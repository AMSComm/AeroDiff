import React from 'react';
import { useTabStore } from '../../stores/tabStore';
import { Zap, Clock, Terminal } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { getActiveTab } = useTabStore();
  const activeTab = getActiveTab();

  const isComputing = activeTab?.isComputing ?? false;
  const computeTimeMs = activeTab?.computeTimeMs ?? 0;
  const diffResult = activeTab?.diffResult;
  const activeChunkIndex = activeTab?.activeChunkIndex ?? 0;

  const totalLeft = diffResult?.total_left_lines ?? 0;
  const totalRight = diffResult?.total_right_lines ?? 0;
  const totalChunks = diffResult?.chunks.length ?? 0;

  return (
    <footer className="h-6 bg-neutral-900 border-t border-neutral-800 px-3 flex items-center justify-between text-[11px] text-neutral-400 select-none shrink-0 font-mono">
      {/* Left items: Engine & Timing */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1">
          <Zap className={`w-3 h-3 ${isComputing ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`} />
          <span>{isComputing ? 'Computing...' : 'Rust Engine: Ready'}</span>
        </div>

        <div className="h-3 w-px bg-neutral-800" />

        <div className="flex items-center space-x-1">
          <Clock className="w-3 h-3 text-neutral-500" />
          <span>{computeTimeMs}ms</span>
        </div>

        {(activeTab?.type === 'file' || activeTab?.type === 'csv') && (
          <>
            <div className="h-3 w-px bg-neutral-800" />
            <span>
              Left: {totalLeft} lines | Right: {totalRight} lines
            </span>
          </>
        )}

        {/* Diff summary stats (modified, added, deleted, identical) */}
        {diffResult && (
          <>
            <div className="h-3 w-px bg-neutral-800" />
            <div className="flex items-center space-x-2 text-[10px]">
              {diffResult.modified_chunks > 0 && (
                <span className="text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  ~{diffResult.modified_chunks} modified
                </span>
              )}
              {diffResult.added_chunks > 0 && (
                <span className="text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                  +{diffResult.added_chunks} added
                </span>
              )}
              {diffResult.deleted_chunks > 0 && (
                <span className="text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                  -{diffResult.deleted_chunks} deleted
                </span>
              )}
              {diffResult.is_identical && (
                <span className="text-emerald-400 font-medium">Identical</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Center: Key shortcuts reminder */}
      <div className="hidden lg:flex items-center space-x-2 text-[10px] text-neutral-500">
        <Terminal className="w-2.5 h-2.5" />
        <span>F7: Next Diff</span>
        <span>•</span>
        <span>Shift+F7: Prev Diff</span>
        <span>•</span>
        <span>Cmd+T: New Tab</span>
        <span>•</span>
        <span>Cmd+W: Close Tab</span>
        <span>•</span>
        <span>Cmd+S: Save</span>
      </div>

      {/* Right items: Chunks & Encoding */}
      <div className="flex items-center space-x-3">
        {totalChunks > 0 && (
          <span>
            Chunk {activeChunkIndex + 1}/{totalChunks}
          </span>
        )}
        <div className="h-3 w-px bg-neutral-800" />
        <span>
          {activeTab?.leftEncoding && activeTab?.rightEncoding && activeTab.leftEncoding !== activeTab.rightEncoding
            ? `L:${activeTab.leftEncoding} R:${activeTab.rightEncoding}`
            : activeTab?.leftEncoding || 'UTF-8'}
        </span>
        <div className="h-3 w-px bg-neutral-800" />
        <span>LF</span>
      </div>
    </footer>
  );
};
