import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useQuickCompareStore } from '../stores/quickCompareStore';
import { useTabStore } from '../stores/tabStore';
import * as ipc from '../utils/ipc';

describe('useQuickCompareStore Unit Tests', () => {
  beforeEach(() => {
    useQuickCompareStore.setState({ selectedLeft: null });
    vi.restoreAllMocks();
  });

  it('should select and clear left item', () => {
    const store = useQuickCompareStore.getState();
    store.selectLeft('/path/to/my-file.txt', false);

    expect(useQuickCompareStore.getState().selectedLeft).toEqual({
      path: '/path/to/my-file.txt',
      isFolder: false,
      name: 'my-file.txt',
    });

    store.clearSelectedLeft();
    expect(useQuickCompareStore.getState().selectedLeft).toBeNull();
  });

  it('should handle single item selection: set left first, then compare with right', async () => {
    const openFileSpy = vi.spyOn(useTabStore.getState(), 'openFileCompareTab').mockResolvedValue('tab_1');
    vi.spyOn(ipc, 'invokeCheckPath').mockResolvedValue({
      path: '/first/file_a.txt',
      name: 'file_a.txt',
      exists: true,
      is_dir: false,
      is_file: true,
      size: 100,
    });

    const store = useQuickCompareStore.getState();

    // 1st single selection: sets selectedLeft
    await store.handleBatchCompare(['/first/file_a.txt']);
    expect(useQuickCompareStore.getState().selectedLeft?.path).toBe('/first/file_a.txt');
    expect(openFileSpy).not.toHaveBeenCalled();

    // 2nd single selection: compares with left
    await store.handleBatchCompare(['/second/file_b.txt']);
    expect(openFileSpy).toHaveBeenCalledWith('/first/file_a.txt', '/second/file_b.txt');
    expect(useQuickCompareStore.getState().selectedLeft).toBeNull();
  });

  it('should prioritize folders when multiple items with >= 2 folders are selected', async () => {
    const openFolderSpy = vi.spyOn(useTabStore.getState(), 'openFolderCompareTab').mockResolvedValue('tab_f');
    const openFileSpy = vi.spyOn(useTabStore.getState(), 'openFileCompareTab').mockResolvedValue('tab_file');

    vi.spyOn(ipc, 'invokeCheckPath').mockImplementation(async (p: string) => {
      const isDir = p.includes('folder') || p.endsWith('/');
      return {
        path: p,
        name: p.split('/').pop() || '',
        exists: true,
        is_dir: isDir,
        is_file: !isDir,
        size: 100,
      };
    });

    const store = useQuickCompareStore.getState();
    const result = await store.handleBatchCompare([
      '/projects/file_1.txt',
      '/projects/folder_a',
      '/projects/file_2.txt',
      '/projects/folder_b',
      '/projects/folder_c',
    ]);

    expect(result).toBe(true);
    expect(openFolderSpy).toHaveBeenCalledWith('/projects/folder_a', '/projects/folder_b');
    expect(openFileSpy).not.toHaveBeenCalled();
    expect(useQuickCompareStore.getState().selectedLeft).toBeNull();
  });

  it('should pick first 2 files when fewer than 2 folders are selected', async () => {
    const openFolderSpy = vi.spyOn(useTabStore.getState(), 'openFolderCompareTab').mockResolvedValue('tab_f');
    const openFileSpy = vi.spyOn(useTabStore.getState(), 'openFileCompareTab').mockResolvedValue('tab_file');

    vi.spyOn(ipc, 'invokeCheckPath').mockImplementation(async (p: string) => {
      const isDir = p.includes('folder');
      return {
        path: p,
        name: p.split('/').pop() || '',
        exists: true,
        is_dir: isDir,
        is_file: !isDir,
        size: 100,
      };
    });

    const store = useQuickCompareStore.getState();
    const result = await store.handleBatchCompare([
      '/projects/folder_only_one',
      '/projects/file_alpha.ts',
      '/projects/file_beta.ts',
      '/projects/file_gamma.ts',
    ]);

    expect(result).toBe(true);
    // Not enough 2 folders -> picks first 2 files: file_alpha and file_beta
    expect(openFileSpy).toHaveBeenCalledWith('/projects/file_alpha.ts', '/projects/file_beta.ts');
    expect(openFolderSpy).not.toHaveBeenCalled();
    expect(useQuickCompareStore.getState().selectedLeft).toBeNull();
  });

  it('should select folder as left if 1 folder and 1 file selected', async () => {
    vi.spyOn(ipc, 'invokeCheckPath').mockImplementation(async (p: string) => {
      const isDir = p.includes('folder');
      return {
        path: p,
        name: p.split('/').pop() || '',
        exists: true,
        is_dir: isDir,
        is_file: !isDir,
        size: 100,
      };
    });

    const store = useQuickCompareStore.getState();
    const result = await store.handleBatchCompare([
      '/projects/my_folder',
      '/projects/readme.txt',
    ]);

    expect(result).toBe(true);
    expect(useQuickCompareStore.getState().selectedLeft).toEqual({
      path: '/projects/my_folder',
      isFolder: true,
      name: 'my_folder',
    });
  });
});
