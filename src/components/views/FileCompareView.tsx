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
  Space,
  Rows,
  CaseSensitive,
  FolderOpen,
  Copy,
  Check,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { useQuickCompareStore } from '../../stores/quickCompareStore';
import { ContextMenu } from '../common/ContextMenu';
import { SplitDiffViewer } from '../viewer/SplitDiffViewer';
import { UnifiedDiffViewer } from '../viewer/UnifiedDiffViewer';
import { DiffMinimap } from '../viewer/DiffMinimap';
import { CodeEditorPane } from '../viewer/CodeEditorPane';
import { CsvCompareView } from './CsvCompareView';
import { detectLanguage } from '../../utils/syntaxHighlighter';

export const FileCompareView: React.FC = () => {
  const activeTab = useTabStore(
    (state) => state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
  );

  const {
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
    changeSideFile,
  } = useTabStore();
  const { selectedLeft, selectLeft, compareWithLeft } = useQuickCompareStore();
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; side: 'left' | 'right' } | null>(null);

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
  const detectedLang = detectLanguage(leftPath || rightPath);

  const getWhitespaceTooltip = () => {
    switch (options.ignore_whitespace) {
      case 'None':
        return 'Whitespace: Include (Click to Trim Ends)';
      case 'LeadingAndTrailing':
        return 'Whitespace: Trim Ends (Click to Ignore All)';
      case 'All':
        return 'Whitespace: Ignore All (Click to Include)';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Top Options Bar - 100% COMPACT ICON BUTTONS as requested */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0 overflow-x-auto scrollbar-none">
        {/* Left Section: View Modes, Edit Mode, and Comparison Filter Rules */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* CSV View Switcher Icons (Table Grid vs Text Diff) */}
          {isCsvFile && (
            <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
              <button
                onClick={() => {
                  if (csvViewMode !== 'table') toggleCsvViewMode();
                }}
                title="Side-by-Side Table View"
                className={`p-1.5 rounded transition-colors ${
                  isTableViewActive
                    ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Table className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (csvViewMode === 'table') toggleCsvViewMode();
                }}
                title="Text Diff View"
                className={`p-1.5 rounded transition-colors ${
                  !isTableViewActive
                    ? 'bg-neutral-800 text-sky-400 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <FileText className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* View Mode Icons (Side-by-Side vs Unified) */}
          {!isTableViewActive && (
            <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
              <button
                onClick={() => setViewMode('split')}
                title="Side-by-Side Diff View"
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'split'
                    ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Columns2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setViewMode('unified')}
                title="Unified Combined View"
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <AlignJustify className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Live Edit Mode Switch */}
          {!isTableViewActive && (
            <button
              onClick={toggleEditing}
              title={isEditing ? 'Switch to Visual Diff mode' : 'Direct multi-line editor mode'}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                isEditing
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:border-neutral-700'
              }`}
            >
              {isEditing ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-sky-400" />
                  <span>Visual Diff</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Editor Mode</span>
                </>
              )}
            </button>
          )}

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Ignore Whitespace Icon Button */}
          <button
            onClick={toggleIgnoreWhitespace}
            title={getWhitespaceTooltip()}
            className={`p-1.5 rounded border transition-colors relative ${
              options.ignore_whitespace !== 'None'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Space className="w-4 h-4" />
            {options.ignore_whitespace !== 'None' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          {/* Ignore Blank Lines Icon Button */}
          <button
            onClick={toggleIgnoreBlankLines}
            title={`Blank Lines: ${options.ignore_blank_lines ? 'Ignore (Active)' : 'Match'}`}
            className={`p-1.5 rounded border transition-colors relative ${
              options.ignore_blank_lines
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Rows className="w-4 h-4" />
            {options.ignore_blank_lines && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          {/* Ignore Case Icon Button */}
          <button
            onClick={toggleIgnoreCase}
            title={`Case: ${options.ignore_case ? 'Ignore (Active)' : 'Match'}`}
            className={`p-1.5 rounded border transition-colors relative ${
              options.ignore_case
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            <CaseSensitive className="w-4 h-4" />
            {options.ignore_case && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {/* Right Section: Navigation, Undo, Save Icons */}
        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
          {/* Swap Sides Icon */}
          <button
            onClick={swapSides}
            title="Swap Left and Right sides"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          {/* Undo / Redo Icons */}
          <button
            onClick={undoAction}
            disabled={history.length === 0}
            title="Undo merge (Cmd+Z / Ctrl+Z)"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={redoAction}
            disabled={future.length === 0}
            title="Redo merge (Cmd+Shift+Z / Ctrl+Y)"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-30 transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Diff Navigation Buttons */}
          <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
            <button
              onClick={() => prevChunk()}
              disabled={totalChunks === 0}
              title="Previous difference (Shift+F7)"
              className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-neutral-400">
              {totalChunks > 0 ? `${activeChunkIndex + 1}/${totalChunks}` : '0'}
            </span>
            <button
              onClick={() => nextChunk()}
              disabled={totalChunks === 0}
              title="Next difference (F7)"
              className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Save Left Icon Button */}
          <button
            onClick={saveLeftFile}
            disabled={!leftPath || !isDirtyLeft}
            title="Save Left File (Cmd+S / Ctrl+S)"
            className={`p-1.5 rounded border transition-colors relative ${
              isDirtyLeft
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                : 'bg-neutral-950 border-neutral-800 text-neutral-500 disabled:opacity-40'
            }`}
          >
            <Save className="w-4 h-4" />
            <span className="absolute -bottom-0.5 right-0.5 text-[8px] font-bold text-sky-400 font-mono">
              L
            </span>
          </button>

          {/* Save Right Icon Button */}
          <button
            onClick={saveRightFile}
            disabled={!rightPath || !isDirtyRight}
            title="Save Right File"
            className={`p-1.5 rounded border transition-colors relative ${
              isDirtyRight
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                : 'bg-neutral-950 border-neutral-800 text-neutral-500 disabled:opacity-40'
            }`}
          >
            <Save className="w-4 h-4" />
            <span className="absolute -bottom-0.5 right-0.5 text-[8px] font-bold text-amber-400 font-mono">
              R
            </span>
          </button>
        </div>
      </div>

      {/* File Paths Bar with dynamic Change File actions & context menu */}
      <div className="bg-neutral-900/60 border-b border-neutral-800/80 px-3 py-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, side: 'left' });
          }}
          className="truncate flex-1 flex items-center space-x-2"
        >
          <span className="text-neutral-500">Left:</span>
          <span className="text-neutral-300 font-medium truncate" title={leftPath || 'Untitled Left'}>
            {leftPath || 'Untitled Left'}
          </span>
          {isDirtyLeft && <span className="text-amber-400 text-[10px] font-bold">(Unsaved)</span>}
          <button
            onClick={() => changeSideFile('left')}
            title="Change Left File (Choose file from disk)"
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 rounded transition-colors shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="hidden lg:flex items-center space-x-2 text-[10px] text-neutral-500 font-sans shrink-0 px-2 select-none">
          {detectedLang && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-emerald-400 font-mono text-[10px] border border-neutral-700">
              {detectedLang.toUpperCase()}
            </span>
          )}
          <span>💡 Double-click line to edit inline | Click Editor Mode for multi-line editing</span>
        </div>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, side: 'right' });
          }}
          className="truncate flex-1 text-right flex items-center justify-end space-x-2"
        >
          <button
            onClick={() => changeSideFile('right')}
            title="Change Right File (Choose file from disk)"
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 rounded transition-colors shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          {isDirtyRight && <span className="text-amber-400 text-[10px] font-bold">(Unsaved)</span>}
          <span className="text-neutral-300 font-medium truncate" title={rightPath || 'Untitled Right'}>
            {rightPath || 'Untitled Right'}
          </span>
          <span className="text-neutral-500">:Right</span>
        </div>
      </div>

      {/* Main Diff Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {isTableViewActive ? (
          /* Side-by-Side Dual Table Mode */
          <CsvCompareView />
        ) : isEditing ? (
          /* Live Edit Mode: Dual CodeEditorPanes with synchronized line numbers */
          <div className="flex-1 flex font-mono text-[13px] bg-neutral-950 overflow-hidden divide-x divide-neutral-800">
            <CodeEditorPane
              title="Left Editor"
              content={leftContent}
              onChange={setLeftContent}
              placeholder="Type or paste left content here..."
              isDirty={isDirtyLeft}
              filePath={leftPath || undefined}
            />
            <CodeEditorPane
              title="Right Editor"
              content={rightContent}
              onChange={setRightContent}
              placeholder="Type or paste right content here..."
              isDirty={isDirtyRight}
              filePath={rightPath || undefined}
            />
          </div>
        ) : (
          /* Visual Diff View: Virtualized with Merging & Highlighting */
          <>
            {viewMode === 'split' ? <SplitDiffViewer /> : <UnifiedDiffViewer />}
            <DiffMinimap />
          </>
        )}
      </div>

      {/* Context Menu for Path Selection & Fast Comparison */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: `Change ${contextMenu.side === 'left' ? 'Left' : 'Right'} File...`,
              icon: <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />,
              onClick: () => changeSideFile(contextMenu.side),
            },
            {
              label: 'Select as Left for Quick Compare',
              icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
              disabled: !(contextMenu.side === 'left' ? leftPath : rightPath),
              onClick: () => {
                const target = contextMenu.side === 'left' ? leftPath : rightPath;
                if (target) selectLeft(target, false);
              },
            },
            ...(selectedLeft && (contextMenu.side === 'left' ? leftPath : rightPath)
              ? [
                  {
                    label: `Compare with Left (${selectedLeft.name})`,
                    icon: <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />,
                    onClick: () => {
                      const target = contextMenu.side === 'left' ? leftPath : rightPath;
                      if (target) compareWithLeft(target, false);
                    },
                  },
                ]
              : []),
            { divider: true },
            {
              label: 'Copy Full Path',
              icon: <Copy className="w-3.5 h-3.5 text-neutral-400" />,
              disabled: !(contextMenu.side === 'left' ? leftPath : rightPath),
              onClick: () => {
                const target = contextMenu.side === 'left' ? leftPath : rightPath;
                if (target) navigator.clipboard.writeText(target);
              },
            },
          ]}
        />
      )}
    </div>
  );
};
