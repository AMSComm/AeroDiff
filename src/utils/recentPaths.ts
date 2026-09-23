const STORAGE_KEY = 'aerodiff_recent_paths';
const MAX_RECENT_PATHS = 30;

export function getRecentPaths(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to load recent paths:', e);
    return [];
  }
}

export function saveRecentPath(path: string): string[] {
  if (typeof window === 'undefined' || !path || !path.trim()) return getRecentPaths();
  const trimmed = path.trim();

  try {
    const current = getRecentPaths();
    // Filter out existing occurrence to move it to the top
    const updated = [trimmed, ...current.filter((p) => p !== trimmed)].slice(0, MAX_RECENT_PATHS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('aerodiff-recent-paths-updated', { detail: updated }));
    return updated;
  } catch (e) {
    console.warn('Failed to save recent path:', e);
    return getRecentPaths();
  }
}

export function removeRecentPath(path: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getRecentPaths();
    const updated = current.filter((p) => p !== path);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('aerodiff-recent-paths-updated', { detail: updated }));
    return updated;
  } catch (e) {
    console.warn('Failed to remove recent path:', e);
    return getRecentPaths();
  }
}

export function clearRecentPaths(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('aerodiff-recent-paths-updated', { detail: [] }));
  } catch (e) {
    console.warn('Failed to clear recent paths:', e);
  }
}
