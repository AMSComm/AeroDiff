use super::hash::fast_hash_bytes;
use super::inline::compute_inline_diff;
use super::options::{DiffOptions, IgnoreWhitespace};
use super::session::{
    get_diff_session_manager, scan_line_spans, CompactLine, DiffSession, SourceBuffer,
};
use super::types::{DiffChunk, DiffChunkType, DiffLine, DiffLineType, DiffResult};
use rayon::prelude::*;
use similar::{capture_diff_slices, Algorithm, ChangeTag, DiffOp, TextDiff};
use std::collections::{HashMap, HashSet};

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

        let line_count = lines.len();
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
            session_id: None,
            total_virtual_lines: line_count,
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

    let total_virtual_lines = result_lines.len();
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
        session_id: None,
        total_virtual_lines,
    }
}

fn longest_increasing_subsequence(pairs: &[(usize, usize)]) -> Vec<(usize, usize)> {
    if pairs.is_empty() {
        return Vec::new();
    }
    let mut tails_indices: Vec<usize> = Vec::new();
    let mut prev_indices: Vec<Option<usize>> = vec![None; pairs.len()];

    for (i, &(_, r_val)) in pairs.iter().enumerate() {
        let pos = tails_indices.binary_search_by(|&tail_idx| pairs[tail_idx].1.cmp(&r_val));

        let insert_pos = match pos {
            Ok(exact) => exact,
            Err(insertion_point) => insertion_point,
        };

        if insert_pos > 0 {
            prev_indices[i] = Some(tails_indices[insert_pos - 1]);
        }

        if insert_pos == tails_indices.len() {
            tails_indices.push(i);
        } else {
            tails_indices[insert_pos] = i;
        }
    }

    let mut lis = Vec::new();
    if let Some(&last_idx) = tails_indices.last() {
        let mut curr = Some(last_idx);
        while let Some(idx) = curr {
            lis.push(pairs[idx]);
            curr = prev_indices[idx];
        }
        lis.reverse();
    }
    lis
}

