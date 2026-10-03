import React from 'react';
import { useQuickCompareStore } from '../../stores/quickCompareStore';
import { pickPath } from '../../utils/filePicker';
import { X, Layers, FolderOpen } from 'lucide-react';

export const QuickCompareHUD: React.FC = () => {
  const { selectedLeft, clearSelectedLeft, compareWithLeft } = useQuickCompareStore();

  if (!selectedLeft) return null;

  const handlePickRight = async () => {
    const picked = await pickPath(selectedLeft.isFolder ? 'folder' : 'file');
    if (picked) {
      await compareWithLeft(picked, selectedLeft.isFolder);
    }
  };

  return (
    <div
      data-testid="quick-compare-hud"
      className="fixed bottom-8 right-6 z-50 flex items-center space-x-3 bg-neutral-900/95 backdrop-blur border border-emerald-500/50 shadow-2xl rounded-lg px-3.5 py-2 text-xs text-neutral-200 animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div className="flex items-center space-x-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <Layers className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-neutral-400 font-semibold">Left:</span>
        <span
          className="text-neutral-100 font-mono font-bold max-w-[180px] truncate"
          title={selectedLeft.path}
        >
          {selectedLeft.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase font-mono">
          {selectedLeft.isFolder ? 'folder' : 'file'}
        </span>
      </div>

      <div className="h-4 w-px bg-neutral-800" />

      <button
        onClick={handlePickRight}
        title="Browse and select Right item to compare immediately"
        className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold transition-colors shadow-xs"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        <span>Choose Right...</span>
      </button>

      <button
        onClick={clearSelectedLeft}
        title="Cancel Quick Compare selection"
        className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
