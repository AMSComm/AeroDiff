import { useState, useEffect, useRef, useCallback } from 'react';
import { DiffResult, DiffLine } from '../types/diff';
import { invokeGetDiffSlice } from '../utils/ipc';

const PAGE_SIZE = 100;
const MAX_CACHE_SIZE = 25_000;
const MAX_PAGES_PER_BATCH = 10; // Up to 1,000 lines per single IPC batch call

export function useDiffSessionLines(diffResult: DiffResult | null | undefined) {
  const [prevDiffResult, setPrevDiffResult] = useState(diffResult);
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
  const fetchedPages = useRef<Set<number>>(new Set());
  const cacheRef = useRef<Map<number, DiffLine>>(lineMap);

  // Synchronously sync cache and lineMap if diffResult changed during render
  if (prevDiffResult !== diffResult) {
    setPrevDiffResult(diffResult);
    const map = new Map<number, DiffLine>();
    fetchedPages.current.clear();
    inFlightPages.current.clear();

    if (diffResult?.lines) {
      diffResult.lines.forEach((line, i) => map.set(i, line));
      const initialCount = diffResult.lines.length;
      if (!sessionId) {
        // Non-streaming: all lines are loaded
      } else {
        // Only pages fully covered by diffResult.lines are marked as fetched
        const fullyLoadedPages = Math.floor(initialCount / PAGE_SIZE);
        for (let p = 0; p < fullyLoadedPages; p++) {
          fetchedPages.current.add(p);
        }
      }
    }
    setLineMap(map);
    cacheRef.current = map;
  }

  useEffect(() => {
    cacheRef.current = lineMap;
  }, [lineMap]);

  const requestRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (!sessionId || totalLines === 0) return;

      const startPage = Math.floor(Math.max(0, startIndex) / PAGE_SIZE);
      const endPage = Math.floor(Math.min(totalLines - 1, endIndex) / PAGE_SIZE);

      const pagesToFetch: number[] = [];
      for (let p = startPage; p <= endPage; p++) {
        if (!fetchedPages.current.has(p) && !inFlightPages.current.has(p)) {
          // Double check if all lines in this page are already in cache
          const pageStart = p * PAGE_SIZE;
          const pageEnd = Math.min(totalLines, (p + 1) * PAGE_SIZE);
          let missing = false;
          for (let i = pageStart; i < pageEnd; i++) {
            if (!cacheRef.current.has(i)) {
              missing = true;
              break;
            }
          }
          if (missing) {
            pagesToFetch.push(p);
          } else {
            fetchedPages.current.add(p);
          }
        }
      }

      if (pagesToFetch.length === 0) return;

      pagesToFetch.forEach((p) => inFlightPages.current.add(p));

      // Fetch contiguous page batches (up to MAX_PAGES_PER_BATCH = 1000 lines per IPC call)
      const batches: { start: number; limit: number; pages: number[] }[] = [];
      let currentBatch: { start: number; limit: number; pages: number[] } | null = null;

      for (const p of pagesToFetch) {
        if (!currentBatch) {
          currentBatch = { start: p * PAGE_SIZE, limit: PAGE_SIZE, pages: [p] };
        } else if (
          p === currentBatch.pages[currentBatch.pages.length - 1] + 1 &&
          currentBatch.pages.length < MAX_PAGES_PER_BATCH
        ) {
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
          lines.forEach((line, idx) => {
            cacheRef.current.set(batch.start + idx, line);
          });
          batch.pages.forEach((p) => fetchedPages.current.add(p));
          setLineMap((prev) => {
            const next = new Map(prev);
            if (next.size > MAX_CACHE_SIZE) {
              const keysToEvict = Array.from(next.keys()).slice(0, 5000);
              keysToEvict.forEach((k) => {
                next.delete(k);
                fetchedPages.current.delete(Math.floor(k / PAGE_SIZE));
              });
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
      return cacheRef.current.get(index);
    },
    []
  );

  return {
    totalLines,
    getLine,
    lineMap,
    requestRange,
    isStreaming: Boolean(sessionId && totalLines > (diffResult?.lines?.length || 0)),
  };
}
