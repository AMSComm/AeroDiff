use super::types::DiffResult;

pub fn merge_chunk_left_to_right(
    _left_content: &str,
    right_content: &str,
    chunk_id: usize,
    diff_result: &DiffResult,
) -> String {
    let chunk = match diff_result.chunks.iter().find(|c| c.chunk_id == chunk_id) {
        Some(c) => c,
        None => return right_content.to_string(),
    };

    let mut right_lines: Vec<&str> = if right_content.is_empty() {
        Vec::new()
    } else {
        right_content.lines().collect()
    };

    // Calculate 0-based insertion point
    let start_idx = if chunk.right_start > 0 {
        (chunk.right_start - 1).min(right_lines.len())
    } else {
        0
    };

    let end_idx = (start_idx + chunk.right_count).min(right_lines.len());

    // Prepare left lines as references
    let replacement: Vec<&str> = chunk.left_lines.iter().map(|s| s.as_str()).collect();

    // Splice in replacement
    right_lines.splice(start_idx..end_idx, replacement);

    right_lines.join("\n")
}

pub fn merge_chunk_right_to_left(
    left_content: &str,
    _right_content: &str,
    chunk_id: usize,
    diff_result: &DiffResult,
) -> String {
    let chunk = match diff_result.chunks.iter().find(|c| c.chunk_id == chunk_id) {
        Some(c) => c,
        None => return left_content.to_string(),
    };

    let mut left_lines: Vec<&str> = if left_content.is_empty() {
        Vec::new()
    } else {
        left_content.lines().collect()
    };

    // Calculate 0-based insertion point
    let start_idx = if chunk.left_start > 0 {
        (chunk.left_start - 1).min(left_lines.len())
    } else {
        0
    };

    let end_idx = (start_idx + chunk.left_count).min(left_lines.len());

    // Prepare right lines as references
    let replacement: Vec<&str> = chunk.right_lines.iter().map(|s| s.as_str()).collect();

    // Splice in replacement
    left_lines.splice(start_idx..end_idx, replacement);

    left_lines.join("\n")
}
