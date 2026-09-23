import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSavedDiffPreferences,
  saveDiffPreferences,
  DEFAULT_DIFF_OPTIONS,
  DEFAULT_VIEW_MODE,
} from '../utils/diffOptionsStorage';

describe('diffOptionsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default diff options and view mode when localStorage is empty', () => {
    const prefs = loadSavedDiffPreferences();
    expect(prefs.options).toEqual(DEFAULT_DIFF_OPTIONS);
    expect(prefs.viewMode).toBe(DEFAULT_VIEW_MODE);
  });

  it('saves and reloads diff options correctly', () => {
    saveDiffPreferences({
      options: {
        ignore_whitespace: 'All',
        ignore_blank_lines: true,
        ignore_case: true,
        regex_filter: null,
      },
    });

    const loaded = loadSavedDiffPreferences();
    expect(loaded.options.ignore_whitespace).toBe('All');
    expect(loaded.options.ignore_blank_lines).toBe(true);
    expect(loaded.options.ignore_case).toBe(true);
    expect(loaded.viewMode).toBe('split');
  });

  it('saves and reloads viewMode correctly', () => {
    saveDiffPreferences({
      viewMode: 'unified',
    });

    const loaded = loadSavedDiffPreferences();
    expect(loaded.viewMode).toBe('unified');
    expect(loaded.options.ignore_whitespace).toBe('None');
  });
});
