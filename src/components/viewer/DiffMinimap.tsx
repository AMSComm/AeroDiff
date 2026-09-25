import React, { useMemo } from 'react';
import { useTabStore } from '../../stores/tabStore';

export const DiffMinimap: React.FC = () => {
  const { getActiveTab, updateActiveTab } = useTabStore();
  const activeTab = getActiveTab();
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  const jumpToChunk = (index: number) => {
    updateActiveTab({ activeChunkIndex: index });
  };

  const lines = diffResult?.lines;
  const chunks = diffResult?.chunks;

  // O(N) map of chunk_id to first line index, avoiding O(N*M) lookups on large files
  const chunkLineMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!lines) return map;
    for (let i = 0; i < lines.length; i++) {
      const cid = lines[i]?.chunk_id;
      if (cid !== null && cid !== undefined && !map.has(cid)) {
        map.set(cid, i);
      }
    }
    return map;
  }, [lines]);

  // Cap DOM nodes to max 500 to keep UI responsive and prevent WebKit memory exhaustion
  const visibleMarkers = useMemo(() => {
    if (!chunks || chunks.length === 0) return [];
    if (chunks.length <= 500) {
      return chunks.map((c, i) => ({ chunk: c, originalIndex: i }));
    }
    const stride = Math.ceil(chunks.length / 500);
    const sampled: { chunk: typeof chunks[0]; originalIndex: number }[] = [];
    for (let i = 0; i < chunks.length; i += stride) {
      sampled.push({ chunk: chunks[i], originalIndex: i });
    }
    if (activeChunkIndex >= 0 && activeChunkIndex < chunks.length) {
      if (!sampled.some((s) => s.originalIndex === activeChunkIndex)) {
        sampled.push({ chunk: chunks[activeChunkIndex], originalIndex: activeChunkIndex });
      }
    }
    return sampled;
  }, [chunks, activeChunkIndex]);

  if (!lines || !chunks || lines.length === 0 || chunks.length === 0) {
    return <div className="w-3 bg-neutral-950 border-l border-neutral-900 shrink-0" />;
  }

  const totalLines = lines.length;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const targetLine = Math.floor(clickRatio * totalLines);

    let closestChunkIdx = 0;
    let minDistance = Infinity;

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const lineIdx = chunkLineMap.get(chunk.chunk_id);
      if (lineIdx !== undefined) {
        const dist = Math.abs(lineIdx - targetLine);
        if (dist < minDistance) {
          minDistance = dist;
          closestChunkIdx = idx;
        }
      }
    }

    jumpToChunk(closestChunkIdx);
  };

  return (
    <div
      onClick={handleTrackClick}
      title="Click to jump to diff"
      className="w-3.5 bg-neutral-950 border-l border-neutral-900 shrink-0 relative select-none cursor-pointer"
    >
      {visibleMarkers.map(({ chunk, originalIndex }) => {
        const lineIdx = chunkLineMap.get(chunk.chunk_id);
        if (lineIdx === undefined) return null;

        const topPercent = (lineIdx / totalLines) * 100;
        const heightPercent = Math.max(1, ((chunk.left_count + chunk.right_count) / totalLines) * 100);

        let bg = 'bg-amber-400';
        if (chunk.chunk_type === 'Addition') bg = 'bg-emerald-400';
        if (chunk.chunk_type === 'Deletion') bg = 'bg-rose-400';

        const isActive = originalIndex === activeChunkIndex;

        return (
          <div
            key={chunk.chunk_id}
            onClick={(e) => {
              e.stopPropagation();
              jumpToChunk(originalIndex);
            }}
            title={`Diff #${originalIndex + 1} (${chunk.chunk_type}) - Click to jump`}
            className={`absolute left-0.5 right-0.5 rounded-xs cursor-pointer transition-all hover:brightness-125 ${bg} ${
              isActive ? 'ring-1 ring-white z-10' : 'opacity-80'
            }`}
            style={{
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              minHeight: '4px',
            }}
          />
        );
      })}
    </div>
  );
};
