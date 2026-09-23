use super::types::{CsvCellDiff, CsvCompareResult, CsvRowDiff, CsvRowStatus};
use crate::diff::options::DiffOptions;
use csv::ReaderBuilder;
use std::collections::{BTreeMap, HashSet};

pub fn detect_delimiter(sample: &str) -> char {
    let mut comma = 0;
    let mut semi = 0;
    let mut tab = 0;
    let mut pipe = 0;

    for line in sample.lines().take(10) {
        for c in line.chars() {
            match c {
                ',' => comma += 1,
                ';' => semi += 1,
                '\t' => tab += 1,
                '|' => pipe += 1,
                _ => {}
            }
        }
    }

    let mut max = comma;
    let mut best = ',';

    if semi > max {
        max = semi;
        best = ';';
    }
    if tab > max {
        max = tab;
        best = '\t';
    }
    if pipe > max {
        best = '|';
    }

    best
}

pub fn compare_csv(
    left_content: &str,
    right_content: &str,
    key_column: Option<&str>,
    options: Option<&DiffOptions>,
) -> Result<CsvCompareResult, String> {
    let delimiter = detect_delimiter(left_content);

    let mut left_rdr = ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .flexible(true)
        .from_reader(left_content.as_bytes());

    let mut right_rdr = ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .flexible(true)
        .from_reader(right_content.as_bytes());

    let left_headers: Vec<String> = left_rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.trim().to_string())
        .collect();

    let right_headers: Vec<String> = right_rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.trim().to_string())
        .collect();

    // Union of headers preserving left then right
    let mut headers = left_headers.clone();
    for h in &right_headers {
        if !headers.contains(h) {
            headers.push(h.clone());
        }
    }

    let key_col_idx = key_column.and_then(|k| headers.iter().position(|h| h == k));

    let mut left_rows_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut left_rows_ordered: Vec<(String, Vec<String>)> = Vec::new();

    for (idx, record) in left_rdr.records().enumerate() {
        let rec = record.map_err(|e| e.to_string())?;
        let values: Vec<String> = rec.iter().map(|s| s.to_string()).collect();
        let key = if let Some(k_idx) = key_col_idx {
            values.get(k_idx).cloned().unwrap_or_else(|| idx.to_string())
        } else {
            idx.to_string()
        };
        left_rows_map.insert(key.clone(), values.clone());
        left_rows_ordered.push((key, values));
    }

    let mut right_rows_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut right_rows_ordered: Vec<(String, Vec<String>)> = Vec::new();

    for (idx, record) in right_rdr.records().enumerate() {
        let rec = record.map_err(|e| e.to_string())?;
        let values: Vec<String> = rec.iter().map(|s| s.to_string()).collect();
        let key = if let Some(k_idx) = key_col_idx {
            values.get(k_idx).cloned().unwrap_or_else(|| idx.to_string())
        } else {
            idx.to_string()
        };
        right_rows_map.insert(key.clone(), values.clone());
        right_rows_ordered.push((key, values));
    }

    let mut row_diffs = Vec::new();
    let mut visited_keys = HashSet::new();

    let mut identical_rows = 0;
    let mut modified_rows = 0;
    let mut added_rows = 0;
    let mut deleted_rows = 0;

    // First iterate over left rows
    for (key, l_vals) in &left_rows_ordered {
        visited_keys.insert(key.clone());

        if let Some(r_vals) = right_rows_map.get(key) {
            let mut cells = Vec::new();
            let mut has_diff = false;

            for (col_idx, h) in headers.iter().enumerate() {
                let l_col_idx = left_headers.iter().position(|lh| lh == h);
                let r_col_idx = right_headers.iter().position(|rh| rh == h);

                let l_val = l_col_idx.and_then(|i| l_vals.get(i)).cloned();
                let r_val = r_col_idx.and_then(|i| r_vals.get(i)).cloned();

                let is_diff = match (&l_val, &r_val) {
                    (Some(l), Some(r)) => {
                        if let Some(opts) = options {
                            opts.normalize_line(l) != opts.normalize_line(r)
                        } else {
                            l != r
                        }
                    }
                    (None, None) => false,
                    _ => true,
                };
                if is_diff {
                    has_diff = true;
                }

                cells.push(CsvCellDiff {
                    col_index: col_idx,
                    col_name: h.clone(),
                    left_val: l_val,
                    right_val: r_val,
                    is_diff,
                });
            }

            let status = if has_diff {
                modified_rows += 1;
                CsvRowStatus::Modified
            } else {
                identical_rows += 1;
                CsvRowStatus::Unchanged
            };

            row_diffs.push(CsvRowDiff {
                key: key.clone(),
                status,
                cells,
            });
        } else {
            // Deleted row (present only in left)
            deleted_rows += 1;
            let mut cells = Vec::new();
            for (col_idx, h) in headers.iter().enumerate() {
                let l_col_idx = left_headers.iter().position(|lh| lh == h);
                let l_val = l_col_idx.and_then(|i| l_vals.get(i)).cloned();
                cells.push(CsvCellDiff {
                    col_index: col_idx,
                    col_name: h.clone(),
                    left_val: l_val,
                    right_val: None,
                    is_diff: true,
                });
            }
            row_diffs.push(CsvRowDiff {
                key: key.clone(),
                status: CsvRowStatus::Deleted,
                cells,
            });
        }
    }

    // Now check right rows that were not in left (Added)
    for (key, r_vals) in &right_rows_ordered {
        if visited_keys.contains(key) {
            continue;
        }

        added_rows += 1;
        let mut cells = Vec::new();
        for (col_idx, h) in headers.iter().enumerate() {
            let r_col_idx = right_headers.iter().position(|rh| rh == h);
            let r_val = r_col_idx.and_then(|i| r_vals.get(i)).cloned();
            cells.push(CsvCellDiff {
                col_index: col_idx,
                col_name: h.clone(),
                left_val: None,
                right_val: r_val,
                is_diff: true,
            });
        }

        row_diffs.push(CsvRowDiff {
            key: key.clone(),
            status: CsvRowStatus::Added,
            cells,
        });
    }

    let total_rows = row_diffs.len();

    Ok(CsvCompareResult {
        headers,
        rows: row_diffs,
        delimiter,
        key_column: key_column.map(|s| s.to_string()),
        total_rows,
        modified_rows,
        added_rows,
        deleted_rows,
        identical_rows,
    })
}
