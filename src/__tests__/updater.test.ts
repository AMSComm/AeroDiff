import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compareVersions,
  APP_VERSION,
  CURRENT_VERSION,
  getAppVersion,
  checkForAppUpdates,
} from '../utils/updater';

describe('updater utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('compareVersions', () => {
    it('compares identical versions as equal', () => {
      expect(compareVersions('0.1.10', '0.1.10')).toBe(0);
      expect(compareVersions('v0.1.10', '0.1.10')).toBe(0);
    });

    it('correctly compares greater versions', () => {
      expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
      expect(compareVersions('0.2.0', '0.1.10')).toBe(1);
      expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    });

    it('correctly compares lesser versions', () => {
      expect(compareVersions('0.1.9', '0.1.10')).toBe(-1);
      expect(compareVersions('0.1.6', '0.1.10')).toBe(-1);
    });
  });

  describe('version constants and dynamic resolution', () => {
    it('provides valid semver format for APP_VERSION and CURRENT_VERSION', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(CURRENT_VERSION).toBe(APP_VERSION);
    });

    it('resolves dynamic app version', async () => {
      const ver = await getAppVersion();
      expect(ver).toBe(APP_VERSION);
    });
  });

  describe('checkForAppUpdates in non-Tauri / test fallback mode', () => {
    it('handles GitHub release checks with fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v0.1.10',
          published_at: '2026-10-20T12:00:00Z',
          body: 'Bug fixes and performance improvements.',
          html_url: 'https://github.com/AMSComm/AeroDiff/releases/tag/v0.1.10',
        }),
      });
      global.fetch = mockFetch;

      const info = await checkForAppUpdates();
      expect(info.currentVersion).toBe(APP_VERSION);
      expect(info.latestVersion).toBe('0.1.10');
      expect(info.available).toBe(false); // Since current is 0.1.10
    });

    it('detects when newer release exists on GitHub', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v0.2.0',
          published_at: '2026-10-25T12:00:00Z',
          body: 'Major update.',
          html_url: 'https://github.com/AMSComm/AeroDiff/releases/tag/v0.2.0',
        }),
      });
      global.fetch = mockFetch;

      const info = await checkForAppUpdates();
      expect(info.available).toBe(true);
      expect(info.latestVersion).toBe('0.2.0');
    });
  });
});
