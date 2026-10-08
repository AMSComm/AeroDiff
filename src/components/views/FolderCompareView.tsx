import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  FolderOpen,
  ArrowLeftRight,
  Copy,
  Check,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { useQuickCompareStore } from '../../stores/quickCompareStore';
import { ContextMenu } from '../common/ContextMenu';
import { FolderEntry, FolderItemStatus, FolderCompareOptions, FolderProgressPayload } from '../../types/diff';
import { invokeCompareFolders, invokeCancelFolderComparison, isTauri } from '../../utils/ipc';

export const FolderCompareView: React.FC = () => {
  const { getActiveTab, updateActiveTab, openFileCompareTab, changeFolderSide } = useTabStore();
  const { selectedLeft, selectLeft, compareWithLeft, handleBatchCompare } = useQuickCompareStore();
  const activeTab = getActiveTab();

  const [filter, setFilter] = useState<'all' | FolderItemStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deepHash, setDeepHash] = useState(false);
  const [ignoreLineEndings, setIgnoreLineEndings] = useState(true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [includeHiddenFolders, setIncludeHiddenFolders] = useState(false);
  const [scanProgress, setScanProgress] = useState<FolderProgressPayload | null>(null);
  const parentContainerRef = useRef<HTMLDivElement>(null);

  // Listen to live scan & comparison progress emitted by Tauri
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<FolderProgressPayload>('folder-compare-progress', (event) => {
          if (event.payload) {
            setScanProgress(event.payload);
          }
        });
      } catch (err) {
        console.warn('Could not register folder progress listener:', err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pathContextMenu, setPathContextMenu] = useState<{ x: number; y: number; side: 'left' | 'right' } | null>(null);

  const handleRowClick = (idx: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
      setLastSelectedIndex(idx);
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, idx);
      const end = Math.max(lastSelectedIndex, idx);
      const next = new Set(selectedIndices);
      for (let i = start; i <= end; i++) {
        next.add(i);
      }
      setSelectedIndices(next);
    } else {
      setSelectedIndices(new Set([idx]));
      setLastSelectedIndex(idx);
    }
  };

  const handleRowContextMenu = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedIndices.has(idx)) {
      setSelectedIndices(new Set([idx]));
      setLastSelectedIndex(idx);
    }
    setRowContextMenu({ x: e.clientX, y: e.clientY });
  };

  const folderResult = activeTab?.type === 'folder' ? activeTab.folderResult : null;
  const leftPath = activeTab?.type === 'folder' ? activeTab.leftPath || '' : '';
  const rightPath = activeTab?.type === 'folder' ? activeTab.rightPath || '' : '';

  const entries = useMemo(() => {
    const list = folderResult?.entries || [];
    const query = searchQuery.trim().toLowerCase();
    const filtered = list.filter((e) => {
      if (filter !== 'all' && e.status !== filter) return false;
      if (query && !e.relative_path.toLowerCase().includes(query)) return false;
      return true;
    });

    const statusPriority: Record<FolderItemStatus, number> = {
      Modified: 0,
      OnlyInLeft: 1,
      OnlyInRight: 2,
      Identical: 3,
    };

    return [...filtered].sort((a, b) => {
      const pDiff = statusPriority[a.status] - statusPriority[b.status];
      if (pDiff !== 0) return pDiff;
      return a.relative_path.localeCompare(b.relative_path);
    });
  }, [folderResult?.entries, filter, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentContainerRef.current,
    estimateSize: () => 34,
    overscan: 25,
  });

  if (!activeTab || activeTab.type !== 'folder') return null;

  const handleRescan = async (override?: Partial<FolderCompareOptions>) => {
    if (!leftPath || !rightPath) return;
    setScanProgress(null);
    updateActiveTab({ isComputing: true, diffError: null });

    const opts: FolderCompareOptions = {
      deep_hash: override?.deep_hash ?? deepHash,
      ignore_line_endings: override?.ignore_line_endings ?? ignoreLineEndings,
      ignore_whitespace: override?.ignore_whitespace ?? ignoreWhitespace,
      include_hidden_folders: override?.include_hidden_folders ?? includeHiddenFolders,
    };

    try {
      const res = await invokeCompareFolders(leftPath, rightPath, opts);
      updateActiveTab({ folderResult: res, isComputing: false, diffError: null });
    } catch (e: any) {
      console.error('Failed to rescan folders:', e);
      updateActiveTab({ isComputing: false, diffError: e?.message || String(e) });
    }
  };

  const handleCancelScan = async () => {
    try {
      await invokeCancelFolderComparison();
      updateActiveTab({ isComputing: false, diffError: 'Comparison was stopped by user.' });
    } catch (e) {
      console.error('Failed to cancel scan:', e);
    }
  };

  const handleOpenFileCompare = async (entry: FolderEntry) => {
    if (entry.is_dir || entry.is_binary) return;
    const fullLeft = `${leftPath}/${entry.relative_path}`;
    const fullRight = `${rightPath}/${entry.relative_path}`;
    await openFileCompareTab(fullLeft, fullRight);
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
            onClick={() => handleRescan()}
            disabled={activeTab.isComputing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded text-xs transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeTab.isComputing ? 'animate-spin' : ''}`} />
            <span>Rescan</span>
          </button>

          {/* Deep Hash Check Button Toggle */}
          <button
            onClick={() => {
              const next = !deepHash;
              setDeepHash(next);
              handleRescan({ deep_hash: next });
            }}
            title="Enable byte-level CRC32 hash comparison"
            className={`px-2 py-1 rounded text-[11px] border font-medium transition-colors ${
              deepHash
                ? 'bg-neutral-800 text-emerald-400 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            CRC32: {deepHash ? 'ON' : 'OFF'}
          </button>

          {/* Ignore Line Endings Toggle */}
          <button
            onClick={() => {
              const next = !ignoreLineEndings;
              setIgnoreLineEndings(next);
              handleRescan({ ignore_line_endings: next });
            }}
            title="Ignore CRLF vs LF line ending differences in text files"
            className={`px-2 py-1 rounded text-[11px] border font-medium transition-colors ${
              ignoreLineEndings
                ? 'bg-neutral-800 text-emerald-400 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            CRLF: {ignoreLineEndings ? 'Ignored' : 'Exact'}
          </button>

          {/* Ignore Whitespace Toggle */}
          <button
            onClick={() => {
              const next = !ignoreWhitespace;
              setIgnoreWhitespace(next);
              handleRescan({ ignore_whitespace: next });
            }}
            title="Ignore leading and trailing whitespace differences in text files"
            className={`px-2 py-1 rounded text-[11px] border font-medium transition-colors ${
              ignoreWhitespace
                ? 'bg-neutral-800 text-emerald-400 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Whitespace: {ignoreWhitespace ? 'Ignored' : 'Exact'}
          </button>

          {/* Include Hidden Folders Toggle */}
          <button
            onClick={() => {
              const next = !includeHiddenFolders;
              setIncludeHiddenFolders(next);
              handleRescan({ include_hidden_folders: next });
            }}
            title="Toggle scanning of hidden folders (.git, .vscode, etc.). Hidden files (.env, .gitignore) are always included."
            className={`px-2 py-1 rounded text-[11px] border font-medium transition-colors ${
              includeHiddenFolders
                ? 'bg-neutral-800 text-emerald-400 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Hidden Folders: {includeHiddenFolders ? 'Included' : 'Excluded'}
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

          {/* Live Progress Status Badge */}
          {activeTab.isComputing && (
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-300">
              <RefreshCw className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
              <span>
                {scanProgress?.stage === 'scanning' ? (
                  <span>
                    Scanning... L: <span className="text-emerald-400">{scanProgress.left_scanned.toLocaleString()}</span> | R:{' '}
                    <span className="text-emerald-400">{scanProgress.right_scanned.toLocaleString()}</span>
                  </span>
                ) : scanProgress?.stage === 'comparing' ? (
                  <span>Comparing {scanProgress.total.toLocaleString()} items...</span>
                ) : scanProgress?.stage === 'hashing' ? (
                  <span>
                    Hashing {scanProgress.compared.toLocaleString()} / {scanProgress.total.toLocaleString()}...
                  </span>
                ) : (
                  <span>Scanning...</span>
                )}
              </span>
              <button
                onClick={handleCancelScan}
                title="Stop folder comparison"
                className="ml-1 px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-sans font-medium transition-colors"
              >
                Stop
              </button>
            </div>
          )}
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
      <div className="bg-neutral-900/60 border-b border-neutral-800/80 px-3 py-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setPathContextMenu({ x: e.clientX, y: e.clientY, side: 'left' });
          }}
          className="truncate flex-1 flex items-center space-x-2"
        >
          <span className="text-neutral-500">Left:</span>
          <span className="text-neutral-300 font-medium truncate" title={leftPath}>
            {leftPath}
          </span>
          <button
            onClick={() => changeFolderSide('left')}
            title="Change Left Folder (Choose folder from disk)"
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 rounded transition-colors shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="hidden lg:flex items-center space-x-1 text-[10px] text-neutral-500 font-sans shrink-0 px-2 select-none">
          <span>💡 Select multiple items & right-click to quick-compare</span>
        </div>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setPathContextMenu({ x: e.clientX, y: e.clientY, side: 'right' });
          }}
          className="truncate flex-1 text-right flex items-center justify-end space-x-2"
        >
          <button
            onClick={() => changeFolderSide('right')}
            title="Change Right Folder (Choose folder from disk)"
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 rounded transition-colors shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <span className="text-neutral-300 font-medium truncate" title={rightPath}>
            {rightPath}
          </span>
          <span className="text-neutral-500">:Right</span>
        </div>
      </div>

      {/* Main Files Table or Error or Loading Progress Card */}
      {activeTab.diffError ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-neutral-950">
          <div className="max-w-lg w-full bg-neutral-900 border border-rose-500/30 rounded-lg p-6 shadow-xl space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-neutral-100">Folder Comparison Error</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  The directory comparison was halted to prevent app freezing or memory exhaustion.
                </p>
              </div>
            </div>

            <div className="p-3 rounded bg-neutral-950/80 border border-neutral-800 text-xs font-mono text-rose-300/90 whitespace-pre-wrap break-words leading-relaxed select-text">
              {activeTab.diffError}
            </div>

            <div className="text-[11px] text-neutral-500 leading-normal">
              💡 For massive directories with tens of thousands of files, use Quick Compare (metadata matching) or compare more targeted subdirectories.
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2 border-t border-neutral-800/80">
              <button
                onClick={() =>
                  updateActiveTab({
                    type: 'welcome',
                    folderResult: undefined,
                    diffError: null,
                    isComputing: false,
                  })
                }
                className="px-3 py-1.5 rounded text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
              >
                Back to Welcome
              </button>
              <button
                onClick={() => handleRescan()}
                className="px-3 py-1.5 rounded text-xs bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold transition-colors flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Scan</span>
              </button>
            </div>
          </div>
        </div>
      ) : activeTab.isComputing && entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-neutral-950 select-none">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-lg p-6 shadow-xl space-y-5">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-neutral-100">
                  {scanProgress?.stage === 'comparing'
                    ? 'Comparing Files...'
                    : scanProgress?.stage === 'hashing'
                    ? 'Verifying File Hashes (CRC32)...'
                    : 'Discovering Files & Folders...'}
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                  {scanProgress?.message || 'Walking directory trees in parallel...'}
                </p>
              </div>
            </div>

            {/* Metrics Counter */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 bg-neutral-950 border border-neutral-800/90 rounded">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Left Scanned</div>
                <div className="text-base font-bold text-neutral-100 mt-1">
                  {scanProgress ? scanProgress.left_scanned.toLocaleString() : '0'}
                </div>
                <div className="text-[10px] text-neutral-500 truncate mt-0.5" title={leftPath}>
                  {leftPath.split('/').pop() || 'Left'}
                </div>
              </div>
              <div className="p-3 bg-neutral-950 border border-neutral-800/90 rounded">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Right Scanned</div>
                <div className="text-base font-bold text-neutral-100 mt-1">
                  {scanProgress ? scanProgress.right_scanned.toLocaleString() : '0'}
                </div>
                <div className="text-[10px] text-neutral-500 truncate mt-0.5" title={rightPath}>
                  {rightPath.split('/').pop() || 'Right'}
                </div>
              </div>
            </div>

            {/* Animated Bar & Safety Monitoring */}
            <div className="space-y-1.5">
              <div className="h-1.5 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                <div className="h-full bg-emerald-500 rounded-full animate-pulse w-full" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                <span>Dynamic Memory Monitoring</span>
                <span>{deepHash ? 'CRC32 Deep Hash' : 'Quick Mode (Size + Date)'}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end border-t border-neutral-800/80">
              <button
                onClick={handleCancelScan}
                className="px-3 py-1.5 rounded text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
              >
                Cancel Scan
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Table Header */}
          <div className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold flex items-center pr-3 shrink-0 select-none">
            <div className="py-2 px-3 w-10 shrink-0 text-center">Type</div>
            <div className="py-2 px-3 flex-1 min-w-0">Name & Relative Path</div>
            <div className="py-2 px-3 w-36 shrink-0">Result</div>
            <div className="py-2 px-3 w-28 shrink-0 text-right">Left Size</div>
            <div className="py-2 px-3 w-28 shrink-0 text-right">Right Size</div>
            <div className="py-2 px-3 w-32 shrink-0 text-center">Action</div>
          </div>

          {/* Virtualized List Container */}
          <div ref={parentContainerRef} className="flex-1 overflow-auto">
            {entries.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 font-mono text-xs">
                {folderResult
                  ? 'No files match the current filter.'
                  : 'No files to display.'}
              </div>
            ) : (
              <div
                className="w-full relative font-mono text-xs"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const idx = virtualRow.index;
                  const entry = entries[idx];
                  if (!entry) return null;
                  const isSelected = selectedIndices.has(idx);

                  return (
                    <div
                      key={virtualRow.key}
                      onClick={(e) => handleRowClick(idx, e)}
                      onContextMenu={(e) => handleRowContextMenu(idx, e)}
                      onDoubleClick={() => !entry.is_binary && handleOpenFileCompare(entry)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex items-center border-b border-neutral-900 cursor-pointer transition-colors group select-none ${
                        isSelected
                          ? 'bg-neutral-800/90 text-neutral-100 ring-1 ring-emerald-500/50'
                          : 'hover:bg-neutral-900/70'
                      }`}
                    >
                      <div className="py-1.5 px-3 w-10 shrink-0 flex items-center justify-center">
                        {entry.is_dir ? (
                          <Folder className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <File className="w-3.5 h-3.5 text-neutral-400" />
                        )}
                      </div>
                      <div className="py-1.5 px-3 flex-1 min-w-0 text-neutral-200 truncate flex items-center">
                        <span className="font-semibold text-neutral-100 shrink-0">
                          {entry.relative_path.split('/').pop()}
                        </span>
                        {entry.is_binary && (
                          <span className="ml-1.5 px-1 py-0.2 rounded text-[10px] font-mono bg-neutral-800 border border-neutral-700/60 text-neutral-400 shrink-0">
                            BIN
                          </span>
                        )}
                        <span className="text-neutral-500 text-[11px] ml-2 truncate">
                          {entry.relative_path}
                        </span>
                      </div>
                      <div className="py-1.5 px-3 w-36 shrink-0">{getStatusBadge(entry.status)}</div>
                      <div className="py-1.5 px-3 w-28 shrink-0 text-right text-neutral-400">
                        {formatBytes(entry.left_size)}
                      </div>
                      <div className="py-1.5 px-3 w-28 shrink-0 text-right text-neutral-400">
                        {formatBytes(entry.right_size)}
                      </div>
                      <div className="py-1.5 px-3 w-32 shrink-0 text-center">
                        {!entry.is_dir && (
                          entry.is_binary ? (
                            <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-500 font-mono">
                              Binary
                            </span>
                          ) : (
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
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu for Table Rows */}
      {rowContextMenu && selectedIndices.size > 0 && (
        <ContextMenu
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          onClose={() => setRowContextMenu(null)}
          items={
            selectedIndices.size === 1
              ? (() => {
                  const singleIdx = Array.from(selectedIndices)[0];
                  const entry = entries[singleIdx];
                  if (!entry) return [];
                  const fullLeft = `${leftPath}/${entry.relative_path}`;
                  const fullRight = `${rightPath}/${entry.relative_path}`;
                  const defaultPath = entry.status === 'OnlyInRight' ? fullRight : fullLeft;

                  return [
                    {
                      label: 'Select as Left for Quick Compare',
                      icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
                      onClick: () => selectLeft(defaultPath, entry.is_dir),
                    },
                    ...(selectedLeft
                      ? [
                          {
                            label: `Compare with Left (${selectedLeft.name})`,
                            icon: <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />,
                            onClick: () => compareWithLeft(defaultPath, entry.is_dir),
                          },
                        ]
                      : []),
                    ...(!entry.is_dir && !entry.is_binary && entry.status !== 'OnlyInLeft' && entry.status !== 'OnlyInRight'
                      ? [
                          {
                            label: 'Diff this File (Left ↔ Right)',
                            icon: <ExternalLink className="w-3.5 h-3.5 text-sky-400" />,
                            onClick: () => handleOpenFileCompare(entry),
                          },
                        ]
                      : []),
                    { divider: true },
                    {
                      label: 'Copy Relative Path',
                      icon: <Copy className="w-3.5 h-3.5 text-neutral-400" />,
                      onClick: () => navigator.clipboard.writeText(entry.relative_path),
                    },
                    {
                      label: 'Copy Full Path',
                      icon: <Copy className="w-3.5 h-3.5 text-neutral-400" />,
                      onClick: () => navigator.clipboard.writeText(defaultPath),
                    },
                  ];
                })()
              : [
                  {
                    label: `Compare Selected Items (${selectedIndices.size})`,
                    icon: <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />,
                    onClick: () => {
                      const selectedEntries = Array.from(selectedIndices)
                        .map((i) => entries[i])
                        .filter(Boolean);
                      const paths = selectedEntries.map((e) =>
                        e.status === 'OnlyInRight'
                          ? `${rightPath}/${e.relative_path}`
                          : `${leftPath}/${e.relative_path}`
                      );
                      handleBatchCompare(paths);
                    },
                  },
                  { divider: true },
                  {
                    label: 'Deselect All',
                    onClick: () => setSelectedIndices(new Set()),
                  },
                ]
          }
        />
      )}

      {/* Context Menu for Folder Paths Banner */}
      {pathContextMenu && (
        <ContextMenu
          x={pathContextMenu.x}
          y={pathContextMenu.y}
          onClose={() => setPathContextMenu(null)}
          items={[
            {
              label: `Change ${pathContextMenu.side === 'left' ? 'Left' : 'Right'} Folder...`,
              icon: <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />,
              onClick: () => changeFolderSide(pathContextMenu.side),
            },
            {
              label: 'Select as Left for Quick Compare',
              icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
              onClick: () => selectLeft(pathContextMenu.side === 'left' ? leftPath : rightPath, true),
            },
            ...(selectedLeft
              ? [
                  {
                    label: `Compare with Left (${selectedLeft.name})`,
                    icon: <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />,
                    onClick: () => compareWithLeft(pathContextMenu.side === 'left' ? leftPath : rightPath, true),
                  },
                ]
              : []),
            { divider: true },
            {
              label: 'Copy Folder Path',
              icon: <Copy className="w-3.5 h-3.5 text-neutral-400" />,
              onClick: () => navigator.clipboard.writeText(pathContextMenu.side === 'left' ? leftPath : rightPath),
            },
          ]}
        />
      )}
    </div>
  );
};
