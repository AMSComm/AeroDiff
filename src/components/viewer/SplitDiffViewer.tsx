import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { DiffLine, InlineSpan } from '../../types/diff';

export const SplitDiffViewer: React.FC = () => {
  const { getActiveTab, mergeChunkAction } = useTabStore();
  const activeTab = getActiveTab();
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const gutterContainerRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  const lines = diffResult?.lines || [];

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => leftContainerRef.current,
    estimateSize: () => 20, // 20px line height per DESIGN.md
    overscan: 25,
  });

  // Scroll to active chunk when activeChunkIndex changes
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (activeChunk) {
        const lineIdx = lines.findIndex((l) => l.chunk_id === activeChunk.chunk_id);
        if (lineIdx !== -1) {
          rowVirtualizer.scrollToIndex(lineIdx, { align: 'center', behavior: 'smooth' });
        }
      }
    }
  }, [activeChunkIndex, diffResult]);

  // Dual Synchronized Scroll Handlers (Vertical + Horizontal)
  const handleLeftScroll = () => {
    if (isSyncingScroll.current) return;
    const left = leftContainerRef.current;
    if (!left) return;

    isSyncingScroll.current = true;
    if (rightContainerRef.current) {
      rightContainerRef.current.scrollTop = left.scrollTop;
      rightContainerRef.current.scrollLeft = left.scrollLeft;
    }
    if (gutterContainerRef.current) {
      gutterContainerRef.current.scrollTop = left.scrollTop;
    }
    isSyncingScroll.current = false;
  };

  const handleRightScroll = () => {
    if (isSyncingScroll.current) return;
    const right = rightContainerRef.current;
    if (!right) return;

    isSyncingScroll.current = true;
    if (leftContainerRef.current) {
      leftContainerRef.current.scrollTop = right.scrollTop;
      leftContainerRef.current.scrollLeft = right.scrollLeft;
    }
    if (gutterContainerRef.current) {
      gutterContainerRef.current.scrollTop = right.scrollTop;
    }
    isSyncingScroll.current = false;
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

  const getLineClass = (type: DiffLine['line_type'], isActive: boolean) => {
    let base = 'flex items-center text-xs font-mono select-text leading-5 ';
    if (isActive) {
      base += 'ring-1 ring-emerald-500/40 ';
    }
    switch (type) {
      case 'Added':
        return base + 'bg-emerald-500/15 text-emerald-100 border-l-2 border-emerald-500';
      case 'Deleted':
        return base + 'bg-rose-500/15 text-rose-100 border-l-2 border-rose-500';
      case 'Modified':
        return base + 'bg-amber-500/15 text-amber-100 border-l-2 border-amber-500';
      case 'Empty':
        return base + 'bg-neutral-900/60 text-transparent select-none';
      default:
        return base + 'text-neutral-300 hover:bg-neutral-900/40';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none relative font-mono text-[13px] overflow-hidden">
      {diffResult?.is_identical && lines.length > 0 && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-3 py-1 flex items-center justify-center space-x-2 text-emerald-400 text-xs shrink-0 font-sans">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Files are identical — no differences found.</span>
        </div>
      )}

      {lines.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs font-sans">
          <span>{diffResult ? 'Both files are empty.' : 'Loading diff...'}</span>
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* === LEFT PANE CONTAINER (SCROLLABLE X + Y) === */}
          <div
            ref={leftContainerRef}
            onScroll={handleLeftScroll}
            className="flex-1 overflow-auto border-r border-neutral-800"
          >
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

                const lineType = line.left_text !== null
                  ? line.line_type === 'Modified' ? 'Modified' : line.line_type
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
                    <div className="px-2 whitespace-pre select-text leading-5">
                      {line.left_text !== null ? (
                        renderInlineText(line.left_text, line.left_inline, true)
                      ) : (
                        <span className="opacity-0 select-none">-</span>
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
                const line = lines[virtualRow.index];
                if (!line) return null;

                const isChunkStart =
                  line.chunk_id !== null &&
                  (virtualRow.index === 0 || lines[virtualRow.index - 1].chunk_id !== line.chunk_id);

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

          {/* === RIGHT PANE CONTAINER (SCROLLABLE X + Y) === */}
          <div
            ref={rightContainerRef}
            onScroll={handleRightScroll}
            className="flex-1 overflow-auto"
          >
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

                const lineType = line.right_text !== null
                  ? line.line_type === 'Modified' ? 'Modified' : line.line_type
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
                    <div className="px-2 whitespace-pre select-text leading-5">
                      {line.right_text !== null ? (
                        renderInlineText(line.right_text, line.right_inline, false)
                      ) : (
                        <span className="opacity-0 select-none">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
