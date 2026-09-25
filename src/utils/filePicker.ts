import { isTauri, invokeReadFile, fileContentCache } from './ipc';

/**
 * Open native OS picker for File or Directory.
 * Pre-reads content into cache so comparison can immediately access it.
 */
export async function pickPath(type: 'file' | 'folder'): Promise<string | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: type === 'folder',
        multiple: false,
        title: type === 'folder' ? 'Select Directory to Compare' : 'Select File to Compare',
      });

      let chosenPath: string | null = null;
      if (selected && typeof selected === 'string') {
        chosenPath = selected;
      } else if (Array.isArray(selected) && selected.length > 0 && typeof selected[0] === 'string') {
        chosenPath = selected[0];
      }

      if (chosenPath && type === 'file') {
        try {
          await invokeReadFile(chosenPath);
        } catch (e) {
          console.warn('Pre-read file error in pickPath:', e);
        }
      }

      return chosenPath;
    } catch (err) {
      console.error('Tauri open dialog error:', err);
    }
  }

  // Web Browser fallback: use HTML file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    if (type === 'folder') {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
    document.body.appendChild(input);

    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      document.body.removeChild(input);
      if (file) {
        try {
          const text = await file.text();
          fileContentCache.set(file.name, text);
        } catch {
          // Ignore binary or read failure in fallback
        }
        resolve(file.name);
      } else {
        resolve(null);
      }
    };

    input.oncancel = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
      resolve(null);
    };

    input.click();
  });
}

/**
 * Read text content from path with encoding support (UTF-8, Shift_JIS, EUC-JP)
 */
export async function readFileContent(
  path: string,
  encoding?: string
): Promise<{ content: string; encoding: string }> {
  return await invokeReadFile(path, encoding);
}

/**
 * Extract dropped item (File or Folder) path and content
 */
export async function extractDroppedItem(
  e: React.DragEvent
): Promise<{ path: string; isFolder: boolean; content?: string } | null> {
  const items = e.dataTransfer.items;
  const files = e.dataTransfer.files;

  if (files.length === 0 && (!items || items.length === 0)) {
    return null;
  }

  // Check if entry is a directory via webkitGetAsEntry
  let isFolder = false;
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    const entry = items[0].webkitGetAsEntry();
    if (entry && entry.isDirectory) {
      isFolder = true;
    }
  }

  const file = files[0];
  if (!file) return null;

  // On desktop / Tauri webview, file.path is available as absolute path
  const fullPath = (file as any).path || file.name;

  let content: string | undefined = undefined;
  if (!isFolder && (!file.size || file.size <= 5 * 1024 * 1024)) {
    try {
      content = await file.text();
      fileContentCache.set(fullPath, content);
      if (file.name !== fullPath) {
        fileContentCache.set(file.name, content);
      }
    } catch {
      // Ignore
    }
  }

  return {
    path: fullPath,
    isFolder,
    content,
  };
}
