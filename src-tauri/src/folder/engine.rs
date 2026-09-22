use super::types::{FolderCompareResult, FolderEntry, FolderItemStatus};
use crate::diff::hash::fast_hash_file;
use rayon::prelude::*;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

struct FileMeta {
    is_dir: bool,
    size: u64,
    modified: u64,
    full_path: PathBuf,
}

fn scan_dir<P: AsRef<Path>>(root: P) -> BTreeMap<String, FileMeta> {
    let mut map = BTreeMap::new();
    let root_path = root.as_ref();

    if !root_path.exists() {
        return map;
    }

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
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = meta.is_dir();
            let size = if is_dir { 0 } else { meta.len() };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            map.insert(
                rel_str,
                FileMeta {
                    is_dir,
                    size,
                    modified,
                    full_path: entry.path().to_path_buf(),
                },
            );
        }
    }

    map
}

pub fn compare_folders<P: AsRef<Path>>(
    left_path: P,
    right_path: P,
    deep_hash_check: bool,
) -> FolderCompareResult {
    let left_map = scan_dir(&left_path);
    let right_map = scan_dir(&right_path);

    let mut all_paths: HashSet<String> = HashSet::new();
    for k in left_map.keys() {
        all_paths.insert(k.clone());
    }
    for k in right_map.keys() {
        all_paths.insert(k.clone());
    }

    let mut sorted_paths: Vec<String> = all_paths.into_iter().collect();
    sorted_paths.sort();

    // Process in parallel with Rayon
    let entries: Vec<FolderEntry> = sorted_paths
        .par_iter()
        .map(|rel| {
            let left_meta = left_map.get(rel);
            let right_meta = right_map.get(rel);

            match (left_meta, right_meta) {
                (Some(l), None) => FolderEntry {
                    relative_path: rel.clone(),
                    is_dir: l.is_dir,
                    status: FolderItemStatus::OnlyInLeft,
                    left_size: Some(l.size),
                    right_size: None,
                    left_modified: Some(l.modified),
                    right_modified: None,
                },
                (None, Some(r)) => FolderEntry {
                    relative_path: rel.clone(),
                    is_dir: r.is_dir,
                    status: FolderItemStatus::OnlyInRight,
                    left_size: None,
                    right_size: Some(r.size),
                    left_modified: None,
                    right_modified: Some(r.modified),
                },
                (Some(l), Some(r)) => {
                    let is_dir = l.is_dir || r.is_dir;
                    let status = if is_dir {
                        FolderItemStatus::Identical
                    } else if l.size != r.size {
                        FolderItemStatus::Modified
                    } else if deep_hash_check {
                        let l_hash = fast_hash_file(&l.full_path).unwrap_or(0);
                        let r_hash = fast_hash_file(&r.full_path).unwrap_or(1);
                        if l_hash == r_hash {
                            FolderItemStatus::Identical
                        } else {
                            FolderItemStatus::Modified
                        }
                    } else {
                        // Quick check based on size
                        FolderItemStatus::Identical
                    };

                    FolderEntry {
                        relative_path: rel.clone(),
                        is_dir,
                        status,
                        left_size: Some(l.size),
                        right_size: Some(r.size),
                        left_modified: Some(l.modified),
                        right_modified: Some(r.modified),
                    }
                }
                (None, None) => unreachable!(),
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
