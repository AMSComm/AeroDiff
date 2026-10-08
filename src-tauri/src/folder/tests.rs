#[cfg(test)]
mod tests {
    use crate::folder::engine::compare_folders;
    use crate::folder::types::{FolderCompareOptions, FolderItemStatus};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_compare_folders_recursive() {
        let dir_left = tempdir().unwrap();
        let dir_right = tempdir().unwrap();

        // Identical file
        fs::write(dir_left.path().join("same.txt"), "hello world").unwrap();
        fs::write(dir_right.path().join("same.txt"), "hello world").unwrap();

        // Modified file
        fs::write(dir_left.path().join("changed.txt"), "old content").unwrap();
        fs::write(dir_right.path().join("changed.txt"), "new content").unwrap();

        // Left only
        fs::write(dir_left.path().join("left_only.txt"), "left").unwrap();

        // Right only
        fs::write(dir_right.path().join("right_only.txt"), "right").unwrap();

        let opts = FolderCompareOptions {
            deep_hash: Some(true),
            ignore_line_endings: Some(false),
            ignore_whitespace: Some(false),
            include_hidden_folders: Some(false),
        };
        let result = compare_folders(dir_left.path(), dir_right.path(), opts, |_| {}).unwrap();

        assert_eq!(result.total_identical, 1);
        assert_eq!(result.total_modified, 1);
        assert_eq!(result.total_only_left, 1);
        assert_eq!(result.total_only_right, 1);

        let same_entry = result.entries.iter().find(|e| e.relative_path == "same.txt").unwrap();
        assert_eq!(same_entry.status, FolderItemStatus::Identical);

        let mod_entry = result.entries.iter().find(|e| e.relative_path == "changed.txt").unwrap();
        assert_eq!(mod_entry.status, FolderItemStatus::Modified);
    }

    #[test]
    fn test_compare_folders_ignore_line_endings() {
        let dir_left = tempdir().unwrap();
        let dir_right = tempdir().unwrap();

        // One CRLF, one LF
        fs::write(dir_left.path().join("crlf.txt"), "line1\r\nline2\r\n").unwrap();
        fs::write(dir_right.path().join("crlf.txt"), "line1\nline2\n").unwrap();

        // When ignore_line_endings is false -> Modified
        let opts_exact = FolderCompareOptions {
            deep_hash: Some(true),
            ignore_line_endings: Some(false),
            ignore_whitespace: Some(false),
            include_hidden_folders: Some(false),
        };
        let res_exact = compare_folders(dir_left.path(), dir_right.path(), opts_exact, |_| {}).unwrap();
        let entry_exact = res_exact.entries.iter().find(|e| e.relative_path == "crlf.txt").unwrap();
        assert_eq!(entry_exact.status, FolderItemStatus::Modified);

        // When ignore_line_endings is true -> Identical
        let opts_ignore = FolderCompareOptions {
            deep_hash: Some(false),
            ignore_line_endings: Some(true),
            ignore_whitespace: Some(false),
            include_hidden_folders: Some(false),
        };
        let res_ignore = compare_folders(dir_left.path(), dir_right.path(), opts_ignore, |_| {}).unwrap();
        let entry_ignore = res_ignore.entries.iter().find(|e| e.relative_path == "crlf.txt").unwrap();
        assert_eq!(entry_ignore.status, FolderItemStatus::Identical);
    }

    #[test]
    fn test_compare_folders_hidden_directory_vs_hidden_file() {
        let dir_left = tempdir().unwrap();
        let dir_right = tempdir().unwrap();

        // Hidden file at root (e.g. .env)
        fs::write(dir_left.path().join(".env"), "SECRET=123").unwrap();
        fs::write(dir_right.path().join(".env"), "SECRET=123").unwrap();

        // Hidden directory (.vscode/settings.json)
        let vscode_left = dir_left.path().join(".vscode");
        let vscode_right = dir_right.path().join(".vscode");
        fs::create_dir_all(&vscode_left).unwrap();
        fs::create_dir_all(&vscode_right).unwrap();
        fs::write(vscode_left.join("settings.json"), "{}").unwrap();
        fs::write(vscode_right.join("settings.json"), "{}").unwrap();

        // 1. By default: include_hidden_folders = false
        // .env should be present, .vscode should be omitted
        let opts_default = FolderCompareOptions {
            deep_hash: Some(false),
            ignore_line_endings: Some(false),
            ignore_whitespace: Some(false),
            include_hidden_folders: Some(false),
        };
        let res_default = compare_folders(dir_left.path(), dir_right.path(), opts_default, |_| {}).unwrap();
        assert!(res_default.entries.iter().any(|e| e.relative_path == ".env"));
        assert!(!res_default.entries.iter().any(|e| e.relative_path.starts_with(".vscode")));

        // 2. When include_hidden_folders = true
        // Both .env and .vscode/settings.json should be present
        let opts_include = FolderCompareOptions {
            deep_hash: Some(false),
            ignore_line_endings: Some(false),
            ignore_whitespace: Some(false),
            include_hidden_folders: Some(true),
        };
        let res_include = compare_folders(dir_left.path(), dir_right.path(), opts_include, |_| {}).unwrap();
        assert!(res_include.entries.iter().any(|e| e.relative_path == ".env"));
        assert!(res_include.entries.iter().any(|e| e.relative_path.contains("settings.json")));
    }
}
