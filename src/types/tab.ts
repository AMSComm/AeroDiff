import {
  DiffResult,
  DiffOptions,
  ViewMode,
  FolderCompareResult,
  CsvCompareResult,
} from './diff';

export type TabType = 'welcome' | 'file' | 'folder' | 'csv';

export interface HistorySnapshot {
  leftContent: string;
  rightContent: string;
  diffResult: DiffResult;
}

export interface TabSession {
  id: string;
  title: string;
  type: TabType;
  leftPath: string | null;
  rightPath: string | null;
  leftContent: string;
  rightContent: string;
  isEditing: boolean; // Toggle between Live Text Edit and Visual Diff View
  viewMode: ViewMode;
  diffResult: DiffResult | null;
  folderResult: FolderCompareResult | null;
  csvResult: CsvCompareResult | null;
  options: DiffOptions;
  activeChunkIndex: number;
  history: HistorySnapshot[];
  future: HistorySnapshot[];
  isDirtyLeft: boolean;
  isDirtyRight: boolean;
  isComputing: boolean;
  computeTimeMs: number;
}
