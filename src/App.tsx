import React, { useEffect } from 'react';
import { useDiffStore } from './stores/diffStore';
import { HeaderToolbar } from './components/layout/HeaderToolbar';
import { DiffOptionsBar } from './components/layout/DiffOptionsBar';
import { StatusBar } from './components/layout/StatusBar';
import { SplitDiffViewer } from './components/viewer/SplitDiffViewer';
import { UnifiedDiffViewer } from './components/viewer/UnifiedDiffViewer';
import { DiffMinimap } from './components/viewer/DiffMinimap';
import { FolderDiffViewer } from './components/folder/FolderDiffViewer';
import { CsvDiffViewer } from './components/csv/CsvDiffViewer';

export const App: React.FC = () => {
  const {
    compareMode,
    viewMode,
    runDiff,
    nextChunk,
    prevChunk,
    undo,
    redo,
    saveLeftFile,
    saveRightFile,
  } = useDiffStore();

  // Run initial diff on mount
  useEffect(() => {
    runDiff();
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F7 or Cmd/Ctrl+Down: Next Diff
      if (e.key === 'F7' && !e.shiftKey) {
        e.preventDefault();
        nextChunk();
      } else if (e.key === 'F7' && e.shiftKey) {
        e.preventDefault();
        prevChunk();
      }

      // Undo: Cmd+Z / Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Redo: Cmd+Shift+Z / Ctrl+Y
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redo();
      }

      // Save: Cmd+S / Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveLeftFile();
        saveRightFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextChunk, prevChunk, undo, redo, saveLeftFile, saveRightFile]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 antialiased select-none font-sans">
      {/* Top Header Toolbar */}
      <HeaderToolbar />

      {/* Diff Options Bar (for Text/File mode) */}
      <DiffOptionsBar />

      {/* Center Dynamic Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {(compareMode === 'file' || compareMode === 'text') && (
          <>
            {viewMode === 'split' ? <SplitDiffViewer /> : <UnifiedDiffViewer />}
            <DiffMinimap />
          </>
        )}

        {compareMode === 'folder' && <FolderDiffViewer />}

        {compareMode === 'csv' && <CsvDiffViewer />}
      </main>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  );
};

export default App;
