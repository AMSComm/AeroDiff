#[cfg(test)]
mod tests {
    use crate::csv::engine::{compare_csv, detect_delimiter};
    use crate::csv::types::CsvRowStatus;

    #[test]
    fn test_detect_delimiter() {
        assert_eq!(detect_delimiter("id,name,age\n1,Alice,30"), ',');
        assert_eq!(detect_delimiter("id;name;age\n1;Alice;30"), ';');
        assert_eq!(detect_delimiter("id\tname\tage\n1\tAlice\t30"), '\t');
        assert_eq!(detect_delimiter("id|name|age\n1|Alice|30"), '|');
    }

    #[test]
    fn test_compare_csv_identical() {
        let csv1 = "id,name,price\n1,Apple,10\n2,Banana,20";
        let csv2 = "id,name,price\n1,Apple,10\n2,Banana,20";

        let result = compare_csv(csv1, csv2, Some("id")).unwrap();
        assert_eq!(result.total_rows, 2);
        assert_eq!(result.identical_rows, 2);
        assert_eq!(result.modified_rows, 0);
    }

    #[test]
    fn test_compare_csv_modified_cells() {
        let csv1 = "id,name,price\n1,Apple,10\n2,Banana,20";
        let csv2 = "id,name,price\n1,Apple,12\n2,Banana,20";

        let result = compare_csv(csv1, csv2, Some("id")).unwrap();
        assert_eq!(result.total_rows, 2);
        assert_eq!(result.identical_rows, 1);
        assert_eq!(result.modified_rows, 1);

        let row1 = &result.rows[0];
        assert_eq!(row1.status, CsvRowStatus::Modified);
        let price_cell = row1.cells.iter().find(|c| c.col_name == "price").unwrap();
        assert!(price_cell.is_diff);
        assert_eq!(price_cell.left_val.as_deref(), Some("10"));
        assert_eq!(price_cell.right_val.as_deref(), Some("12"));
    }

    #[test]
    fn test_compare_csv_added_deleted_rows() {
        let csv1 = "id,name\n1,Alice\n2,Bob";
        let csv2 = "id,name\n1,Alice\n3,Charlie";

        let result = compare_csv(csv1, csv2, Some("id")).unwrap();
        assert_eq!(result.total_rows, 3);
        assert_eq!(result.identical_rows, 1);
        assert_eq!(result.deleted_rows, 1); // 2,Bob deleted
        assert_eq!(result.added_rows, 1); // 3,Charlie added
    }
}
