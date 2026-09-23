import { isTauri } from './ipc';

/**
 * Open native OS picker for File or Directory
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

      if (selected && typeof selected === 'string') {
        return selected;
      }
      if (Array.isArray(selected) && selected.length > 0 && typeof selected[0] === 'string') {
        return selected[0];
      }
    } catch (err) {
      console.error('Tauri open dialog error:', err);
    }
  }

  // Web Browser fallback: use HTML file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (type === 'folder') {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }

    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        // Return name or webkitRelativePath
        resolve(file.name);
      } else {
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Read text content from path or prompt
 */
export async function readFileContent(path: string): Promise<string> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('read_file', { path });
    } catch (err) {
      console.error(`Failed to read file '${path}':`, err);
      throw err;
    }
  }
  return '';
}
