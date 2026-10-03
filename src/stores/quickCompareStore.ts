import { create } from 'zustand';
import { invokeCheckPath } from '../utils/ipc';
import { useTabStore } from './tabStore';

export interface QuickCompareItem {
  path: string;
  isFolder: boolean;
  name: string;
}

interface QuickCompareState {
  selectedLeft: QuickCompareItem | null;
  selectLeft: (path: string, isFolder?: boolean) => void;
  clearSelectedLeft: () => void;
  compareWithLeft: (rightPath: string, rightIsFolder?: boolean) => Promise<boolean>;
  handleBatchCompare: (paths: string[]) => Promise<boolean>;
}

export const useQuickCompareStore = create<QuickCompareState>((set, get) => ({
  selectedLeft: null,

  selectLeft: (path: string, isFolder?: boolean) => {
    const name = path.split('/').pop() || path.split('\\').pop() || path;
    set({
      selectedLeft: {
        path,
        isFolder: Boolean(isFolder),
        name,
      },
    });
  },

  clearSelectedLeft: () => set({ selectedLeft: null }),

  compareWithLeft: async (rightPath: string, rightIsFolder?: boolean) => {
    const { selectedLeft } = get();
    if (!selectedLeft) return false;

    let isFolder = rightIsFolder;
    if (isFolder === undefined) {
      const check = await invokeCheckPath(rightPath).catch(() => null);
      isFolder = Boolean(check?.is_dir);
    }

    const tabStore = useTabStore.getState();
    const leftPath = selectedLeft.path;
    get().clearSelectedLeft();

    if (selectedLeft.isFolder && isFolder) {
      await tabStore.openFolderCompareTab(leftPath, rightPath);
      return true;
    } else if (!selectedLeft.isFolder && !isFolder) {
      await tabStore.openFileCompareTab(leftPath, rightPath);
      return true;
    } else {
      console.warn('Cannot compare a folder with a file directly.');
      return false;
    }
  },

  handleBatchCompare: async (paths: string[]) => {
    const validPaths = paths.filter((p) => p && typeof p === 'string' && !p.startsWith('-'));
    if (validPaths.length === 0) return false;

    // Single item selection: choose Left first, then choose Right to compare
    if (validPaths.length === 1) {
      const p = validPaths[0];
      const check = await invokeCheckPath(p).catch(() => null);
      const isFolder = Boolean(check?.is_dir);

      const { selectedLeft, compareWithLeft, selectLeft } = get();
      if (selectedLeft) {
        return await compareWithLeft(p, isFolder);
      } else {
        selectLeft(p, isFolder);
        return true;
      }
    }

    // Multiple items selection (2 or more):
    // Take the first 2 selected items prioritizing folders; if fewer than 2 folders, fall back to first 2 files
    const checks = await Promise.all(
      validPaths.map(async (p) => {
        const info = await invokeCheckPath(p).catch(() => null);
        return { path: p, isFolder: Boolean(info?.is_dir) };
      })
    );

    const folders = checks.filter((c) => c.isFolder).map((c) => c.path);
    const files = checks.filter((c) => !c.isFolder).map((c) => c.path);

    let left: string;
    let right: string;
    let isFolderCompare = false;

    if (folders.length >= 2) {
      // Prioritize folders if at least 2 folders selected
      left = folders[0];
      right = folders[1];
      isFolderCompare = true;
    } else if (files.length >= 2) {
      // Not enough 2 folders -> select first 2 files
      left = files[0];
      right = files[1];
      isFolderCompare = false;
    } else if (folders.length === 1 && files.length >= 1) {
      // Only 1 folder and 1 file -> cannot compare folder and file directly, mark folder as left
      get().selectLeft(folders[0], true);
      return true;
    } else {
      return false;
    }

    get().clearSelectedLeft();
    const tabStore = useTabStore.getState();
    if (isFolderCompare) {
      await tabStore.openFolderCompareTab(left, right);
    } else {
      await tabStore.openFileCompareTab(left, right);
    }
    return true;
  },
}));
