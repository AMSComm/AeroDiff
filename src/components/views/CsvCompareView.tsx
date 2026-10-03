import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
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

export const CsvCompareView: React.FC = () => {
  const activeTab = useTabStore(
    (state) => state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
  );
  const { mergeChunkAction, setLeftContent, setRightContent } = useTabStore();

  const parentContainerRef = useRef<HTMLDivElement>(null);
  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const gutterContainerRef = useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
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

  // Derive column headers and count from the first line
  const { maxCols, columnHeaders } = useMemo(() => {
    const headerLine = getLine(0) || diffResult?.lines?.[0];
    const leftH = headerLine?.left_text ? splitCsvCells(headerLine.left_text, delimiter) : [];
    const rightH = headerLine?.right_text ? splitCsvCells(headerLine.right_text, delimiter) : [];
    const max = Math.max(1, leftH.length, rightH.length);
    const headers: string[] = [];
    for (let c = 0; c < max; c++) {
      headers.push(leftH[c] || rightH[c] || `Col ${c + 1}`);
    }
    return { maxCols: max, columnHeaders: headers };
  }, [diffResult, delimiter, getLine]);

  const colWidth = 140;

  // Auto-detect columns with differences across loaded lines for quick navigation
  const changedColIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const [_, line] of lineMap.entries()) {
      if (line.line_type === 'Modified' && line.left_text && line.right_text) {
        const leftCells = splitCsvCells(line.left_text, delimiter);
        const rightCells = splitCsvCells(line.right_text, delimiter);
        for (let c = 0; c < maxCols; c++) {
          const lv = leftCells[c] ?? '';
          const rv = rightCells[c] ?? '';
          if (!areCellsEqual(lv, rv, options)) {
            indices.add(c);
          }
        }
      }
      if (indices.size >= 12) break;
    }
    return Array.from(indices).sort((a, b) => a - b);
  }, [lineMap, delimiter, maxCols, options]);

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

  const isSyncingHorizontal = useRef(false);

  const scrollToColumn = useCallback(
    (colIdx: number) => {
      const targetScrollLeft = Math.max(0, colIdx * colWidth - 80);
      isSyncingHorizontal.current = true;
      if (leftContainerRef.current) leftContainerRef.current.scrollLeft = targetScrollLeft;
      if (rightContainerRef.current) rightContainerRef.current.scrollLeft = targetScrollLeft;
      requestAnimationFrame(() => {
        isSyncingHorizontal.current = false;
      });
    },
    [colWidth]
  );

  const handleLeftHorizontalScroll = useCallback(() => {
    if (isSyncingHorizontal.current) return;
    const left = leftContainerRef.current;
    const right = rightContainerRef.current;
    if (!left || !right) return;

    if (Math.abs(right.scrollLeft - left.scrollLeft) > 1) {
      isSyncingHorizontal.current = true;
      right.scrollLeft = left.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingHorizontal.current = false;
      });
    }
  }, []);

  const handleRightHorizontalScroll = useCallback(() => {
    if (isSyncingHorizontal.current) return;
    const left = leftContainerRef.current;
    const right = rightContainerRef.current;
    if (!left || !right) return;

    if (Math.abs(left.scrollLeft - right.scrollLeft) > 1) {
      isSyncingHorizontal.current = true;
      left.scrollLeft = right.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingHorizontal.current = false;
      });
    }
  }, []);

  // Non-passive wheel handler on parent container locking all panes synchronously
  useEffect(() => {
    const el = parentContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 0) {
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
          isSyncingHorizontal.current = true;
          if (leftContainerRef.current) leftContainerRef.current.scrollLeft = targetScrollLeft;
          if (rightContainerRef.current) rightContainerRef.current.scrollLeft = targetScrollLeft;
          requestAnimationFrame(() => {
            isSyncingHorizontal.current = false;
          });
        }
      }
    },
    [colWidth, viewportHeight]
  );

  const prevChunkIndexRef = useRef<number | null>(null);

  // Jump to active chunk when navigation buttons clicked & auto-scroll horizontal to changed column
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      if (prevChunkIndexRef.current === activeChunkIndex) return;
      prevChunkIndexRef.current = activeChunkIndex;

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
          const leftCells = line.left_text !== null ? splitCsvCells(line.left_text, delimiter) : null;
          const rightCells = line.right_text !== null ? splitCsvCells(line.right_text, delimiter) : null;
          if (leftCells && rightCells) {
            for (let c = 0; c < maxCols; c++) {
              const lv = leftCells[c] ?? '';
              const rv = rightCells[c] ?? '';
              if (!areCellsEqual(lv, rv, options)) {
                scrollToColumn(c);
                break;
              }
            }
          }
        }
      }
    }
  }, [
    activeChunkIndex,
    diffResult,
    applyScrollTop,
    requestRange,
    getLine,
    delimiter,
    maxCols,
    options,
    scrollToColumn,
  ]);

  // When lineMap receives the activeChunk line, snap horizontally to changed column
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (!activeChunk) return;
      const lineIdx = Math.max(0, (activeChunk.left_start || activeChunk.right_start) - 1);
      const line = getLine(lineIdx);
      if (line) {
        const leftCells = line.left_text !== null ? splitCsvCells(line.left_text, delimiter) : null;
        const rightCells = line.right_text !== null ? splitCsvCells(line.right_text, delimiter) : null;
        if (leftCells && rightCells) {
          for (let c = 0; c < maxCols; c++) {
            const lv = leftCells[c] ?? '';
            const rv = rightCells[c] ?? '';
            if (!areCellsEqual(lv, rv, options)) {
              scrollToColumn(c);
              break;
            }
          }
        }
      }
    }
  }, [activeChunkIndex, lineMap, getLine, delimiter, maxCols, options, scrollToColumn, diffResult]);

  // Cell edit trigger
  const startEditing = useCallback(
    (side: 'left' | 'right', rowIndex: number, colIndex: number, defaultVal?: string) => {
      const line = getLine(rowIndex);
      if (!line) return;
      const text = side === 'left' ? line.left_text : line.right_text;
      if (text === null) return;
      const cells = splitCsvCells(text, delimiter);
      const currentVal = defaultVal !== undefined ? defaultVal : cells[colIndex] ?? '';
      setEditingCell({ side, rowIndex, colIndex });
      setEditValue(currentVal);
    },
    [getLine, delimiter]
  );

  // Cell edit commit
  const commitEdit = useCallback(
    (side: 'left' | 'right', rowIndex: number, colIndex: number, valToSave: string) => {
      if (isCommittingRef.current) return;
      isCommittingRef.current = true;

      try {
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
        while (cells.length <= colIndex) {
          cells.push('');
        }

        if (cells[colIndex] === valToSave) return;

        cells[colIndex] = valToSave;

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
    [delimiter, getLine, setLeftContent, setRightContent]
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
        const line = getLine(selectedCell.rowIndex);
        const text = selectedCell.side === 'left' ? line?.left_text : line?.right_text;
        const cells = text ? splitCsvCells(text, delimiter) : [];
        const val = cells[selectedCell.colIndex] ?? '';
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

      {/* Changed Columns Quick Jump Bar */}
      {changedColIndices.length > 0 && (
        <div className="bg-neutral-900/90 border-b border-neutral-800 px-3 py-1 flex items-center space-x-2 text-[11px] shrink-0 overflow-x-auto">
          <span className="text-amber-400 font-semibold whitespace-nowrap flex items-center space-x-1">
            <span>⚠️ Changed Columns ({changedColIndices.length}):</span>
          </span>
          <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
            {changedColIndices.map((colIdx) => (
              <button
                key={colIdx}
                onClick={() => scrollToColumn(colIdx)}
                className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 hover:border-amber-400 transition-colors flex items-center space-x-1 font-mono text-[11px] whitespace-nowrap cursor-pointer shadow-xs"
                title={`Jump horizontally to ${columnHeaders[colIdx] || `Col ${colIdx + 1}`}`}
              >
                <span className="font-semibold">{columnHeaders[colIdx] || `Col ${colIdx + 1}`}</span>
                <span className="text-[9px] text-amber-400/80">(Col {colIdx + 1})</span>
              </button>
            ))}
          </div>
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
              className="flex-1 overflow-x-auto overflow-y-hidden border-r border-neutral-800"
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
                    {columnHeaders.map((h, idx) => {
                      const hasDiff = changedColIndices.includes(idx);
                      return (
                        <div
                          key={idx}
                          onClick={() => hasDiff && scrollToColumn(idx)}
                          style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                          className={`px-2 py-1.5 truncate border-r border-neutral-800/60 transition-colors flex items-center justify-between ${
                            hasDiff
                              ? 'bg-amber-500/15 text-amber-200 font-bold border-b-2 border-b-amber-500 cursor-pointer hover:bg-amber-500/25'
                              : 'text-neutral-400'
                          }`}
                          title={hasDiff ? `${h} (Contains differences - Click to snap horizontally)` : h}
                        >
                          <span className="truncate">{h}</span>
                          {hasDiff && (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-amber-500/30 text-amber-300 rounded font-mono font-bold shrink-0">
                              DIFF
                            </span>
                          )}
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

                  const hasAnyDiffCell =
                    isModified &&
                    leftCells !== null &&
                    rightCells !== null &&
                    Array.from({ length: maxCols }).some((_, cIdx) => {
                      const lv = leftCells[cIdx] ?? '';
                      const rv = rightCells?.[cIdx] ?? '';
                      return !areCellsEqual(lv, rv, options);
                    });
                  const showModifiedBg = isModified && hasAnyDiffCell;

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
                          Array.from({ length: maxCols }).map((_, cIdx) => {
                            const cellVal = leftCells[cIdx] ?? '';
                            const rightVal = rightCells?.[cIdx] ?? '';
                            const isDiffCell = isModified && !areCellsEqual(cellVal, rightVal, options);
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
                                    : isDeleted
                                    ? 'text-rose-200 hover:bg-neutral-800/50'
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
              className="flex-1 overflow-x-auto overflow-y-hidden"
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
                    {columnHeaders.map((h, idx) => {
                      const hasDiff = changedColIndices.includes(idx);
                      return (
                        <div
                          key={idx}
                          onClick={() => hasDiff && scrollToColumn(idx)}
                          style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                          className={`px-2 py-1.5 truncate border-r border-neutral-800/60 transition-colors flex items-center justify-between ${
                            hasDiff
                              ? 'bg-amber-500/15 text-amber-200 font-bold border-b-2 border-b-amber-500 cursor-pointer hover:bg-amber-500/25'
                              : 'text-neutral-400'
                          }`}
                          title={hasDiff ? `${h} (Contains differences - Click to snap horizontally)` : h}
                        >
                          <span className="truncate">{h}</span>
                          {hasDiff && (
                            <span className="ml-1 text-[9px] px-1 py-0.2 bg-amber-500/30 text-amber-300 rounded font-mono font-bold shrink-0">
                              DIFF
                            </span>
                          )}
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

                  const hasAnyDiffCell =
                    isModified &&
                    leftCells !== null &&
                    rightCells !== null &&
                    Array.from({ length: maxCols }).some((_, cIdx) => {
                      const lv = leftCells[cIdx] ?? '';
                      const rv = rightCells?.[cIdx] ?? '';
                      return !areCellsEqual(lv, rv, options);
                    });
                  const showModifiedBg = isModified && hasAnyDiffCell;

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
                          Array.from({ length: maxCols }).map((_, cIdx) => {
                            const cellVal = rightCells[cIdx] ?? '';
                            const leftVal = leftCells?.[cIdx] ?? '';
                            const isDiffCell = isModified && !areCellsEqual(leftVal, cellVal, options);
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
                                    : isAdded
                                    ? 'text-emerald-200 hover:bg-neutral-800/50'
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
