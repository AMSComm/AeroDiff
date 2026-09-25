use super::hash::fast_hash_bytes;
use super::inline::compute_inline_diff;
use super::options::{DiffOptions, IgnoreWhitespace};
use super::types::{DiffChunk, DiffChunkType, DiffLine, DiffLineType, DiffResult};
use similar::{Algorithm, ChangeTag, TextDiff};

pub fn compute_diff(left: &str, right: &str, options: &DiffOptions) -> DiffResult {
    let is_default_opts = options.ignore_whitespace == IgnoreWhitespace::None
        && !options.ignore_blank_lines
        && !options.ignore_case
        && options.regex_filter.is_none();

    let left_hash = fast_hash_bytes(left.as_bytes());
    let right_hash = fast_hash_bytes(right.as_bytes());

    let original_left_lines: Vec<&str> = if left.is_empty() {
        Vec::new()
    } else {
        left.lines().collect()
    };
    let original_right_lines: Vec<&str> = if right.is_empty() {
        Vec::new()
    } else {
        right.lines().collect()
    };

    let total_left = original_left_lines.len();
    let total_right = original_right_lines.len();

    // Fast path: Exact match
    if is_default_opts && left_hash == right_hash && left == right {
        let lines: Vec<DiffLine> = original_left_lines
            .iter()
            .enumerate()
            .map(|(i, &l)| DiffLine {
                left_line_num: Some(i + 1),
                right_line_num: Some(i + 1),
                left_text: Some(l.to_string()),
                right_text: Some(l.to_string()),
                line_type: DiffLineType::Unchanged,
                left_inline: Vec::new(),
                right_inline: Vec::new(),
                chunk_id: None,
            })
            .collect();

        return DiffResult {
            lines,
            chunks: Vec::new(),
            total_left_lines: total_left,
            total_right_lines: total_right,
            added_chunks: 0,
            deleted_chunks: 0,
            modified_chunks: 0,
            is_identical: true,
            hash_matched: true,
        };
    }

    // Filter/normalize for comparison
    // If ignore_blank_lines is set, we also treat blank differences as unchanged or skip
    let norm_left: Vec<String> = original_left_lines
        .iter()
        .map(|l| options.normalize_line(l))
        .collect();
    let norm_right: Vec<String> = original_right_lines
        .iter()
        .map(|l| options.normalize_line(l))
        .collect();

    let norm_left_refs: Vec<&str> = norm_left.iter().map(|s| s.as_str()).collect();
    let norm_right_refs: Vec<&str> = norm_right.iter().map(|s| s.as_str()).collect();

    let max_lines = norm_left_refs.len().max(norm_right_refs.len());
    let algorithm = if max_lines > 5_000 {
        Algorithm::Patience
    } else {
        Algorithm::Myers
    };

    let diff = TextDiff::configure()
        .algorithm(algorithm)
        .diff_slices(&norm_left_refs, &norm_right_refs);

    let mut result_lines = Vec::new();
    let mut chunks = Vec::new();

    let mut left_line_counter = 1;
    let mut right_line_counter = 1;

    let mut added_chunks = 0;
    let mut deleted_chunks = 0;
    let mut modified_chunks = 0;

    let mut current_deletes: Vec<(usize, &str)> = Vec::new(); // (orig_line_num, text)
    let mut current_inserts: Vec<(usize, &str)> = Vec::new(); // (orig_line_num, text)

    let flush_changes = |deletes: &mut Vec<(usize, &str)>,
                         inserts: &mut Vec<(usize, &str)>,
                         res_lines: &mut Vec<DiffLine>,
                         chunks: &mut Vec<DiffChunk>,
                         added_cnt: &mut usize,
                         del_cnt: &mut usize,
                         mod_cnt: &mut usize| {
        if deletes.is_empty() && inserts.is_empty() {
            return;
        }

        // Drain ignored deletes (e.g. blank lines or regex filter)
        let mut active_deletes = Vec::new();
        for (l_num, l_text) in deletes.drain(..) {
            if options.should_ignore_line(l_text) {
                res_lines.push(DiffLine {
                    left_line_num: Some(l_num),
                    right_line_num: None,
                    left_text: Some(l_text.to_string()),
                    right_text: None,
                    line_type: DiffLineType::Unchanged,
                    left_inline: Vec::new(),
                    right_inline: Vec::new(),
                    chunk_id: None,
                });
            } else {
                active_deletes.push((l_num, l_text));
            }
        }

        // Drain ignored inserts
        let mut active_inserts = Vec::new();
        for (r_num, r_text) in inserts.drain(..) {
            if options.should_ignore_line(r_text) {
                res_lines.push(DiffLine {
                    left_line_num: None,
                    right_line_num: Some(r_num),
                    left_text: None,
                    right_text: Some(r_text.to_string()),
                    line_type: DiffLineType::Unchanged,
                    left_inline: Vec::new(),
                    right_inline: Vec::new(),
                    chunk_id: None,
                });
            } else {
                active_inserts.push((r_num, r_text));
            }
        }

        if active_deletes.is_empty() && active_inserts.is_empty() {
            return;
        }

        // Check if there are genuine differences
        let max_len = active_deletes.len().max(active_inserts.len());
        let mut paired_results = Vec::new();
        let mut has_genuine_change = false;
        let mut has_real_deletes = false;
        let mut has_real_inserts = false;

        for i in 0..max_len {
            let left_item = active_deletes.get(i);
            let right_item = active_inserts.get(i);

            match (left_item, right_item) {
                (Some((l_num, l_text)), Some((r_num, r_text))) => {
                    if options.normalize_line(l_text) == options.normalize_line(r_text) {
                        paired_results.push(DiffLine {
                            left_line_num: Some(*l_num),
                            right_line_num: Some(*r_num),
                            left_text: Some(l_text.to_string()),
                            right_text: Some(r_text.to_string()),
                            line_type: DiffLineType::Unchanged,
                            left_inline: Vec::new(),
                            right_inline: Vec::new(),
                            chunk_id: None,
                        });
                    } else {
                        has_genuine_change = true;
                        has_real_deletes = true;
                        has_real_inserts = true;
                        let (l_spans, r_spans) = compute_inline_diff(l_text, r_text, options);
                        paired_results.push(DiffLine {
                            left_line_num: Some(*l_num),
                            right_line_num: Some(*r_num),
                            left_text: Some(l_text.to_string()),
                            right_text: Some(r_text.to_string()),
                            line_type: DiffLineType::Modified,
                            left_inline: l_spans,
                            right_inline: r_spans,
                            chunk_id: None,
                        });
                    }
                }
                (Some((l_num, l_text)), None) => {
                    has_genuine_change = true;
                    has_real_deletes = true;
                    paired_results.push(DiffLine {
                        left_line_num: Some(*l_num),
                        right_line_num: None,
                        left_text: Some(l_text.to_string()),
                        right_text: None,
                        line_type: DiffLineType::Deleted,
                        left_inline: Vec::new(),
                        right_inline: Vec::new(),
                        chunk_id: None,
                    });
                }
                (None, Some((r_num, r_text))) => {
                    has_genuine_change = true;
                    has_real_inserts = true;
                    paired_results.push(DiffLine {
                        left_line_num: None,
                        right_line_num: Some(*r_num),
                        left_text: None,
                        right_text: Some(r_text.to_string()),
                        line_type: DiffLineType::Added,
                        left_inline: Vec::new(),
                        right_inline: Vec::new(),
                        chunk_id: None,
                    });
                }
                (None, None) => unreachable!(),
            }
        }

        if !has_genuine_change {
            res_lines.extend(paired_results);
            return;
        }

        let chunk_id = chunks.len();
        let chunk_type = if has_real_deletes && has_real_inserts {
            *mod_cnt += 1;
            DiffChunkType::Modification
        } else if has_real_deletes {
            *del_cnt += 1;
            DiffChunkType::Deletion
        } else {
            *added_cnt += 1;
            DiffChunkType::Addition
        };

        let chunk_left_start = paired_results
            .iter()
            .find(|l| l.line_type != DiffLineType::Unchanged && l.left_line_num.is_some())
            .and_then(|l| l.left_line_num)
            .unwrap_or_else(|| {
                res_lines.last().and_then(|l| l.left_line_num).unwrap_or(0) + 1
            });

        let chunk_right_start = paired_results
            .iter()
            .find(|l| l.line_type != DiffLineType::Unchanged && l.right_line_num.is_some())
            .and_then(|l| l.right_line_num)
            .unwrap_or_else(|| {
                res_lines.last().and_then(|l| l.right_line_num).unwrap_or(0) + 1
            });

        let left_lines_collected: Vec<String> = paired_results
            .iter()
            .filter(|l| l.line_type != DiffLineType::Unchanged)
            .filter_map(|l| l.left_text.clone())
            .collect();

        let right_lines_collected: Vec<String> = paired_results
            .iter()
            .filter(|l| l.line_type != DiffLineType::Unchanged)
            .filter_map(|l| l.right_text.clone())
            .collect();

        chunks.push(DiffChunk {
            chunk_id,
            left_start: chunk_left_start,
            left_count: left_lines_collected.len(),
            right_start: chunk_right_start,
            right_count: right_lines_collected.len(),
            chunk_type,
            left_lines: left_lines_collected,
            right_lines: right_lines_collected,
        });

        for mut line in paired_results {
            if line.line_type != DiffLineType::Unchanged {
                line.chunk_id = Some(chunk_id);
            }
            res_lines.push(line);
        }
    };

    let mut left_idx = 0;
    let mut right_idx = 0;

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {
                flush_changes(
                    &mut current_deletes,
                    &mut current_inserts,
                    &mut result_lines,
                    &mut chunks,
                    &mut added_chunks,
                    &mut deleted_chunks,
                    &mut modified_chunks,
                );

                let orig_l = original_left_lines.get(left_idx).copied().unwrap_or("");
                let orig_r = original_right_lines.get(right_idx).copied().unwrap_or("");

                result_lines.push(DiffLine {
                    left_line_num: Some(left_line_counter),
                    right_line_num: Some(right_line_counter),
                    left_text: Some(orig_l.to_string()),
                    right_text: Some(orig_r.to_string()),
                    line_type: DiffLineType::Unchanged,
                    left_inline: Vec::new(),
                    right_inline: Vec::new(),
                    chunk_id: None,
                });

                left_line_counter += 1;
                right_line_counter += 1;
                left_idx += 1;
                right_idx += 1;
            }
            ChangeTag::Delete => {
                let orig_l = original_left_lines.get(left_idx).copied().unwrap_or("");
                current_deletes.push((left_line_counter, orig_l));
                left_line_counter += 1;
                left_idx += 1;
            }
            ChangeTag::Insert => {
                let orig_r = original_right_lines.get(right_idx).copied().unwrap_or("");
                current_inserts.push((right_line_counter, orig_r));
                right_line_counter += 1;
                right_idx += 1;
            }
        }
    }

    flush_changes(
        &mut current_deletes,
        &mut current_inserts,
        &mut result_lines,
        &mut chunks,
        &mut added_chunks,
        &mut deleted_chunks,
        &mut modified_chunks,
    );

    let is_identical = chunks.is_empty();

    DiffResult {
        lines: result_lines,
        chunks,
        total_left_lines: total_left,
        total_right_lines: total_right,
        added_chunks,
        deleted_chunks,
        modified_chunks,
        is_identical,
        hash_matched: is_identical && left_hash == right_hash,
    }
}
