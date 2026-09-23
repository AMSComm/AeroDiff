import React, { useState } from 'react';
import { Table, Key, ArrowRight, RefreshCw, FileSpreadsheet, FileText } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { CsvRowStatus } from '../../types/diff';
import { invokeCompareCsv } from '../../utils/ipc';

export const CsvCompareView: React.FC = () => {
  const { getActiveTab, updateActiveTab, toggleCsvViewMode } = useTabStore();
  const activeTab = getActiveTab();

  const [selectedKey, setSelectedKey] = useState<string>('__none__');

  if (!activeTab || (activeTab.type !== 'csv' && activeTab.type !== 'file')) return null;

  const csvResult = activeTab.csvResult;
  const leftContent = activeTab.leftContent;
  const rightContent = activeTab.rightContent;

  const handleKeySelect = async (key: string) => {
    setSelectedKey(key);
    updateActiveTab({ isComputing: true });
    try {
      const res = await invokeCompareCsv(
        leftContent,
        rightContent,
        key === '__none__' ? undefined : key
      );
      updateActiveTab({ csvResult: res, isComputing: false });
    } catch (e) {
      console.error('Failed to compare CSV:', e);
      updateActiveTab({ isComputing: false });
    }
  };

  const headers = csvResult?.headers || [];
  const rows = csvResult?.rows || [];

  const getStatusBadge = (status: CsvRowStatus) => {
    switch (status) {
      case 'Modified':
        return (
          <span className="text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
            Modified
          </span>
        );
      case 'Added':
        return (
          <span className="text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
            + Added
          </span>
        );
      case 'Deleted':
        return (
          <span className="text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
            - Deleted
          </span>
        );
      case 'Unchanged':
        return <span className="text-neutral-500 text-[10px]">Identical</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Top CSV Controls Toolbar - All Buttons & Simple */}
      <div className="h-11 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="flex items-center space-x-1.5 text-neutral-300 font-semibold">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>CSV Table Diff</span>
          </div>

          {/* Toggle back to text diff if in file tab or switched */}
          <button
            onClick={toggleCsvViewMode}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs transition-colors ml-1"
            title="Switch back to Text View"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Text View</span>
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Key Selection Buttons */}
          <div className="flex items-center space-x-1">
            <span className="text-neutral-400 text-[11px]">Match Mode:</span>
            <button
              onClick={() => handleKeySelect('__none__')}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                selectedKey === '__none__'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              Row Index (1-to-1)
            </button>

            {/* Render header columns as buttons for easy 1-click Primary Key selection */}
            {headers.slice(0, 5).map((col) => (
              <button
                key={col}
                onClick={() => handleKeySelect(col)}
                title={`Align rows by key column '${col}'`}
                className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  selectedKey === col
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
                }`}
              >
                Key: <span className="font-mono font-bold">{col}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary Badges */}
        {csvResult && (
          <div className="flex items-center space-x-2 text-[11px] font-mono shrink-0 ml-2">
            <span className="text-neutral-400">{csvResult.total_rows} rows</span>
            {csvResult.modified_rows > 0 && (
              <span className="text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                {csvResult.modified_rows} modified
              </span>
            )}
            {csvResult.added_rows > 0 && (
              <span className="text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                +{csvResult.added_rows} added
              </span>
            )}
            {csvResult.deleted_rows > 0 && (
              <span className="text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                -{csvResult.deleted_rows} deleted
              </span>
            )}
          </div>
        )}
      </div>

      {/* CSV Grid Table */}
      {!csvResult || rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8 space-y-2">
          <Table className="w-10 h-10 text-neutral-600" />
          <p className="text-xs">Loading or no tabular CSV data available.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead className="bg-neutral-900 sticky top-0 border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-2 px-3 w-28 border-r border-neutral-800">Status</th>
                <th className="py-2 px-3 w-24 border-r border-neutral-800">Key / Index</th>
                {headers.map((h) => (
                  <th key={h} className="py-2 px-3 min-w-36 border-r border-neutral-800 truncate">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {rows.map((row, idx) => {
                const isMod = row.status === 'Modified';
                const isAdd = row.status === 'Added';
                const isDel = row.status === 'Deleted';

                let rowBg = 'hover:bg-neutral-900/50';
                if (isMod) rowBg = 'bg-amber-500/10 hover:bg-amber-500/15';
                if (isAdd) rowBg = 'bg-emerald-500/10 hover:bg-emerald-500/15';
                if (isDel) rowBg = 'bg-rose-500/10 hover:bg-rose-500/15';

                return (
                  <tr key={idx} className={rowBg}>
                    <td className="py-1.5 px-3 border-r border-neutral-900">
                      {getStatusBadge(row.status)}
                    </td>
                    <td className="py-1.5 px-3 border-r border-neutral-900 text-neutral-400">
                      {row.key}
                    </td>
                    {row.cells.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`py-1.5 px-3 border-r border-neutral-900 truncate max-w-xs ${
                          cell.is_diff
                            ? 'bg-amber-400/20 text-amber-200 font-semibold'
                            : 'text-neutral-300'
                        }`}
                      >
                        {cell.is_diff ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="line-through text-rose-300/80">
                              {cell.left_val ?? '∅'}
                            </span>
                            <ArrowRight className="w-3 h-3 text-neutral-500 shrink-0" />
                            <span className="text-emerald-300 font-bold">
                              {cell.right_val ?? '∅'}
                            </span>
                          </div>
                        ) : (
                          <span>{cell.left_val ?? cell.right_val ?? ''}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
