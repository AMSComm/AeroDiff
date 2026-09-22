use super::types::InlineSpan;
use similar::{Algorithm, ChangeTag, TextDiff};

pub fn compute_inline_diff(left: &str, right: &str) -> (Vec<InlineSpan>, Vec<InlineSpan>) {
    let diff = TextDiff::configure()
        .algorithm(Algorithm::Myers)
        .diff_chars(left, right);

    let mut left_spans = Vec::new();
    let mut right_spans = Vec::new();

    let mut left_idx = 0;
    let mut right_idx = 0;

    for change in diff.iter_all_changes() {
        let text = change.value();
        let len = text.chars().count();

        match change.tag() {
            ChangeTag::Equal => {
                left_spans.push(InlineSpan {
                    start: left_idx,
                    end: left_idx + len,
                    highlight: false,
                });
                right_spans.push(InlineSpan {
                    start: right_idx,
                    end: right_idx + len,
                    highlight: false,
                });
                left_idx += len;
                right_idx += len;
            }
            ChangeTag::Delete => {
                left_spans.push(InlineSpan {
                    start: left_idx,
                    end: left_idx + len,
                    highlight: true,
                });
                left_idx += len;
            }
            ChangeTag::Insert => {
                right_spans.push(InlineSpan {
                    start: right_idx,
                    end: right_idx + len,
                    highlight: true,
                });
                right_idx += len;
            }
        }
    }

    (left_spans, right_spans)
}
