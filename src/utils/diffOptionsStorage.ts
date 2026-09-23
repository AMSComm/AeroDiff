import { DiffOptions, ViewMode } from '../types/diff';

const STORAGE_KEY = 'aerodiff_user_diff_options';

export interface SavedDiffPreferences {
  options: DiffOptions;
  viewMode: ViewMode;
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  ignore_whitespace: 'None',
  ignore_blank_lines: false,
  ignore_case: false,
  regex_filter: null,
};

export const DEFAULT_VIEW_MODE: ViewMode = 'split';

export function loadSavedDiffPreferences(): SavedDiffPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        options: { ...DEFAULT_DIFF_OPTIONS },
        viewMode: DEFAULT_VIEW_MODE,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      options: {
        ignore_whitespace: parsed.options?.ignore_whitespace ?? DEFAULT_DIFF_OPTIONS.ignore_whitespace,
        ignore_blank_lines: Boolean(parsed.options?.ignore_blank_lines),
        ignore_case: Boolean(parsed.options?.ignore_case),
        regex_filter: parsed.options?.regex_filter ?? null,
      },
      viewMode: parsed.viewMode === 'unified' ? 'unified' : 'split',
    };
  } catch (e) {
    console.warn('Failed to load saved diff preferences:', e);
    return {
      options: { ...DEFAULT_DIFF_OPTIONS },
      viewMode: DEFAULT_VIEW_MODE,
    };
  }
}

export function saveDiffPreferences(prefs: Partial<SavedDiffPreferences>): void {
  try {
    const current = loadSavedDiffPreferences();
    const updated: SavedDiffPreferences = {
      options: prefs.options ? { ...current.options, ...prefs.options } : current.options,
      viewMode: prefs.viewMode ?? current.viewMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save diff preferences:', e);
  }
}
