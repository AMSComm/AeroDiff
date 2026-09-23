import { create } from 'zustand';
import { TabSession, TabType, HistorySnapshot } from '../types/tab';
import { DiffOptions, DiffResult, FolderCompareResult, CsvCompareResult, ViewMode } from '../types/diff';
import {
  invokeCompareText,
  invokeCompareFolders,
  invokeCompareCsv,
  invokeMergeChunk,
  invokeSaveFile,
} from '../utils/ipc';
import { readFileContent } from '../utils/filePicker';

interface TabState {
  tabs: TabSession[];
  activeTabId: string;

  // Tab management
  createTab: (type?: TabType, initialData?: Partial<TabSession>) => string;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;

  // Quick Open Handlers
  openFileCompareTab: (
    leftPath: string,
    rightPath: string,
    leftContent?: string,
    rightContent?: string
  ) => Promise<string>;
  openFolderCompareTab: (leftPath: string, rightPath: string) => Promise<string>;
  openCsvCompareTab: (leftPath: string, rightPath: string) => Promise<string>;

  // Start comparison in CURRENT active tab (in-place)
  startCompareInActiveTab: (
    leftPath: string,
    rightPath: string,
    options?: {
      leftContent?: string;
      rightContent?: string;
      forceType?: TabType;
    }
  ) => Promise<void>;

  // CSV View toggle
  toggleCsvViewMode: () => Promise<void>;

  // Active Tab Controls
  getActiveTab: () => TabSession | undefined;
  updateActiveTab: (updates: Partial<TabSession>) => void;
  setLeftContent: (content: string) => void;
  setRightContent: (content: string) => void;
  toggleEditing: () => void;
  setViewMode: (mode: ViewMode) => void;
  toggleIgnoreWhitespace: () => void;
  toggleIgnoreBlankLines: () => void;
  toggleIgnoreCase: () => void;
  swapSides: () => void;
  recomputeActiveDiff: () => Promise<void>;
  mergeChunkAction: (chunkId: number, direction: 'left_to_right' | 'right_to_left') => Promise<void>;
  undoAction: () => void;
  redoAction: () => void;
  saveLeftFile: () => Promise<boolean>;
  saveRightFile: () => Promise<boolean>;
  nextChunk: () => void;
  prevChunk: () => void;
}

const DEFAULT_OPTIONS: DiffOptions = {
  ignore_whitespace: 'None',
  ignore_blank_lines: false,
  ignore_case: false,
  regex_filter: null,
};

let tabIdCounter = 1;
const generateId = () => `tab_${Date.now()}_${tabIdCounter++}`;

const createDefaultSession = (type: TabType = 'welcome', initial?: Partial<TabSession>): TabSession => {
  let title = 'New Comparison';
  if (type === 'file') title = 'File Diff';
  if (type === 'folder') title = 'Folder Diff';
  if (type === 'csv') title = 'CSV Diff';

  return {
    id: generateId(),
    title,
    type,
    leftPath: null,
    rightPath: null,
    leftContent: '',
    rightContent: '',
    isEditing: false,
    viewMode: 'split',
    diffResult: null,
    folderResult: null,
    csvResult: null,
    options: { ...DEFAULT_OPTIONS },
    activeChunkIndex: 0,
    history: [],
    future: [],
    isDirtyLeft: false,
    isDirtyRight: false,
    isComputing: false,
    computeTimeMs: 0,
    ...initial,
  };
};

