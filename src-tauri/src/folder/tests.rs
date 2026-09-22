#[cfg(test)]
mod tests {
    use crate::folder::engine::compare_folders;
    use crate::folder::types::FolderItemStatus;
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

        let result = compare_folders(dir_left.path(), dir_right.path(), true);

        assert_eq!(result.total_identical, 1);
        assert_eq!(result.total_modified, 1);
        assert_eq!(result.total_only_left, 1);
        assert_eq!(result.total_only_right, 1);

        let same_entry = result.entries.iter().find(|e| e.relative_path == "same.txt").unwrap();
        assert_eq!(same_entry.status, FolderItemStatus::Identical);

        let mod_entry = result.entries.iter().find(|e| e.relative_path == "changed.txt").unwrap();
        assert_eq!(mod_entry.status, FolderItemStatus::Modified);
    }
}
