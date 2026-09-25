use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffLineType {
    Unchanged,
    Added,
    Deleted,
    Modified,
    Empty, // Placeholder for side-by-side alignment
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffChunkType {
    Addition,
    Deletion,
    Modification,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InlineSpan {
    pub start: usize,
    pub end: usize,
    pub highlight: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffLine {
    pub left_line_num: Option<usize>,
    pub right_line_num: Option<usize>,
    pub left_text: Option<String>,
    pub right_text: Option<String>,
    pub line_type: DiffLineType,
    pub left_inline: Vec<InlineSpan>,
    pub right_inline: Vec<InlineSpan>,
    pub chunk_id: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffChunk {
    pub chunk_id: usize,
    pub left_start: usize, // 1-indexed
    pub left_count: usize,
    pub right_start: usize, // 1-indexed
    pub right_count: usize,
    pub chunk_type: DiffChunkType,
    pub left_lines: Vec<String>,
    pub right_lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffResult {
    pub lines: Vec<DiffLine>,
    pub chunks: Vec<DiffChunk>,
    pub total_left_lines: usize,
    pub total_right_lines: usize,
    pub added_chunks: usize,
    pub deleted_chunks: usize,
    pub modified_chunks: usize,
    pub is_identical: bool,
    pub hash_matched: bool,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub total_virtual_lines: usize,
}
