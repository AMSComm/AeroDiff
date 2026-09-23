use super::options::{DiffOptions, IgnoreWhitespace};
use super::types::InlineSpan;
use similar::{Algorithm, ChangeTag, TextDiff};

fn push_span(spans: &mut Vec<InlineSpan>, start: usize, end: usize, highlight: bool) {
    if start >= end {
        return;
    }
    if let Some(last) = spans.last_mut() {
        if last.highlight == highlight && last.end == start {
            last.end = end;
            return;
        }
    }
    spans.push(InlineSpan {
        start,
        end,
        highlight,
    });
}

pub fn compute_inline_diff(
    left: &str,
    right: &str,
    options: &DiffOptions,
) -> (Vec<InlineSpan>, Vec<InlineSpan>) {
    if left == right || options.normalize_line(left) == options.normalize_line(right) {
        let left_len = left.chars().count();
        let right_len = right.chars().count();
        let l_spans = if left_len > 0 {
            vec![InlineSpan {
                start: 0,
                end: left_len,
                highlight: false,
            }]
        } else {
            Vec::new()
        };
        let r_spans = if right_len > 0 {
            vec![InlineSpan {
                start: 0,
                end: right_len,
                highlight: false,
            }]
        } else {
            Vec::new()
        };
        return (l_spans, r_spans);
    }

    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let left_len = left_chars.len();
    let right_len = right_chars.len();

    let chars_match = |c1: char, c2: char| -> bool {
        if c1 == c2 {
            return true;
        }
        if options.ignore_case && c1.to_lowercase().eq(c2.to_lowercase()) {
            return true;
        }
        false
    };

    // 1. Common Prefix Trimming (respecting ignore_case)
    let mut prefix_len = 0;
    while prefix_len < left_len && prefix_len < right_len && chars_match(left_chars[prefix_len], right_chars[prefix_len]) {
        prefix_len += 1;
    }

    // 2. Common Suffix Trimming (respecting ignore_case)
    let mut suffix_len = 0;
    while suffix_len < (left_len - prefix_len)
        && suffix_len < (right_len - prefix_len)
        && chars_match(left_chars[left_len - 1 - suffix_len], right_chars[right_len - 1 - suffix_len])
    {
        suffix_len += 1;
    }

    let mut left_spans: Vec<InlineSpan> = Vec::new();
    let mut right_spans: Vec<InlineSpan> = Vec::new();

    // Add common prefix
    if prefix_len > 0 {
        push_span(&mut left_spans, 0, prefix_len, false);
        push_span(&mut right_spans, 0, prefix_len, false);
    }

    let left_mid_len = left_len - prefix_len - suffix_len;
    let right_mid_len = right_len - prefix_len - suffix_len;

    // Detect first & last non-whitespace characters for robust leading/trailing whitespace ignoring
    let left_first_non_ws = left_chars.iter().position(|c| !c.is_whitespace());
    let left_last_non_ws = left_chars.iter().rposition(|c| !c.is_whitespace());
    let right_first_non_ws = right_chars.iter().position(|c| !c.is_whitespace());
    let right_last_non_ws = right_chars.iter().rposition(|c| !c.is_whitespace());

    // Fast bailout if middle differing slice is huge
    if left_mid_len > 300 || right_mid_len > 300 {
        if left_mid_len > 0 {
            push_span(&mut left_spans, prefix_len, prefix_len + left_mid_len, true);
        }
        if right_mid_len > 0 {
            push_span(&mut right_spans, prefix_len, prefix_len + right_mid_len, true);
        }
    } else if left_mid_len > 0 || right_mid_len > 0 {
        let left_mid_slice = &left_chars[prefix_len..left_len - suffix_len];
        let right_mid_slice = &right_chars[prefix_len..right_len - suffix_len];

        let left_mid: String = left_mid_slice.iter().collect();
        let right_mid: String = right_mid_slice.iter().collect();

        let left_compare: String = if options.ignore_case {
            left_mid.to_lowercase()
        } else {
            left_mid.clone()
        };
        let right_compare: String = if options.ignore_case {
            right_mid.to_lowercase()
        } else {
            right_mid.clone()
        };

        let diff = TextDiff::configure()
            .algorithm(Algorithm::Myers)
            .diff_chars(&left_compare, &right_compare);

        let mut curr_l = prefix_len;
        let mut curr_r = prefix_len;

        for change in diff.iter_all_changes() {
            let val = change.value();
            let c_len = val.chars().count();
            match change.tag() {
                ChangeTag::Equal => {
                    push_span(&mut left_spans, curr_l, curr_l + c_len, false);
                    push_span(&mut right_spans, curr_r, curr_r + c_len, false);
                    curr_l += c_len;
                    curr_r += c_len;
                }
                ChangeTag::Delete => {
                    let is_whitespace_ignored = match options.ignore_whitespace {
                        IgnoreWhitespace::All => val.chars().all(|c| c.is_whitespace()),
                        IgnoreWhitespace::LeadingAndTrailing => {
                            val.chars().all(|c| c.is_whitespace())
                                && (left_first_non_ws.map_or(true, |f| curr_l + c_len <= f)
                                    || left_last_non_ws.map_or(true, |l| curr_l >= l + 1))
                        }
                        IgnoreWhitespace::None => false,
                    };

                    push_span(&mut left_spans, curr_l, curr_l + c_len, !is_whitespace_ignored);
                    curr_l += c_len;
                }
                ChangeTag::Insert => {
                    let is_whitespace_ignored = match options.ignore_whitespace {
                        IgnoreWhitespace::All => val.chars().all(|c| c.is_whitespace()),
                        IgnoreWhitespace::LeadingAndTrailing => {
                            val.chars().all(|c| c.is_whitespace())
                                && (right_first_non_ws.map_or(true, |f| curr_r + c_len <= f)
                                    || right_last_non_ws.map_or(true, |l| curr_r >= l + 1))
                        }
                        IgnoreWhitespace::None => false,
                    };

                    push_span(&mut right_spans, curr_r, curr_r + c_len, !is_whitespace_ignored);
                    curr_r += c_len;
                }
            }
        }
    }

    // Add common suffix
    if suffix_len > 0 {
        push_span(&mut left_spans, left_len - suffix_len, left_len, false);
        push_span(&mut right_spans, right_len - suffix_len, right_len, false);
    }

    (left_spans, right_spans)
}
