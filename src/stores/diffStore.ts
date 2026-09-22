import { create } from 'zustand';
import {
  CompareMode,
  CsvCompareResult,
  DiffOptions,
  DiffResult,
  FolderCompareResult,
  ViewMode,
} from '../types/diff';
import {
  invokeCompareCsv,
  invokeCompareFiles,
  invokeCompareFolders,
  invokeCompareText,
  invokeMergeChunk,
  invokeReadFile,
  invokeSaveFile,
} from '../utils/ipc';

interface HistorySnapshot {
  leftContent: string;
  rightContent: string;
  diffResult: DiffResult;
}

interface DiffState {
  compareMode: CompareMode;
  viewMode: ViewMode;
  leftPath: string | null;
  rightPath: string | null;
  leftContent: string;
  rightContent: string;
  options: DiffOptions;
  diffResult: DiffResult | null;
  folderResult: FolderCompareResult | null;
  csvResult: CsvCompareResult | null;
  activeChunkIndex: number;
  isComputing: boolean;
  computeTimeMs: number;
  history: HistorySnapshot[];
  future: HistorySnapshot[];

  // Actions
  setCompareMode: (mode: CompareMode) => void;
  setViewMode: (mode: ViewMode) => void;
  setLeftContent: (content: string) => void;
  setRightContent: (content: string) => void;
  setLeftPath: (path: string) => void;
  setRightPath: (path: string) => void;
  swapSides: () => void;
  setOptions: (options: Partial<DiffOptions>) => void;
  runDiff: () => Promise<void>;
  mergeChunkAction: (chunkId: number, direction: 'left_to_right' | 'right_to_left') => Promise<void>;
  undo: () => void;
  redo: () => void;
  jumpToChunk: (index: number) => void;
  nextChunk: () => void;
  prevChunk: () => void;
  saveLeftFile: () => Promise<boolean>;
  saveRightFile: () => Promise<boolean>;
  runFolderDiff: (deepHash: boolean) => Promise<void>;
  runCsvDiff: (keyColumn?: string) => Promise<void>;
}

const DEFAULT_OPTIONS: DiffOptions = {
  ignore_whitespace: 'None',
  ignore_blank_lines: false,
  ignore_case: false,
  regex_filter: null,
};

const SAMPLE_LEFT = `// AeroDiff Sample Source (Left)
function calculateTotal(items, taxRate) {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
  }

  // Calculate standard tax
  const tax = subtotal * taxRate;
  const grandTotal = subtotal + tax;
  return grandTotal;
}

export default calculateTotal;`;

const SAMPLE_RIGHT = `// AeroDiff Sample Source (Right - Modified)
function calculateTotal(items, taxRate, discount = 0) {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }

  // Calculate standard tax with discount
  const discounted = Math.max(0, subtotal - discount);
  const tax = discounted * taxRate;
  const grandTotal = discounted + tax;
  return grandTotal;
}

export default calculateTotal;`;

