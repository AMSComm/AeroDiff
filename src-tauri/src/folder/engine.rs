use super::types::{FolderCompareResult, FolderEntry, FolderItemStatus, FolderProgressPayload};
use rayon::prelude::*;
use std::cmp::Ordering;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering as AtomicOrdering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn cancel_folder_comparison() {
    CANCEL_REQUESTED.store(true, AtomicOrdering::SeqCst);
}

pub fn is_cancel_requested() -> bool {
    CANCEL_REQUESTED.load(AtomicOrdering::Relaxed)
}

struct FileMeta {
    is_dir: bool,
    size: u64,
    modified: u64,
    full_path: PathBuf,
}

fn files_identical(left: &Path, right: &Path, size: u64) -> bool {
    if size == 0 {
        return true;
    }

    let Ok(mut f1) = File::open(left) else { return false };
    let Ok(mut f2) = File::open(right) else { return false };

    let mut buf1 = [0u8; 8192];
    let mut buf2 = [0u8; 8192];

    loop {
        let n1 = match f1.read(&mut buf1) {
            Ok(n) => n,
            Err(_) => return false,
        };
        let n2 = match f2.read(&mut buf2) {
            Ok(n) => n,
            Err(_) => return false,
        };
        if n1 != n2 || buf1[..n1] != buf2[..n2] {
            return false;
        }
        if n1 == 0 {
            return true;
        }
    }
}

fn scan_dir<P: AsRef<Path>, F: Fn(usize) + Send + Sync>(
    root: P,
    on_progress: &F,
) -> Result<Vec<(String, FileMeta)>, String> {
    let root_path = root.as_ref();
    if !root_path.exists() {
        return Ok(Vec::new());
    }

    let mut list = Vec::with_capacity(4096);
    let mut count = 0;

    for entry in WalkDir::new(root_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            name != ".git" && name != "node_modules" && name != "target" && name != ".DS_Store"
        })
        .filter_map(|e| e.ok())
    {
        count += 1;
        if count % 2_000 == 0 {
            if is_cancel_requested() {
                return Err("Comparison was cancelled by user.".to_string());
            }
            on_progress(count);
        }

        if let Ok(rel) = entry.path().strip_prefix(root_path) {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let ft = entry.file_type();
            let is_dir = ft.is_dir();

            let (size, modified) = if is_dir {
                (0, 0)
            } else if let Ok(meta) = entry.metadata() {
                let s = meta.len();
                let m = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                (s, m)
            } else {
                continue;
            };

            if list.try_reserve(1).is_err() {
                return Err(format!(
                    "System ran out of memory while scanning '{}' (after {} items). Comparison halted safely.",
                    root_path.display(),
                    count
                ));
            }

            list.push((
                rel_str,
                FileMeta {
                    is_dir,
                    size,
                    modified,
                    full_path: entry.path().to_path_buf(),
                },
            ));
        }
    }

    on_progress(list.len());
    list.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    Ok(list)
}

