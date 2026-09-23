import React from 'react';
import {
  Columns2,
  AlignJustify,
  Edit3,
  Eye,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RotateCw,
  Save,
  Table,
  FileText,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { SplitDiffViewer } from '../viewer/SplitDiffViewer';
import { UnifiedDiffViewer } from '../viewer/UnifiedDiffViewer';
import { DiffMinimap } from '../viewer/DiffMinimap';
import { CsvCompareView } from './CsvCompareView';

export const FileCompareView: React.FC = () => {
  const {
    getActiveTab,
    toggleEditing,
    setViewMode,
    toggleIgnoreWhitespace,
    toggleIgnoreBlankLines,
    toggleIgnoreCase,
    toggleCsvViewMode,
    swapSides,
    undoAction,
    redoAction,
    saveLeftFile,
    saveRightFile,
    nextChunk,
    prevChunk,
    setLeftContent,
    setRightContent,
  } = useTabStore();

  const activeTab = getActiveTab();
  if (!activeTab || (activeTab.type !== 'file' && activeTab.type !== 'csv')) return null;

  const {
    leftPath,
    rightPath,
    leftContent,
    rightContent,
    isEditing,
    viewMode,
    options,
    diffResult,
    activeChunkIndex,
    history,
    future,
    isDirtyLeft,
    isDirtyRight,
    csvViewMode,
  } = activeTab;

  const totalChunks = diffResult?.chunks.length || 0;

  const isCsvFile =
    Boolean(
      leftPath?.toLowerCase().endsWith('.csv') ||
      leftPath?.toLowerCase().endsWith('.tsv') ||
      rightPath?.toLowerCase().endsWith('.csv') ||
      rightPath?.toLowerCase().endsWith('.tsv')
    ) || activeTab.type === 'csv';

  const isTableViewActive = isCsvFile && csvViewMode === 'table';

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Top Options Bar - 100% BUTTONS as requested */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0 overflow-x-auto scrollbar-none">
        {/* Left Section: View, Edit Mode, CSV Toggle, and Ignore Rules */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* CSV View Switcher (Visible only when file is CSV/TSV) */}
          {isCsvFile && (
            <>
              <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
                <button
                  onClick={() => {
                    if (csvViewMode !== 'table') toggleCsvViewMode();
                  }}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    isTableViewActive
                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Table className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Table View</span>
                </button>

                <button
                  onClick={() => {
                    if (csvViewMode === 'table') toggleCsvViewMode();
                  }}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    !isTableViewActive
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Text View</span>
                </button>
              </div>

              <div className="h-4 w-px bg-neutral-800 mx-1" />
            </>
          )}

          {/* View Mode Buttons (Side-by-Side vs Unified) */}
          {!isTableViewActive && (
            <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
              <button
                onClick={() => setViewMode('split')}
                title="Side-by-Side Split View"
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'split'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>

              <button
                onClick={() => setViewMode('unified')}
                title="Unified Combined View"
                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-neutral-800 text-neutral-100 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <AlignJustify className="w-3.5 h-3.5" />
                <span>Unified</span>
              </button>
            </div>
          )}

          {/* Live Edit Mode Button */}
          {!isTableViewActive && (
            <button
              onClick={toggleEditing}
              title={isEditing ? 'Switch to Visual Diff' : 'Direct In-place Edit'}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                isEditing
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
              <span>{isEditing ? 'Visual Diff' : 'Edit Mode'}</span>
            </button>
          )}

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Ignore Whitespace Button */}
          <button
            onClick={toggleIgnoreWhitespace}
            title="Toggle Whitespace rules: Include -> Trim Ends -> Ignore All"
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              options.ignore_whitespace !== 'None'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Whitespace:{' '}
            <span className="font-mono">
              {options.ignore_whitespace === 'None'
                ? 'Include'
                : options.ignore_whitespace === 'LeadingAndTrailing'
                ? 'Trim Ends'
                : 'Ignore All'}
            </span>
          </button>

          {/* Ignore Blank Lines Button */}
          <button
            onClick={toggleIgnoreBlankLines}
            title="Toggle Blank Lines matching"
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              options.ignore_blank_lines
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Blank Lines: {options.ignore_blank_lines ? 'Ignore' : 'Match'}
          </button>

          {/* Ignore Case Button */}
          <button
            onClick={toggleIgnoreCase}
            title="Toggle Case Sensitivity"
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              options.ignore_case
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Case: {options.ignore_case ? 'Ignore' : 'Match'}
          </button>
        </div>

        {/* Right Section: Navigation, Undo, Save */}
        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
          {/* Swap Sides Button */}
          <button
            onClick={swapSides}
            title="Swap Left and Right sides"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* Undo / Redo */}
          <button
            onClick={undoAction}
            disabled={history.length === 0}
            title="Undo merge (Cmd+Z / Ctrl+Z)"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={redoAction}
            disabled={future.length === 0}
            title="Redo merge (Cmd+Shift+Z / Ctrl+Y)"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Diff Navigation Buttons */}
          <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
            <span className="px-2 text-[11px] font-mono text-neutral-400">
              {totalChunks > 0 ? `${activeChunkIndex + 1}/${totalChunks}` : '0 diffs'}
            </span>
            <button
              onClick={prevChunk}
              disabled={totalChunks === 0}
              title="Previous difference (Shift+F7)"
              className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={nextChunk}
              disabled={totalChunks === 0}
              title="Next difference (F7)"
              className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Save Buttons */}
          <button
            onClick={saveLeftFile}
            disabled={!leftPath || !isDirtyLeft}
            title="Save Left File (Cmd+S / Ctrl+S)"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              isDirtyLeft
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-sm'
                : 'bg-neutral-950 border border-neutral-800 text-neutral-500 disabled:opacity-50'
            }`}
          >
            <Save className="w-3 h-3" />
            <span>Save Left</span>
          </button>

          <button
            onClick={saveRightFile}
            disabled={!rightPath || !isDirtyRight}
            title="Save Right File"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              isDirtyRight
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-sm'
                : 'bg-neutral-950 border border-neutral-800 text-neutral-500 disabled:opacity-50'
            }`}
          >
            <Save className="w-3 h-3" />
            <span>Save Right</span>
          </button>
        </div>
      </div>

      {/* File Paths Bar */}
      <div className="bg-neutral-900/60 border-b border-neutral-800/80 px-3 py-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
        <div className="truncate flex-1 flex items-center space-x-1.5">
          <span className="text-neutral-500">Left:</span>
          <span className="text-neutral-300 font-medium truncate">{leftPath || 'Untitled Left'}</span>
          {isDirtyLeft && <span className="text-amber-400 text-[10px] font-bold">(Unsaved)</span>}
        </div>
        <div className="truncate flex-1 text-right flex items-center justify-end space-x-1.5">
          {isDirtyRight && <span className="text-amber-400 text-[10px] font-bold">(Unsaved)</span>}
          <span className="text-neutral-300 font-medium truncate">{rightPath || 'Untitled Right'}</span>
          <span className="text-neutral-500">:Right</span>
        </div>
      </div>

      {/* Main Diff Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {isTableViewActive ? (
          /* CSV Table Mode */
          <CsvCompareView />
        ) : isEditing ? (
          /* Live Edit Mode: Dual Textareas with live typing */
          <div className="flex-1 flex font-mono text-[13px] bg-neutral-950 overflow-hidden divide-x divide-neutral-800">
            {/* Left Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400 border-b border-neutral-800 flex justify-between">
                <span>Left Editor:</span>
                <span>{leftContent.split('\n').length} lines</span>
              </div>
              <textarea
                value={leftContent}
                onChange={(e) => setLeftContent(e.target.value)}
                placeholder="Type or paste left content here..."
                className="flex-1 p-3 bg-neutral-950 text-neutral-100 resize-none font-mono focus:outline-none leading-5"
                spellCheck={false}
              />
            </div>

            {/* Right Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400 border-b border-neutral-800 flex justify-between">
                <span>Right Editor:</span>
                <span>{rightContent.split('\n').length} lines</span>
              </div>
              <textarea
                value={rightContent}
                onChange={(e) => setRightContent(e.target.value)}
                placeholder="Type or paste right content here..."
                className="flex-1 p-3 bg-neutral-950 text-neutral-100 resize-none font-mono focus:outline-none leading-5"
                spellCheck={false}
              />
            </div>
          </div>
        ) : (
          /* Visual Diff View: Virtualized with Merging & Highlighting */
          <>
            {viewMode === 'split' ? <SplitDiffViewer /> : <UnifiedDiffViewer />}
            <DiffMinimap />
          </>
        )}
      </div>
    </div>
  );
};
