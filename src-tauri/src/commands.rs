use crate::csv::engine::compare_csv;
use crate::csv::types::CsvCompareResult;
use crate::diff::engine::compute_diff;
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
pub async fn compare_text(left: String, right: String, options: DiffOptions) -> Result<DiffResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(compute_diff(&left, &right, &options))
    })
    .await
    .map_err(|e| e.to_string())?
}

use encoding_rs::{EUC_JP, SHIFT_JIS, UTF_8};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContentResult {
    pub content: String,
    pub encoding: String,
}

pub fn decode_bytes_with_encoding(
    bytes: &[u8],
    preferred_encoding: Option<&str>,
) -> (String, String) {
    match preferred_encoding.map(|s| s.to_lowercase()).as_deref() {
        Some("shift_jis") | Some("shiftjis") | Some("sjis") | Some("cp932") => {
            let (res, _, _) = SHIFT_JIS.decode(bytes);
            (res.into_owned(), "Shift_JIS".to_string())
        }
        Some("euc_jp") | Some("euc-jp") | Some("eucjp") => {
            let (res, _, _) = EUC_JP.decode(bytes);
            (res.into_owned(), "EUC-JP".to_string())
        }
        Some("utf-8") | Some("utf8") => {
            let (res, _, _) = UTF_8.decode(bytes);
            (res.into_owned(), "UTF-8".to_string())
        }
        _ => {
            // Auto-detect strategy:
            // 1. Check if valid UTF-8
            if let Ok(utf8_str) = std::str::from_utf8(bytes) {
                return (utf8_str.to_string(), "UTF-8".to_string());
            }

            // 2. Try Shift_JIS without malformed bytes
            let (sjis_str, _, sjis_had_errors) = SHIFT_JIS.decode(bytes);
            if !sjis_had_errors {
                return (sjis_str.into_owned(), "Shift_JIS".to_string());
            }

            // 3. Try EUC-JP without malformed bytes
            let (euc_str, _, euc_had_errors) = EUC_JP.decode(bytes);
            if !euc_had_errors {
                return (euc_str.into_owned(), "EUC-JP".to_string());
            }

            // 4. Fallback to Shift_JIS
            (sjis_str.into_owned(), "Shift_JIS".to_string())
        }
    }
}

#[tauri::command]
pub fn compare_files(
    left_path: String,
    right_path: String,
    options: DiffOptions,
    left_encoding: Option<String>,
    right_encoding: Option<String>,
) -> Result<DiffResult, String> {
    let clean_l = left_path.trim().trim_matches('"').trim_matches('\'');
    let clean_r = right_path.trim().trim_matches('"').trim_matches('\'');
    let p_left = Path::new(clean_l);
    let p_right = Path::new(clean_r);

    if !p_left.exists() {
        return Err(format!("Left file does not exist: {}", clean_l));
    }
    if !p_right.exists() {
        return Err(format!("Right file does not exist: {}", clean_r));
    }

    let bytes_l = fs::read(p_left).map_err(|e| format!("Failed to read left file: {}", e))?;
    let bytes_r = fs::read(p_right).map_err(|e| format!("Failed to read right file: {}", e))?;

    if bytes_l == bytes_r && options == DiffOptions::default() && left_encoding == right_encoding {
        let (left, _) = decode_bytes_with_encoding(&bytes_l, left_encoding.as_deref());
        let count = left.lines().count();
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

    let (left, _) = decode_bytes_with_encoding(&bytes_l, left_encoding.as_deref());
    let (right, _) = decode_bytes_with_encoding(&bytes_r, right_encoding.as_deref());

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

#[derive(Debug, Serialize, Deserialize)]
pub struct PathInfo {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub name: String,
}

#[tauri::command]
pub fn check_path(path: String) -> Result<PathInfo, String> {
    let clean = path.trim().trim_matches('"').trim_matches('\'');
    let p = Path::new(clean);
    let exists = p.exists();
    let is_dir = p.is_dir();
    let is_file = p.is_file();
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    Ok(PathInfo {
        path: clean.to_string(),
        exists,
        is_dir,
        is_file,
        name,
    })
}

#[tauri::command]
pub fn read_file(path: String, encoding: Option<String>) -> Result<FileContentResult, String> {
    let clean = path.trim().trim_matches('"').trim_matches('\'');
    let bytes = fs::read(clean).map_err(|e| format!("Failed to read file '{}': {}", clean, e))?;
    let (content, enc_name) = decode_bytes_with_encoding(&bytes, encoding.as_deref());
    Ok(FileContentResult {
        content,
        encoding: enc_name,
    })
}

#[tauri::command]
pub fn save_file(path: String, content: String, encoding: Option<String>) -> Result<(), String> {
    let clean = path.trim().trim_matches('"').trim_matches('\'');
    let enc = match encoding.map(|s| s.to_lowercase()).as_deref() {
        Some("shift_jis") | Some("shiftjis") | Some("sjis") | Some("cp932") => SHIFT_JIS,
        Some("euc_jp") | Some("euc-jp") | Some("eucjp") => EUC_JP,
        _ => UTF_8,
    };
    let (encoded_bytes, _, _) = enc.encode(&content);
    fs::write(clean, encoded_bytes).map_err(|e| format!("Failed to write file '{}': {}", clean, e))
}

#[tauri::command]
pub fn compare_folders_cmd(
    left_path: String,
    right_path: String,
    deep_hash: bool,
) -> Result<FolderCompareResult, String> {
    let clean_l = left_path.trim().trim_matches('"').trim_matches('\'');
    let clean_r = right_path.trim().trim_matches('"').trim_matches('\'');
    Ok(compare_folders(clean_l.to_string(), clean_r.to_string(), deep_hash))
}

#[tauri::command]
pub async fn compare_csv_cmd(
    left_content: String,
    right_content: String,
    key_column: Option<String>,
) -> Result<CsvCompareResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compare_csv(&left_content, &right_content, key_column.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_utf8() {
        let text = "Hello 世界";
        let bytes = text.as_bytes();
        let (decoded, enc) = decode_bytes_with_encoding(bytes, None);
        assert_eq!(decoded, text);
        assert_eq!(enc, "UTF-8");
    }

    #[test]
    fn test_decode_shift_jis() {
        let (bytes, _, _) = SHIFT_JIS.encode("こんにちは世界 (Shift_JIS)");
        let (decoded, enc) = decode_bytes_with_encoding(&bytes, None);
        assert_eq!(decoded, "こんにちは世界 (Shift_JIS)");
        assert_eq!(enc, "Shift_JIS");
    }

    #[test]
    fn test_decode_euc_jp() {
        let (bytes, _, _) = EUC_JP.encode("こんにちは世界 (EUC-JP)");
        let (decoded, enc) = decode_bytes_with_encoding(&bytes, Some("euc-jp"));
        assert_eq!(decoded, "こんにちは世界 (EUC-JP)");
        assert_eq!(enc, "EUC-JP");
    }
}