pub fn compare_folders<P: AsRef<Path> + Sync, F: Fn(FolderProgressPayload) + Send + Sync + 'static>(
    left_path: P,
    right_path: P,
    deep_hash_check: bool,
    progress: F,
) -> Result<FolderCompareResult, String> {
    CANCEL_REQUESTED.store(false, AtomicOrdering::SeqCst);
    let progress = Arc::new(progress);

    let left_count = Arc::new(AtomicUsize::new(0));
    let right_count = Arc::new(AtomicUsize::new(0));

    let p_left = Arc::clone(&progress);
    let p_right = Arc::clone(&progress);
    let lc_for_l = Arc::clone(&left_count);
    let rc_for_l = Arc::clone(&right_count);
    let lc_for_r = Arc::clone(&left_count);
    let rc_for_r = Arc::clone(&right_count);

    progress(FolderProgressPayload {
        stage: "scanning".to_string(),
        left_scanned: 0,
        right_scanned: 0,
        compared: 0,
        total: 0,
        message: "Scanning directory trees...".to_string(),
    });

    // 1. Scan both directories in parallel
    let (left_res, right_res) = rayon::join(
        || {
            scan_dir(&left_path, &|cnt| {
                lc_for_l.store(cnt, AtomicOrdering::Relaxed);
                p_left(FolderProgressPayload {
                    stage: "scanning".to_string(),
                    left_scanned: cnt,
                    right_scanned: rc_for_l.load(AtomicOrdering::Relaxed),
                    compared: 0,
                    total: 0,
                    message: format!("Scanning Left folder: {} items found...", cnt),
                });
            })
        },
        || {
            scan_dir(&right_path, &|cnt| {
                rc_for_r.store(cnt, AtomicOrdering::Relaxed);
                p_right(FolderProgressPayload {
                    stage: "scanning".to_string(),
                    left_scanned: lc_for_r.load(AtomicOrdering::Relaxed),
                    right_scanned: cnt,
                    compared: 0,
                    total: 0,
                    message: format!("Scanning Right folder: {} items found...", cnt),
                });
            })
        },
    );

    let left_list = left_res?;
    let right_list = right_res?;

    if is_cancel_requested() {
        return Err("Comparison was cancelled by user.".to_string());
    }

    // 2. Linear two-pointer merge to identify matches and differences
    let mut i = 0;
    let mut j = 0;
    let l_len = left_list.len();
    let r_len = right_list.len();

    enum ItemPair<'a> {
        OnlyLeft(&'a (String, FileMeta)),
        OnlyRight(&'a (String, FileMeta)),
        Both(&'a (String, FileMeta), &'a (String, FileMeta)),
    }

    let mut pairs = Vec::new();
    if pairs.try_reserve(l_len.max(r_len)).is_err() {
        return Err("System ran out of memory while allocating comparison tree. Comparison halted safely.".to_string());
    }

    while i < l_len && j < r_len {
        let l = &left_list[i];
        let r = &right_list[j];
        match l.0.cmp(&r.0) {
            Ordering::Equal => {
                pairs.push(ItemPair::Both(l, r));
                i += 1;
                j += 1;
            }
            Ordering::Less => {
                pairs.push(ItemPair::OnlyLeft(l));
                i += 1;
            }
            Ordering::Greater => {
                pairs.push(ItemPair::OnlyRight(r));
                j += 1;
            }
        }
    }

    while i < l_len {
        pairs.push(ItemPair::OnlyLeft(&left_list[i]));
        i += 1;
    }
    while j < r_len {
        pairs.push(ItemPair::OnlyRight(&right_list[j]));
        j += 1;
    }

    let total_items = pairs.len();
    progress(FolderProgressPayload {
        stage: "comparing".to_string(),
        left_scanned: l_len,
        right_scanned: r_len,
        compared: 0,
        total: total_items,
        message: format!("Comparing {} items across folders...", total_items),
    });

    let hash_counter = Arc::new(AtomicUsize::new(0));
    let p_hash = Arc::clone(&progress);

    // 3. Process pairs in parallel with Rayon
    let entries: Vec<FolderEntry> = pairs
        .into_par_iter()
        .map(|pair| match pair {
            ItemPair::OnlyLeft(l) => FolderEntry {
                relative_path: l.0.clone(),
                is_dir: l.1.is_dir,
                status: FolderItemStatus::OnlyInLeft,
                left_size: Some(l.1.size),
                right_size: None,
                left_modified: Some(l.1.modified),
                right_modified: None,
            },
            ItemPair::OnlyRight(r) => FolderEntry {
                relative_path: r.0.clone(),
                is_dir: r.1.is_dir,
                status: FolderItemStatus::OnlyInRight,
                left_size: None,
                right_size: Some(r.1.size),
                left_modified: None,
                right_modified: Some(r.1.modified),
            },
            ItemPair::Both(l, r) => {
                let is_dir = l.1.is_dir || r.1.is_dir;
                let status = if is_dir {
                    FolderItemStatus::Identical
                } else if l.1.size != r.1.size {
                    FolderItemStatus::Modified
                } else if deep_hash_check {
                    let cur = hash_counter.fetch_add(1, AtomicOrdering::Relaxed);
                    if cur % 2_000 == 0 {
                        p_hash(FolderProgressPayload {
                            stage: "hashing".to_string(),
                            left_scanned: l_len,
                            right_scanned: r_len,
                            compared: cur,
                            total: total_items,
                            message: format!("Verifying file contents ({} / {})...", cur, total_items),
                        });
                    }

                    if files_identical(&l.1.full_path, &r.1.full_path, l.1.size) {
                        FolderItemStatus::Identical
                    } else {
                        FolderItemStatus::Modified
                    }
                } else {
                    // Quick check: if size matches, check modification time
                    if l.1.modified == r.1.modified || l.1.modified == 0 || r.1.modified == 0 {
                        FolderItemStatus::Identical
                    } else {
                        FolderItemStatus::Modified
                    }
                };

                FolderEntry {
                    relative_path: l.0.clone(),
                    is_dir,
                    status,
                    left_size: Some(l.1.size),
                    right_size: Some(r.1.size),
                    left_modified: Some(l.1.modified),
                    right_modified: Some(r.1.modified),
                }
            }
        })
        .collect();

    if is_cancel_requested() {
        return Err("Comparison was cancelled by user.".to_string());
    }

    let mut total_identical = 0;
    let mut total_modified = 0;
    let mut total_only_left = 0;
    let mut total_only_right = 0;

    for entry in &entries {
        match entry.status {
            FolderItemStatus::Identical => total_identical += 1,
            FolderItemStatus::Modified => total_modified += 1,
            FolderItemStatus::OnlyInLeft => total_only_left += 1,
            FolderItemStatus::OnlyInRight => total_only_right += 1,
        }
    }

    progress(FolderProgressPayload {
        stage: "done".to_string(),
        left_scanned: l_len,
        right_scanned: r_len,
        compared: total_items,
        total: total_items,
        message: format!("Compared {} items successfully", total_items),
    });

    Ok(FolderCompareResult {
        entries,
        total_identical,
        total_modified,
        total_only_left,
        total_only_right,
    })
}
