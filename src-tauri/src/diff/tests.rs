#[cfg(test)]
mod tests {
    use super::super::engine::compute_diff;
    use super::super::hash::fast_hash_bytes;
    use super::super::merge::{merge_chunk_left_to_right, merge_chunk_right_to_left};
    use super::super::options::{DiffOptions, IgnoreWhitespace};
    use super::super::types::{DiffChunkType, DiffLineType};

    #[test]
    fn test_identical_content() {
        let left = "line 1\nline 2\nline 3";
        let right = "line 1\nline 2\nline 3";
        let options = DiffOptions::default();

        let result = compute_diff(left, right, &options);

        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
        assert_eq!(result.lines.len(), 3);
        for line in &result.lines {
            assert_eq!(line.line_type, DiffLineType::Unchanged);
        }
    }

    #[test]
    fn test_simple_addition() {
        let left = "alpha\ngamma";
        let right = "alpha\nbeta\ngamma";
        let options = DiffOptions::default();

        let result = compute_diff(left, right, &options);

        assert!(!result.is_identical);
        assert_eq!(result.chunks.len(), 1);
        let chunk = &result.chunks[0];
        assert_eq!(chunk.chunk_type, DiffChunkType::Addition);
        assert_eq!(chunk.right_lines, vec!["beta"]);
    }

    #[test]
    fn test_simple_deletion() {
        let left = "alpha\nbeta\ngamma";
        let right = "alpha\ngamma";
        let options = DiffOptions::default();

        let result = compute_diff(left, right, &options);

        assert!(!result.is_identical);
        assert_eq!(result.chunks.len(), 1);
        let chunk = &result.chunks[0];
        assert_eq!(chunk.chunk_type, DiffChunkType::Deletion);
        assert_eq!(chunk.left_lines, vec!["beta"]);
    }

    #[test]
    fn test_modification_with_inline_highlight() {
        let left = "Hello world";
        let right = "Hello brave world";
        let options = DiffOptions::default();

        let result = compute_diff(left, right, &options);

        assert!(!result.is_identical);
        assert_eq!(result.chunks.len(), 1);
        let chunk = &result.chunks[0];
        assert_eq!(chunk.chunk_type, DiffChunkType::Modification);

        // Check inline highlight on right side has highlighted "brave "
        let mod_line = result.lines.iter().find(|l| l.line_type == DiffLineType::Modified).unwrap();
        let right_highlights: Vec<_> = mod_line.right_inline.iter().filter(|s| s.highlight).collect();
        assert!(!right_highlights.is_empty());
    }

    #[test]
    fn test_ignore_whitespace_leading_trailing() {
        let left = "  value = 100   ";
        let right = "value = 100";
        let mut options = DiffOptions::default();
        options.ignore_whitespace = IgnoreWhitespace::LeadingAndTrailing;

        let result = compute_diff(left, right, &options);

        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
    }

    #[test]
    fn test_ignore_whitespace_all() {
        let left = "let a = b + c;";
        let right = "let a=b+c;";
        let mut options = DiffOptions::default();
        options.ignore_whitespace = IgnoreWhitespace::All;

        let result = compute_diff(left, right, &options);

        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
    }

    #[test]
    fn test_ignore_blank_lines() {
        let left = "header\n\n\nfooter";
        let right = "header\nfooter";
        let mut options = DiffOptions::default();
        options.ignore_blank_lines = true;

        let result = compute_diff(left, right, &options);

        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
    }

    #[test]
    fn test_ignore_case() {
        let left = "FUNCTION CalculateTotal()";
        let right = "function calculatetotal()";
        let mut options = DiffOptions::default();
        options.ignore_case = true;

        let result = compute_diff(left, right, &options);

        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
    }

    #[test]
    fn test_regex_line_filter() {
        let left = "// Build timestamp: 2026-01-01\nconst x = 10;";
        let right = "// Build timestamp: 2026-09-22\nconst x = 10;";
        let mut options = DiffOptions::default();
        options.regex_filter = Some("^// Build timestamp:.*".to_string());

        let result = compute_diff(left, right, &options);

        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
    }

    #[test]
    fn test_chunk_merge_left_to_right() {
        let left = "alpha\nNEW_FEATURE\ngamma";
        let right = "alpha\ngamma";
        let options = DiffOptions::default();

        let result = compute_diff(left, right, &options);
        assert_eq!(result.chunks.len(), 1);

        let merged_right = merge_chunk_left_to_right(left, right, 0, &result);
        assert_eq!(merged_right, "alpha\nNEW_FEATURE\ngamma");
    }

    #[test]
    fn test_chunk_merge_right_to_left() {
        let left = "alpha\nOLD_CODE\ngamma";
        let right = "alpha\nNEW_CODE\ngamma";
        let options = DiffOptions::default();

        let result = compute_diff(left, right, &options);
        assert_eq!(result.chunks.len(), 1);

        let merged_left = merge_chunk_right_to_left(left, right, 0, &result);
        assert_eq!(merged_left, "alpha\nNEW_CODE\ngamma");
    }

    #[test]
    fn test_fast_hash_equality() {
        let data1 = b"Hello world large data content";
        let data2 = b"Hello world large data content";
        let data3 = b"Hello world different content";

        let hash1 = fast_hash_bytes(data1);
        let hash2 = fast_hash_bytes(data2);
        let hash3 = fast_hash_bytes(data3);

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }
}