pub fn diff_slices_scalable<T: Eq + std::hash::Hash + Copy + Ord>(
    left: &[T],
    right: &[T],
    old_offset: usize,
    new_offset: usize,
) -> Vec<DiffOp> {
    if left.is_empty() && right.is_empty() {
        return Vec::new();
    }
    if left.is_empty() {
        return vec![DiffOp::Insert {
            old_index: old_offset,
            new_index: new_offset,
            new_len: right.len(),
        }];
    }
    if right.is_empty() {
        return vec![DiffOp::Delete {
            old_index: old_offset,
            old_len: left.len(),
            new_index: new_offset,
        }];
    }

    const MAX_MYERS_SIZE: usize = 5_000;
    if left.len() <= MAX_MYERS_SIZE && right.len() <= MAX_MYERS_SIZE {
        let ops = capture_diff_slices(Algorithm::Myers, left, right);
        return ops
            .into_iter()
            .map(|op| match op {
                DiffOp::Equal {
                    old_index,
                    new_index,
                    len,
                } => DiffOp::Equal {
                    old_index: old_index + old_offset,
                    new_index: new_index + new_offset,
                    len,
                },
                DiffOp::Delete {
                    old_index,
                    old_len,
                    new_index,
                } => DiffOp::Delete {
                    old_index: old_index + old_offset,
                    old_len,
                    new_index: new_index + new_offset,
                },
                DiffOp::Insert {
                    old_index,
                    new_index,
                    new_len,
                } => DiffOp::Insert {
                    old_index: old_index + old_offset,
                    new_index: new_index + new_offset,
                    new_len,
                },
                DiffOp::Replace {
                    old_index,
                    old_len,
                    new_index,
                    new_len,
                } => DiffOp::Replace {
                    old_index: old_index + old_offset,
                    old_len,
                    new_index: new_index + new_offset,
                    new_len,
                },
            })
            .collect();
    }

    // Step 1: Check for zero common elements (fast exit for schema changes / completely different files)
    let (smaller, larger) = if left.len() <= right.len() {
        (left, right)
    } else {
        (right, left)
    };

    let mut set = HashSet::with_capacity(smaller.len().min(500_000));
    for &h in smaller {
        set.insert(h);
    }

    let has_any_common = larger.iter().any(|h| set.contains(h));
    if !has_any_common {
        return vec![DiffOp::Replace {
            old_index: old_offset,
            old_len: left.len(),
            new_index: new_offset,
            new_len: right.len(),
        }];
    }

    // Step 2: Unique common anchors (Patience diff)
    let mut left_counts: HashMap<T, usize> = HashMap::new();
    for &h in left {
        *left_counts.entry(h).or_insert(0) += 1;
    }

    let mut right_counts: HashMap<T, usize> = HashMap::new();
    for &h in right {
        *right_counts.entry(h).or_insert(0) += 1;
    }

    let mut unique_right: HashMap<T, usize> = HashMap::new();
    for (r_idx, &h) in right.iter().enumerate() {
        if right_counts.get(&h) == Some(&1) && left_counts.get(&h) == Some(&1) {
            unique_right.insert(h, r_idx);
        }
    }

    let mut pairs = Vec::new();
    for (l_idx, &h) in left.iter().enumerate() {
        if let Some(&r_idx) = unique_right.get(&h) {
            pairs.push((l_idx, r_idx));
        }
    }

    if !pairs.is_empty() {
        let anchors = longest_increasing_subsequence(&pairs);
        if !anchors.is_empty() {
            let mut result = Vec::new();
            let mut curr_l = 0;
            let mut curr_r = 0;

            for (anchor_l, anchor_r) in anchors {
                let mut match_len = 1;
                while curr_l <= anchor_l
                    && curr_r <= anchor_r
                    && anchor_l + match_len < left.len()
                    && anchor_r + match_len < right.len()
                    && left[anchor_l + match_len] == right[anchor_r + match_len]
                {
                    match_len += 1;
                }

                if anchor_l > curr_l || anchor_r > curr_r {
                    let sub_ops = diff_slices_scalable(
                        &left[curr_l..anchor_l],
                        &right[curr_r..anchor_r],
                        old_offset + curr_l,
                        new_offset + curr_r,
                    );
                    result.extend(sub_ops);
                }

                result.push(DiffOp::Equal {
                    old_index: old_offset + anchor_l,
                    new_index: new_offset + anchor_r,
                    len: match_len,
                });

                curr_l = anchor_l + match_len;
                curr_r = anchor_r + match_len;
            }

            if curr_l < left.len() || curr_r < right.len() {
                let sub_ops = diff_slices_scalable(
                    &left[curr_l..],
                    &right[curr_r..],
                    old_offset + curr_l,
                    new_offset + curr_r,
                );
                result.extend(sub_ops);
            }

            return result;
        }
    }

    // Step 3: Common elements exist, but none are unique (e.g. repetitive lines).
    // Partition into chunks of MAX_MYERS_SIZE so Myers never runs on >5000 lines.
    let chunk_size = MAX_MYERS_SIZE;
    let mut result = Vec::new();
    let mut l_start = 0;
    let mut r_start = 0;

    let l_ratio = left.len() as f64;
    let r_ratio = right.len() as f64;

    while l_start < left.len() || r_start < right.len() {
        if l_start >= left.len() {
            result.push(DiffOp::Insert {
                old_index: old_offset + left.len(),
                new_index: new_offset + r_start,
                new_len: right.len() - r_start,
            });
            break;
        }
        if r_start >= right.len() {
            result.push(DiffOp::Delete {
                old_index: old_offset + l_start,
                old_len: left.len() - l_start,
                new_index: new_offset + right.len(),
            });
            break;
        }

        let l_end = (l_start + chunk_size).min(left.len());
        let r_take = ((l_end - l_start) as f64 * (r_ratio / l_ratio)).round() as usize;
        let r_end = (r_start + r_take.max(1)).min(right.len());

        let sub_ops = diff_slices_scalable(
            &left[l_start..l_end],
            &right[r_start..r_end],
            old_offset + l_start,
            new_offset + r_start,
        );
        result.extend(sub_ops);

        l_start = l_end;
        r_start = r_end;
    }

    result
}

