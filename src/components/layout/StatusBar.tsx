import React from 'react';
import { useDiffStore } from '../../stores/diffStore';
import { Zap, Clock, Terminal } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { isComputing, computeTimeMs, diffResult, activeChunkIndex } = useDiffStore();

  const totalLeft = diffResult?.total_left_lines ?? 0;
  const totalRight = diffResult?.total_right_lines ?? 0;
  const totalChunks = diffResult?.chunks.length ?? 0;

  return (
    <footer className="h-6 bg-neutral-900 border-t border-neutral-800 px-3 flex items-center justify-between text-[11px] text-neutral-400 select-none shrink-0 font-mono">
      {/* Left items: Engine & Timing */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1">
          <Zap className={`w-3 h-3 ${isComputing ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`} />
          <span>{isComputing ? 'Computing Diff...' : 'Rust Engine: Ready'}</span>
        </div>

        <div className="h-3 w-px bg-neutral-800" />

        <div className="flex items-center space-x-1">
          <Clock className="w-3 h-3 text-neutral-500" />
          <span>{computeTimeMs}ms</span>
        </div>

        <div className="h-3 w-px bg-neutral-800" />

        <span>
          L: {totalLeft} lines | R: {totalRight} lines
        </span>
      </div>

      {/* Center: Key shortcuts reminder */}
      <div className="hidden md:flex items-center space-x-2 text-[10px] text-neutral-500">
        <Terminal className="w-2.5 h-2.5" />
        <span>F7: Next Diff</span>
        <span>•</span>
        <span>Shift+F7: Prev Diff</span>
        <span>•</span>
        <span>Cmd/Ctrl+Z: Undo Merge</span>
      </div>

      {/* Right items: Chunks & Encoding */}
      <div className="flex items-center space-x-3">
        {totalChunks > 0 && (
          <span>
            Chunk {activeChunkIndex + 1} of {totalChunks}
          </span>
        )}
        <div className="h-3 w-px bg-neutral-800" />
        <span>UTF-8</span>
        <div className="h-3 w-px bg-neutral-800" />
        <span>LF</span>
      </div>
    </footer>
  );
};
