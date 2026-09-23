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
  CheckCircle2,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { SplitDiffViewer } from '../viewer/SplitDiffViewer';
import { UnifiedDiffViewer } from '../viewer/UnifiedDiffViewer';
import { DiffMinimap } from '../viewer/DiffMinimap';

export const FileCompareView: React.FC = () => {
  const {
    getActiveTab,
    updateActiveTab,
    toggleEditing,
    setViewMode,
    toggleIgnoreWhitespace,
    toggleIgnoreBlankLines,
    toggleIgnoreCase,
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
  if (!activeTab || activeTab.type !== 'file') return null;

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
  } = activeTab;

  const totalChunks = diffResult?.chunks.length || 0;

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden text-xs">
      {/* Top Options Bar - 100% BUTTONS as requested */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0 overflow-x-auto scrollbar-none">
        {/* Left Section: View, Edit Mode, and Ignore Rules */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* View Mode Buttons */}
          <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'split'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Side-by-Side</span>
            </button>

            <button
              onClick={() => setViewMode('unified')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'unified'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span>Unified</span>
            </button>
          </div>

          {/* Live Edit Mode Button */}
          <button
            onClick={toggleEditing}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              isEditing
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            <span>{isEditing ? 'Xem Diff & Merge' : 'Chỉnh sửa trực tiếp'}</span>
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Ignore Whitespace Button */}
          <button
            onClick={toggleIgnoreWhitespace}
            title="Bỏ qua khoảng trắng: Tắt -> Cắt đầu/cuối -> Tất cả"
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              options.ignore_whitespace !== 'None'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Khoảng trắng:{' '}
            <span className="font-mono">
              {options.ignore_whitespace === 'None'
                ? 'Tắt'
                : options.ignore_whitespace === 'LeadingAndTrailing'
                ? 'Cắt đầu/cuối'
                : 'Tất cả'}
            </span>
          </button>

          {/* Ignore Blank Lines Button */}
          <button
            onClick={toggleIgnoreBlankLines}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              options.ignore_blank_lines
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Dòng trống: {options.ignore_blank_lines ? 'Bỏ qua' : 'So sánh'}
          </button>

          {/* Ignore Case Button */}
          <button
            onClick={toggleIgnoreCase}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              options.ignore_case
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Chữ hoa/thường: {options.ignore_case ? 'Bỏ qua' : 'Phân biệt'}
          </button>
        </div>

        {/* Right Section: Navigation, Undo, Save */}
        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
          {/* Swap Sides Button */}
          <button
            onClick={swapSides}
            title="Đổi nội dung bên Trái và bên Phải"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* Undo / Redo */}
          <button
            onClick={undoAction}
            disabled={history.length === 0}
            title="Hoàn tác (Cmd+Z / Ctrl+Z)"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={redoAction}
            disabled={future.length === 0}
            title="Làm lại (Cmd+Shift+Z / Ctrl+Y)"
            className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-neutral-800 mx-1" />

          {/* Diff Navigation Buttons */}
          <div className="flex items-center bg-neutral-950 p-0.5 rounded border border-neutral-800">
            <span className="px-2 text-[11px] font-mono text-neutral-400">
              {totalChunks > 0 ? `${activeChunkIndex + 1}/${totalChunks}` : '0 diff'}
            </span>
            <button
              onClick={prevChunk}
              disabled={totalChunks === 0}
              title="Diff trước đó (Shift+F7)"
              className="p-1 rounded text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={nextChunk}
              disabled={totalChunks === 0}
              title="Diff tiếp theo (F7)"
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
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              isDirtyLeft
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-sm'
                : 'bg-neutral-950 border border-neutral-800 text-neutral-500 disabled:opacity-50'
            }`}
          >
            <Save className="w-3 h-3" />
            <span>Lưu Trái</span>
          </button>

          <button
            onClick={saveRightFile}
            disabled={!rightPath || !isDirtyRight}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              isDirtyRight
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400 shadow-sm'
                : 'bg-neutral-950 border border-neutral-800 text-neutral-500 disabled:opacity-50'
            }`}
          >
            <Save className="w-3 h-3" />
            <span>Lưu Phải</span>
          </button>
        </div>
      </div>

      {/* File Paths Bar */}
      <div className="bg-neutral-900/60 border-b border-neutral-800/80 px-3 py-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
        <div className="truncate flex-1 flex items-center space-x-1.5">
          <span className="text-neutral-500">Trái:</span>
          <span className="text-neutral-300 font-medium truncate">{leftPath || 'Untitled Left'}</span>
          {isDirtyLeft && <span className="text-amber-400 text-[10px] font-bold">(Chưa lưu)</span>}
        </div>
        <div className="truncate flex-1 text-right flex items-center justify-end space-x-1.5">
          {isDirtyRight && <span className="text-amber-400 text-[10px] font-bold">(Chưa lưu)</span>}
          <span className="text-neutral-300 font-medium truncate">{rightPath || 'Untitled Right'}</span>
          <span className="text-neutral-500">:Phải</span>
        </div>
      </div>

      {/* Main Diff Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {isEditing ? (
          /* Live Edit Mode: Dual Textareas with live typing */
          <div className="flex-1 flex font-mono text-[13px] bg-neutral-950 overflow-hidden divide-x divide-neutral-800">
            {/* Left Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400 border-b border-neutral-800 flex justify-between">
                <span>Soạn thảo Bên Trái:</span>
                <span>{leftContent.split('\n').length} dòng</span>
              </div>
              <textarea
                value={leftContent}
                onChange={(e) => setLeftContent(e.target.value)}
                placeholder="Nhập hoặc dán nội dung bên trái vào đây..."
                className="flex-1 p-3 bg-neutral-950 text-neutral-100 resize-none font-mono focus:outline-none leading-5"
                spellCheck={false}
              />
            </div>

            {/* Right Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400 border-b border-neutral-800 flex justify-between">
                <span>Soạn thảo Bên Phải:</span>
                <span>{rightContent.split('\n').length} dòng</span>
              </div>
              <textarea
                value={rightContent}
                onChange={(e) => setRightContent(e.target.value)}
                placeholder="Nhập hoặc dán nội dung bên phải vào đây..."
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
