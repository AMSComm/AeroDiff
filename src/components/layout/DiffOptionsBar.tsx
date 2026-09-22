import React, { useState } from 'react';
import {
  Columns2,
  AlignJustify,
  ChevronDown,
  ChevronUp,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useDiffStore } from '../../stores/diffStore';
import { IgnoreWhitespace, ViewMode } from '../../types/diff';

export const DiffOptionsBar: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    options,
    setOptions,
    diffResult,
    activeChunkIndex,
    nextChunk,
    prevChunk,
    compareMode,
  } = useDiffStore();

  const [showRegexInput, setShowRegexInput] = useState(false);
  const [regexDraft, setRegexDraft] = useState(options.regex_filter || '');

  if (compareMode !== 'file' && compareMode !== 'text') {
    return null;
  }

  const handleWhitespaceCycle = () => {
    const cycle: Record<IgnoreWhitespace, IgnoreWhitespace> = {
      None: 'LeadingAndTrailing',
      LeadingAndTrailing: 'All',
      All: 'None',
    };
    setOptions({ ignore_whitespace: cycle[options.ignore_whitespace] });
  };

  const applyRegex = () => {
    setOptions({ regex_filter: regexDraft.trim() ? regexDraft.trim() : null });
    setShowRegexInput(false);
  };

  const totalChunks = diffResult?.chunks.length || 0;

  return (
    <div className="h-9 bg-neutral-950 border-b border-neutral-800/80 flex items-center justify-between px-3 text-xs select-none">
      {/* Left: View Mode & Ignore Filters */}
      <div className="flex items-center space-x-2">
        {/* Split vs Unified Toggle */}
        <div className="flex items-center bg-neutral-900 rounded p-0.5 border border-neutral-800">
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              viewMode === 'split'
                ? 'bg-neutral-800 text-neutral-100 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            <span>Side-by-Side</span>
          </button>

          <button
            onClick={() => setViewMode('unified')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              viewMode === 'unified'
                ? 'bg-neutral-800 text-neutral-100 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <AlignJustify className="w-3 h-3" />
            <span>Unified</span>
          </button>
        </div>

        <div className="h-3.5 w-px bg-neutral-800 mx-1" />

        {/* Ignore Whitespace Toggle */}
        <button
          onClick={handleWhitespaceCycle}
          title="Toggle ignore whitespace mode: None -> Trim -> All"
          className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
            options.ignore_whitespace !== 'None'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
          }`}
        >
          Whitespace:{' '}
          <span className="font-mono">
            {options.ignore_whitespace === 'LeadingAndTrailing'
              ? 'Trim Ends'
              : options.ignore_whitespace}
          </span>
        </button>

        {/* Ignore Blank Lines */}
        <button
          onClick={() => setOptions({ ignore_blank_lines: !options.ignore_blank_lines })}
          className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
            options.ignore_blank_lines
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
          }`}
        >
          Ignore Blank Lines
        </button>

        {/* Ignore Case */}
        <button
          onClick={() => setOptions({ ignore_case: !options.ignore_case })}
          className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
            options.ignore_case
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
          }`}
        >
          Ignore Case
        </button>

        {/* Regex Line Filter */}
        <div className="relative">
          <button
            onClick={() => setShowRegexInput(!showRegexInput)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
              options.regex_filter
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>Regex Filter</span>
          </button>

          {showRegexInput && (
            <div className="absolute top-8 left-0 z-50 w-72 bg-neutral-900 border border-neutral-800 p-2.5 rounded-lg shadow-xl">
              <div className="text-[11px] text-neutral-400 mb-1.5 flex items-center justify-between">
                <span>Filter out lines matching Regex:</span>
                <span title="Example: ^// Generated.*">
                  <HelpCircle className="w-3 h-3 text-neutral-500" />
                </span>
              </div>
              <input
                type="text"
                value={regexDraft}
                onChange={(e) => setRegexDraft(e.target.value)}
                placeholder="e.g. ^// Build at.*"
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <div className="flex justify-end space-x-1.5 mt-2">
                <button
                  onClick={() => {
                    setRegexDraft('');
                    setOptions({ regex_filter: null });
                    setShowRegexInput(false);
                  }}
                  className="px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
                >
                  Clear
                </button>
                <button
                  onClick={applyRegex}
                  className="px-2.5 py-0.5 text-[10px] bg-emerald-500 text-neutral-950 font-semibold rounded hover:bg-emerald-400"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Navigation & Stats */}
      <div className="flex items-center space-x-3">
        {/* Fast Hash Banner */}
        {diffResult?.hash_matched && (
          <div className="flex items-center space-x-1 text-emerald-400 text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>100% Byte Identical</span>
          </div>
        )}

        {/* Diff Counter */}
        {diffResult && !diffResult.hash_matched && (
          <div className="flex items-center space-x-2 text-[11px]">
            <span className="text-neutral-400 font-mono">
              {diffResult.chunks.length > 0 ? (
                <>
                  Diff{' '}
                  <span className="text-neutral-200 font-bold">
                    {activeChunkIndex + 1}/{diffResult.chunks.length}
                  </span>
                </>
              ) : (
                <span className="text-neutral-500">No differences</span>
              )}
            </span>

            {/* Breakdown Badges */}
            <div className="flex items-center space-x-1 text-[10px] font-mono">
              {diffResult.added_chunks > 0 && (
                <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  +{diffResult.added_chunks}
                </span>
              )}
              {diffResult.deleted_chunks > 0 && (
                <span className="text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                  -{diffResult.deleted_chunks}
                </span>
              )}
              {diffResult.modified_chunks > 0 && (
                <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                  ~{diffResult.modified_chunks}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center space-x-0.5 bg-neutral-900 p-0.5 rounded border border-neutral-800">
          <button
            onClick={prevChunk}
            disabled={totalChunks === 0}
            title="Previous Difference (Shift+F7)"
            className={`p-1 rounded transition-colors ${
              totalChunks > 0
                ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                : 'text-neutral-600 cursor-not-allowed'
            }`}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={nextChunk}
            disabled={totalChunks === 0}
            title="Next Difference (F7)"
            className={`p-1 rounded transition-colors ${
              totalChunks > 0
                ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                : 'text-neutral-600 cursor-not-allowed'
            }`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
