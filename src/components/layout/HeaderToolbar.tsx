import React from 'react';
import {
  FileText,
  FolderTree,
  Table,
  ArrowLeftRight,
  Save,
  RotateCcw,
  RotateCw,
  Share2,
  FolderOpen,
  Zap,
} from 'lucide-react';
import { useDiffStore } from '../../stores/diffStore';
import { CompareMode } from '../../types/diff';
import { isTauri } from '../../utils/ipc';

export const HeaderToolbar: React.FC = () => {
  const {
    compareMode,
    setCompareMode,
    leftPath,
    rightPath,
    setLeftPath,
    setRightPath,
    swapSides,
    undo,
    redo,
    history,
    future,
    saveLeftFile,
    saveRightFile,
    diffResult,
    leftContent,
    rightContent,
  } = useDiffStore();

  const handleOpenLeft = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: compareMode === 'folder',
      });
      if (selected && typeof selected === 'string') {
        setLeftPath(selected);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            useDiffStore.getState().setLeftContent(reader.result as string);
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  };

  const handleOpenRight = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        directory: compareMode === 'folder',
      });
      if (selected && typeof selected === 'string') {
        setRightPath(selected);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            useDiffStore.getState().setRightContent(reader.result as string);
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  };

  const exportHtmlReport = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AeroDiff Report</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, monospace; background: #0f172a; color: #f8fafc; padding: 24px; }
    h1 { font-size: 20px; border-bottom: 1px solid #334155; padding-bottom: 12px; }
    .meta { color: #94a3b8; font-size: 13px; margin-bottom: 20px; }
    .table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .table td { padding: 4px 8px; border-bottom: 1px solid #1e293b; }
    .num { width: 40px; color: #64748b; text-align: right; user-select: none; }
    .added { background: rgba(34, 197, 94, 0.2); }
    .deleted { background: rgba(239, 68, 68, 0.2); }
    .modified { background: rgba(234, 179, 8, 0.2); }
  </style>
</head>
<body>
  <h1>AeroDiff Comparison Report</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleString()} | Left: ${leftPath || 'Untitled Left'} | Right: ${rightPath || 'Untitled Right'}
  </div>
  <table class="table">
    ${(diffResult?.lines || [])
      .map(
        (l) => `
      <tr class="${l.line_type.toLowerCase()}">
        <td class="num">${l.left_line_num || ''}</td>
        <td>${escapeHtml(l.left_text || '')}</td>
        <td class="num">${l.right_line_num || ''}</td>
        <td>${escapeHtml(l.right_text || '')}</td>
      </tr>`
      )
      .join('')}
  </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aerodiff-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  return (
    <header className="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 shrink-0 select-none text-xs">
      {/* Brand & Tabs */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 font-bold tracking-tight text-neutral-100 text-sm">
          <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
          <span>AeroDiff</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            v0.1
          </span>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
          <button
            onClick={() => setCompareMode('file')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-colors ${
              compareMode === 'file'
                ? 'bg-neutral-800 text-neutral-100 font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>File & Text</span>
          </button>

          <button
            onClick={() => setCompareMode('folder')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-colors ${
              compareMode === 'folder'
                ? 'bg-neutral-800 text-neutral-100 font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Folders</span>
          </button>

          <button
            onClick={() => setCompareMode('csv')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-colors ${
              compareMode === 'csv'
                ? 'bg-neutral-800 text-neutral-100 font-medium shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>CSV Table</span>
          </button>
        </div>
      </div>

      {/* Center: File paths / Quick Open */}
      <div className="flex items-center space-x-2 flex-1 max-w-xl mx-4">
        {/* Left target */}
        <div className="flex-1 flex items-center bg-neutral-950 px-2 py-1 rounded border border-neutral-800 text-neutral-400 truncate">
          <FolderOpen className="w-3 h-3 mr-1.5 shrink-0 text-neutral-500" />
          <span className="truncate flex-1 font-mono text-[11px]">
            {leftPath ? leftPath.split('/').pop() : 'Left Content (Editable)'}
          </span>
          <button
            onClick={handleOpenLeft}
            className="text-[10px] ml-1.5 text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-1.5 py-0.5 rounded"
          >
            Open
          </button>
        </div>

        {/* Swap Sides Button */}
        <button
          onClick={swapSides}
          title="Swap Left and Right sides"
          className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        {/* Right target */}
        <div className="flex-1 flex items-center bg-neutral-950 px-2 py-1 rounded border border-neutral-800 text-neutral-400 truncate">
          <FolderOpen className="w-3 h-3 mr-1.5 shrink-0 text-neutral-500" />
          <span className="truncate flex-1 font-mono text-[11px]">
            {rightPath ? rightPath.split('/').pop() : 'Right Content (Editable)'}
          </span>
          <button
            onClick={handleOpenRight}
            className="text-[10px] ml-1.5 text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-1.5 py-0.5 rounded"
          >
            Open
          </button>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-1.5">
        <button
          onClick={undo}
          disabled={history.length === 0}
          title="Undo merge (Cmd+Z / Ctrl+Z)"
          className={`p-1.5 rounded transition-colors ${
            history.length > 0
              ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              : 'text-neutral-600 cursor-not-allowed'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={redo}
          disabled={future.length === 0}
          title="Redo merge (Cmd+Shift+Z / Ctrl+Y)"
          className={`p-1.5 rounded transition-colors ${
            future.length > 0
              ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              : 'text-neutral-600 cursor-not-allowed'
          }`}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-neutral-800 mx-1" />

        {leftPath && (
          <button
            onClick={saveLeftFile}
            title="Save Left File (Ctrl+S)"
            className="flex items-center space-x-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            <Save className="w-3 h-3 text-emerald-400" />
            <span>Save L</span>
          </button>
        )}

        {rightPath && (
          <button
            onClick={saveRightFile}
            title="Save Right File"
            className="flex items-center space-x-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            <Save className="w-3 h-3 text-emerald-400" />
            <span>Save R</span>
          </button>
        )}

        <button
          onClick={exportHtmlReport}
          title="Export Standalone HTML Report"
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors font-medium"
        >
          <Share2 className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
