import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { DiffLine, InlineSpan } from '../../types/diff';
import { MasterVerticalScrollbar } from './MasterVerticalScrollbar';
import { useDiffSessionLines } from '../../hooks/useDiffSessionLines';

function getTargetLineNum(
  getLine: (idx: number) => DiffLine | undefined,
  virtualIndex: number,
  side: 'left' | 'right'
): { isInsert: boolean; lineNum: number } {
  const line = getLine(virtualIndex);
  if (!line) return { isInsert: false, lineNum: virtualIndex + 1 };
  const existingNum = side === 'left' ? line.left_line_num : line.right_line_num;
  if (existingNum !== null && existingNum !== undefined) {
    return { isInsert: false, lineNum: existingNum };
  }

  // Find nearest preceding line with a valid line number for this side
  for (let i = virtualIndex - 1; i >= Math.max(0, virtualIndex - 30); i--) {
    const prev = getLine(i);
    const prevNum = side === 'left' ? prev?.left_line_num : prev?.right_line_num;
    if (prevNum !== null && prevNum !== undefined) {
      return { isInsert: true, lineNum: prevNum + 1 };
    }
  }

  return { isInsert: true, lineNum: 1 };
}

export const SplitDiffViewer: React.FC = () => {
  const { getActiveTab, mergeChunkAction, updateLineContent } = useTabStore();
  const activeTab = getActiveTab();
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  const parentContainerRef = useRef<HTMLDivElement>(null);
  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const gutterContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [editingLine, setEditingLine] = useState<{
    side: 'left' | 'right';
    lineNum: number;
    virtualIndex: number;
    isInsert: boolean;
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  const { totalLines, getLine, requestRange } = useDiffSessionLines(diffResult);

  const rowVirtualizer = useVirtualizer({
    count: totalLines,
    getScrollElement: () => rightContainerRef.current,
    estimateSize: () => 20, // 20px line height per DESIGN.md
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

  // Track parent viewport height with ResizeObserver
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

  // Synchronized scroll applicator with zero ping-pong
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
  const [maxContentWidth, setMaxContentWidth] = useState<number | undefined>(undefined);

  // Sync scroll width between left and right panes
  useEffect(() => {
    const updateWidth = () => {
      const leftW = leftContainerRef.current?.scrollWidth || 0;
      const rightW = rightContainerRef.current?.scrollWidth || 0;
      const maxW = Math.max(leftW, rightW);
      if (maxW > 0) {
        setMaxContentWidth(maxW);
      }
    };
    updateWidth();
    const timer = setTimeout(updateWidth, 50);
    return () => clearTimeout(timer);
  }, [totalLines, diffResult]);

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

  // Listen to wheel events on outer container to smoothly update shared scrollTop
  useEffect(() => {
    const el = parentContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 0) {
        const totalSize = rowVirtualizer.getTotalSize();
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

  // Scroll to active chunk when activeChunkIndex changes
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (activeChunk) {
        const targetLine = Math.max(0, (activeChunk.left_start || activeChunk.right_start) - 1);
        const targetOffset = Math.max(0, targetLine * 20 - 100);
        applyScrollTop(targetOffset);
      }
    }
  }, [activeChunkIndex, diffResult, applyScrollTop]);

  useEffect(() => {
    if (editingLine && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingLine]);

  const handleStartEdit = (side: 'left' | 'right', virtualIndex: number) => {
    const line = getLine(virtualIndex);
    if (!line) return;

    const target = getTargetLineNum(getLine, virtualIndex, side);
    const initialText =
      target.isInsert
        ? ''
        : (side === 'left' ? line.left_text : line.right_text) ?? '';

    setEditingLine({
      side,
      lineNum: target.lineNum,
      virtualIndex,
      isInsert: target.isInsert,
    });
    setEditValue(initialText);
  };

  const handleSaveEdit = async () => {
    if (!editingLine) return;
    const { side, lineNum, isInsert } = editingLine;
    const val = editValue;
    setEditingLine(null);

    if (isInsert && val.trim() === '') {
      return;
    }

    await updateLineContent(side, lineNum, val, isInsert);
  };

  const handleTabAdvance = async (forward: boolean) => {
    if (!editingLine) return;
    const currentSide = editingLine.side;
    const currentIdx = editingLine.virtualIndex;
    const val = editValue;
    const isInsert = editingLine.isInsert;
    const lineNum = editingLine.lineNum;

    setEditingLine(null);
    if (!isInsert || val.trim() !== '') {
      await updateLineContent(currentSide, lineNum, val, isInsert);
    }

    const step = forward ? 1 : -1;
    let nextIdx = currentIdx + step;
    while (nextIdx >= 0 && nextIdx < totalLines) {
      const nextLine = getLine(nextIdx);
      const hasText =
        currentSide === 'left' ? nextLine?.left_text !== null : nextLine?.right_text !== null;
      if (hasText) {
        handleStartEdit(currentSide, nextIdx);
        return;
      }
      nextIdx += step;
    }
  };

  const renderInlineText = (text: string | null, spans: InlineSpan[], isDelete: boolean) => {
    if (text === null) return null;
    if (!spans || spans.length === 0) return <span>{text}</span>;

    const chars = Array.from(text);
    return (
      <>
        {spans.map((span, idx) => {
          const slice = chars.slice(span.start, span.end).join('');
          if (span.highlight) {
            return (
              <span
                key={idx}
                className={
                  isDelete
                    ? 'bg-rose-500/35 text-rose-200 rounded-xs'
                    : 'bg-emerald-500/35 text-emerald-200 rounded-xs'
                }
              >
                {slice}
              </span>
            );
          }
          return <span key={idx}>{slice}</span>;
        })}
      </>
    );
  };

  const getLineClass = (type: string, isActiveChunk: boolean) => {
    let base = 'hover:bg-neutral-900/40 text-neutral-300';
    if (type === 'Added') {
      base = 'bg-emerald-500/15 text-emerald-100 border-l-2 border-emerald-500';
    } else if (type === 'Deleted') {
      base = 'bg-rose-500/15 text-rose-100 border-l-2 border-rose-500';
    } else if (type === 'Modified') {
      base = 'bg-amber-500/15 text-amber-100 border-l-2 border-amber-500';
    } else if (type === 'Empty') {
      base = 'bg-neutral-900/40 opacity-30 select-none';
    }

    if (isActiveChunk) {
      base += ' ring-1 ring-emerald-500/40';
    }
    return base;
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none relative font-mono text-[13px] overflow-hidden">
      {diffResult?.is_identical && totalLines > 0 && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-1 flex items-center justify-center space-x-2 text-emerald-400 text-xs shrink-0 font-sans">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Files are identical — no differences found.</span>
        </div>
      )}

      {activeTab?.diffError && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-950 text-neutral-200 select-none">
          <div className="max-w-md w-full rounded-xl border border-rose-500/30 bg-[#121215] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Unable to Compare Files</h3>
                <p className="text-xs text-neutral-400">
                  AeroDiff encountered an issue processing these files.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-neutral-800 bg-[#09090b] p-3 text-xs font-mono text-rose-300 break-words max-h-32 overflow-y-auto">
              {activeTab.diffError}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => useTabStore.getState().updateActiveTab({ type: 'welcome' })}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                Return to Welcome
              </button>
              <button
                type="button"
                onClick={() => useTabStore.getState().recomputeActiveDiff()}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pane Titles Header */}
      <div className="bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400 border-b border-neutral-800 flex justify-between select-none shrink-0 font-sans">
        <div className="flex-1 flex items-center justify-between pr-4">
          <span className="truncate font-medium text-neutral-300">
            {activeTab?.leftPath ? activeTab.leftPath.split(/[/\\]/).pop() : 'Original (Left)'}
          </span>
          <span className="text-neutral-500 text-[10px]">
            {activeTab?.leftEncoding ? `[${activeTab.leftEncoding}]` : ''}
          </span>
        </div>
        <div className="w-10 border-r border-neutral-800 shrink-0" />
        <div className="flex-1 flex items-center justify-between pl-4">
          <span className="truncate font-medium text-neutral-300">
            {activeTab?.rightPath ? activeTab.rightPath.split(/[/\\]/).pop() : 'Modified (Right)'}
          </span>
          <span className="text-neutral-500 text-[10px]">
            {activeTab?.rightEncoding ? `[${activeTab.rightEncoding}]` : ''}
          </span>
        </div>
        {/* Placeholder spacer matching MasterVerticalScrollbar */}
        <div className="w-3.5 shrink-0" />
      </div>

      {/* Main Diff Area */}
      <div ref={parentContainerRef} className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex overflow-hidden">
          {/* === LEFT PANE CONTAINER (SCROLLABLE X, Y LOCKED TO MASTER) === */}
          <div
            ref={leftContainerRef}
            onScroll={handleLeftHorizontalScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden border-r border-neutral-800"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                minWidth: maxContentWidth ? `${maxContentWidth}px` : '100%',
                width: 'max-content',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const line = getLine(virtualRow.index);

                if (!line) {
                  return (
                    <div
                      key={virtualRow.index}
                      className="absolute top-0 left-0 min-w-full w-max flex items-stretch border-b border-neutral-900/40 bg-neutral-950 text-neutral-600"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="sticky left-0 z-10 w-12 bg-neutral-900/60 text-neutral-600 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                        {virtualRow.index + 1}
                      </div>
                      <div className="flex-1 px-2 whitespace-pre leading-5 min-w-0 flex items-center">
                        <span className="inline-block w-28 h-2.5 bg-neutral-900 rounded-xs animate-pulse opacity-40" />
                      </div>
                    </div>
                  );
                }

                const isActiveChunk =
                  line.chunk_id !== null &&
                  diffResult?.chunks[activeChunkIndex]?.chunk_id === line.chunk_id;

                const lineType =
                  line.left_text !== null
                    ? line.line_type === 'Modified'
                      ? 'Modified'
                      : line.line_type
                    : 'Empty';

                return (
                  <div
                    key={virtualRow.index}
                    className={`absolute top-0 left-0 min-w-full w-max flex items-stretch border-b border-neutral-900/40 ${getLineClass(
                      lineType,
                      isActiveChunk
                    )}`}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {/* Sticky Left Line Number */}
                    <div className="sticky left-0 z-10 w-12 bg-neutral-900 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5 shadow-[1px_0_0_#27272a]">
                      {line.left_line_num ?? ''}
                    </div>

                    {/* Left Content (Full text, no truncation, horizontal scrollable) */}
                    <div className="flex-1 px-2 whitespace-pre leading-5 min-w-0">
                      {editingLine?.side === 'left' &&
                      editingLine.virtualIndex === virtualRow.index ? (
                        <input
                          ref={inputRef}
                          data-testid="text-line-input"
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveEdit();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingLine(null);
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              handleTabAdvance(!e.shiftKey);
                            }
                          }}
                          onBlur={handleSaveEdit}
                          autoFocus
                          className="w-full h-5 leading-5 bg-neutral-900 text-white font-mono text-[13px] px-1 border border-emerald-500 rounded-xs outline-none shadow-xs"
                        />
                      ) : (
                        <div
                          onDoubleClick={() => handleStartEdit('left', virtualRow.index)}
                          className="cursor-text select-text w-full group flex items-center"
                          title="Double-click to edit line"
                        >
                          {line.left_text !== null ? (
                            renderInlineText(line.left_text, line.left_inline, true)
                          ) : (
                            <span className="opacity-0 group-hover:opacity-40 italic text-[11px] select-none text-neutral-400 transition-opacity">
                              + double-click to insert
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* === MIDDLE GUTTER (MERGE ACTIONS) === */}
          <div
            ref={gutterContainerRef}
            className="w-10 bg-neutral-900/80 border-r border-neutral-800 shrink-0 select-none overflow-hidden"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const line = getLine(virtualRow.index);
                if (!line) {
                  return (
                    <div
                      key={virtualRow.index}
                      className="absolute top-0 left-0 w-10 flex items-center justify-center border-b border-neutral-900/40 text-neutral-700 text-[10px]"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    />
                  );
                }

                const prevLine = virtualRow.index > 0 ? getLine(virtualRow.index - 1) : null;
                const isChunkStart =
                  line.chunk_id !== null &&
                  (virtualRow.index === 0 || prevLine?.chunk_id !== line.chunk_id);

                return (
                  <div
                    key={virtualRow.index}
                    className="absolute top-0 left-0 w-10 flex items-center justify-center border-b border-neutral-900/40"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {isChunkStart && line.chunk_id !== null && (
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
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* === RIGHT PANE CONTAINER (SCROLLABLE X, Y LOCKED TO MASTER) === */}
          <div
            ref={rightContainerRef}
            onScroll={handleRightHorizontalScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                minWidth: maxContentWidth ? `${maxContentWidth}px` : '100%',
                width: 'max-content',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const line = getLine(virtualRow.index);

                if (!line) {
                  return (
                    <div
                      key={virtualRow.index}
                      className="absolute top-0 left-0 min-w-full w-max flex items-stretch border-b border-neutral-900/40 bg-neutral-950 text-neutral-600"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="sticky left-0 z-10 w-12 bg-neutral-900/60 text-neutral-600 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                        {virtualRow.index + 1}
                      </div>
                      <div className="flex-1 px-2 whitespace-pre leading-5 min-w-0 flex items-center">
                        <span className="inline-block w-28 h-2.5 bg-neutral-900 rounded-xs animate-pulse opacity-40" />
                      </div>
                    </div>
                  );
                }

                const isActiveChunk =
                  line.chunk_id !== null &&
                  diffResult?.chunks[activeChunkIndex]?.chunk_id === line.chunk_id;

                const lineType =
                  line.right_text !== null
                    ? line.line_type === 'Modified'
                      ? 'Modified'
                      : line.line_type
                    : 'Empty';

                return (
                  <div
                    key={virtualRow.index}
                    className={`absolute top-0 left-0 min-w-full w-max flex items-stretch border-b border-neutral-900/40 ${getLineClass(
                      lineType,
                      isActiveChunk
                    )}`}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {/* Sticky Right Line Number */}
                    <div className="sticky left-0 z-10 w-12 bg-neutral-900 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5 shadow-[1px_0_0_#27272a]">
                      {line.right_line_num ?? ''}
                    </div>

                    {/* Right Content (Full text, no truncation, horizontal scrollable) */}
                    <div className="flex-1 px-2 whitespace-pre leading-5 min-w-0">
                      {editingLine?.side === 'right' &&
                      editingLine.virtualIndex === virtualRow.index ? (
                        <input
                          ref={inputRef}
                          data-testid="text-line-input"
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveEdit();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingLine(null);
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              handleTabAdvance(!e.shiftKey);
                            }
                          }}
                          onBlur={handleSaveEdit}
                          autoFocus
                          className="w-full h-5 leading-5 bg-neutral-900 text-white font-mono text-[13px] px-1 border border-emerald-500 rounded-xs outline-none shadow-xs"
                        />
                      ) : (
                        <div
                          onDoubleClick={() => handleStartEdit('right', virtualRow.index)}
                          className="cursor-text select-text w-full group flex items-center"
                          title="Double-click to edit line"
                        >
                          {line.right_text !== null ? (
                            renderInlineText(line.right_text, line.right_inline, false)
                          ) : (
                            <span className="opacity-0 group-hover:opacity-40 italic text-[11px] select-none text-neutral-400 transition-opacity">
                              + double-click to insert
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Unified Vertical Master Scrollbar (Zero layout shift, 1:1 hardware scroll) */}
        <MasterVerticalScrollbar
          scrollTop={scrollTop}
          totalHeight={rowVirtualizer.getTotalSize()}
          viewportHeight={viewportHeight}
          onScrollChange={applyScrollTop}
        />
      </div>
    </div>
  );
};
