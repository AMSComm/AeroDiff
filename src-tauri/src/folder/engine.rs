use super::types::{FolderCompareOptions, FolderCompareResult, FolderEntry, FolderItemStatus, FolderProgressPayload};
use rayon::prelude::*;
use std::cmp::Ordering;
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
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

pub fn is_known_binary_extension(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "bmp" | "tiff"
        | "pdf" | "zip" | "tar" | "gz" | "7z" | "rar" | "xz" | "bz2"
        | "exe" | "dll" | "dylib" | "so" | "bin" | "iso" | "dmg" | "node"
        | "mp3" | "mp4" | "mov" | "avi" | "mkv" | "wav" | "ogg" | "flac"
        | "woff" | "woff2" | "ttf" | "otf" | "eot"
        | "class" | "pyc" | "o" | "obj" | "a" | "lib"
        | "db" | "sqlite" | "sqlite3" | "parquet"
    )
}

pub fn is_file_binary(path: &Path) -> bool {
    if is_known_binary_extension(path) {
        return true;
    }
    let Ok(mut f) = File::open(path) else { return true };
    let mut buf = [0u8; 8192];
    let Ok(n) = f.read(&mut buf) else { return true };
    if n == 0 {
        return false;
    }
    buf[..n].iter().any(|&b| b == 0)
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

fn compare_text_files_normalized(
    left_path: &Path,
    right_path: &Path,
    ignore_line_endings: bool,
    ignore_whitespace: bool,
) -> bool {
    let Ok(f1) = File::open(left_path) else { return false };
    let Ok(f2) = File::open(right_path) else { return false };

    let mut reader1 = BufReader::with_capacity(32768, f1);
    let mut reader2 = BufReader::with_capacity(32768, f2);

    let mut line1 = String::new();
    let mut line2 = String::new();

    loop {
        line1.clear();
        line2.clear();

        let n1 = reader1.read_line(&mut line1).unwrap_or(0);
        let n2 = reader2.read_line(&mut line2).unwrap_or(0);

        if n1 == 0 && n2 == 0 {
            return true;
        }

        if n1 == 0 || n2 == 0 {
            if ignore_whitespace {
                if n1 != 0 {
                    if !line1.trim().is_empty() { return false; }
                    while let Ok(n) = reader1.read_line(&mut line1) {
                        if n == 0 { break; }
                        if !line1.trim().is_empty() { return false; }
                        line1.clear();
                    }
                    return true;
                }
                if n2 != 0 {
                    if !line2.trim().is_empty() { return false; }
                    while let Ok(n) = reader2.read_line(&mut line2) {
                        if n == 0 { break; }
                        if !line2.trim().is_empty() { return false; }
                        line2.clear();
                    }
                    return true;
                }
            }
            return false;
        }

        if ignore_whitespace {
            if line1.trim() != line2.trim() {
                return false;
            }
        } else if ignore_line_endings {
            let s1 = line1.trim_end_matches(['\r', '\n']);
            let s2 = line2.trim_end_matches(['\r', '\n']);
            if s1 != s2 {
                return false;
            }
        } else {
            if line1 != line2 {
                return false;
            }
        }
    }
}

fn compare_file_contents(
    left_path: &Path,
    right_path: &Path,
    left_size: u64,
    right_size: u64,
    ignore_line_endings: bool,
    ignore_whitespace: bool,
    _deep_hash: bool,
) -> bool {
    // TIER 1 Fast Path: Exact raw-byte comparison.
    // If files have the same size and identical bytes, they are 100% identical in all aspects
    // (including CRLF and whitespace), avoiding any expensive line-by-line parsing or allocations.
    if left_size == right_size && files_identical(left_path, right_path, left_size) {
        return true;
    }

    // TIER 2: If either file is binary, different raw bytes mean the file is modified
    let left_is_bin = is_file_binary(left_path);
    let right_is_bin = is_file_binary(right_path);
    if left_is_bin || right_is_bin {
        return false;
    }

    // TIER 3: If no ignore options are enabled, different raw bytes/size mean modified
    if !ignore_line_endings && !ignore_whitespace {
        return false;
    }

    // TIER 4 Slow Path: Only text files with raw byte differences need normalized line comparison
    compare_text_files_normalized(left_path, right_path, ignore_line_endings, ignore_whitespace)
}

fn scan_dir<P: AsRef<Path>, F: Fn(usize) + Send + Sync>(
    root: P,
    include_hidden_folders: bool,
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
            let is_dir = e.file_type().is_dir();

            // Always ignore internal version control metadata and OS noise
            if name == ".git" || name == "node_modules" || name == "target" || name == ".DS_Store" {
                return false;
            }

            // By default, exclude hidden DIRECTORIES (.vscode, .idea, .github, etc.)
            // But KEEP hidden FILES (.env, .gitignore, .prettierrc, etc.)
            if !include_hidden_folders && is_dir && name.starts_with('.') {
                return false;
            }

            true
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
            let is_symlink = ft.is_symlink();
            let (is_dir, size, modified) = if is_symlink {
                // If the entry is a symlink, resolve the target to see if it is a directory or file
                if let Ok(target_meta) = std::fs::metadata(entry.path()) {
                    if target_meta.is_dir() {
                        (true, 0, 0)
                    } else {
                        let s = target_meta.len();
                        let m = target_meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        (false, s, m)
                    }
                } else {
                    // Broken symlink: record symlink file size
                    let s = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    (false, s, 0)
                }
            } else if ft.is_dir() {
                (true, 0, 0)
            } else if let Ok(meta) = entry.metadata() {
                let s = meta.len();
                let m = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                (false, s, m)
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
    options: FolderCompareOptions,
    progress: F,
) -> Result<FolderCompareResult, String> {
    CANCEL_REQUESTED.store(false, AtomicOrdering::SeqCst);
    let progress = Arc::new(progress);

    let deep_hash = options.deep_hash.unwrap_or(false);
    let ignore_line_endings = options.ignore_line_endings.unwrap_or(false);
    let ignore_whitespace = options.ignore_whitespace.unwrap_or(false);
    let include_hidden_folders = options.include_hidden_folders.unwrap_or(false);

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
            scan_dir(&left_path, include_hidden_folders, &|cnt| {
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
            scan_dir(&right_path, include_hidden_folders, &|cnt| {
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
            ItemPair::OnlyLeft(l) => {
                let is_bin = if l.1.is_dir { None } else { Some(is_known_binary_extension(&l.1.full_path)) };
                FolderEntry {
                    relative_path: l.0.clone(),
                    is_dir: l.1.is_dir,
                    status: FolderItemStatus::OnlyInLeft,
                    left_size: Some(l.1.size),
                    right_size: None,
                    left_modified: Some(l.1.modified),
                    right_modified: None,
                    is_binary: is_bin,
                }
            }
            ItemPair::OnlyRight(r) => {
                let is_bin = if r.1.is_dir { None } else { Some(is_known_binary_extension(&r.1.full_path)) };
                FolderEntry {
                    relative_path: r.0.clone(),
                    is_dir: r.1.is_dir,
                    status: FolderItemStatus::OnlyInRight,
                    left_size: None,
                    right_size: Some(r.1.size),
                    left_modified: None,
                    right_modified: Some(r.1.modified),
                    is_binary: is_bin,
                }
            }
            ItemPair::Both(l, r) => {
                let is_dir = l.1.is_dir || r.1.is_dir;
                let (status, is_bin) = if is_dir {
                    (FolderItemStatus::Identical, None)
                } else {
                    let is_bin = is_known_binary_extension(&l.1.full_path) || is_known_binary_extension(&r.1.full_path);
                    let status = if !deep_hash && !ignore_line_endings && !ignore_whitespace {
                        if l.1.size != r.1.size {
                            FolderItemStatus::Modified
                        } else if l.1.modified == r.1.modified || l.1.modified == 0 || r.1.modified == 0 {
                            FolderItemStatus::Identical
                        } else {
                            FolderItemStatus::Modified
                        }
                    } else {
                        let cur = hash_counter.fetch_add(1, AtomicOrdering::Relaxed);
                        if cur % 2_000 == 0 {
                            p_hash(FolderProgressPayload {
                                stage: "comparing".to_string(),
                                left_scanned: l_len,
                                right_scanned: r_len,
                                compared: cur,
                                total: total_items,
                                message: format!("Comparing file contents ({} / {})...", cur, total_items),
                            });
                        }

                        if compare_file_contents(
                            &l.1.full_path,
                            &r.1.full_path,
                            l.1.size,
                            r.1.size,
                            ignore_line_endings,
                            ignore_whitespace,
                            deep_hash,
                        ) {
                            FolderItemStatus::Identical
                        } else {
                            FolderItemStatus::Modified
                        }
                    };
                    (status, Some(is_bin))
                };

                FolderEntry {
                    relative_path: l.0.clone(),
                    is_dir,
                    status,
                    left_size: Some(l.1.size),
                    right_size: Some(r.1.size),
                    left_modified: Some(l.1.modified),
                    right_modified: Some(r.1.modified),
                    is_binary: is_bin,
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
