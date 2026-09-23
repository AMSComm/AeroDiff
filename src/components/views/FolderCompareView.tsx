import React, { useState } from 'react';
import {
  Folder,
  File,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  PlusCircle,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { FolderEntry, FolderItemStatus } from '../../types/diff';
import { invokeCompareFolders } from '../../utils/ipc';

export const FolderCompareView: React.FC = () => {
  const { getActiveTab, updateActiveTab, openFileCompareTab } = useTabStore();
  const activeTab = getActiveTab();

  const [filter, setFilter] = useState<'all' | FolderItemStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deepHash, setDeepHash] = useState(true);

  if (!activeTab || activeTab.type !== 'folder') return null;

  const folderResult = activeTab.folderResult;
  const leftPath = activeTab.leftPath || '';
  const rightPath = activeTab.rightPath || '';

  const handleRescan = async () => {
    if (!leftPath || !rightPath) return;
    updateActiveTab({ isComputing: true });
    try {
      const res = await invokeCompareFolders(leftPath, rightPath, deepHash);
      updateActiveTab({ folderResult: res, isComputing: false });
    } catch (e) {
      console.error('Failed to rescan folders:', e);
      updateActiveTab({ isComputing: false });
    }
  };

  const handleOpenFileCompare = async (entry: FolderEntry) => {
    if (entry.is_dir) return;
    const fullLeft = `${leftPath}/${entry.relative_path}`;
    const fullRight = `${rightPath}/${entry.relative_path}`;
    await openFileCompareTab(fullLeft, fullRight);
  };

  const entries = (folderResult?.entries || [])
    .filter((e) => {
      if (filter === 'all') return true;
      return e.status === filter;
    })
    .filter((e) => {
      if (!searchQuery.trim()) return true;
      return e.relative_path.toLowerCase().includes(searchQuery.toLowerCase());
    });

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
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>Modified</span>
          </span>
        );
      case 'OnlyInLeft':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <MinusCircle className="w-3 h-3 text-rose-400" />
            <span>Only Left</span>
          </span>
        );
      case 'OnlyInRight':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <PlusCircle className="w-3 h-3 text-emerald-400" />
            <span>Only Right</span>
          </span>
        );
      case 'Identical':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-neutral-800 text-neutral-400">
            <CheckCircle2 className="w-3 h-3 text-neutral-500" />
            <span>Identical</span>
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Top Action & Filter Toolbar - ALL BUTTONS */}
      <div className="h-11 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          {/* Rescan Button */}
          <button
            onClick={handleRescan}
            disabled={activeTab.isComputing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded text-xs transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeTab.isComputing ? 'animate-spin' : ''}`} />
            <span>Rescan Folders</span>
          </button>

          {/* Deep Hash Check Button Toggle */}
          <button
            onClick={() => setDeepHash(!deepHash)}
            className={`px-2.5 py-1.5 rounded text-xs border font-medium transition-colors ${
              deepHash
                ? 'bg-neutral-800 text-emerald-400 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            CRC32 Hash: {deepHash ? 'Enabled (Exact)' : 'Disabled (Fast)'}
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Search box */}
          <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded px-2 py-1 space-x-1.5 text-neutral-400">
            <Search className="w-3.5 h-3.5 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter file path..."
              className="bg-transparent border-none text-xs text-neutral-200 focus:outline-none w-36"
            />
          </div>
        </div>

        {/* Status Filter Buttons */}
        {folderResult && (
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                filter === 'all'
                  ? 'bg-neutral-800 text-neutral-100 border-neutral-700'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              All ({folderResult.entries.length})
            </button>
            <button
              onClick={() => setFilter('Modified')}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                filter === 'Modified'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-amber-300'
              }`}
            >
              Modified ({folderResult.total_modified})
            </button>
            <button
              onClick={() => setFilter('OnlyInLeft')}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                filter === 'OnlyInLeft'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-rose-300'
              }`}
            >
              Only Left ({folderResult.total_only_left})
            </button>
            <button
              onClick={() => setFilter('OnlyInRight')}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                filter === 'OnlyInRight'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-emerald-300'
              }`}
            >
              Only Right ({folderResult.total_only_right})
            </button>
            <button
              onClick={() => setFilter('Identical')}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                filter === 'Identical'
                  ? 'bg-neutral-800 text-neutral-200 border-neutral-700'
                  : 'bg-neutral-950 text-neutral-500 border-neutral-800 hover:text-neutral-300'
              }`}
            >
              Identical ({folderResult.total_identical})
            </button>
          </div>
        )}
      </div>

      {/* Directory Paths Banner */}
      <div className="bg-neutral-900/60 border-b border-neutral-800/80 px-3 py-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
        <div className="truncate flex-1">
          <span className="text-neutral-500">Left:</span> {leftPath}
        </div>
        <div className="truncate flex-1 text-right">
          <span className="text-neutral-500">Right:</span> {rightPath}
        </div>
      </div>

      {/* Main Files Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead className="bg-neutral-900 sticky top-0 border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-2 px-3 w-8">Type</th>
              <th className="py-2 px-3">Name & Relative Path</th>
              <th className="py-2 px-3 w-36">Result</th>
              <th className="py-2 px-3 w-28 text-right">Left Size</th>
              <th className="py-2 px-3 w-28 text-right">Right Size</th>
              <th className="py-2 px-3 w-32 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-500">
                  {folderResult
                    ? 'No files match the current filter.'
                    : 'Scanning folder contents...'}
                </td>
              </tr>
            ) : (
              entries.map((entry, idx) => (
                <tr
                  key={idx}
                  onDoubleClick={() => handleOpenFileCompare(entry)}
                  className="hover:bg-neutral-900/70 cursor-pointer transition-colors group"
                >
                  <td className="py-1.5 px-3">
                    {entry.is_dir ? (
                      <Folder className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <File className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-neutral-200 truncate">
                    <span className="font-semibold text-neutral-100">
                      {entry.relative_path.split('/').pop()}
                    </span>
                    <span className="text-neutral-500 text-[11px] ml-2">
                      {entry.relative_path}
                    </span>
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
                          handleOpenFileCompare(entry);
                        }}
                        title="Open comparison tab for this file"
                        className="inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Diff Files</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
