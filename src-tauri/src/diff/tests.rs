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

    #[test]
    fn test_modified_line_with_ignore_case_inline() {
        let left = "User: Alice";
        let right = "user: Bob";
        let mut options = DiffOptions::default();
        options.ignore_case = true;

        let result = compute_diff(left, right, &options);
        assert!(!result.is_identical);
        assert_eq!(result.chunks.len(), 1);

        let line = &result.lines[0];
        assert_eq!(line.line_type, DiffLineType::Modified);

        // Verify "User: " / "user: " is NOT highlighted because ignore_case is active
        let left_highlights: Vec<_> = line.left_inline.iter().filter(|s| s.highlight).collect();
        let right_highlights: Vec<_> = line.right_inline.iter().filter(|s| s.highlight).collect();

        // Only "Alice" (length 5) and "Bob" (length 3) should be highlighted
        assert_eq!(left_highlights.len(), 1);
        assert_eq!(left_highlights[0].end - left_highlights[0].start, 5); // "Alice"

        assert_eq!(right_highlights.len(), 1);
        assert_eq!(right_highlights[0].end - right_highlights[0].start, 3); // "Bob"
    }

    #[test]
    fn test_modified_line_with_ignore_whitespace_inline() {
        let left = "  let x = 1;";
        let right = "let x = 2;";
        let mut options = DiffOptions::default();
        options.ignore_whitespace = IgnoreWhitespace::LeadingAndTrailing;

        let result = compute_diff(left, right, &options);
        assert!(!result.is_identical);
        assert_eq!(result.chunks.len(), 1);

        let line = &result.lines[0];
        assert_eq!(line.line_type, DiffLineType::Modified);

        // Leading spaces should NOT be highlighted
        let left_highlights: Vec<_> = line.left_inline.iter().filter(|s| s.highlight).collect();
        let right_highlights: Vec<_> = line.right_inline.iter().filter(|s| s.highlight).collect();

        assert_eq!(left_highlights.len(), 1);
        assert_eq!(&left[left_highlights[0].start..left_highlights[0].end], "1");

        assert_eq!(right_highlights.len(), 1);
        assert_eq!(&right[right_highlights[0].start..right_highlights[0].end], "2");
    }

    #[test]
    fn test_lines_differ_only_by_ignored_attributes_no_chunk() {
        let left = "  Hello  \nWorld\n\n";
        let right = "hello\nworld";
        let mut options = DiffOptions::default();
        options.ignore_whitespace = IgnoreWhitespace::LeadingAndTrailing;
        options.ignore_case = true;
        options.ignore_blank_lines = true;

        let result = compute_diff(left, right, &options);
        assert!(result.is_identical);
        assert_eq!(result.chunks.len(), 0);
        for line in &result.lines {
            assert_eq!(line.line_type, DiffLineType::Unchanged);
            assert!(line.chunk_id.is_none());
        }
    }

    #[test]
    fn test_streaming_diff_session() {
        use super::super::engine::compute_diff_session_from_sources;
        use super::super::session::{get_diff_session_manager, SourceBuffer};
        use std::sync::Arc;

        let left = "common_head\nalpha\nmod1\ncommon_tail";
        let right = "common_head\nmod2\ngamma\ncommon_tail";
        let options = DiffOptions::default();

        let left_src = SourceBuffer::Memory(Arc::new(left.as_bytes().to_vec()));
        let right_src = SourceBuffer::Memory(Arc::new(right.as_bytes().to_vec()));

        let res = compute_diff_session_from_sources(left_src, right_src, &options);
        assert!(!res.is_identical);
        assert!(res.session_id.is_some());
        assert_eq!(res.total_left_lines, 4);
        assert_eq!(res.total_right_lines, 4);

        let sid = res.session_id.unwrap();
        let slice = get_diff_session_manager().get_slice(&sid, 0, 10).unwrap();
        assert!(!slice.is_empty());

        // First line is common_head Unchanged
        assert_eq!(slice[0].line_type, DiffLineType::Unchanged);
        assert_eq!(slice[0].left_text.as_deref(), Some("common_head"));
        assert_eq!(slice[0].right_text.as_deref(), Some("common_head"));

        // Last line is common_tail Unchanged
        let last = slice.last().unwrap();
        assert_eq!(last.line_type, DiffLineType::Unchanged);
        assert_eq!(last.left_text.as_deref(), Some("common_tail"));
    }

    #[test]
    fn test_compare_real_heavy_files() {
        use crate::commands::compare_files;
        let p1 = "/Users/huy/Downloads/journal_detail_monthly_20260901.csv";
        let p2 = "/Users/huy/Downloads/journal_detail_monthly_20260925.csv";
        if !std::path::Path::new(p1).exists() || !std::path::Path::new(p2).exists() {
            return;
        }

        let start = std::time::Instant::now();
        let res = compare_files(p1.to_string(), p2.to_string(), DiffOptions::default(), None, None).unwrap();
        let elapsed = start.elapsed();
        println!("🚀 Heavy files compared in {:?}", elapsed);
        println!("Total virtual lines: {}", res.total_virtual_lines);
        println!("Session ID: {:?}", res.session_id);
        println!("Chunks: {}", res.chunks.len());
        assert!(!res.is_identical);
        assert!(res.total_virtual_lines > 2_000_000);
    }
}
