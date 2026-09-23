import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTabStore } from '../../stores/tabStore';
import { DiffLine, InlineSpan } from '../../types/diff';

export const UnifiedDiffViewer: React.FC = () => {
  const { getActiveTab } = useTabStore();
  const activeTab = getActiveTab();
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = diffResult?.lines || [];

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 20,
    overscan: 25,
  });

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

          return (
            <div
              key={virtualRow.index}
              className={`absolute top-0 left-0 w-full flex items-stretch border-b border-neutral-900/40 ${rowBg}`}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* Left Line Num */}
              <div className="w-12 bg-neutral-900 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                {line.left_line_num ?? ''}
              </div>

              {/* Right Line Num */}
              <div className="w-12 bg-neutral-900 text-neutral-500 text-right pr-2 select-none text-[11px] shrink-0 border-r border-neutral-800 leading-5">
                {line.right_line_num ?? ''}
              </div>

              {/* Prefix Symbol */}
              <div className="w-6 text-center select-none shrink-0 font-bold opacity-60 leading-5">
                {symbol}
              </div>

              {/* Text */}
              <div className="flex-1 px-2 select-text leading-5 truncate">
                {renderInlineText(displayedText, spans, isDeleted)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