export const useDiffStore = create<DiffState>((set, get) => ({
  compareMode: 'file',
  viewMode: 'split',
  leftPath: null,
  rightPath: null,
  leftContent: SAMPLE_LEFT,
  rightContent: SAMPLE_RIGHT,
  options: DEFAULT_OPTIONS,
  diffResult: null,
  folderResult: null,
  csvResult: null,
  activeChunkIndex: 0,
  isComputing: false,
  computeTimeMs: 0,
  history: [],
  future: [],

  setCompareMode: (compareMode) => {
    set({ compareMode });
    if (compareMode === 'csv') {
      get().runCsvDiff();
    } else if (compareMode === 'file' || compareMode === 'text') {
      get().runDiff();
    }
  },

  setViewMode: (viewMode) => set({ viewMode }),

  setLeftContent: (leftContent) => {
    set({ leftContent });
    get().runDiff();
  },

  setRightContent: (rightContent) => {
    set({ rightContent });
    get().runDiff();
  },

  setLeftPath: async (leftPath) => {
    set({ leftPath });
    try {
      const content = await invokeReadFile(leftPath);
      set({ leftContent: content });
      get().runDiff();
    } catch (e) {
      console.error('Error loading left file:', e);
    }
  },

  setRightPath: async (rightPath) => {
    set({ rightPath });
    try {
      const content = await invokeReadFile(rightPath);
      set({ rightContent: content });
      get().runDiff();
    } catch (e) {
      console.error('Error loading right file:', e);
    }
  },

  swapSides: () => {
    const { leftContent, rightContent, leftPath, rightPath } = get();
    set({
      leftContent: rightContent,
      rightContent: leftContent,
      leftPath: rightPath,
      rightPath: leftPath,
    });
    get().runDiff();
  },

  setOptions: (partialOptions) => {
    const options = { ...get().options, ...partialOptions };
    set({ options });
    get().runDiff();
  },

  runDiff: async () => {
    const { leftContent, rightContent, leftPath, rightPath, options } = get();
    set({ isComputing: true });
    const start = performance.now();

    try {
      const result = await invokeCompareText(leftContent, rightContent, options);
      const duration = Math.round(performance.now() - start);
      set({
        diffResult: result,
        isComputing: false,
        computeTimeMs: duration,
        activeChunkIndex: 0,
      });
    } catch (err) {
      console.error('Failed to compute diff:', err);
      set({ isComputing: false });
    }
  },

  mergeChunkAction: async (chunkId, direction) => {
    const { leftContent, rightContent, diffResult, options, history } = get();
    if (!diffResult) return;

    // Push snapshot to undo history
    const snapshot: HistorySnapshot = {
      leftContent,
      rightContent,
      diffResult,
    };

    set({ isComputing: true });
    try {
      const res = await invokeMergeChunk(
        leftContent,
        rightContent,
        chunkId,
        direction,
        diffResult,
        options
      );

      set({
        leftContent: res.new_left,
        rightContent: res.new_right,
        diffResult: res.updated_diff,
        isComputing: false,
        history: [...history, snapshot],
        future: [],
      });
    } catch (e) {
      console.error('Failed to merge chunk:', e);
      set({ isComputing: false });
    }
  },

  undo: () => {
    const { history, future, leftContent, rightContent, diffResult } = get();
    if (history.length === 0 || !diffResult) return;

    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    const newFuture: HistorySnapshot[] = [
      { leftContent, rightContent, diffResult },
      ...future,
    ];

    set({
      leftContent: previous.leftContent,
      rightContent: previous.rightContent,
      diffResult: previous.diffResult,
      history: newHistory,
      future: newFuture,
    });
  },

  redo: () => {
    const { history, future, leftContent, rightContent, diffResult } = get();
    if (future.length === 0 || !diffResult) return;

    const next = future[0];
    const newFuture = future.slice(1);
    const newHistory: HistorySnapshot[] = [
      ...history,
      { leftContent, rightContent, diffResult },
    ];

    set({
      leftContent: next.leftContent,
      rightContent: next.rightContent,
      diffResult: next.diffResult,
      history: newHistory,
      future: newFuture,
    });
  },

  jumpToChunk: (index) => {
    const { diffResult } = get();
    if (!diffResult || diffResult.chunks.length === 0) return;
    const clamped = Math.max(0, Math.min(index, diffResult.chunks.length - 1));
    set({ activeChunkIndex: clamped });
  },

  nextChunk: () => {
    const { activeChunkIndex, diffResult } = get();
    if (!diffResult || diffResult.chunks.length === 0) return;
    const next = (activeChunkIndex + 1) % diffResult.chunks.length;
    set({ activeChunkIndex: next });
  },

  prevChunk: () => {
    const { activeChunkIndex, diffResult } = get();
    if (!diffResult || diffResult.chunks.length === 0) return;
    const prev = (activeChunkIndex - 1 + diffResult.chunks.length) % diffResult.chunks.length;
    set({ activeChunkIndex: prev });
  },

  saveLeftFile: async () => {
    const { leftPath, leftContent } = get();
    if (!leftPath) return false;
    try {
      await invokeSaveFile(leftPath, leftContent);
      return true;
    } catch (e) {
      console.error('Failed to save left file:', e);
      return false;
    }
  },

  saveRightFile: async () => {
    const { rightPath, rightContent } = get();
    if (!rightPath) return false;
    try {
      await invokeSaveFile(rightPath, rightContent);
      return true;
    } catch (e) {
      console.error('Failed to save right file:', e);
      return false;
    }
  },

  runFolderDiff: async (deepHash) => {
    const { leftPath, rightPath } = get();
    if (!leftPath || !rightPath) return;
    set({ isComputing: true });
    try {
      const res = await invokeCompareFolders(leftPath, rightPath, deepHash);
      set({ folderResult: res, isComputing: false });
    } catch (e) {
      console.error('Failed to compare folders:', e);
      set({ isComputing: false });
    }
  },

  runCsvDiff: async (keyColumn) => {
    const { leftContent, rightContent } = get();
    set({ isComputing: true });
    try {
      const res = await invokeCompareCsv(leftContent, rightContent, keyColumn);
      set({ csvResult: res, isComputing: false });
    } catch (e) {
      console.error('Failed to compare CSV:', e);
      set({ isComputing: false });
    }
  },
}));