pub fn compute_diff_session_from_sources(
    left_source: SourceBuffer,
    right_source: SourceBuffer,
    options: &DiffOptions,
) -> DiffResult {
    let left_bytes = left_source.as_bytes();
    let right_bytes = right_source.as_bytes();

    let left_spans = scan_line_spans(left_bytes);
    let right_spans = scan_line_spans(right_bytes);

    let total_left = left_spans.len();
    let total_right = right_spans.len();

    let is_default_opts = options.ignore_whitespace == IgnoreWhitespace::None
        && !options.ignore_blank_lines
        && !options.ignore_case
        && options.regex_filter.is_none();

    let left_hash = fast_hash_bytes(left_bytes);
    let right_hash = fast_hash_bytes(right_bytes);

    // Fast path: Exact byte match
    if is_default_opts && left_hash == right_hash && left_bytes == right_bytes {
        let compact_lines: Vec<CompactLine> = (0..total_left)
            .map(|i| CompactLine {
                left_line_num: Some((i + 1) as u32),
                right_line_num: Some((i + 1) as u32),
                line_type: DiffLineType::Unchanged,
                chunk_id: None,
                left_span: Some(left_spans[i]),
                right_span: Some(right_spans[i]),
            })
            .collect();

        let session_id = uuid::Uuid::new_v4().to_string();
        let session = DiffSession {
            session_id: session_id.clone(),
            total_virtual_lines: total_left,
            total_left_lines: total_left,
            total_right_lines: total_right,
            added_chunks: 0,
            deleted_chunks: 0,
            modified_chunks: 0,
            is_identical: true,
            hash_matched: true,
            chunks: Vec::new(),
            lines: compact_lines,
            left_source: Some(left_source),
            right_source: Some(right_source),
            options: options.clone(),
            created_at: std::time::Instant::now(),
        };

        let initial_slice = session.get_slice(0, 100);
        get_diff_session_manager().insert_session(session);

        return DiffResult {
            lines: initial_slice,
            chunks: Vec::new(),
            total_left_lines: total_left,
            total_right_lines: total_right,
            added_chunks: 0,
            deleted_chunks: 0,
            modified_chunks: 0,
            is_identical: true,
            hash_matched: true,
            session_id: Some(session_id),
            total_virtual_lines: total_left,
        };
    }

    // Hash lines in parallel using Rayon
    let left_hashes: Vec<u32> = if is_default_opts {
        left_spans
            .par_iter()
            .map(|&(off, len)| {
                let slice = &left_bytes[off as usize..(off as usize + len as usize)];
                fast_hash_bytes(slice)
            })
            .collect()
    } else {
        left_spans
            .par_iter()
            .map(|&(off, len)| {
                let slice = &left_bytes[off as usize..(off as usize + len as usize)];
                let text = String::from_utf8_lossy(slice);
                let norm = options.normalize_line(&text);
                fast_hash_bytes(norm.as_bytes())
            })
            .collect()
    };

    let right_hashes: Vec<u32> = if is_default_opts {
        right_spans
            .par_iter()
            .map(|&(off, len)| {
                let slice = &right_bytes[off as usize..(off as usize + len as usize)];
                fast_hash_bytes(slice)
            })
            .collect()
    } else {
        right_spans
            .par_iter()
            .map(|&(off, len)| {
                let slice = &right_bytes[off as usize..(off as usize + len as usize)];
                let text = String::from_utf8_lossy(slice);
                let norm = options.normalize_line(&text);
                fast_hash_bytes(norm.as_bytes())
            })
            .collect()
    };

    // Trim common prefix
    let mut prefix_len = 0;
    while prefix_len < left_hashes.len()
        && prefix_len < right_hashes.len()
        && left_hashes[prefix_len] == right_hashes[prefix_len]
    {
        prefix_len += 1;
    }

    // Trim common suffix
    let mut suffix_len = 0;
    while suffix_len < (left_hashes.len() - prefix_len)
        && suffix_len < (right_hashes.len() - prefix_len)
        && left_hashes[left_hashes.len() - 1 - suffix_len] == right_hashes[right_hashes.len() - 1 - suffix_len]
    {
        suffix_len += 1;
    }

    let mut compact_lines = Vec::with_capacity(total_left.max(total_right));
    let mut chunks = Vec::new();
    let mut added_chunks = 0;
    let mut deleted_chunks = 0;
    let mut modified_chunks = 0;

    // 1. Add prefix lines
    for i in 0..prefix_len {
        compact_lines.push(CompactLine {
            left_line_num: Some((i + 1) as u32),
            right_line_num: Some((i + 1) as u32),
            line_type: DiffLineType::Unchanged,
            chunk_id: None,
            left_span: Some(left_spans[i]),
            right_span: Some(right_spans[i]),
        });
    }

    let mid_left_end = left_hashes.len() - suffix_len;
    let mid_right_end = right_hashes.len() - suffix_len;

    // 2. Diff middle section
    if prefix_len < mid_left_end || prefix_len < mid_right_end {
        let mid_left = &left_hashes[prefix_len..mid_left_end];
        let mid_right = &right_hashes[prefix_len..mid_right_end];

        let diff_ops = diff_slices_scalable(mid_left, mid_right, 0, 0);

        for op in diff_ops {
            match op {
                DiffOp::Equal {
                    old_index,
                    new_index,
                    len,
                } => {
                    for k in 0..len {
                        let l_idx = prefix_len + old_index + k;
                        let r_idx = prefix_len + new_index + k;

                        compact_lines.push(CompactLine {
                            left_line_num: Some((l_idx + 1) as u32),
                            right_line_num: Some((r_idx + 1) as u32),
                            line_type: DiffLineType::Unchanged,
                            chunk_id: None,
                            left_span: left_spans.get(l_idx).copied(),
                            right_span: right_spans.get(r_idx).copied(),
                        });
                    }
                }
                DiffOp::Delete {
                    old_index,
                    old_len,
                    new_index,
                } => {
                    deleted_chunks += 1;
                    let chunk_id = chunks.len();
                    let l_start = prefix_len + old_index + 1;
                    let r_start = prefix_len + new_index + 1;

                    chunks.push(DiffChunk {
                        chunk_id,
                        left_start: l_start,
                        left_count: old_len,
                        right_start: r_start,
                        right_count: 0,
                        chunk_type: DiffChunkType::Deletion,
                        left_lines: Vec::new(),
                        right_lines: Vec::new(),
                    });

                    for k in 0..old_len {
                        let l_idx = prefix_len + old_index + k;
                        compact_lines.push(CompactLine {
                            left_line_num: Some((l_idx + 1) as u32),
                            right_line_num: None,
                            line_type: DiffLineType::Deleted,
                            chunk_id: Some(chunk_id as u32),
                            left_span: left_spans.get(l_idx).copied(),
                            right_span: None,
                        });
                    }
                }
                DiffOp::Insert {
                    old_index,
                    new_index,
                    new_len,
                } => {
                    added_chunks += 1;
                    let chunk_id = chunks.len();
                    let l_start = prefix_len + old_index + 1;
                    let r_start = prefix_len + new_index + 1;

                    chunks.push(DiffChunk {
                        chunk_id,
                        left_start: l_start,
                        left_count: 0,
                        right_start: r_start,
                        right_count: new_len,
                        chunk_type: DiffChunkType::Addition,
                        left_lines: Vec::new(),
                        right_lines: Vec::new(),
                    });

                    for k in 0..new_len {
                        let r_idx = prefix_len + new_index + k;
                        compact_lines.push(CompactLine {
                            left_line_num: None,
                            right_line_num: Some((r_idx + 1) as u32),
                            line_type: DiffLineType::Added,
                            chunk_id: Some(chunk_id as u32),
                            left_span: None,
                            right_span: right_spans.get(r_idx).copied(),
                        });
                    }
                }
                DiffOp::Replace {
                    old_index,
                    old_len,
                    new_index,
                    new_len,
                } => {
                    modified_chunks += 1;
                    let chunk_id = chunks.len();
                    let l_start = prefix_len + old_index + 1;
                    let r_start = prefix_len + new_index + 1;

                    chunks.push(DiffChunk {
                        chunk_id,
                        left_start: l_start,
                        left_count: old_len,
                        right_start: r_start,
                        right_count: new_len,
                        chunk_type: DiffChunkType::Modification,
                        left_lines: Vec::new(),
                        right_lines: Vec::new(),
                    });

                    let max_len = old_len.max(new_len);
                    for k in 0..max_len {
                        let has_left = k < old_len;
                        let has_right = k < new_len;

                        let l_idx = if has_left {
                            Some(prefix_len + old_index + k)
                        } else {
                            None
                        };
                        let r_idx = if has_right {
                            Some(prefix_len + new_index + k)
                        } else {
                            None
                        };

                        let line_type = if has_left && has_right {
                            DiffLineType::Modified
                        } else if has_left {
                            DiffLineType::Deleted
                        } else {
                            DiffLineType::Added
                        };

                        compact_lines.push(CompactLine {
                            left_line_num: l_idx.map(|idx| (idx + 1) as u32),
                            right_line_num: r_idx.map(|idx| (idx + 1) as u32),
                            line_type,
                            chunk_id: Some(chunk_id as u32),
                            left_span: l_idx.and_then(|idx| left_spans.get(idx).copied()),
                            right_span: r_idx.and_then(|idx| right_spans.get(idx).copied()),
                        });
                    }
                }
            }
        }
    }

    // 3. Add suffix lines
    for i in 0..suffix_len {
        let l_idx = mid_left_end + i;
        let r_idx = mid_right_end + i;

        compact_lines.push(CompactLine {
            left_line_num: Some((l_idx + 1) as u32),
            right_line_num: Some((r_idx + 1) as u32),
            line_type: DiffLineType::Unchanged,
            chunk_id: None,
            left_span: left_spans.get(l_idx).copied(),
            right_span: right_spans.get(r_idx).copied(),
        });
    }

    let is_identical = chunks.is_empty();
    let total_virtual_lines = compact_lines.len();

    let session_id = uuid::Uuid::new_v4().to_string();
    let session = DiffSession {
        session_id: session_id.clone(),
        total_virtual_lines,
        total_left_lines: total_left,
        total_right_lines: total_right,
        added_chunks,
        deleted_chunks,
        modified_chunks,
        is_identical,
        hash_matched: is_identical && left_hash == right_hash,
        chunks: chunks.clone(),
        lines: compact_lines,
        left_source: Some(left_source),
        right_source: Some(right_source),
        options: options.clone(),
        created_at: std::time::Instant::now(),
    };

    let slice_limit = if total_virtual_lines <= 2_000 {
        total_virtual_lines
    } else {
        100
    };

    let initial_slice = session.get_slice(0, slice_limit);
    get_diff_session_manager().insert_session(session);

    DiffResult {
        lines: initial_slice,
        chunks,
        total_left_lines: total_left,
        total_right_lines: total_right,
        added_chunks,
        deleted_chunks,
        modified_chunks,
        is_identical,
        hash_matched: is_identical && left_hash == right_hash,
        session_id: Some(session_id),
        total_virtual_lines,
    }
}
