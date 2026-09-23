import { describe, it, expect, beforeEach } from 'vitest';
import { getRecentPaths, saveRecentPath, removeRecentPath, clearRecentPaths } from '../utils/recentPaths';

describe('recentPaths utility', () => {
  beforeEach(() => {
    clearRecentPaths();
  });

  it('should save paths and prioritize most recent', () => {
    saveRecentPath('/path/one');
    saveRecentPath('/path/two');
    const paths = getRecentPaths();
    expect(paths).toEqual(['/path/two', '/path/one']);
  });

  it('should avoid duplicates by bumping existing path to front', () => {
    saveRecentPath('/path/a');
    saveRecentPath('/path/b');
    saveRecentPath('/path/a');
    const paths = getRecentPaths();
    expect(paths).toEqual(['/path/a', '/path/b']);
  });

  it('should remove path properly', () => {
    saveRecentPath('/path/1');
    saveRecentPath('/path/2');
    removeRecentPath('/path/1');
    expect(getRecentPaths()).toEqual(['/path/2']);
  });

  it('should clear all paths', () => {
    saveRecentPath('/path/1');
    clearRecentPaths();
    expect(getRecentPaths()).toEqual([]);
  });
});
