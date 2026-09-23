import type { Update } from '@tauri-apps/plugin-updater';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseDate?: string;
  notes?: string;
  downloadUrl?: string;
  isTauri: boolean;
  error?: string;
  hasNativeUpdater?: boolean;
}

export const CURRENT_VERSION = '0.1.1';
export const GITHUB_REPO = 'AMSComm/AeroDiff';

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const parts2 = v2.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

let cachedUpdate: Update | null = null;

export async function checkForAppUpdates(): Promise<UpdateInfo> {
  const isTauri =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
        (window as unknown as { __TAURI__?: unknown }).__TAURI__
    );

  if (isTauri) {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      cachedUpdate = update;
      if (update) {
        return {
          available: true,
          currentVersion: CURRENT_VERSION,
          latestVersion: update.version,
          releaseDate: update.date,
          notes: update.body || 'New features, bug fixes, and performance optimizations.',
          isTauri: true,
          hasNativeUpdater: true,
        };
      }
      return {
        available: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        isTauri: true,
        hasNativeUpdater: true,
      };
    } catch (err) {
      console.warn('Tauri native updater check error, falling back to GitHub API:', err);
    }
  }

  // Fallback / Web mode: check GitHub latest release API
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      if (res.status === 404) {
        return {
          available: false,
          currentVersion: CURRENT_VERSION,
          latestVersion: CURRENT_VERSION,
          isTauri,
          notes: 'No releases published yet on GitHub repository.',
        };
      }
      throw new Error(`GitHub API returned ${res.status}`);
    }
    const data = await res.json();
    const latestTag = (data.tag_name || '').replace(/^v/, '');
    const isNewer = compareVersions(latestTag, CURRENT_VERSION) > 0;

    return {
      available: isNewer,
      currentVersion: CURRENT_VERSION,
      latestVersion: latestTag,
      releaseDate: data.published_at,
      notes: data.body,
      downloadUrl: data.html_url,
      isTauri,
      hasNativeUpdater: false,
    };
  } catch (err) {
    return {
      available: false,
      currentVersion: CURRENT_VERSION,
      isTauri,
      error: (err as Error).message,
    };
  }
}

export async function installTauriUpdate(
  onProgress?: (downloaded: number, total?: number) => void
): Promise<void> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');

  let update = cachedUpdate;
  if (!update) {
    update = await check();
  }
  if (!update) throw new Error('No update available');

  let downloaded = 0;
  let contentLength = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength || 0;
        if (onProgress) onProgress(0, contentLength);
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        if (onProgress) onProgress(downloaded, contentLength);
        break;
      case 'Finished':
        if (onProgress) onProgress(contentLength, contentLength);
        break;
    }
  });

  // Automatically restart the application to finalize installation
  await relaunch();
}
