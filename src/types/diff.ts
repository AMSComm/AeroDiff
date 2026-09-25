export type DiffLineType = 'Unchanged' | 'Added' | 'Deleted' | 'Modified' | 'Empty';

export type DiffChunkType = 'Addition' | 'Deletion' | 'Modification';

export interface InlineSpan {
  start: number;
  end: number;
  highlight: boolean;
}

export interface DiffLine {
  left_line_num: number | null;
  right_line_num: number | null;
  left_text: string | null;
  right_text: string | null;
  line_type: DiffLineType;
  left_inline: InlineSpan[];
  right_inline: InlineSpan[];
  chunk_id: number | null;
}

export interface DiffChunk {
  chunk_id: number;
  left_start: number;
  left_count: number;
  right_start: number;
  right_count: number;
  chunk_type: DiffChunkType;
  left_lines: string[];
  right_lines: string[];
}

export interface DiffResult {
  lines: DiffLine[];
  chunks: DiffChunk[];
  total_left_lines: number;
  total_right_lines: number;
  added_chunks: number;
  deleted_chunks: number;
  modified_chunks: number;
  is_identical: boolean;
  hash_matched: boolean;
  session_id?: string | null;
  total_virtual_lines?: number;
}

export type IgnoreWhitespace = 'None' | 'LeadingAndTrailing' | 'All';

export interface DiffOptions {
  ignore_whitespace: IgnoreWhitespace;
  ignore_blank_lines: boolean;
  ignore_case: boolean;
  regex_filter: string | null;
}

export type CompareMode = 'file' | 'folder' | 'csv' | 'text';
export type ViewMode = 'split' | 'unified';

export type FolderItemStatus = 'Identical' | 'Modified' | 'OnlyInLeft' | 'OnlyInRight';

export interface FolderEntry {
  relative_path: string;
  is_dir: boolean;
  status: FolderItemStatus;
  left_size: number | null;
  right_size: number | null;
  left_modified: number | null;
  right_modified: number | null;
}

export interface FolderCompareResult {
  entries: FolderEntry[];
  total_identical: number;
  total_modified: number;
  total_only_left: number;
  total_only_right: number;
}

export type CsvRowStatus = 'Unchanged' | 'Modified' | 'Added' | 'Deleted';

export interface CsvCellDiff {
  col_index: number;
  col_name: string;
  left_val: string | null;
  right_val: string | null;
  is_diff: boolean;
}

export interface CsvRowDiff {
  key: string;
  status: CsvRowStatus;
  cells: CsvCellDiff[];
}

export interface CsvCompareResult {
  headers: string[];
  rows: CsvRowDiff[];
  delimiter: string;
  key_column: string | null;
  total_rows: number;
  modified_rows: number;
  added_rows: number;
  deleted_rows: number;
  identical_rows: number;
}
