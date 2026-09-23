import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { DiffLine, InlineSpan } from '../../types/diff';

export const SplitDiffViewer: React.FC = () => {
  const { getActiveTab, mergeChunkAction } = useTabStore();
  const activeTab = getActiveTab();
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = diffResult?.lines || [];

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 20, // 20px line height per DESIGN.md
    overscan: 25,
  });

  // Scroll to active chunk when activeChunkIndex changes
  useEffect(() => {
    if (diffResult && diffResult.chunks.length > 0) {
      const activeChunk = diffResult.chunks[activeChunkIndex];
      if (activeChunk) {
        // Find line index where chunk starts
        const lineIdx = lines.findIndex((l) => l.chunk_id === activeChunk.chunk_id);
        if (lineIdx !== -1) {
          rowVirtualizer.scrollToIndex(lineIdx, { align: 'center', behavior: 'smooth' });
        }
      }
    }
  }, [activeChunkIndex, diffResult]);

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
    let base = 'flex items-center text-xs font-mono px-2 select-text leading-5 truncate ';
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
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-neutral-950 select-none relative font-mono text-[13px]"
      style={{ height: '100%' }}
    >
      <div
        className="w-full relative"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const line = lines[virtualRow.index];
          if (!line) return null;

          const isChunkStart =
            line.chunk_id !== null &&
            (virtualRow.index === 0 || lines[virtualRow.index - 1].chunk_id !== line.chunk_id);

          const isActiveChunk =
            line.chunk_id !== null &&
            diffResult?.chunks[activeChunkIndex]?.chunk_id === line.chunk_id;

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/40"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* === LEFT PANE === */}
              {/* Left Line Number */}
              <div className="w-12 bg-neutral-900 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                {line.left_line_num ?? ''}
              </div>

              {/* Left Content */}
              <div
                className={`flex-1 ${getLineClass(
                  line.left_text !== null
                    ? line.line_type === 'Modified'
                      ? 'Modified'
                      : line.line_type
                    : 'Empty',
                  isActiveChunk
                )}`}
              >
                {line.left_text !== null ? (
                  renderInlineText(line.left_text, line.left_inline, true)
                ) : (
                  <span className="opacity-0">-</span>
                )}
              </div>

              {/* === MIDDLE GUTTER (MERGE ACTIONS) === */}
              <div className="w-10 bg-neutral-900/80 border-x border-neutral-800 shrink-0 flex items-center justify-center">
                {isChunkStart && line.chunk_id !== null && (
                  <div className="flex items-center space-x-0.5">
                    {/* Merge Left to Right */}
                    <button
                      onClick={() => mergeChunkAction(line.chunk_id!, 'left_to_right')}
                      title="Merge chunk to Right (->)"
                      className="p-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>

                    {/* Merge Right to Left */}
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

              {/* === RIGHT PANE === */}
              {/* Right Content */}
              <div
                className={`flex-1 ${getLineClass(
                  line.right_text !== null
                    ? line.line_type === 'Modified'
                      ? 'Modified'
                      : line.line_type
                    : 'Empty',
                  isActiveChunk
                )}`}
              >
                {line.right_text !== null ? (
                  renderInlineText(line.right_text, line.right_inline, false)
                ) : (
                  <span className="opacity-0">-</span>
                )}
              </div>

              {/* Right Line Number */}
              <div className="w-12 bg-neutral-900 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-l border-neutral-800 leading-5">
                {line.right_line_num ?? ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
