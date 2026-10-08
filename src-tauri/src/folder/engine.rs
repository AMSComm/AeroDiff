use super::types::{FolderCompareResult, FolderEntry, FolderItemStatus};
use rayon::prelude::*;
use std::cmp::Ordering;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

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

fn scan_dir<P: AsRef<Path>>(root: P) -> Vec<(String, FileMeta)> {
    let root_path = root.as_ref();
    if !root_path.exists() {
        return Vec::new();
    }

    let mut list = Vec::with_capacity(4096);

    for entry in WalkDir::new(root_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            name != ".git" && name != "node_modules" && name != "target" && name != ".DS_Store"
        })
        .filter_map(|e| e.ok())
    {
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

    list.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    list
}

pub fn compare_folders<P: AsRef<Path> + Sync>(
    left_path: P,
    right_path: P,
    deep_hash_check: bool,
) -> FolderCompareResult {
    // 1. Scan both directories in parallel
    let (left_list, right_list) = rayon::join(
        || scan_dir(&left_path),
        || scan_dir(&right_path),
    );

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

    let mut pairs = Vec::with_capacity(l_len.max(r_len));

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

    FolderCompareResult {
        entries,
        total_identical,
        total_modified,
        total_only_left,
        total_only_right,
    }
}
