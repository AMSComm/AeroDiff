import { DiffOptions, DiffResult, FolderCompareResult, CsvCompareResult } from '../types/diff';
import { cleanPath } from './pathUtils';
import { isTauri as checkTauriCore } from '@tauri-apps/api/core';

export const fileContentCache = new Map<string, string>();
if (typeof window !== 'undefined') {
  (window as any).fileContentCache = fileContentCache;
}

// Check if running inside Tauri
export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (
      checkTauriCore() ||
      Boolean((window as any).__TAURI__) ||
      Boolean((window as any).__TAURI_INTERNALS__)
    );
  } catch {
    return Boolean((window as any).__TAURI__) || Boolean((window as any).__TAURI_INTERNALS__);
  }
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
  options: DiffOptions,
  leftEncoding?: string,
  rightEncoding?: string
): Promise<DiffResult> {
  const cLeft = cleanPath(leftPath);
  const cRight = cleanPath(rightPath);

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('compare_files', {
        leftPath: cLeft,
        rightPath: cRight,
        options,
        leftEncoding: leftEncoding && leftEncoding !== 'auto' ? leftEncoding : null,
        rightEncoding: rightEncoding && rightEncoding !== 'auto' ? rightEncoding : null,
      });
    } catch (err) {
      console.warn('Tauri compare_files error, falling back to reading content:', err);
    }
  }

  const [leftRes, rightRes] = await Promise.all([
    invokeReadFile(cLeft, leftEncoding),
    invokeReadFile(cRight, rightEncoding),
  ]);
  return computeLocalDiff(leftRes.content, rightRes.content, options);
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

export interface FileContentResult {
  content: string;
  encoding: string;
}

export async function invokeReadFile(
  path: string,
  encoding?: string
): Promise<FileContentResult> {
  const cleaned = cleanPath(path);
  if (!cleaned) return { content: '', encoding: 'UTF-8' };

  const cacheKey = `${cleaned}:${encoding || 'auto'}`;
  if (fileContentCache.has(cacheKey)) {
    return { content: fileContentCache.get(cacheKey)!, encoding: encoding || 'UTF-8' };
  }

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<FileContentResult>('read_file', {
        path: cleaned,
        encoding: encoding && encoding !== 'auto' ? encoding : null,
      });
      fileContentCache.set(cacheKey, res.content);
      fileContentCache.set(cleaned, res.content);
      return res;
    } catch (err) {
      console.error(`Failed to read file '${cleaned}':`, err);
      throw err;
    }
  }

  if (fileContentCache.has(cleaned)) {
    return { content: fileContentCache.get(cleaned)!, encoding: 'UTF-8' };
  }

  return { content: '', encoding: 'UTF-8' };
}

export interface PathInfo {
  path: string;
  exists: boolean;
  is_dir: boolean;
  is_file: boolean;
  name: string;
}

export async function invokeCheckPath(path: string): Promise<PathInfo> {
  const cleaned = cleanPath(path);
  if (!cleaned) {
    return { path: '', exists: false, is_dir: false, is_file: false, name: '' };
  }
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PathInfo>('check_path', { path: cleaned });
    } catch (err) {
      console.warn('invoke check_path error:', err);
    }
  }
  const isLikelyDir = !cleaned.includes('.') || cleaned.endsWith('/') || cleaned.endsWith('\\');
  const name = cleaned.split(/[/\\]/).pop() || '';
  return {
    path: cleaned,
    exists: true,
    is_dir: isLikelyDir,
    is_file: !isLikelyDir,
    name,
  };
}

export async function invokeSaveFile(
  path: string,
  content: string,
  encoding?: string
): Promise<void> {
  const cleaned = cleanPath(path);
  if (!cleaned) return;
  fileContentCache.set(cleaned, content);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_file', {
      path: cleaned,
      content,
      encoding: encoding && encoding !== 'auto' ? encoding : null,
    });
  }
}

