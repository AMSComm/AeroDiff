import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { DiffLine, DiffOptions } from '../../types/diff';
import { MasterVerticalScrollbar } from '../viewer/MasterVerticalScrollbar';

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

  // Quoted CSV cell parser
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

  const diffResult = activeTab?.diffResult;
  const options = activeTab?.options;
  const lines: DiffLine[] = useMemo(() => diffResult?.lines || [], [diffResult]);
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  // Detect delimiter from first non-empty line
  const delimiter = useMemo(() => {
    for (const l of lines) {
      const text = l.left_text || l.right_text || '';
      if (text.includes('\t')) return '\t';
      if (text.includes(';')) return ';';
      if (text.includes(',')) return ',';
    }
    return ',';
  }, [lines]);

  // Pre-parse cells and compute max column count
  const { parsedRows, maxCols, columnHeaders } = useMemo(() => {
    let max = 1;
    const parsed = lines.map((l) => {
      const leftCells = l.left_text !== null ? splitCsvCells(l.left_text, delimiter) : null;
      const rightCells = l.right_text !== null ? splitCsvCells(l.right_text, delimiter) : null;

      if (leftCells && leftCells.length > max) max = leftCells.length;
      if (rightCells && rightCells.length > max) max = rightCells.length;

      return {
        line: l,
        leftCells,
        rightCells,
      };
    });

    // Detect column headers from first line if available
    const firstLeft = parsed[0]?.leftCells;
    const firstRight = parsed[0]?.rightCells;
    const headers: string[] = [];
    for (let c = 0; c < max; c++) {
      headers.push(firstLeft?.[c] || firstRight?.[c] || `Col ${c + 1}`);
    }

    return { parsedRows: parsed, maxCols: max, columnHeaders: headers };
  }, [lines, delimiter]);

  // Virtualizer for 60fps performance on large tables
  const rowVirtualizer = useVirtualizer({
    count: parsedRows.length,
    getScrollElement: () => rightContainerRef.current,
    estimateSize: () => 26, // 26px row height for tables
    overscan: 25,
  });

  // Track parent viewport height
  useEffect(() => {
    const el = parentContainerRef.current;
    if (!el) return;

    setViewportHeight(el.clientHeight);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [parsedRows.length]);

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
        const maxScroll = Math.max(0, totalSize - el.clientHeight);
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
      } else if (Math.abs(e.deltaX) > 0) {
        const target = e.target as HTMLElement | null;
        if (target && gutterContainerRef.current?.contains(target)) {
          if (leftContainerRef.current && rightContainerRef.current) {
            leftContainerRef.current.scrollLeft += e.deltaX;
            rightContainerRef.current.scrollLeft += e.deltaX;
          }
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [rowVirtualizer]);

  // Cell edit start
  const startEditing = useCallback(
    (side: 'left' | 'right', rowIndex: number, colIndex: number, defaultVal?: string) => {
      const rowData = parsedRows[rowIndex];
      if (!rowData) return;
      const cells = side === 'left' ? rowData.leftCells : rowData.rightCells;
      if (cells === null) return; // Cannot edit non-existent row on this side
      const currentVal = defaultVal !== undefined ? defaultVal : cells[colIndex] ?? '';
      setEditingCell({ side, rowIndex, colIndex });
      setEditValue(currentVal);
    },
    [parsedRows]
  );

  // Cell edit commit
  const commitEdit = useCallback(
    (side: 'left' | 'right', rowIndex: number, colIndex: number, valToSave: string) => {
      const rowData = parsedRows[rowIndex];
      if (!rowData) {
        setEditingCell(null);
        return;
      }
      const lineNum = side === 'left' ? rowData.line.left_line_num : rowData.line.right_line_num;
      if (!lineNum) {
        setEditingCell(null);
        return;
      }

      const rawContent = side === 'left' ? activeTab?.leftContent || '' : activeTab?.rightContent || '';
      const fileLines = rawContent.split('\n');
      const lineIdx = lineNum - 1;
      if (lineIdx < 0 || lineIdx >= fileLines.length) {
        setEditingCell(null);
        return;
      }

      const origLine = fileLines[lineIdx];
      const cells = splitCsvCells(origLine, delimiter);
      while (cells.length <= colIndex) {
        cells.push('');
      }

      if (cells[colIndex] === valToSave) {
        setEditingCell(null);
        return;
      }

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

      setEditingCell(null);
    },
    [activeTab, delimiter, parsedRows, setLeftContent, setRightContent]
  );

  // Key navigation inside cell editor (Enter, Tab, Esc)
  const handleInputKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      side: 'left' | 'right',
      rowIndex: number,
      colIndex: number
    ) => {
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
          } else if (rowIndex + 1 < parsedRows.length) {
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
    [commitEdit, editValue, maxCols, parsedRows.length, startEditing]
  );

  const isIdentical = diffResult?.is_identical;
  const colWidth = 140;
  const tableMinWidth = Math.max(40 + maxCols * colWidth, 400);

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Identical Notification Banner if applicable */}
      {isIdentical && parsedRows.length > 0 && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-1 flex items-center justify-center space-x-2 text-emerald-400 text-xs shrink-0 font-sans">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Both CSV tables are identical.</span>
        </div>
      )}

      {/* Main Dual Table Split View */}
      <div className="flex-1 flex overflow-hidden bg-neutral-950 select-none relative font-mono text-[12px]">
        {/* Empty state */}
        {parsedRows.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs font-sans">
            <span>{diffResult ? 'Both files are empty.' : 'Loading table diff...'}</span>
          </div>
        )}

        {parsedRows.length > 0 && (
          <div ref={parentContainerRef} className="flex-1 flex overflow-hidden relative">
            {/* === LEFT TABLE CONTAINER (SCROLLABLE X, Y LOCKED TO MASTER) === */}
            <div
              ref={leftContainerRef}
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
                    {columnHeaders.map((h, idx) => (
                      <div
                        key={idx}
                        style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                        className="px-2 py-1.5 truncate border-r border-neutral-800/60"
                        title={h}
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Virtualized Left Table Rows */}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const rowData = parsedRows[virtualRow.index];
                  if (!rowData) return null;

                  const { line, leftCells, rightCells } = rowData;
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
                        isActiveChunk ? 'ring-1 ring-emerald-500/40 z-10' : ''
                      } ${
                        isDeleted
                          ? 'bg-rose-500/10'
                          : showModifiedBg
                          ? 'bg-amber-500/5'
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

                            return (
                              <div
                                key={cIdx}
                                title={`${cellVal} (Double-click to edit)`}
                                onDoubleClick={() =>
                                  startEditing('left', virtualRow.index, cIdx, cellVal)
                                }
                                style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                className={`px-2 py-1 truncate border-r border-neutral-800/40 leading-5 cursor-text hover:bg-neutral-800/50 ${
                                  isDiffCell
                                    ? 'bg-amber-500/25 text-amber-200 border-l border-r border-amber-500/40 font-semibold'
                                    : isDeleted
                                    ? 'text-rose-200'
                                    : 'text-neutral-300'
                                }`}
                              >
                                {cellVal}
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
                  const rowData = parsedRows[virtualRow.index];
                  if (!rowData) return null;
                  const { line } = rowData;

                  const isChunkStart =
                    line.chunk_id !== null &&
                    (virtualRow.index === 0 ||
                      parsedRows[virtualRow.index - 1].line.chunk_id !== line.chunk_id);

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
                    {columnHeaders.map((h, idx) => (
                      <div
                        key={idx}
                        style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                        className="px-2 py-1.5 truncate border-r border-neutral-800/60"
                        title={h}
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Virtualized Right Table Rows */}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const rowData = parsedRows[virtualRow.index];
                  if (!rowData) return null;

                  const { line, leftCells, rightCells } = rowData;
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
                      const lv = leftCells?.[cIdx] ?? '';
                      const rv = rightCells[cIdx] ?? '';
                      return !areCellsEqual(lv, rv, options);
                    });
                  const showModifiedBg = isModified && hasAnyDiffCell;

                  return (
                    <div
                      key={virtualRow.index}
                      className={`absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/50 ${
                        isActiveChunk ? 'ring-1 ring-emerald-500/40 z-10' : ''
                      } ${
                        isAdded
                          ? 'bg-emerald-500/10'
                          : showModifiedBg
                          ? 'bg-amber-500/5'
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
                            const isDiffCell = isModified && !areCellsEqual(cellVal, leftVal, options);
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

                            return (
                              <div
                                key={cIdx}
                                title={`${cellVal} (Double-click to edit)`}
                                onDoubleClick={() =>
                                  startEditing('right', virtualRow.index, cIdx, cellVal)
                                }
                                style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                                className={`px-2 py-1 truncate border-r border-neutral-800/40 leading-5 cursor-text hover:bg-neutral-800/50 ${
                                  isDiffCell
                                    ? 'bg-amber-500/25 text-amber-200 border-l border-r border-amber-500/40 font-semibold'
                                    : isAdded
                                    ? 'text-emerald-200'
                                    : 'text-neutral-300'
                                }`}
                              >
                                {cellVal}
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

            {/* === MASTER VERTICAL SCROLLBAR (12PX, ALWAYS VISIBLE, HIGH CONTRAST) === */}
            <MasterVerticalScrollbar
              scrollTop={scrollTop}
              totalHeight={rowVirtualizer.getTotalSize() + 30}
              viewportHeight={viewportHeight}
              onScrollChange={applyScrollTop}
            />
          </div>
        )}
      </div>
    </div>
  );
};
