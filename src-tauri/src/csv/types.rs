use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CsvRowStatus {
    Unchanged,
    Modified,
    Added,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvCellDiff {
    pub col_index: usize,
    pub col_name: String,
    pub left_val: Option<String>,
    pub right_val: Option<String>,
    pub is_diff: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvRowDiff {
    pub key: String,
    pub status: CsvRowStatus,
    pub cells: Vec<CsvCellDiff>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvCompareResult {
    pub headers: Vec<String>,
    pub rows: Vec<CsvRowDiff>,
    pub delimiter: char,
    pub key_column: Option<String>,
    pub total_rows: usize,
    pub modified_rows: usize,
    pub added_rows: usize,
    pub deleted_rows: usize,
    pub identical_rows: usize,
}
