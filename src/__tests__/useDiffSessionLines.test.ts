import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiffSessionLines } from '../hooks/useDiffSessionLines';
import { DiffResult, DiffLine } from '../types/diff';
import * as ipc from '../utils/ipc';

describe('useDiffSessionLines Hook', () => {
  const sampleLine: DiffLine = {
    left_line_num: 1,
    right_line_num: 1,
    left_text: 'line 1',
    right_text: 'line 1',
    line_type: 'Unchanged',
    left_inline: [],
    right_inline: [],
    chunk_id: null,
  };

  it('handles standard non-streaming diffResult', () => {
    const diffResult: DiffResult = {
      lines: [sampleLine],
      chunks: [],
      total_left_lines: 1,
      total_right_lines: 1,
      added_chunks: 0,
      deleted_chunks: 0,
      modified_chunks: 0,
      is_identical: true,
      hash_matched: true,
    };

    const { result } = renderHook(() => useDiffSessionLines(diffResult));

    expect(result.current.totalLines).toBe(1);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.getLine(0)).toEqual(sampleLine);
    expect(result.current.getLine(1)).toBeUndefined();
  });

  it('handles streaming session with windowed line fetching', async () => {
    const fetchedLine: DiffLine = {
      left_line_num: 101,
      right_line_num: 101,
      left_text: 'line 101',
      right_text: 'line 101 modified',
      line_type: 'Modified',
      left_inline: [],
      right_inline: [],
      chunk_id: 1,
    };

    const spy = vi.spyOn(ipc, 'invokeGetDiffSlice').mockResolvedValue([fetchedLine]);

    const streamingDiff: DiffResult = {
      lines: [sampleLine],
      chunks: [],
      total_left_lines: 1000,
      total_right_lines: 1000,
      added_chunks: 0,
      deleted_chunks: 0,
      modified_chunks: 1,
      is_identical: false,
      hash_matched: false,
      session_id: 'test_session_123',
      total_virtual_lines: 1000,
    };

    const { result } = renderHook(() => useDiffSessionLines(streamingDiff));

    expect(result.current.totalLines).toBe(1000);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.getLine(0)).toEqual(sampleLine);
    expect(result.current.getLine(100)).toBeUndefined();

    // Trigger requestRange
    await act(async () => {
      await result.current.requestRange(100, 110);
    });

    expect(spy).toHaveBeenCalledWith('test_session_123', 100, 100);
    expect(result.current.getLine(100)).toEqual(fetchedLine);

    spy.mockRestore();
  });
});