const initialWelcomeTab = createDefaultSession('welcome');

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [initialWelcomeTab],
  activeTabId: initialWelcomeTab.id,

  createTab: (type = 'welcome', initialData) => {
    const newTab = createDefaultSession(type, initialData);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
    return newTab.id;
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length === 1) {
      // If closing only tab, reset to welcome tab
      const freshTab = createDefaultSession('welcome');
      set({ tabs: [freshTab], activeTabId: freshTab.id });
      return;
    }

    const tabIdx = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);

    let nextActiveId = activeTabId;
    if (activeTabId === id) {
      const nextIdx = Math.max(0, tabIdx - 1);
      nextActiveId = newTabs[nextIdx]?.id || newTabs[0].id;
    }

    set({ tabs: newTabs, activeTabId: nextActiveId });
  },

  setActiveTabId: (activeTabId) => set({ activeTabId }),

  openFileCompareTab: async (leftPath, rightPath, leftContent, rightContent) => {
    let lContent = leftContent ?? '';
    let rContent = rightContent ?? '';

    if (!leftContent && leftPath) {
      try {
        lContent = await readFileContent(leftPath);
      } catch (e) {
        console.error('Failed to read left file:', e);
      }
    }

    if (!rightContent && rightPath) {
      try {
        rContent = await readFileContent(rightPath);
      } catch (e) {
        console.error('Failed to read right file:', e);
      }
    }

    const leftFileName = leftPath.split('/').pop() || 'Left';
    const rightFileName = rightPath.split('/').pop() || 'Right';
    const title = `${leftFileName} ↔ ${rightFileName}`;

    const newTab = createDefaultSession('file', {
      title,
      leftPath,
      rightPath,
      leftContent: lContent,
      rightContent: rContent,
    });

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    // Compute initial diff
    get().recomputeActiveDiff();
    return newTab.id;
  },

  openFolderCompareTab: async (leftPath, rightPath) => {
    const leftDirName = leftPath.split('/').pop() || 'Left';
    const rightDirName = rightPath.split('/').pop() || 'Right';
    const title = `📁 ${leftDirName} ↔ ${rightDirName}`;

    const newTab = createDefaultSession('folder', {
      title,
      leftPath,
      rightPath,
      isComputing: true,
    });

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    try {
      const res = await invokeCompareFolders(leftPath, rightPath, true);
      get().updateActiveTab({ folderResult: res, isComputing: false });
    } catch (e) {
      console.error('Failed to scan folders:', e);
      get().updateActiveTab({ isComputing: false });
    }

    return newTab.id;
  },

  openCsvCompareTab: async (leftPath, rightPath) => {
    let lContent = '';
    let rContent = '';
    try {
      lContent = await readFileContent(leftPath);
      rContent = await readFileContent(rightPath);
    } catch (e) {
      console.error('Failed to read CSV:', e);
    }

    const leftFileName = leftPath.split('/').pop() || 'Left';
    const rightFileName = rightPath.split('/').pop() || 'Right';
    const title = `📊 ${leftFileName} ↔ ${rightFileName}`;

    const newTab = createDefaultSession('csv', {
      title,
      leftPath,
      rightPath,
      leftContent: lContent,
      rightContent: rContent,
      isComputing: true,
    });

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));

    try {
      const res = await invokeCompareCsv(lContent, rContent);
      get().updateActiveTab({ csvResult: res, isComputing: false });
    } catch (e) {
      console.error('Failed to compare CSV:', e);
      get().updateActiveTab({ isComputing: false });
    }

    return newTab.id;
  },

  startCompareInActiveTab: async (leftPath, rightPath, options) => {
    const activeTab = get().getActiveTab();
    if (!activeTab) return;

    let targetType: TabType = options?.forceType ?? 'file';

    // Auto-detect type if not forced
    if (!options?.forceType) {
      const isCsv =
        leftPath.toLowerCase().endsWith('.csv') ||
        leftPath.toLowerCase().endsWith('.tsv') ||
        rightPath.toLowerCase().endsWith('.csv') ||
        rightPath.toLowerCase().endsWith('.tsv');

      if (isCsv) {
        targetType = 'csv';
      }
    }

    const leftFileName = leftPath.split(/[/\\]/).pop() || 'Left';
    const rightFileName = rightPath.split(/[/\\]/).pop() || 'Right';
    const title =
      targetType === 'folder'
        ? `📁 ${leftFileName} ↔ ${rightFileName}`
        : targetType === 'csv'
        ? `📊 ${leftFileName} ↔ ${rightFileName}`
        : `${leftFileName} ↔ ${rightFileName}`;

    if (targetType === 'folder') {
      get().updateActiveTab({
        type: 'folder',
        title,
        leftPath,
        rightPath,
        folderResult: null,
        isComputing: true,
      });

      try {
        const res = await invokeCompareFolders(leftPath, rightPath, true);
        get().updateActiveTab({ folderResult: res, isComputing: false });
      } catch (e) {
        console.error('Failed to compare folders:', e);
        get().updateActiveTab({ isComputing: false });
      }
      return;
    }

    // For file or csv: read content
    let lContent = options?.leftContent ?? '';
    let rContent = options?.rightContent ?? '';

    if (!lContent && leftPath) {
      try {
        lContent = await readFileContent(leftPath);
      } catch (e) {
        console.error('Failed to read left file:', e);
      }
    }

    if (!rContent && rightPath) {
      try {
        rContent = await readFileContent(rightPath);
      } catch (e) {
        console.error('Failed to read right file:', e);
      }
    }

    get().updateActiveTab({
      type: targetType,
      title,
      leftPath,
      rightPath,
      leftContent: lContent,
      rightContent: rContent,
      csvViewMode: targetType === 'csv' ? 'table' : undefined,
      isComputing: true,
    });

    if (targetType === 'csv') {
      try {
        const [csvRes, diffRes] = await Promise.all([
          invokeCompareCsv(lContent, rContent),
          invokeCompareText(lContent, rContent, activeTab.options),
        ]);
        get().updateActiveTab({
          csvResult: csvRes,
          diffResult: diffRes,
          isComputing: false,
        });
      } catch (e) {
        console.error('Failed to compare CSV:', e);
        get().updateActiveTab({ isComputing: false });
      }
    } else {
      await get().recomputeActiveDiff();
    }
  },

  toggleCsvViewMode: async () => {
    const active = get().getActiveTab();
    if (!active) return;
    const currentMode = active.csvViewMode || (active.type === 'csv' ? 'table' : 'text');
    const nextMode = currentMode === 'table' ? 'text' : 'table';

    get().updateActiveTab({ csvViewMode: nextMode });

    if (nextMode === 'table' && !active.csvResult) {
      get().updateActiveTab({ isComputing: true });
      try {
        const res = await invokeCompareCsv(active.leftContent, active.rightContent);
        get().updateActiveTab({ csvResult: res, isComputing: false });
      } catch (e) {
        console.error('Failed to parse CSV:', e);
        get().updateActiveTab({ isComputing: false });
      }
    } else if (nextMode === 'text' && !active.diffResult) {
      await get().recomputeActiveDiff();
    }
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || tabs[0];
  },

  updateActiveTab: (updates) => {
    const { activeTabId } = get();
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === activeTabId ? { ...tab, ...updates } : tab)),
    }));
  },

  setLeftContent: (content) => {
    get().updateActiveTab({ leftContent: content, isDirtyLeft: true });
    get().recomputeActiveDiff();
  },

  setRightContent: (content) => {
    get().updateActiveTab({ rightContent: content, isDirtyRight: true });
    get().recomputeActiveDiff();
  },

  toggleEditing: () => {
    const active = get().getActiveTab();
    if (!active) return;
    get().updateActiveTab({ isEditing: !active.isEditing });
    get().recomputeActiveDiff();
  },

  setViewMode: (viewMode) => {
    get().updateActiveTab({ viewMode });
  },

  toggleIgnoreWhitespace: () => {
    const active = get().getActiveTab();
    if (!active) return;
    const current = active.options.ignore_whitespace;
    const next = current === 'None' ? 'LeadingAndTrailing' : current === 'LeadingAndTrailing' ? 'All' : 'None';
    get().updateActiveTab({ options: { ...active.options, ignore_whitespace: next } });
    get().recomputeActiveDiff();
  },

  toggleIgnoreBlankLines: () => {
    const active = get().getActiveTab();
    if (!active) return;
    get().updateActiveTab({
      options: { ...active.options, ignore_blank_lines: !active.options.ignore_blank_lines },
    });
    get().recomputeActiveDiff();
  },

  toggleIgnoreCase: () => {
    const active = get().getActiveTab();
    if (!active) return;
    get().updateActiveTab({
      options: { ...active.options, ignore_case: !active.options.ignore_case },
    });
    get().recomputeActiveDiff();
  },

  swapSides: () => {
    const active = get().getActiveTab();
    if (!active) return;
    get().updateActiveTab({
      leftContent: active.rightContent,
      rightContent: active.leftContent,
      leftPath: active.rightPath,
      rightPath: active.leftPath,
      isDirtyLeft: active.isDirtyRight,
      isDirtyRight: active.isDirtyLeft,
    });
    get().recomputeActiveDiff();
  },

  recomputeActiveDiff: async () => {
    const active = get().getActiveTab();
    if (!active) return;

    get().updateActiveTab({ isComputing: true });
    const start = performance.now();

    try {
      const result = await invokeCompareText(active.leftContent, active.rightContent, active.options);
      const duration = Math.round(performance.now() - start);
      get().updateActiveTab({
        diffResult: result,
        isComputing: false,
        computeTimeMs: duration,
        activeChunkIndex: 0,
      });
    } catch (err) {
      console.error('Failed to compute diff:', err);
      get().updateActiveTab({ isComputing: false });
    }
  },

  mergeChunkAction: async (chunkId, direction) => {
    const active = get().getActiveTab();
    if (!active || !active.diffResult) return;

    const snapshot: HistorySnapshot = {
      leftContent: active.leftContent,
      rightContent: active.rightContent,
      diffResult: active.diffResult,
    };

    get().updateActiveTab({ isComputing: true });
    try {
      const res = await invokeMergeChunk(
        active.leftContent,
        active.rightContent,
        chunkId,
        direction,
        active.diffResult,
        active.options
      );

      get().updateActiveTab({
        leftContent: res.new_left,
        rightContent: res.new_right,
        diffResult: res.updated_diff,
        isComputing: false,
        isDirtyLeft: direction === 'right_to_left' ? true : active.isDirtyLeft,
        isDirtyRight: direction === 'left_to_right' ? true : active.isDirtyRight,
        history: [...active.history, snapshot],
        future: [],
      });
    } catch (e) {
      console.error('Failed to merge chunk:', e);
      get().updateActiveTab({ isComputing: false });
    }
  },

  undoAction: () => {
    const active = get().getActiveTab();
    if (!active || active.history.length === 0 || !active.diffResult) return;

    const previous = active.history[active.history.length - 1];
    const newHistory = active.history.slice(0, -1);
    const newFuture: HistorySnapshot[] = [
      { leftContent: active.leftContent, rightContent: active.rightContent, diffResult: active.diffResult },
      ...active.future,
    ];

    get().updateActiveTab({
      leftContent: previous.leftContent,
      rightContent: previous.rightContent,
      diffResult: previous.diffResult,
      history: newHistory,
      future: newFuture,
    });
  },

  redoAction: () => {
    const active = get().getActiveTab();
    if (!active || active.future.length === 0 || !active.diffResult) return;

    const next = active.future[0];
    const newFuture = active.future.slice(1);
    const newHistory: HistorySnapshot[] = [
      ...active.history,
      { leftContent: active.leftContent, rightContent: active.rightContent, diffResult: active.diffResult },
    ];

    get().updateActiveTab({
      leftContent: next.leftContent,
      rightContent: next.rightContent,
      diffResult: next.diffResult,
      history: newHistory,
      future: newFuture,
    });
  },

  saveLeftFile: async () => {
    const active = get().getActiveTab();
    if (!active || !active.leftPath) return false;
    try {
      await invokeSaveFile(active.leftPath, active.leftContent);
      get().updateActiveTab({ isDirtyLeft: false });
      return true;
    } catch (e) {
      console.error('Failed to save left file:', e);
      return false;
    }
  },

  saveRightFile: async () => {
    const active = get().getActiveTab();
    if (!active || !active.rightPath) return false;
    try {
      await invokeSaveFile(active.rightPath, active.rightContent);
      get().updateActiveTab({ isDirtyRight: false });
      return true;
    } catch (e) {
      console.error('Failed to save right file:', e);
      return false;
    }
  },

  nextChunk: () => {
    const active = get().getActiveTab();
    if (!active || !active.diffResult || active.diffResult.chunks.length === 0) return;
    const next = (active.activeChunkIndex + 1) % active.diffResult.chunks.length;
    get().updateActiveTab({ activeChunkIndex: next });
  },

  prevChunk: () => {
    const active = get().getActiveTab();
    if (!active || !active.diffResult || active.diffResult.chunks.length === 0) return;
    const prev =
      (active.activeChunkIndex - 1 + active.diffResult.chunks.length) % active.diffResult.chunks.length;
    get().updateActiveTab({ activeChunkIndex: prev });
  },
}));
