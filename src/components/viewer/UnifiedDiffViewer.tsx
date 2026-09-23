import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2 } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { DiffLine, InlineSpan } from '../../types/diff';
import { MasterVerticalScrollbar } from './MasterVerticalScrollbar';

export const UnifiedDiffViewer: React.FC = () => {
  const { getActiveTab, updateLineContent } = useTabStore();
  const activeTab = getActiveTab();
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  const parentContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [editingLine, setEditingLine] = useState<{
    side: 'left' | 'right';
    lineNum: number;
    virtualIndex: number;
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  const lines = diffResult?.lines || [];

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 20,
    overscan: 25,
  });

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
  }, [lines.length]);

  const applyScrollTop = useCallback((newTop: number) => {
    setScrollTop(newTop);
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop !== newTop) {
      scrollContainerRef.current.scrollTop = newTop;
    }
  }, []);

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
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = next;
            return next;
          });
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [rowVirtualizer]);

  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (activeChunk) {
        const lineIdx = lines.findIndex((l) => l.chunk_id === activeChunk.chunk_id);
        if (lineIdx !== -1) {
          const targetOffset = Math.max(0, lineIdx * 20 - 100);
          applyScrollTop(targetOffset);
        }
      }
    }
  }, [activeChunkIndex, diffResult, applyScrollTop, lines]);

  useEffect(() => {
    if (editingLine && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingLine]);

  const handleStartEdit = (virtualIndex: number) => {
    const line = lines[virtualIndex];
    if (!line) return;

    const side = line.line_type === 'Deleted' ? 'left' : 'right';
    const lineNum = side === 'left' ? line.left_line_num : line.right_line_num;
    if (lineNum === null || lineNum === undefined) return;

    const initialText = (side === 'left' ? line.left_text : line.right_text) ?? '';
    setEditingLine({ side, lineNum, virtualIndex });
    setEditValue(initialText);
  };

  const handleSaveEdit = async () => {
    if (!editingLine) return;
    const { side, lineNum } = editingLine;
    const val = editValue;
    setEditingLine(null);
    await updateLineContent(side, lineNum, val, false);
  };

  const handleTabAdvance = async (forward: boolean) => {
    if (!editingLine) return;
    const currentIdx = editingLine.virtualIndex;
    const { side, lineNum } = editingLine;
    const val = editValue;

    setEditingLine(null);
    await updateLineContent(side, lineNum, val, false);

    const step = forward ? 1 : -1;
    let nextIdx = currentIdx + step;
    while (nextIdx >= 0 && nextIdx < lines.length) {
      handleStartEdit(nextIdx);
      if (editingLine) return;
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

  return (
    <div
      ref={parentContainerRef}
      className="flex-1 flex bg-neutral-950 select-none relative font-mono text-[13px] overflow-hidden"
    >
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
      >
        {diffResult?.is_identical && lines.length > 0 && (
          <div className="sticky top-0 z-20 bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-1 flex items-center justify-center space-x-2 text-emerald-400 text-xs font-sans">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Files are identical — no differences found.</span>
          </div>
        )}

        {lines.length === 0 && (
          <div className="h-full flex items-center justify-center text-neutral-500 text-xs font-sans">
            <span>{diffResult ? 'Both files are empty.' : 'Loading diff...'}</span>
          </div>
        )}

        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            minWidth: '100%',
            width: 'max-content',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = lines[virtualRow.index];
            if (!line) return null;

            const isActiveChunk =
              line.chunk_id !== null &&
              diffResult?.chunks[activeChunkIndex]?.chunk_id === line.chunk_id;

            const isAdded = line.line_type === 'Added';
            const isDeleted = line.line_type === 'Deleted';
            const isModified = line.line_type === 'Modified';

            let rowBg = 'hover:bg-neutral-900/40 text-neutral-300';
            let symbol = ' ';
            let displayedText = line.left_text ?? line.right_text ?? '';
            let spans = line.left_inline.length > 0 ? line.left_inline : line.right_inline;

            if (isAdded) {
              rowBg = 'bg-emerald-500/15 text-emerald-100 border-l-2 border-emerald-500';
              symbol = '+';
              displayedText = line.right_text ?? '';
              spans = line.right_inline;
            } else if (isDeleted) {
              rowBg = 'bg-rose-500/15 text-rose-100 border-l-2 border-rose-500';
              symbol = '-';
              displayedText = line.left_text ?? '';
              spans = line.left_inline;
            } else if (isModified) {
              rowBg = 'bg-amber-500/15 text-amber-100 border-l-2 border-amber-500';
              symbol = '~';
            }

            if (isActiveChunk) {
              rowBg += ' ring-1 ring-emerald-500/40';
            }

            const isEditingThis = editingLine?.virtualIndex === virtualRow.index;

            return (
              <div
                key={virtualRow.index}
                className={`absolute top-0 left-0 min-w-full w-max flex items-stretch border-b border-neutral-900/40 ${rowBg}`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Sticky Line Numbers & Prefix Symbol */}
                <div className="sticky left-0 z-10 flex shrink-0 bg-neutral-900 border-r border-neutral-800 shadow-[1px_0_0_#27272a]">
                  {/* Left Line Num */}
                  <div className="w-12 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                    {line.left_line_num ?? ''}
                  </div>

                  {/* Right Line Num */}
                  <div className="w-12 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                    {line.right_line_num ?? ''}
                  </div>

                  {/* Prefix Symbol */}
                  <div className="w-6 text-center select-none shrink-0 font-bold opacity-70 leading-5">
                    {symbol}
                  </div>
                </div>

                {/* Text: Un-truncated, horizontal scrollable with whitespace-pre or inline input */}
                <div className="flex-1 px-3 whitespace-pre leading-5 min-w-0">
                  {isEditingThis ? (
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
                      onDoubleClick={() => handleStartEdit(virtualRow.index)}
                      className="cursor-text select-text w-full"
                      title="Double-click to edit line"
                    >
                      {renderInlineText(displayedText, spans, isDeleted)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <MasterVerticalScrollbar
        scrollTop={scrollTop}
        totalHeight={rowVirtualizer.getTotalSize()}
        viewportHeight={viewportHeight}
        onScrollChange={applyScrollTop}
      />
    </div>
  );
};
