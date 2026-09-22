use crate::csv::engine::compare_csv;
use crate::csv::types::CsvCompareResult;
use crate::diff::engine::compute_diff;
use crate::diff::hash::fast_hash_file;
use crate::diff::merge::{merge_chunk_left_to_right, merge_chunk_right_to_left};
use crate::diff::options::DiffOptions;
use crate::diff::types::DiffResult;
use crate::folder::engine::compare_folders;
use crate::folder::types::FolderCompareResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct MergeResponse {
    pub new_left: String,
    pub new_right: String,
    pub updated_diff: DiffResult,
}

#[tauri::command]
pub fn compare_text(left: String, right: String, options: DiffOptions) -> Result<DiffResult, String> {
    Ok(compute_diff(&left, &right, &options))
}

#[tauri::command]
pub fn compare_files(
    left_path: String,
    right_path: String,
    options: DiffOptions,
) -> Result<DiffResult, String> {
    let p_left = Path::new(&left_path);
    let p_right = Path::new(&right_path);

    if !p_left.exists() {
        return Err(format!("Left file does not exist: {}", left_path));
    }
    if !p_right.exists() {
        return Err(format!("Right file does not exist: {}", right_path));
    }

    // Fast hash check for identical files (especially for large files)
    if let (Ok(meta_l), Ok(meta_r)) = (p_left.metadata(), p_right.metadata()) {
        if meta_l.len() == meta_r.len() && meta_l.len() > 0 {
            if let (Ok(h_l), Ok(h_r)) = (fast_hash_file(p_left), fast_hash_file(p_right)) {
                if h_l == h_r && options == DiffOptions::default() {
                    let count = meta_l.len() as usize;
                    return Ok(DiffResult {
                        lines: Vec::new(),
                        chunks: Vec::new(),
                        total_left_lines: count,
                        total_right_lines: count,
                        added_chunks: 0,
                        deleted_chunks: 0,
                        modified_chunks: 0,
                        is_identical: true,
                        hash_matched: true,
                    });
                }
            }
        }
    }

    let left = fs::read_to_string(p_left).map_err(|e| format!("Failed to read left file: {}", e))?;
    let right = fs::read_to_string(p_right).map_err(|e| format!("Failed to read right file: {}", e))?;

    Ok(compute_diff(&left, &right, &options))
}

#[tauri::command]
pub fn merge_chunk(
    left_content: String,
    right_content: String,
    chunk_id: usize,
    direction: String, // "left_to_right" or "right_to_left"
    diff_result: DiffResult,
    options: DiffOptions,
) -> Result<MergeResponse, String> {
    let (new_left, new_right) = match direction.as_str() {
        "left_to_right" => {
            let updated_right = merge_chunk_left_to_right(&left_content, &right_content, chunk_id, &diff_result);
            (left_content, updated_right)
        }
        "right_to_left" => {
            let updated_left = merge_chunk_right_to_left(&left_content, &right_content, chunk_id, &diff_result);
            (updated_left, right_content)
        }
        _ => return Err("Invalid merge direction. Must be 'left_to_right' or 'right_to_left'".to_string()),
    };

    let updated_diff = compute_diff(&new_left, &new_right, &options);

    Ok(MergeResponse {
        new_left,
        new_right,
        updated_diff,
    })
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub fn compare_folders_cmd(
    left_path: String,
    right_path: String,
    deep_hash: bool,
) -> Result<FolderCompareResult, String> {
    Ok(compare_folders(left_path, right_path, deep_hash))
}

#[tauri::command]
pub fn compare_csv_cmd(
    left_content: String,
    right_content: String,
    key_column: Option<String>,
) -> Result<CsvCompareResult, String> {
    compare_csv(&left_content, &right_content, key_column.as_deref())
}
