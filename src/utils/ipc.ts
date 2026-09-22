import { DiffOptions, DiffResult, FolderCompareResult, CsvCompareResult } from '../types/diff';

// Check if running inside Tauri
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Fallback in-memory diff calculation for browser preview and Vitest tests
function computeLocalDiff(left: string, right: string, _options: DiffOptions): DiffResult {
  const leftLines = left ? left.split('\n') : [];
  const rightLines = right ? right.split('\n') : [];

  const maxLen = Math.max(leftLines.length, rightLines.length);
  const lines: import('../types/diff').DiffLine[] = [];
  const chunks: import('../types/diff').DiffChunk[] = [];
  let added = 0;
  let deleted = 0;
  let modified = 0;

  for (let i = 0; i < maxLen; i++) {
    const l = leftLines[i];
    const r = rightLines[i];

    if (l !== undefined && r !== undefined) {
      if (l === r) {
        lines.push({
          left_line_num: i + 1,
          right_line_num: i + 1,
          left_text: l,
          right_text: r,
          line_type: 'Unchanged' as const,
          left_inline: [],
          right_inline: [],
          chunk_id: null,
        });
      } else {
        modified++;
        const chunkId: number = chunks.length;
        chunks.push({
          chunk_id: chunkId,
          left_start: i + 1,
          left_count: 1,
          right_start: i + 1,
          right_count: 1,
          chunk_type: 'Modification' as const,
          left_lines: [l],
          right_lines: [r],
        });
        lines.push({
          left_line_num: i + 1,
          right_line_num: i + 1,
          left_text: l,
          right_text: r,
          line_type: 'Modified' as const,
          left_inline: [{ start: 0, end: l.length, highlight: true }],
          right_inline: [{ start: 0, end: r.length, highlight: true }],
          chunk_id: chunkId,
        });
      }
    } else if (l !== undefined) {
      deleted++;
      const chunkId = chunks.length;
      chunks.push({
        chunk_id: chunkId,
        left_start: i + 1,
        left_count: 1,
        right_start: i + 1,
        right_count: 0,
        chunk_type: 'Deletion' as const,
        left_lines: [l],
        right_lines: [],
      });
      lines.push({
        left_line_num: i + 1,
        right_line_num: null,
        left_text: l,
        right_text: null,
        line_type: 'Deleted' as const,
        left_inline: [],
        right_inline: [],
        chunk_id: chunkId,
      });
    } else if (r !== undefined) {
      added++;
      const chunkId = chunks.length;
      chunks.push({
        chunk_id: chunkId,
        left_start: i + 1,
        left_count: 0,
        right_start: i + 1,
        right_count: 1,
        chunk_type: 'Addition' as const,
        left_lines: [],
        right_lines: [r],
      });
      lines.push({
        left_line_num: null,
        right_line_num: i + 1,
        left_text: null,
        right_text: r,
        line_type: 'Added' as const,
        left_inline: [],
        right_inline: [],
        chunk_id: chunkId,
      });
    }
  }

  const isIdentical = chunks.length === 0;

  return {
    lines,
    chunks,
    total_left_lines: leftLines.length,
    total_right_lines: rightLines.length,
    added_chunks: added,
    deleted_chunks: deleted,
    modified_chunks: modified,
    is_identical: isIdentical,
    hash_matched: isIdentical,
  };
}

export async function invokeCompareText(
  left: string,
  right: string,
  options: DiffOptions
): Promise<DiffResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('compare_text', { left, right, options });
  }
  return computeLocalDiff(left, right, options);
}

export async function invokeCompareFiles(
  leftPath: string,
  rightPath: string,
  options: DiffOptions
): Promise<DiffResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('compare_files', { leftPath, rightPath, options });
  }
  throw new Error('File comparison requires running in desktop Tauri app');
}

export async function invokeMergeChunk(
  leftContent: string,
  rightContent: string,
  chunkId: number,
  direction: 'left_to_right' | 'right_to_left',
  diffResult: DiffResult,
  options: DiffOptions
): Promise<{ new_left: string; new_right: string; updated_diff: DiffResult }> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('merge_chunk', {
      leftContent,
      rightContent,
      chunkId,
      direction,
      diffResult,
      options,
    });
  }

  // Local fallback merge
  const chunk = diffResult.chunks.find((c) => c.chunk_id === chunkId);
  if (!chunk) return { new_left: leftContent, new_right: rightContent, updated_diff: diffResult };

  let newLeft = leftContent;
  let newRight = rightContent;

  if (direction === 'left_to_right') {
    const rLines = rightContent ? rightContent.split('\n') : [];
    const start = Math.max(0, chunk.right_start - 1);
    rLines.splice(start, chunk.right_count, ...chunk.left_lines);
    newRight = rLines.join('\n');
  } else {
    const lLines = leftContent ? leftContent.split('\n') : [];
    const start = Math.max(0, chunk.left_start - 1);
    lLines.splice(start, chunk.left_count, ...chunk.right_lines);
    newLeft = lLines.join('\n');
  }

  const updatedDiff = computeLocalDiff(newLeft, newRight, options);
  return { new_left: newLeft, new_right: newRight, updated_diff: updatedDiff };
}

export async function invokeReadFile(path: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('read_file', { path });
  }
  return '';
}

export async function invokeSaveFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('save_file', { path, content });
  }
}

export async function invokeCompareFolders(
  leftPath: string,
  rightPath: string,
  deepHash: boolean
): Promise<FolderCompareResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('compare_folders_cmd', { leftPath, rightPath, deepHash });
  }
  return {
    entries: [],
    total_identical: 0,
    total_modified: 0,
    total_only_left: 0,
    total_only_right: 0,
  };
}

export async function invokeCompareCsv(
  leftContent: string,
  rightContent: string,
  keyColumn?: string
): Promise<CsvCompareResult> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('compare_csv_cmd', {
      leftContent,
      rightContent,
      keyColumn: keyColumn || null,
    });
  }
  return {
    headers: [],
    rows: [],
    delimiter: ',',
    key_column: null,
    total_rows: 0,
    modified_rows: 0,
    added_rows: 0,
    deleted_rows: 0,
    identical_rows: 0,
  };
}