export async function invokeCompareFolders(
  leftPath: string,
  rightPath: string,
  deepHash: boolean
): Promise<FolderCompareResult> {
  const cLeft = cleanPath(leftPath);
  const cRight = cleanPath(rightPath);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('compare_folders_cmd', { leftPath: cLeft, rightPath: cRight, deepHash });
  }
  return {
    entries: [],
    total_identical: 0,
    total_modified: 0,
    total_only_left: 0,
    total_only_right: 0,
  };
}

function computeLocalCsvDiff(
  leftContent: string,
  rightContent: string,
  keyColumn?: string
): CsvCompareResult {
  const delimiter = leftContent.includes('\t') || rightContent.includes('\t') ? '\t' : ',';
  const leftLines = leftContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rightLines = rightContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const leftHeaders = leftLines[0] ? leftLines[0].split(delimiter).map((h) => h.trim()) : [];
  const rightHeaders = rightLines[0] ? rightLines[0].split(delimiter).map((h) => h.trim()) : [];
  const headers = Array.from(new Set([...leftHeaders, ...rightHeaders]));

  const leftRows = leftLines.slice(1).map((line) => line.split(delimiter).map((c) => c.trim()));
  const rightRows = rightLines.slice(1).map((line) => line.split(delimiter).map((c) => c.trim()));

  const maxRows = Math.max(leftRows.length, rightRows.length);
  const rows: import('../types/diff').CsvRowDiff[] = [];
  let modifiedRows = 0;
  let addedRows = 0;
  let deletedRows = 0;
  let identicalRows = 0;

  for (let i = 0; i < maxRows; i++) {
    const lRow = leftRows[i];
    const rRow = rightRows[i];

    if (lRow && rRow) {
      let isDiff = false;
      const cells: import('../types/diff').CsvCellDiff[] = headers.map((h, colIdx) => {
        const lv = lRow[colIdx] ?? '';
        const rv = rRow[colIdx] ?? '';
        const cellDiff = lv !== rv;
        if (cellDiff) isDiff = true;
        return {
          col_index: colIdx,
          col_name: h,
          left_val: lv || null,
          right_val: rv || null,
          is_diff: cellDiff,
        };
      });

      if (isDiff) {
        modifiedRows++;
        rows.push({
          key: (keyColumn ? lRow[leftHeaders.indexOf(keyColumn)] : null) || `#${i + 1}`,
          status: 'Modified',
          cells,
        });
      } else {
        identicalRows++;
        rows.push({
          key: (keyColumn ? lRow[leftHeaders.indexOf(keyColumn)] : null) || `#${i + 1}`,
          status: 'Unchanged',
          cells,
        });
      }
    } else if (lRow) {
      deletedRows++;
      rows.push({
        key: `#${i + 1}`,
        status: 'Deleted',
        cells: headers.map((h, colIdx) => ({
          col_index: colIdx,
          col_name: h,
          left_val: lRow[colIdx] || null,
          right_val: null,
          is_diff: true,
        })),
      });
    } else if (rRow) {
      addedRows++;
      rows.push({
        key: `#${i + 1}`,
        status: 'Added',
        cells: headers.map((h, colIdx) => ({
          col_index: colIdx,
          col_name: h,
          left_val: null,
          right_val: rRow[colIdx] || null,
          is_diff: true,
        })),
      });
    }
  }

  return {
    headers,
    rows,
    delimiter,
    key_column: keyColumn || null,
    total_rows: rows.length,
    modified_rows: modifiedRows,
    added_rows: addedRows,
    deleted_rows: deletedRows,
    identical_rows: identicalRows,
  };
}

export async function invokeCompareCsv(
  leftContent: string,
  rightContent: string,
  keyColumn?: string
): Promise<CsvCompareResult> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('compare_csv_cmd', {
        leftContent,
        rightContent,
        keyColumn: keyColumn || null,
      });
    } catch (err) {
      console.warn('Tauri compare_csv_cmd error, using local fallback:', err);
    }
  }
  return computeLocalCsvDiff(leftContent, rightContent, keyColumn);
}
