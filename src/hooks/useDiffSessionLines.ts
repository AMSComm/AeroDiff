import { useState, useEffect, useRef, useCallback } from 'react';
import { DiffResult, DiffLine } from '../types/diff';
import { invokeGetDiffSlice } from '../utils/ipc';

const PAGE_SIZE = 100;
const MAX_CACHE_SIZE = 10_000;

export function useDiffSessionLines(diffResult: DiffResult | null | undefined) {
  const [lineMap, setLineMap] = useState<Map<number, DiffLine>>(() => {
    const map = new Map<number, DiffLine>();
    if (diffResult?.lines) {
      diffResult.lines.forEach((line, i) => map.set(i, line));
    }
    return map;
  });

  const totalLines = diffResult?.total_virtual_lines || diffResult?.lines?.length || 0;
  const sessionId = diffResult?.session_id;

  const inFlightPages = useRef<Set<number>>(new Set());
  const cacheRef = useRef<Map<number, DiffLine>>(lineMap);

  useEffect(() => {
    cacheRef.current = lineMap;
  }, [lineMap]);

  // Reset cache whenever diffResult or session_id changes
  useEffect(() => {
    const map = new Map<number, DiffLine>();
    if (diffResult?.lines) {
      diffResult.lines.forEach((line, i) => map.set(i, line));
    }
    setLineMap(map);
    inFlightPages.current.clear();
  }, [sessionId, diffResult]);

  const requestRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (!sessionId || totalLines === 0) return;

      const startPage = Math.floor(Math.max(0, startIndex) / PAGE_SIZE);
      const endPage = Math.floor(Math.min(totalLines - 1, endIndex) / PAGE_SIZE);

      const pagesToFetch: number[] = [];
      for (let p = startPage; p <= endPage; p++) {
        const pageOffset = p * PAGE_SIZE;
        if (!cacheRef.current.has(pageOffset) && !inFlightPages.current.has(p)) {
          pagesToFetch.push(p);
        }
      }

      if (pagesToFetch.length === 0) return;

      pagesToFetch.forEach((p) => inFlightPages.current.add(p));

      // Fetch contiguous page batches (up to 5 pages = 500 lines per IPC call)
      const batches: { start: number; limit: number; pages: number[] }[] = [];
      let currentBatch: { start: number; limit: number; pages: number[] } | null = null;

      for (const p of pagesToFetch) {
        if (!currentBatch) {
          currentBatch = { start: p * PAGE_SIZE, limit: PAGE_SIZE, pages: [p] };
        } else if (p === currentBatch.pages[currentBatch.pages.length - 1] + 1 && currentBatch.pages.length < 5) {
          currentBatch.limit += PAGE_SIZE;
          currentBatch.pages.push(p);
        } else {
          batches.push(currentBatch);
          currentBatch = { start: p * PAGE_SIZE, limit: PAGE_SIZE, pages: [p] };
        }
      }
      if (currentBatch) batches.push(currentBatch);

      for (const batch of batches) {
        try {
          const lines = await invokeGetDiffSlice(sessionId, batch.start, batch.limit);
          setLineMap((prev) => {
            const next = new Map(prev);
            if (next.size > MAX_CACHE_SIZE) {
              const keysToEvict = Array.from(next.keys()).slice(0, 2000);
              keysToEvict.forEach((k) => next.delete(k));
            }
            lines.forEach((line, idx) => {
              next.set(batch.start + idx, line);
            });
            return next;
          });
        } catch (e) {
          console.error('Failed to fetch diff slice:', e);
        } finally {
          batch.pages.forEach((p) => inFlightPages.current.delete(p));
        }
      }
    },
    [sessionId, totalLines]
  );

  const getLine = useCallback(
    (index: number): DiffLine | undefined => {
      return lineMap.get(index);
    },
    [lineMap]
  );

  return {
    totalLines,
    getLine,
    requestRange,
    isStreaming: Boolean(sessionId && totalLines > (diffResult?.lines?.length || 0)),
  };
}
