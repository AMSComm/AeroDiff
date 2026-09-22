import React from 'react';
import { useDiffStore } from '../../stores/diffStore';

export const DiffMinimap: React.FC = () => {
  const { diffResult, activeChunkIndex, jumpToChunk } = useDiffStore();

  const lines = diffResult?.lines || [];
  const chunks = diffResult?.chunks || [];

  if (lines.length === 0 || chunks.length === 0) {
    return <div className="w-3 bg-neutral-950 border-l border-neutral-900 shrink-0" />;
  }

  const totalLines = lines.length;

  return (
    <div className="w-3.5 bg-neutral-950 border-l border-neutral-900 shrink-0 relative select-none">
      {chunks.map((chunk, idx) => {
        // Calculate vertical position percentage
        const lineIdx = lines.findIndex((l) => l.chunk_id === chunk.chunk_id);
        if (lineIdx === -1) return null;

        const topPercent = (lineIdx / totalLines) * 100;
        const heightPercent = Math.max(1, ((chunk.left_count + chunk.right_count) / totalLines) * 100);

        let bg = 'bg-amber-400';
        if (chunk.chunk_type === 'Addition') bg = 'bg-emerald-400';
        if (chunk.chunk_type === 'Deletion') bg = 'bg-rose-400';

        const isActive = idx === activeChunkIndex;

        return (
          <div
            key={chunk.chunk_id}
            onClick={() => jumpToChunk(idx)}
            title={`Diff #${idx + 1} (${chunk.chunk_type}) - Click to jump`}
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
