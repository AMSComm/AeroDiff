use super::types::InlineSpan;
use similar::{Algorithm, ChangeTag, TextDiff};

pub fn compute_inline_diff(left: &str, right: &str) -> (Vec<InlineSpan>, Vec<InlineSpan>) {
    if left == right {
        let len = left.chars().count();
        let spans = if len > 0 {
            vec![InlineSpan {
                start: 0,
                end: len,
                highlight: false,
            }]
        } else {
            Vec::new()
        };
        return (spans.clone(), spans);
    }

    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let left_len = left_chars.len();
    let right_len = right_chars.len();

    // 1. Common Prefix Trimming
    let mut prefix_len = 0;
    while prefix_len < left_len && prefix_len < right_len && left_chars[prefix_len] == right_chars[prefix_len] {
        prefix_len += 1;
    }

    // 2. Common Suffix Trimming
    let mut suffix_len = 0;
    while suffix_len < (left_len - prefix_len)
        && suffix_len < (right_len - prefix_len)
        && left_chars[left_len - 1 - suffix_len] == right_chars[right_len - 1 - suffix_len]
    {
        suffix_len += 1;
    }

    let mut left_spans = Vec::new();
    let mut right_spans = Vec::new();

    // Add common prefix
    if prefix_len > 0 {
        left_spans.push(InlineSpan {
            start: 0,
            end: prefix_len,
            highlight: false,
        });
        right_spans.push(InlineSpan {
            start: 0,
            end: prefix_len,
            highlight: false,
        });
    }

    let left_mid_len = left_len - prefix_len - suffix_len;
    let right_mid_len = right_len - prefix_len - suffix_len;

    // Fast bailout if middle differing slice is huge: avoids O(N*M) char diff freezing
    if left_mid_len > 300 || right_mid_len > 300 {
        if left_mid_len > 0 {
            left_spans.push(InlineSpan {
                start: prefix_len,
                end: prefix_len + left_mid_len,
                highlight: true,
            });
        }
        if right_mid_len > 0 {
            right_spans.push(InlineSpan {
                start: prefix_len,
                end: prefix_len + right_mid_len,
                highlight: true,
            });
        }
    } else if left_mid_len > 0 || right_mid_len > 0 {
        let left_mid: String = left_chars[prefix_len..left_len - suffix_len].iter().collect();
        let right_mid: String = right_chars[prefix_len..right_len - suffix_len].iter().collect();

        let diff = TextDiff::configure()
            .algorithm(Algorithm::Myers)
            .diff_chars(&left_mid, &right_mid);

        let mut curr_l = prefix_len;
        let mut curr_r = prefix_len;

        for change in diff.iter_all_changes() {
            let val = change.value();
            let c_len = val.chars().count();
            match change.tag() {
                ChangeTag::Equal => {
                    left_spans.push(InlineSpan {
                        start: curr_l,
                        end: curr_l + c_len,
                        highlight: false,
                    });
                    right_spans.push(InlineSpan {
                        start: curr_r,
                        end: curr_r + c_len,
                        highlight: false,
                    });
                    curr_l += c_len;
                    curr_r += c_len;
                }
                ChangeTag::Delete => {
                    left_spans.push(InlineSpan {
                        start: curr_l,
                        end: curr_l + c_len,
                        highlight: true,
                    });
                    curr_l += c_len;
                }
                ChangeTag::Insert => {
                    right_spans.push(InlineSpan {
                        start: curr_r,
                        end: curr_r + c_len,
                        highlight: true,
                    });
                    curr_r += c_len;
                }
            }
        }
    }

    // Add common suffix
    if suffix_len > 0 {
        left_spans.push(InlineSpan {
            start: left_len - suffix_len,
            end: left_len,
            highlight: false,
        });
        right_spans.push(InlineSpan {
            start: right_len - suffix_len,
            end: right_len,
            highlight: false,
        });
    }

    (left_spans, right_spans)
}
