import React, { useState } from 'react';
import {
  Folder,
  File,
  RefreshCw,
  FolderTree,
  AlertTriangle,
  ArrowRight,
  Check,
} from 'lucide-react';
import { useDiffStore } from '../../stores/diffStore';
import { FolderEntry, FolderItemStatus } from '../../types/diff';
import { isTauri } from '../../utils/ipc';

export const FolderDiffViewer: React.FC = () => {
  const {
    leftPath,
    rightPath,
    setLeftPath,
    setRightPath,
    folderResult,
    runFolderDiff,
    isComputing,
    setCompareMode,
  } = useDiffStore();

  const [filter, setFilter] = useState<'all' | FolderItemStatus>('all');
  const [deepHash, setDeepHash] = useState(true);

  const handleOpenLeftDir = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setLeftPath(selected);
      }
    }
  };

  const handleOpenRightDir = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setRightPath(selected);
      }
    }
  };

  const entries = (folderResult?.entries || []).filter((e) => {
    if (filter === 'all') return true;
    return e.status === filter;
  });

  const handleDrillDown = (entry: FolderEntry) => {
    if (entry.is_dir || !leftPath || !rightPath) return;

    // Open file diff
    useDiffStore.getState().setLeftPath(`${leftPath}/${entry.relative_path}`);
    useDiffStore.getState().setRightPath(`${rightPath}/${entry.relative_path}`);
    setCompareMode('file');
  };

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getStatusBadge = (status: FolderItemStatus) => {
    switch (status) {
      case 'Modified':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Modified
          </span>
        );
      case 'OnlyInLeft':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
            Only Left
          </span>
        );
      case 'OnlyInRight':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Only Right
          </span>
        );
      case 'Identical':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-400">
            Identical
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden">
      {/* Top Filter & Actions Bar */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center space-x-2">
          {/* Compare Button */}
          <button
            onClick={() => runFolderDiff(deepHash)}
            disabled={!leftPath || !rightPath || isComputing}
            className="flex items-center space-x-1 px-3 py-1 bg-emerald-500 text-neutral-950 font-semibold rounded hover:bg-emerald-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isComputing ? 'animate-spin' : ''}`} />
            <span>Scan Folders</span>
          </button>

          {/* Deep Hash Check Toggle */}
          <label className="flex items-center space-x-1.5 text-neutral-400 hover:text-neutral-200 cursor-pointer text-[11px] ml-2">
            <input
              type="checkbox"
              checked={deepHash}
              onChange={(e) => setDeepHash(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-emerald-500 focus:ring-0"
            />
            <span>Deep CRC32 Hash Check</span>
          </label>
        </div>

        {/* Filter Badges */}
        {folderResult && (
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === 'all'
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              All ({folderResult.entries.length})
            </button>
            <button
              onClick={() => setFilter('Modified')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === 'Modified'
                  ? 'bg-amber-500/20 text-amber-400 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Modified ({folderResult.total_modified})
            </button>
            <button
              onClick={() => setFilter('OnlyInLeft')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === 'OnlyInLeft'
                  ? 'bg-rose-500/20 text-rose-400 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Only Left ({folderResult.total_only_left})
            </button>
            <button
              onClick={() => setFilter('OnlyInRight')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === 'OnlyInRight'
                  ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Only Right ({folderResult.total_only_right})
            </button>
            <button
              onClick={() => setFilter('Identical')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === 'Identical'
                  ? 'bg-neutral-800 text-neutral-200 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Identical ({folderResult.total_identical})
            </button>
          </div>
        )}
      </div>

      {/* Main Table or Empty State */}
      {!folderResult ? (
        <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8 space-y-4">
          <FolderTree className="w-12 h-12 text-neutral-600" />
          <div className="text-center max-w-md">
            <h3 className="text-sm font-semibold text-neutral-300 mb-1">
              Folder Comparison Workspace
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Select two directories in the header bar above, then click "Scan Folders" to compare
              structure, file sizes, and deep byte hashes in parallel.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleOpenLeftDir}
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs hover:border-neutral-700"
              >
                Choose Left Directory
              </button>
              <button
                onClick={handleOpenRightDir}
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs hover:border-neutral-700"
              >
                Choose Right Directory
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead className="bg-neutral-900/90 sticky top-0 border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2 px-3 w-8">Type</th>
                <th className="py-2 px-3">Relative Path</th>
                <th className="py-2 px-3 w-28">Status</th>
                <th className="py-2 px-3 w-24 text-right">Left Size</th>
                <th className="py-2 px-3 w-24 text-right">Right Size</th>
                <th className="py-2 px-3 w-20 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {entries.map((entry, idx) => (
                <tr
                  key={idx}
                  onDoubleClick={() => handleDrillDown(entry)}
                  className="hover:bg-neutral-900/60 cursor-pointer transition-colors group"
                >
                  <td className="py-1.5 px-3">
                    {entry.is_dir ? (
                      <Folder className="w-3.5 h-3.5 text-amber-400/80" />
                    ) : (
                      <File className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-neutral-200 truncate">
                    {entry.relative_path}
                  </td>
                  <td className="py-1.5 px-3">{getStatusBadge(entry.status)}</td>
                  <td className="py-1.5 px-3 text-right text-neutral-400">
                    {formatBytes(entry.left_size)}
                  </td>
                  <td className="py-1.5 px-3 text-right text-neutral-400">
                    {formatBytes(entry.right_size)}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    {!entry.is_dir && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDrillDown(entry);
                        }}
                        title="Open file in diff viewer"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-700"
                      >
                        Diff
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
