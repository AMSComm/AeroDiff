import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, Key, ArrowRight, RefreshCw } from 'lucide-react';
import { useDiffStore } from '../../stores/diffStore';
import { CsvRowStatus } from '../../types/diff';

export const CsvDiffViewer: React.FC = () => {
  const { csvResult, runCsvDiff, isComputing } = useDiffStore();
  const [selectedKey, setSelectedKey] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = csvResult?.rows || [];
  const headers = csvResult?.headers || [];

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  const handleKeyChange = (key: string) => {
    setSelectedKey(key);
    runCsvDiff(key === '__none__' ? undefined : key);
  };

  const getStatusBadge = (status: CsvRowStatus) => {
    switch (status) {
      case 'Modified':
        return <span className="text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded text-[10px]">Mod</span>;
      case 'Added':
        return <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded text-[10px]">+Add</span>;
      case 'Deleted':
        return <span className="text-rose-400 bg-rose-500/10 px-1 py-0.5 rounded text-[10px]">-Del</span>;
      case 'Unchanged':
        return <span className="text-neutral-500 text-[10px]">=</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* CSV Options & Key Column Bar */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          {/* Delimiter info */}
          <div className="text-[11px] text-neutral-400 flex items-center space-x-1">
            <span>Delimiter:</span>
            <span className="font-mono bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 text-neutral-200">
              {csvResult?.delimiter === '\t' ? 'TAB' : csvResult?.delimiter || ','}
            </span>
          </div>

          {/* Key Column Alignment Selector */}
          <div className="flex items-center space-x-1.5 text-[11px]">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-neutral-400">Key Column:</span>
            <select
              value={selectedKey || '__none__'}
              onChange={(e) => handleKeyChange(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-neutral-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="__none__">(Row Index - Sequential)</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => runCsvDiff(selectedKey === '__none__' ? undefined : selectedKey)}
            disabled={isComputing}
            className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            title="Recompute CSV diff"
          >
            <RefreshCw className={`w-3 h-3 ${isComputing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats Badges */}
        {csvResult && (
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <span className="text-neutral-400">{csvResult.total_rows} total rows</span>
            {csvResult.modified_rows > 0 && (
              <span className="text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30">
                {csvResult.modified_rows} changed
              </span>
            )}
            {csvResult.added_rows > 0 && (
              <span className="text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded border border-emerald-500/30">
                +{csvResult.added_rows} added
              </span>
            )}
            {csvResult.deleted_rows > 0 && (
              <span className="text-rose-400 bg-rose-500/15 px-1.5 py-0.2 rounded border border-rose-500/30">
                -{csvResult.deleted_rows} deleted
              </span>
            )}
          </div>
        )}
      </div>

      {/* Virtualized Table */}
      {!csvResult ? (
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8 space-y-3">
          <Table className="w-12 h-12 text-neutral-600" />
          <p className="text-xs">No CSV comparison loaded. Open CSV files above to view tabular diff.</p>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 overflow-auto">
          <div
            className="w-full relative font-mono text-[12px]"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {/* Header row */}
            <div className="sticky top-0 z-10 flex bg-neutral-900 border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
              <div className="w-16 px-2 py-1.5 shrink-0 border-r border-neutral-800">Status</div>
              <div className="w-24 px-2 py-1.5 shrink-0 border-r border-neutral-800">Key</div>
              {headers.map((h) => (
                <div key={h} className="w-44 px-2 py-1.5 shrink-0 border-r border-neutral-800 truncate">
                  {h}
                </div>
              ))}
            </div>

            {/* Virtualized rows */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;

              const isMod = row.status === 'Modified';
              const isAdd = row.status === 'Added';
              const isDel = row.status === 'Deleted';

              let rowBg = 'hover:bg-neutral-900/50';
              if (isMod) rowBg = 'bg-amber-500/10 hover:bg-amber-500/15';
              if (isAdd) rowBg = 'bg-emerald-500/10 hover:bg-emerald-500/15';
              if (isDel) rowBg = 'bg-rose-500/10 hover:bg-rose-500/15';

              return (
                <div
                  key={virtualRow.index}
                  className={`absolute top-0 left-0 w-full flex items-center border-b border-neutral-900/60 ${rowBg}`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="w-16 px-2 py-1 shrink-0 border-r border-neutral-900 text-center">
                    {getStatusBadge(row.status)}
                  </div>
                  <div className="w-24 px-2 py-1 shrink-0 border-r border-neutral-900 truncate text-neutral-400">
                    {row.key}
                  </div>
                  {row.cells.map((cell, cIdx) => (
                    <div
                      key={cIdx}
                      className={`w-44 px-2 py-1 shrink-0 border-r border-neutral-900 truncate ${
                        cell.is_diff ? 'bg-amber-400/20 text-amber-200 font-semibold' : 'text-neutral-300'
                      }`}
                    >
                      {cell.is_diff ? (
                        <span className="flex items-center space-x-1">
                          <span className="line-through opacity-70 text-rose-300">
                            {cell.left_val ?? '∅'}
                          </span>
                          <ArrowRight className="w-2.5 h-2.5 inline shrink-0 opacity-60" />
                          <span className="text-emerald-300">{cell.right_val ?? '∅'}</span>
                        </span>
                      ) : (
                        <span>{cell.left_val ?? cell.right_val ?? ''}</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
