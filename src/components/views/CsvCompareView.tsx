import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { registerScrollLineGetter, useTabStore } from '../../stores/tabStore';
import { DiffOptions } from '../../types/diff';
import { MasterVerticalScrollbar } from '../viewer/MasterVerticalScrollbar';
import { useDiffSessionLines } from '../../hooks/useDiffSessionLines';

/**
 * Compare two cell values taking into account active diff options (case, whitespace)
 */
function areCellsEqual(left: string, right: string, options?: DiffOptions): boolean {
  if (left === right) return true;
  if (!options) return false;

  let l = left;
  let r = right;

  if (options.ignore_case) {
    l = l.toLowerCase();
    r = r.toLowerCase();
  }

  if (options.ignore_whitespace === 'All') {
    l = l.replace(/\s+/g, '');
    r = r.replace(/\s+/g, '');
  } else if (options.ignore_whitespace === 'LeadingAndTrailing') {
    l = l.trim();
    r = r.trim();
  }

  return l === r;
}

/**
 * Fast CSV line splitter handling commas, tabs, semicolons, and quoted values
 */
function splitCsvCells(line: string | null, delimiter: string): string[] {
  if (line === null) return [];
  if (!line.includes('"')) {
    return line.split(delimiter).map((c) => c.trim());
  }

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export interface CsvColumnInfo {
  name: string;
  leftIndex: number;
  rightIndex: number;
  status: 'common' | 'added' | 'deleted';
}

/**
 * Intelligent Schema & Header-aware column alignment.
 * Detects newly added columns in Right, deleted columns from Left,
 * and maintains proper cell alignment without shifting columns.
 */
export function alignCsvHeaders(leftH: string[], rightH: string[]): CsvColumnInfo[] {
  if (leftH.length === 0 && rightH.length === 0) {
    return [{ name: 'Col 1', leftIndex: 0, rightIndex: 0, status: 'common' }];
  }
  if (leftH.length === 0) {
    return rightH.map((name, idx) => ({
      name: name || `Col ${idx + 1}`,
      leftIndex: -1,
      rightIndex: idx,
      status: 'added' as const,
    }));
  }
  if (rightH.length === 0) {
    return leftH.map((name, idx) => ({
      name: name || `Col ${idx + 1}`,
      leftIndex: idx,
      rightIndex: -1,
      status: 'deleted' as const,
    }));
  }

  const leftTrimmed = leftH.map((h) => h.trim());
  const rightTrimmed = rightH.map((h) => h.trim());

  const rightMap = new Map<string, number>();
  rightTrimmed.forEach((h, idx) => {
    if (!rightMap.has(h.toLowerCase())) {
      rightMap.set(h.toLowerCase(), idx);
    }
  });

  const hasAnyCommon = leftTrimmed.some((h) => rightMap.has(h.toLowerCase()));

  // Fallback to positional alignment if no headers match at all
  if (!hasAnyCommon) {
    const max = Math.max(leftH.length, rightH.length);
    const result: CsvColumnInfo[] = [];
    for (let i = 0; i < max; i++) {
      const lExists = i < leftH.length;
      const rExists = i < rightH.length;
      result.push({
        name: leftH[i] || rightH[i] || `Col ${i + 1}`,
        leftIndex: lExists ? i : -1,
        rightIndex: rExists ? i : -1,
        status: lExists && rExists ? 'common' : rExists ? 'added' : 'deleted',
      });
    }
    return result;
  }

  const leftMap = new Map<string, number>();
  leftTrimmed.forEach((h, idx) => {
    if (!leftMap.has(h.toLowerCase())) {
      leftMap.set(h.toLowerCase(), idx);
    }
  });

  const columns: CsvColumnInfo[] = [];
  const handledRight = new Set<number>();

  for (let lIdx = 0; lIdx < leftTrimmed.length; lIdx++) {
    const lHeader = leftTrimmed[lIdx];
    const rIdx = rightMap.get(lHeader.toLowerCase()) ?? -1;

    if (rIdx >= 0) {
      // Any unhandled right headers before rIdx in rightH should be inserted before this column
      for (let r = 0; r < rIdx; r++) {
        if (!handledRight.has(r)) {
          const rH = rightTrimmed[r];
          if (!leftMap.has(rH.toLowerCase())) {
            columns.push({
              name: rightH[r] || `Col ${r + 1}`,
              leftIndex: -1,
              rightIndex: r,
              status: 'added',
            });
            handledRight.add(r);
          }
        }
      }

      columns.push({
        name: leftH[lIdx] || rightH[rIdx] || `Col ${lIdx + 1}`,
        leftIndex: lIdx,
        rightIndex: rIdx,
        status: 'common',
      });
      handledRight.add(rIdx);
    } else {
      // Column exists only in left
      columns.push({
        name: leftH[lIdx] || `Col ${lIdx + 1}`,
        leftIndex: lIdx,
        rightIndex: -1,
        status: 'deleted',
      });
    }
  }

  // Any remaining unhandled columns in right (appended at end)
  for (let r = 0; r < rightH.length; r++) {
    if (!handledRight.has(r)) {
      const rH = rightTrimmed[r];
      if (!leftMap.has(rH.toLowerCase())) {
        columns.push({
          name: rightH[r] || `Col ${r + 1}`,
          leftIndex: -1,
          rightIndex: r,
          status: 'added',
        });
        handledRight.add(r);
      }
    }
  }

  return columns;
}

export const CsvCompareView: React.FC = () => {
  const activeTab = useTabStore(
    (state) => state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
  );
  const { mergeChunkAction, setLeftContent, setRightContent, syncActiveChunkFromLine } = useTabStore();

  const parentContainerRef = useRef<HTMLDivElement>(null);
  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const gutterContainerRef = useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  scrollTopRef.current = scrollTop;

  useEffect(() => {
    return registerScrollLineGetter(() => Math.floor(scrollTopRef.current / 26));
  }, []);

  useEffect(() => {
    syncActiveChunkFromLine(Math.floor(scrollTop / 26));
  }, [scrollTop, syncActiveChunkFromLine]);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Inline cell edit state
  const [editingCell, setEditingCell] = useState<{
    side: 'left' | 'right';
    rowIndex: number;
    colIndex: number;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Selected cell state for navigation
  const [selectedCell, setSelectedCell] = useState<{
    side: 'left' | 'right';
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  const isCommittingRef = useRef(false);

  const diffResult = activeTab?.diffResult;
  const options = activeTab?.options;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  const { totalLines, getLine, lineMap, requestRange } = useDiffSessionLines(diffResult);

  // Detect delimiter from first non-empty line
  const delimiter = useMemo(() => {
    const sample = getLine(0) || diffResult?.lines?.[0];
    const text = sample?.left_text || sample?.right_text || '';
    if (text.includes('\t')) return '\t';
    if (text.includes(';')) return ';';
    if (text.includes(',')) return ',';
    return ',';
  }, [diffResult, getLine]);

  // Derive schema-aware aligned columns from the first line
  const columns = useMemo(() => {
    const headerLine = getLine(0) || diffResult?.lines?.[0];
    const leftH = headerLine?.left_text ? splitCsvCells(headerLine.left_text, delimiter) : [];
    const rightH = headerLine?.right_text ? splitCsvCells(headerLine.right_text, delimiter) : [];
    return alignCsvHeaders(leftH, rightH);
  }, [diffResult, delimiter, getLine]);

  const maxCols = columns.length;
  const columnHeaders = useMemo(() => columns.map((c) => c.name), [columns]);

  const colWidth = 140;

  // Auto-detect columns with differences across loaded lines for quick navigation
  const changedColIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const [_, line] of lineMap.entries()) {
      if (line.line_type === 'Modified' && line.left_text && line.right_text) {
        const leftCells = splitCsvCells(line.left_text, delimiter);
        const rightCells = splitCsvCells(line.right_text, delimiter);
        for (let c = 0; c < columns.length; c++) {
          const col = columns[c];
          if (col.status === 'common') {
            const lv = leftCells[col.leftIndex] ?? '';
            const rv = rightCells[col.rightIndex] ?? '';
            if (!areCellsEqual(lv, rv, options)) {
              indices.add(c);
            }
          }
        }
      }
      if (indices.size >= 12) break;
    }
    return Array.from(indices).sort((a, b) => a - b);
  }, [lineMap, delimiter, columns, options]);

  const addedColIndices = useMemo(() => {
    return columns
      .map((col, idx) => (col.status === 'added' ? idx : -1))
      .filter((idx) => idx >= 0);
  }, [columns]);

  const deletedColIndices = useMemo(() => {
    return columns
      .map((col, idx) => (col.status === 'deleted' ? idx : -1))
      .filter((idx) => idx >= 0);
  }, [columns]);

  // Virtualizer for 60fps performance on large tables
  const rowVirtualizer = useVirtualizer({
    count: totalLines,
    getScrollElement: () => rightContainerRef.current,
    estimateSize: () => 26, // 26px row height for tables
    overscan: 25,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    if (virtualItems.length > 0) {
      const start = virtualItems[0].index;
      const end = virtualItems[virtualItems.length - 1].index;
      requestRange(start, end);
    }
  }, [virtualItems, requestRange]);

  // Proactively pre-fetch first diff chunk on load so changed columns bar is immediately populated
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const firstChunk = diffResult.chunks[0];
      const lineIdx = Math.max(0, (firstChunk.left_start || firstChunk.right_start) - 1);
      requestRange(lineIdx, lineIdx + 5);
    }
  }, [diffResult, requestRange]);

  // Track parent viewport height
  useEffect(() => {
    const el = parentContainerRef.current;
    if (!el) return;

    setViewportHeight(el.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setViewportHeight(entry.contentRect.height);
        }
      });

      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [totalLines]);

  // Synchronized scroll applicator with zero feedback loops
  const applyScrollTop = useCallback((newTop: number) => {
    setScrollTop(newTop);
    if (leftContainerRef.current && leftContainerRef.current.scrollTop !== newTop) {
      leftContainerRef.current.scrollTop = newTop;
    }
    if (rightContainerRef.current && rightContainerRef.current.scrollTop !== newTop) {
      rightContainerRef.current.scrollTop = newTop;
    }
    if (gutterContainerRef.current && gutterContainerRef.current.scrollTop !== newTop) {
      gutterContainerRef.current.scrollTop = newTop;
    }
  }, []);

  const syncingSource = useRef<'left' | 'right' | null>(null);

  const scrollToColumn = useCallback(
    (colIdx: number) => {
      const targetScrollLeft = Math.max(0, colIdx * colWidth - 80);
      syncingSource.current = 'left';
      if (leftContainerRef.current) leftContainerRef.current.scrollLeft = targetScrollLeft;
      if (rightContainerRef.current) rightContainerRef.current.scrollLeft = targetScrollLeft;
      queueMicrotask(() => {
        syncingSource.current = null;
      });
    },
    [colWidth]
  );

  const handleLeftHorizontalScroll = useCallback(() => {
    if (syncingSource.current === 'right') return;
    const left = leftContainerRef.current;
    const right = rightContainerRef.current;
    if (!left || !right) return;

    const currentLeft = left.scrollLeft;
    if (Math.abs(right.scrollLeft - currentLeft) >= 0.5) {
      syncingSource.current = 'left';
      right.scrollLeft = currentLeft;
      queueMicrotask(() => {
        syncingSource.current = null;
      });
    }
  }, []);

  const handleRightHorizontalScroll = useCallback(() => {
    if (syncingSource.current === 'left') return;
    const left = leftContainerRef.current;
    const right = rightContainerRef.current;
    if (!left || !right) return;

    const currentRight = right.scrollLeft;
    if (Math.abs(left.scrollLeft - currentRight) >= 0.5) {
      syncingSource.current = 'right';
      left.scrollLeft = currentRight;
      queueMicrotask(() => {
        syncingSource.current = null;
      });
    }
  }, []);

  // Non-passive wheel handler on parent container locking all panes synchronously
  useEffect(() => {
    const el = parentContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // Only intercept for vertical scroll if vertical motion is dominant!
      // This prevents swallowing or cancelling trackpad horizontal swipe gestures.
      if (absY > 0 && absY >= absX) {
        const totalSize = rowVirtualizer.getTotalSize() + 30; // +30 for header
        const clientH = el.clientHeight || viewportHeight || 600;
        const maxScroll = Math.max(0, totalSize - clientH);
        if (maxScroll > 0) {
          e.preventDefault();
          setScrollTop((prev) => {
            const next = Math.max(0, Math.min(maxScroll, prev + e.deltaY));
            if (leftContainerRef.current) leftContainerRef.current.scrollTop = next;
            if (rightContainerRef.current) rightContainerRef.current.scrollTop = next;
            if (gutterContainerRef.current) gutterContainerRef.current.scrollTop = next;
            return next;
          });
        }
      } else if (absX > 0 && absX > absY) {
        // If scrolling horizontally over gutter or non-scrollable area, sync both containers directly
        const target = e.target as HTMLElement | null;
        if (target && gutterContainerRef.current?.contains(target)) {
          e.preventDefault();
          if (leftContainerRef.current && rightContainerRef.current) {
            leftContainerRef.current.scrollLeft += e.deltaX;
            rightContainerRef.current.scrollLeft += e.deltaX;
          }
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handleWheel, { capture: true });
  }, [rowVirtualizer, totalLines, viewportHeight]);

  // Keep selected cell in view both vertically and horizontally
  const scrollCellIntoView = useCallback(
    (rowIndex: number, colIndex: number) => {
      const rowTop = rowIndex * 26;
      const rowBottom = (rowIndex + 1) * 26;
      const headerHeight = 30;
      const clientH = parentContainerRef.current?.clientHeight || viewportHeight || 600;
      const effectiveViewport = Math.max(100, clientH - headerHeight);

      // Vertical scroll check
      setScrollTop((currentScroll) => {
        let newScroll = currentScroll;
        if (rowTop < currentScroll) {
          newScroll = rowTop;
        } else if (rowBottom > currentScroll + effectiveViewport - 10) {
          newScroll = rowBottom - effectiveViewport + 10;
        }
        if (newScroll !== currentScroll) {
          if (leftContainerRef.current) leftContainerRef.current.scrollTop = newScroll;
          if (rightContainerRef.current) rightContainerRef.current.scrollTop = newScroll;
          if (gutterContainerRef.current) gutterContainerRef.current.scrollTop = newScroll;
        }
        return newScroll;
      });

      // Horizontal scroll check
      const colLeft = colIndex * colWidth;
      const colRight = (colIndex + 1) * colWidth;
      const container = leftContainerRef.current;
      if (container) {
        const clientW = Math.max(100, container.clientWidth - 40); // 40px for row number column
        const currentScrollLeft = container.scrollLeft;
        let targetScrollLeft = currentScrollLeft;
        if (colLeft < currentScrollLeft) {
          targetScrollLeft = Math.max(0, colLeft);
        } else if (colRight > currentScrollLeft + clientW) {
          targetScrollLeft = colRight - clientW + 20;
        }
        if (targetScrollLeft !== currentScrollLeft) {
          syncingSource.current = 'left';
          if (leftContainerRef.current) leftContainerRef.current.scrollLeft = targetScrollLeft;
          if (rightContainerRef.current) rightContainerRef.current.scrollLeft = targetScrollLeft;
          queueMicrotask(() => {
            syncingSource.current = null;
          });
        }
      }
    },
    [colWidth, viewportHeight]
  );

  const lastJumpNonceRef = useRef<number | null>(null);
  const lastHorizontalSnapNonceRef = useRef<number | null>(null);

  // Jump to active chunk when navigation buttons clicked & auto-scroll horizontal to changed column
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const currentNonce = activeTab?.chunkJumpNonce ?? 0;
      if (lastJumpNonceRef.current === currentNonce) return;
      lastJumpNonceRef.current = currentNonce;
      lastHorizontalSnapNonceRef.current = currentNonce;

      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (activeChunk) {
        const lineIdx = Math.max(0, (activeChunk.left_start || activeChunk.right_start) - 1);
        // Align diff row directly to the top of the table viewport
        const targetOffset = Math.max(0, lineIdx * 26);
        applyScrollTop(targetOffset);

        // Pre-fetch slice around lineIdx
        requestRange(Math.max(0, lineIdx - 10), lineIdx + 50);

        const line = getLine(lineIdx);
        if (line) {
          lastHorizontalSnapNonceRef.current = null;
          const leftCells = line.left_text !== null ? splitCsvCells(line.left_text, delimiter) : null;
          const rightCells = line.right_text !== null ? splitCsvCells(line.right_text, delimiter) : null;
          if (leftCells && rightCells) {
            for (let c = 0; c < columns.length; c++) {
              const col = columns[c];
              if (col.status === 'common') {
                const lv = leftCells[col.leftIndex] ?? '';
                const rv = rightCells[col.rightIndex] ?? '';
                if (!areCellsEqual(lv, rv, options)) {
                  scrollToColumn(c);
                  break;
                }
              } else if (col.status === 'added' || col.status === 'deleted') {
                scrollToColumn(c);
                break;
              }
            }
          }
        }
      }
    }
  }, [
    activeTab?.chunkJumpNonce,
    activeChunkIndex,
    diffResult,
    applyScrollTop,
    requestRange,
    getLine,
    delimiter,
    columns,
    options,
    scrollToColumn,
  ]);

  // When lineMap receives the activeChunk line, snap horizontally to changed column
  useEffect(() => {
    const currentNonce = activeTab?.chunkJumpNonce ?? 0;
    if (lastHorizontalSnapNonceRef.current !== currentNonce) return;

    if (diffResult && diffResult.chunks.length > 0) {
      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (!activeChunk) return;
      const lineIdx = Math.max(0, (activeChunk.left_start || activeChunk.right_start) - 1);
      const line = getLine(lineIdx);
      if (line) {
        lastHorizontalSnapNonceRef.current = null;
        const leftCells = line.left_text !== null ? splitCsvCells(line.left_text, delimiter) : null;
        const rightCells = line.right_text !== null ? splitCsvCells(line.right_text, delimiter) : null;
        if (leftCells && rightCells) {
          for (let c = 0; c < columns.length; c++) {
            const col = columns[c];
            if (col.status === 'common') {
              const lv = leftCells[col.leftIndex] ?? '';
              const rv = rightCells[col.rightIndex] ?? '';
              if (!areCellsEqual(lv, rv, options)) {
                scrollToColumn(c);
                break;
              }
            } else if (col.status === 'added' || col.status === 'deleted') {
              scrollToColumn(c);
              break;
            }
          }
        }
      }
    }
  }, [activeTab?.chunkJumpNonce, activeChunkIndex, lineMap, getLine, delimiter, columns, options, scrollToColumn, diffResult]);

  // Cell edit trigger
  const startEditing = useCallback(
    (side: 'left' | 'right', rowIndex: number, colIndex: number, defaultVal?: string) => {
      const col = columns[colIndex];
      if (!col) return;
      if (side === 'left' && col.leftIndex === -1) return;
      if (side === 'right' && col.rightIndex === -1) return;

      const line = getLine(rowIndex);
      if (!line) return;
      const text = side === 'left' ? line.left_text : line.right_text;
      if (text === null) return;
      const cells = splitCsvCells(text, delimiter);
      const targetIdx = side === 'left' ? col.leftIndex : col.rightIndex;
      const currentVal = defaultVal !== undefined ? defaultVal : cells[targetIdx] ?? '';
      setEditingCell({ side, rowIndex, colIndex });
      setEditValue(currentVal);
    },
    [columns, getLine, delimiter]
  );

  // Cell edit commit
  const commitEdit = useCallback(
    (side: 'left' | 'right', rowIndex: number, colIndex: number, valToSave: string) => {
      if (isCommittingRef.current) return;
      isCommittingRef.current = true;

      try {
        const col = columns[colIndex];
        if (!col) return;
        const targetColIdx = side === 'left' ? col.leftIndex : col.rightIndex;
        if (targetColIdx === -1) return;

        const line = getLine(rowIndex);
        if (!line) return;
        const lineNum = side === 'left' ? line.left_line_num : line.right_line_num;
        if (!lineNum) return;

        const storeTab = useTabStore.getState().getActiveTab();
        const rawContent = side === 'left' ? storeTab?.leftContent || '' : storeTab?.rightContent || '';
        const fileLines = rawContent.split('\n');
        const lineIdx = lineNum - 1;
        if (lineIdx < 0 || lineIdx >= fileLines.length) return;

        const origLine = fileLines[lineIdx];
        const cells = splitCsvCells(origLine, delimiter);
        while (cells.length <= targetColIdx) {
          cells.push('');
        }

        if (cells[targetColIdx] === valToSave) return;

        cells[targetColIdx] = valToSave;

        const encodedLine = cells
          .map((c) => {
            if (c.includes(delimiter) || c.includes('"') || c.includes('\n')) {
              return `"${c.replace(/"/g, '""')}"`;
            }
            return c;
          })
          .join(delimiter);

        fileLines[lineIdx] = encodedLine;
        const updatedContent = fileLines.join('\n');

        if (side === 'left') {
          setLeftContent(updatedContent);
        } else {
          setRightContent(updatedContent);
        }
      } finally {
        setEditingCell(null);
        setTimeout(() => {
          isCommittingRef.current = false;
        }, 100);
      }
    },
    [columns, delimiter, getLine, setLeftContent, setRightContent]
  );

  // Key navigation inside cell editor (Enter, Tab, Esc)
  const handleInputKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      side: 'left' | 'right',
      rowIndex: number,
      colIndex: number
    ) => {
      e.stopPropagation();
      if (e.nativeEvent) {
        e.nativeEvent.stopImmediatePropagation();
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit(side, rowIndex, colIndex, editValue);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditingCell(null);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit(side, rowIndex, colIndex, editValue);

        if (!e.shiftKey) {
          if (colIndex + 1 < maxCols) {
            startEditing(side, rowIndex, colIndex + 1);
          } else if (rowIndex + 1 < totalLines) {
            startEditing(side, rowIndex + 1, 0);
          }
        } else {
          if (colIndex - 1 >= 0) {
            startEditing(side, rowIndex, colIndex - 1);
          } else if (rowIndex - 1 >= 0) {
            startEditing(side, rowIndex - 1, maxCols - 1);
          }
        }
      }
    },
    [commitEdit, editValue, maxCols, totalLines, startEditing]
  );

  // Keyboard navigation for selected cell (Arrow keys, Tab, Enter/F2 to edit, Esc to deselect)
  useEffect(() => {
    if (!selectedCell || editingCell) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isCommittingRef.current) {
        return;
      }
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        return;
      }

      let nextRow = selectedCell.rowIndex;
      let nextCol = selectedCell.colIndex;
      let nextSide = selectedCell.side;
      let handled = false;

      if (e.key === 'ArrowUp') {
        nextRow = Math.max(0, selectedCell.rowIndex - 1);
        handled = true;
      } else if (e.key === 'ArrowDown') {
        nextRow = Math.min(totalLines - 1, selectedCell.rowIndex + 1);
        handled = true;
      } else if (e.key === 'ArrowLeft') {
        if (selectedCell.colIndex > 0) {
          nextCol = selectedCell.colIndex - 1;
        } else if (selectedCell.side === 'right') {
          nextSide = 'left';
          nextCol = maxCols - 1;
        }
        handled = true;
      } else if (e.key === 'ArrowRight') {
        if (selectedCell.colIndex < maxCols - 1) {
          nextCol = selectedCell.colIndex + 1;
        } else if (selectedCell.side === 'left') {
          nextSide = 'right';
          nextCol = 0;
        }
        handled = true;
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (selectedCell.colIndex > 0) {
            nextCol = selectedCell.colIndex - 1;
          } else if (selectedCell.rowIndex > 0) {
            nextRow = selectedCell.rowIndex - 1;
            nextCol = maxCols - 1;
          }
        } else {
          if (selectedCell.colIndex < maxCols - 1) {
            nextCol = selectedCell.colIndex + 1;
          } else if (selectedCell.rowIndex < totalLines - 1) {
            nextRow = selectedCell.rowIndex + 1;
            nextCol = 0;
          }
        }
        handled = true;
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const col = columns[selectedCell.colIndex];
        if (!col) return;
        if (selectedCell.side === 'left' && col.leftIndex === -1) return;
        if (selectedCell.side === 'right' && col.rightIndex === -1) return;

        const line = getLine(selectedCell.rowIndex);
        const text = selectedCell.side === 'left' ? line?.left_text : line?.right_text;
        const cells = text ? splitCsvCells(text, delimiter) : [];
        const targetIdx = selectedCell.side === 'left' ? col.leftIndex : col.rightIndex;
        const val = cells[targetIdx] ?? '';
        startEditing(selectedCell.side, selectedCell.rowIndex, selectedCell.colIndex, val);
        return;
      } else if (e.key === 'Escape') {
        setSelectedCell(null);
        return;
      }

      if (handled) {
        e.preventDefault();
        setSelectedCell({ side: nextSide, rowIndex: nextRow, colIndex: nextCol });
        scrollCellIntoView(nextRow, nextCol);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedCell,
    editingCell,
    totalLines,
    maxCols,
    columns,
    scrollCellIntoView,
    getLine,
    delimiter,
    startEditing,
  ]);

  const isIdentical = diffResult?.is_identical;
  const tableMinWidth = Math.max(40 + maxCols * colWidth, 400);

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Identical Notification Banner if applicable */}
      {isIdentical && totalLines > 0 && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-1 flex items-center justify-center space-x-2 text-emerald-400 text-xs shrink-0 font-sans">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Both CSV tables are identical.</span>
        </div>
      )}

      {/* Schema & Differences Summary Bar */}
      {(addedColIndices.length > 0 || deletedColIndices.length > 0 || changedColIndices.length > 0) && (
        <div className="bg-neutral-900/90 border-b border-neutral-800 px-3 py-1 flex items-center space-x-2 text-[11px] shrink-0 overflow-x-auto">
          {/* Added Columns Chips */}
          {addedColIndices.length > 0 && (
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-emerald-400 font-semibold whitespace-nowrap flex items-center space-x-1">
                <span>+ Added Columns ({addedColIndices.length}):</span>
              </span>
              <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
                {addedColIndices.map((colIdx) => (
                  <button
                    key={colIdx}
                    onClick={() => scrollToColumn(colIdx)}
                    className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 hover:border-emerald-400 transition-colors flex items-center space-x-1 font-mono text-[11px] whitespace-nowrap cursor-pointer shadow-xs"
                    title={`Jump horizontally to added column: ${columns[colIdx]?.name} (exists in Right only)`}
                  >
                    <span className="font-semibold">{columns[colIdx]?.name}</span>
                    <span className="text-[9px] text-emerald-400/80">(Right only)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deleted Columns Chips */}
          {deletedColIndices.length > 0 && (
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-rose-400 font-semibold whitespace-nowrap flex items-center space-x-1">
                <span>- Deleted Columns ({deletedColIndices.length}):</span>
              </span>
              <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
                {deletedColIndices.map((colIdx) => (
                  <button
                    key={colIdx}
                    onClick={() => scrollToColumn(colIdx)}
                    className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-200 hover:bg-rose-500/30 hover:border-rose-400 transition-colors flex items-center space-x-1 font-mono text-[11px] whitespace-nowrap cursor-pointer shadow-xs"
                    title={`Jump horizontally to deleted column: ${columns[colIdx]?.name} (exists in Left only)`}
                  >
                    <span className="font-semibold">{columns[colIdx]?.name}</span>
                    <span className="text-[9px] text-rose-400/80">(Left only)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Changed Columns Chips */}
          {changedColIndices.length > 0 && (
            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-amber-400 font-semibold whitespace-nowrap flex items-center space-x-1">
                <span>⚠️ Changed Cells ({changedColIndices.length}):</span>
              </span>
              <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
                {changedColIndices.map((colIdx) => (
                  <button
                    key={colIdx}
                    onClick={() => scrollToColumn(colIdx)}
                    className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 hover:border-amber-400 transition-colors flex items-center space-x-1 font-mono text-[11px] whitespace-nowrap cursor-pointer shadow-xs"
                    title={`Jump horizontally to changed column ${columns[colIdx]?.name}`}
                  >
                    <span className="font-semibold">{columns[colIdx]?.name}</span>
                    <span className="text-[9px] text-amber-400/80">(Col {colIdx + 1})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Dual Table Split View */}
      <div ref={parentContainerRef} className="flex-1 flex overflow-hidden bg-neutral-950 select-none relative font-mono text-[12px]">
        {/* Empty state */}
        {totalLines === 0 && (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs font-sans">
            <span>{diffResult ? 'Both files are empty.' : 'Loading table diff...'}</span>
          </div>
        )}

        {totalLines > 0 && (
          <div className="flex-1 flex overflow-hidden relative">
            {/* === LEFT TABLE CONTAINER (SCROLLABLE X, Y LOCKED TO MASTER) === */}
            <div
              ref={leftContainerRef}
              data-testid="csv-left-container"
              onScroll={handleLeftHorizontalScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden border-r border-neutral-800 overscroll-x-none"
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize() + 30}px`,
                  minWidth: '100%',
                  width: `${tableMinWidth}px`,
                  position: 'relative',
                }}
              >
                {/* Sticky Header Row */}
                <div
                  className="sticky top-0 z-20 flex bg-neutral-900 border-b border-neutral-800 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 shadow-sm"
                  style={{ width: `${tableMinWidth}px`, height: '30px' }}
                >
                  <div className="sticky left-0 z-30 w-10 px-2 py-1.5 text-right shrink-0 bg-neutral-950 text-neutral-500 border-r border-neutral-800 shadow-[1px_0_0_#27272a]">
                    #
                  </div>
                  <div className="flex-1 flex">
                    {columns.map((col, idx) => {
                      const hasDiff = changedColIndices.includes(idx);
                      const isAddedCol = col.status === 'added';
                      const isDeletedCol = col.status === 'deleted';

                      return (
                        <div
                          key={idx}
                          onClick={() => (hasDiff || isAddedCol || isDeletedCol) && scrollToColumn(idx)}
                          style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                          className={`px-2 py-1.5 truncate border-r border-neutral-800/60 transition-colors flex items-center justify-between ${
                            isAddedCol
                              ? 'bg-emerald-500/15 text-emerald-200 font-bold border-b-2 border-b-emerald-500 cursor-pointer hover:bg-emerald-500/25'
                              : isDeletedCol
                              ? 'bg-rose-500/15 text-rose-200 font-bold border-b-2 border-b-rose-500 cursor-pointer hover:bg-rose-500/25'
                              : hasDiff
                              ? 'bg-amber-500/15 text-amber-200 font-bold border-b-2 border-b-amber-500 cursor-pointer hover:bg-amber-500/25'
                              : 'text-neutral-400'
                          }`}
                          title={
                            isAddedCol
                              ? `${col.name} (Added in Right - Click to snap)`
                              : isDeletedCol
                              ? `${col.name} (Deleted in Right - Click to snap)`
                              : hasDiff
                              ? `${col.name} (Contains differences - Click to snap)`
                              : col.name
                          }
                        >
                          <span className="truncate">{col.name}</span>
                          {isAddedCol ? (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-emerald-500/30 text-emerald-300 rounded font-mono font-bold shrink-0">
                              +COL
                            </span>
                          ) : isDeletedCol ? (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-rose-500/30 text-rose-300 rounded font-mono font-bold shrink-0">
                              -COL
                            </span>
                          ) : hasDiff ? (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-amber-500/30 text-amber-300 rounded font-mono font-bold shrink-0">
                              DIFF
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Virtualized Left Table Rows */}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const line = getLine(virtualRow.index);
                  if (!line) {
                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/50 bg-neutral-950 text-neutral-600"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start + 30}px)`,
                        }}
                      >
                        <div className="sticky left-0 z-10 w-10 bg-neutral-900/60 text-neutral-600 text-right pr-2 shrink-0 border-r border-neutral-800/80 text-[11px] leading-6 select-none">
                          {virtualRow.index + 1}
                        </div>
                        <div className="flex-1 flex items-center px-3">
                          <span className="inline-block w-32 h-2.5 bg-neutral-900 rounded-xs animate-pulse opacity-40" />
                        </div>
                      </div>
                    );
                  }

                  const leftCells = line.left_text !== null ? splitCsvCells(line.left_text, delimiter) : null;
                  const rightCells = line.right_text !== null ? splitCsvCells(line.right_text, delimiter) : null;

                  const isActiveChunk =
                    line.chunk_id !== null &&
                    diffResult?.chunks[activeChunkIndex]?.chunk_id === line.chunk_id;

                  const isModified = line.line_type === 'Modified';
                  const isDeleted = line.line_type === 'Deleted';

                  // Only highlight row as Modified if there is a difference in a COMMON column!
                  const hasCommonDiffCell =
                    isModified &&
                    leftCells !== null &&
                    rightCells !== null &&
                    columns.some((col) => {
                      if (col.status !== 'common') return false;
                      const lv = leftCells[col.leftIndex] ?? '';
                      const rv = rightCells[col.rightIndex] ?? '';
                      return !areCellsEqual(lv, rv, options);
                    });
                  const showModifiedBg = isModified && hasCommonDiffCell;

                  return (
                    <div
                      key={virtualRow.index}
                      className={`absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/50 ${
                        isActiveChunk ? 'ring-1 ring-emerald-500/60 z-10 shadow-xs' : ''
                      } ${
                        isDeleted
                          ? 'bg-rose-500/15 border-l-2 border-rose-500'
                          : showModifiedBg
                          ? 'bg-amber-500/15 border-l-2 border-amber-500'
                          : leftCells === null
                          ? 'bg-neutral-900/60'
                          : 'hover:bg-neutral-900/40'
                      }`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start + 30}px)`,
                      }}
                    >
                      {/* Sticky Left Row Number */}
                      <div className="sticky left-0 z-10 w-10 bg-neutral-900/90 text-neutral-500 text-right pr-2 shrink-0 border-r border-neutral-800/80 text-[11px] leading-6 select-none shadow-[1px_0_0_#27272a]">
                        {line.left_line_num ?? ''}
                      </div>

                      {/* Left Cells */}
                      <div className="flex-1 flex">
                        {leftCells !== null ? (
                          columns.map((col, cIdx) => {
                            if (col.status === 'added' || col.leftIndex === -1) {
                              return (
                                <div
                                  key={cIdx}
                                  data-testid="csv-cell"
                                  style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                  className="px-2 py-1 truncate border-r border-neutral-800/40 leading-5 select-none bg-neutral-900/40 text-neutral-600 italic text-[11px] text-center"
                                  title="Column not present in Left file"
                                >
                                  —
                                </div>
                              );
                            }

                            const cellVal = leftCells[col.leftIndex] ?? '';
                            const rightVal =
                              rightCells !== null && col.rightIndex >= 0
                                ? rightCells[col.rightIndex] ?? ''
                                : null;

                            const isDiffCell =
                              col.status === 'common' &&
                              isModified &&
                              rightVal !== null &&
                              !areCellsEqual(cellVal, rightVal, options);

                            const isEditing =
                              editingCell?.side === 'left' &&
                              editingCell?.rowIndex === virtualRow.index &&
                              editingCell?.colIndex === cIdx;

                            if (isEditing) {
                              return (
                                <div
                                  key={cIdx}
                                  style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                  className="p-0 border-r border-neutral-800/40 relative h-full flex items-center"
                                >
                                  <input
                                    data-testid="csv-cell-input"
                                    type="text"
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) =>
                                      handleInputKeyDown(e, 'left', virtualRow.index, cIdx)
                                    }
                                    onBlur={() =>
                                      commitEdit('left', virtualRow.index, cIdx, editValue)
                                    }
                                    onFocus={(e) => e.target.select()}
                                    className="w-full h-full px-1.5 py-0 bg-neutral-900 text-neutral-100 font-mono text-[12px] border border-emerald-400 focus:outline-none shadow-xs z-20"
                                  />
                                </div>
                              );
                            }

                            const isSelected =
                              selectedCell?.side === 'left' &&
                              selectedCell?.rowIndex === virtualRow.index &&
                              selectedCell?.colIndex === cIdx;

                            const isColDeleted = col.status === 'deleted';

                            return (
                              <div
                                key={cIdx}
                                data-testid="csv-cell"
                                title={`${cellVal} (Double-click to edit)`}
                                onClick={() => {
                                  setSelectedCell({ side: 'left', rowIndex: virtualRow.index, colIndex: cIdx });
                                }}
                                onDoubleClick={() =>
                                  startEditing('left', virtualRow.index, cIdx, cellVal)
                                }
                                style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                className={`px-2 py-1 truncate border-r border-neutral-800/40 leading-5 cursor-pointer select-none transition-shadow ${
                                  isSelected
                                    ? isDiffCell
                                      ? 'bg-amber-500/40 text-amber-50 ring-2 ring-emerald-400 font-bold z-20 shadow-md'
                                      : 'bg-emerald-500/25 text-white ring-2 ring-emerald-400 font-semibold z-20 shadow-md'
                                    : isDiffCell
                                    ? 'bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/70 font-semibold shadow-xs hover:bg-amber-500/40'
                                    : isColDeleted || isDeleted
                                    ? 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                                    : 'text-neutral-300 hover:bg-neutral-800/50'
                                }`}
                              >
                                {isDiffCell && cellVal === '' ? (
                                  <span className="italic text-neutral-500 text-[10px] bg-neutral-900/90 px-1.5 py-0.5 rounded border border-dashed border-amber-500/50 select-none">
                                    (empty)
                                  </span>
                                ) : (
                                  cellVal
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex-1 px-3 py-1 text-neutral-700 italic select-none">
                            -
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* === MIDDLE GUTTER (MERGE & STATUS) === */}
            <div
              ref={gutterContainerRef}
              className="w-10 bg-neutral-900/90 border-r border-neutral-800 shrink-0 overflow-hidden select-none"
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize() + 30}px`,
                  position: 'relative',
                }}
              >
                {/* Header spacer */}
                <div className="sticky top-0 z-20 h-[30px] bg-neutral-900 text-center py-1.5 border-b border-neutral-800 text-neutral-500 font-semibold text-[11px]">
                  ±
                </div>

                {/* Virtualized Gutter Items */}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const line = getLine(virtualRow.index);
                  if (!line) {
                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute top-0 left-0 w-10 flex items-center justify-center border-b border-neutral-900/50 text-neutral-700 text-[10px]"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start + 30}px)`,
                        }}
                      />
                    );
                  }

                  const prevLine = virtualRow.index > 0 ? getLine(virtualRow.index - 1) : null;
                  const isChunkStart =
                    line.chunk_id !== null &&
                    (virtualRow.index === 0 || (prevLine !== null && prevLine !== undefined && prevLine.chunk_id !== line.chunk_id));

                  const isModified = line.line_type === 'Modified';
                  const isDeleted = line.line_type === 'Deleted';
                  const isAdded = line.line_type === 'Added';

                  return (
                    <div
                      key={virtualRow.index}
                      className="absolute top-0 left-0 w-10 flex items-center justify-center border-b border-neutral-900/50"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start + 30}px)`,
                      }}
                    >
                      {isChunkStart && line.chunk_id !== null ? (
                        <div className="flex items-center space-x-0.5">
                          <button
                            onClick={() => mergeChunkAction(line.chunk_id!, 'left_to_right')}
                            title="Merge chunk to Right (->)"
                            className="p-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => mergeChunkAction(line.chunk_id!, 'right_to_left')}
                            title="Merge chunk to Left (<-)"
                            className="p-0.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-neutral-950 transition-colors"
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] font-mono select-none">
                          {isModified ? (
                            <span className="text-amber-400 font-bold">~</span>
                          ) : isAdded ? (
                            <span className="text-emerald-400 font-bold">+</span>
                          ) : isDeleted ? (
                            <span className="text-rose-400 font-bold">-</span>
                          ) : (
                            <span className="text-neutral-600">=</span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* === RIGHT TABLE CONTAINER (SCROLLABLE X, Y LOCKED TO MASTER) === */}
            <div
              ref={rightContainerRef}
              data-testid="csv-right-container"
              onScroll={handleRightHorizontalScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-none"
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize() + 30}px`,
                  minWidth: '100%',
                  width: `${tableMinWidth}px`,
                  position: 'relative',
                }}
              >
                {/* Sticky Header Row */}
                <div
                  className="sticky top-0 z-20 flex bg-neutral-900 border-b border-neutral-800 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 shadow-sm"
                  style={{ width: `${tableMinWidth}px`, height: '30px' }}
                >
                  <div className="sticky left-0 z-30 w-10 px-2 py-1.5 text-right shrink-0 bg-neutral-950 text-neutral-500 border-r border-neutral-800 shadow-[1px_0_0_#27272a]">
                    #
                  </div>
                  <div className="flex-1 flex">
                    {columns.map((col, idx) => {
                      const hasDiff = changedColIndices.includes(idx);
                      const isAddedCol = col.status === 'added';
                      const isDeletedCol = col.status === 'deleted';

                      return (
                        <div
                          key={idx}
                          onClick={() => (hasDiff || isAddedCol || isDeletedCol) && scrollToColumn(idx)}
                          style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                          className={`px-2 py-1.5 truncate border-r border-neutral-800/60 transition-colors flex items-center justify-between ${
                            isAddedCol
                              ? 'bg-emerald-500/15 text-emerald-200 font-bold border-b-2 border-b-emerald-500 cursor-pointer hover:bg-emerald-500/25'
                              : isDeletedCol
                              ? 'bg-rose-500/15 text-rose-200 font-bold border-b-2 border-b-rose-500 cursor-pointer hover:bg-rose-500/25'
                              : hasDiff
                              ? 'bg-amber-500/15 text-amber-200 font-bold border-b-2 border-b-amber-500 cursor-pointer hover:bg-amber-500/25'
                              : 'text-neutral-400'
                          }`}
                          title={
                            isAddedCol
                              ? `${col.name} (Added in Right - Click to snap)`
                              : isDeletedCol
                              ? `${col.name} (Deleted in Right - Click to snap)`
                              : hasDiff
                              ? `${col.name} (Contains differences - Click to snap)`
                              : col.name
                          }
                        >
                          <span className="truncate">{col.name}</span>
                          {isAddedCol ? (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-emerald-500/30 text-emerald-300 rounded font-mono font-bold shrink-0">
                              +COL
                            </span>
                          ) : isDeletedCol ? (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-rose-500/30 text-rose-300 rounded font-mono font-bold shrink-0">
                              -COL
                            </span>
                          ) : hasDiff ? (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-amber-500/30 text-amber-300 rounded font-mono font-bold shrink-0">
                              DIFF
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Virtualized Right Table Rows */}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const line = getLine(virtualRow.index);
                  if (!line) {
                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/50 bg-neutral-950 text-neutral-600"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start + 30}px)`,
                        }}
                      >
                        <div className="sticky left-0 z-10 w-10 bg-neutral-900/60 text-neutral-600 text-right pr-2 shrink-0 border-r border-neutral-800/80 text-[11px] leading-6 select-none">
                          {virtualRow.index + 1}
                        </div>
                        <div className="flex-1 flex items-center px-3">
                          <span className="inline-block w-32 h-2.5 bg-neutral-900 rounded-xs animate-pulse opacity-40" />
                        </div>
                      </div>
                    );
                  }

                  const leftCells = line.left_text !== null ? splitCsvCells(line.left_text, delimiter) : null;
                  const rightCells = line.right_text !== null ? splitCsvCells(line.right_text, delimiter) : null;

                  const isActiveChunk =
                    line.chunk_id !== null &&
                    diffResult?.chunks[activeChunkIndex]?.chunk_id === line.chunk_id;

                  const isModified = line.line_type === 'Modified';
                  const isAdded = line.line_type === 'Added';

                  // Only highlight row as Modified if there is a difference in a COMMON column!
                  const hasCommonDiffCell =
                    isModified &&
                    leftCells !== null &&
                    rightCells !== null &&
                    columns.some((col) => {
                      if (col.status !== 'common') return false;
                      const lv = leftCells[col.leftIndex] ?? '';
                      const rv = rightCells[col.rightIndex] ?? '';
                      return !areCellsEqual(lv, rv, options);
                    });
                  const showModifiedBg = isModified && hasCommonDiffCell;

                  return (
                    <div
                      key={virtualRow.index}
                      className={`absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/50 ${
                        isActiveChunk ? 'ring-1 ring-emerald-500/60 z-10 shadow-xs' : ''
                      } ${
                        isAdded
                          ? 'bg-emerald-500/15 border-l-2 border-emerald-500'
                          : showModifiedBg
                          ? 'bg-amber-500/15 border-l-2 border-amber-500'
                          : rightCells === null
                          ? 'bg-neutral-900/60'
                          : 'hover:bg-neutral-900/40'
                      }`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start + 30}px)`,
                      }}
                    >
                      {/* Sticky Right Row Number */}
                      <div className="sticky left-0 z-10 w-10 bg-neutral-900/90 text-neutral-500 text-right pr-2 shrink-0 border-r border-neutral-800/80 text-[11px] leading-6 select-none shadow-[1px_0_0_#27272a]">
                        {line.right_line_num ?? ''}
                      </div>

                      {/* Right Cells */}
                      <div className="flex-1 flex">
                        {rightCells !== null ? (
                          columns.map((col, cIdx) => {
                            if (col.status === 'deleted' || col.rightIndex === -1) {
                              return (
                                <div
                                  key={cIdx}
                                  data-testid="csv-cell"
                                  style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                  className="px-2 py-1 truncate border-r border-neutral-800/40 leading-5 select-none bg-neutral-900/40 text-neutral-600 italic text-[11px] text-center"
                                  title="Column not present in Right file"
                                >
                                  —
                                </div>
                              );
                            }

                            const cellVal = rightCells[col.rightIndex] ?? '';
                            const leftVal =
                              leftCells !== null && col.leftIndex >= 0
                                ? leftCells[col.leftIndex] ?? ''
                                : null;

                            const isDiffCell =
                              col.status === 'common' &&
                              isModified &&
                              leftVal !== null &&
                              !areCellsEqual(leftVal, cellVal, options);

                            const isEditing =
                              editingCell?.side === 'right' &&
                              editingCell?.rowIndex === virtualRow.index &&
                              editingCell?.colIndex === cIdx;

                            if (isEditing) {
                              return (
                                <div
                                  key={cIdx}
                                  style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                  className="p-0 border-r border-neutral-800/40 relative h-full flex items-center"
                                >
                                  <input
                                    data-testid="csv-cell-input"
                                    type="text"
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) =>
                                      handleInputKeyDown(e, 'right', virtualRow.index, cIdx)
                                    }
                                    onBlur={() =>
                                      commitEdit('right', virtualRow.index, cIdx, editValue)
                                    }
                                    onFocus={(e) => e.target.select()}
                                    className="w-full h-full px-1.5 py-0 bg-neutral-900 text-neutral-100 font-mono text-[12px] border border-emerald-400 focus:outline-none shadow-xs z-20"
                                  />
                                </div>
                              );
                            }

                            const isSelected =
                              selectedCell?.side === 'right' &&
                              selectedCell?.rowIndex === virtualRow.index &&
                              selectedCell?.colIndex === cIdx;

                            const isColAdded = col.status === 'added';

                            return (
                              <div
                                key={cIdx}
                                data-testid="csv-cell"
                                title={`${cellVal} (Double-click to edit)`}
                                onClick={() => {
                                  setSelectedCell({ side: 'right', rowIndex: virtualRow.index, colIndex: cIdx });
                                }}
                                onDoubleClick={() =>
                                  startEditing('right', virtualRow.index, cIdx, cellVal)
                                }
                                style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                className={`px-2 py-1 truncate border-r border-neutral-800/40 leading-5 cursor-pointer select-none transition-shadow ${
                                  isSelected
                                    ? isDiffCell
                                      ? 'bg-amber-500/40 text-amber-50 ring-2 ring-emerald-400 font-bold z-20 shadow-md'
                                      : 'bg-emerald-500/25 text-white ring-2 ring-emerald-400 font-semibold z-20 shadow-md'
                                    : isDiffCell
                                    ? 'bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/70 font-semibold shadow-xs hover:bg-amber-500/40'
                                    : isColAdded || isAdded
                                    ? 'bg-emerald-500/15 text-emerald-300 font-medium hover:bg-emerald-500/25'
                                    : 'text-neutral-300 hover:bg-neutral-800/50'
                                }`}
                              >
                                {isDiffCell && cellVal === '' ? (
                                  <span className="italic text-neutral-500 text-[10px] bg-neutral-900/90 px-1.5 py-0.5 rounded border border-dashed border-amber-500/50 select-none">
                                    (empty)
                                  </span>
                                ) : (
                                  cellVal
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex-1 px-3 py-1 text-neutral-700 italic select-none">
                            -
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Unified Vertical Master Scrollbar */}
        <MasterVerticalScrollbar
          scrollTop={scrollTop}
          totalHeight={rowVirtualizer.getTotalSize() + 30}
          viewportHeight={viewportHeight}
          onScrollChange={applyScrollTop}
        />
      </div>
    </div>
  );
};
