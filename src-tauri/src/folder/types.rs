use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FolderItemStatus {
    Identical,
    Modified,
    OnlyInLeft,
    OnlyInRight,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderEntry {
    pub relative_path: String,
    pub is_dir: bool,
    pub status: FolderItemStatus,
    pub left_size: Option<u64>,
    pub right_size: Option<u64>,
    pub left_modified: Option<u64>,
    pub right_modified: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderCompareResult {
    pub entries: Vec<FolderEntry>,
    pub total_identical: usize,
    pub total_modified: usize,
    pub total_only_left: usize,
    pub total_only_right: usize,
}
