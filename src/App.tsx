import React, { useEffect } from 'react';
import { useTabStore } from './stores/tabStore';
import { TabBar } from './components/tabs/TabBar';
import { WelcomeView } from './components/views/WelcomeView';
import { FolderCompareView } from './components/views/FolderCompareView';
import { FileCompareView } from './components/views/FileCompareView';
import { CsvCompareView } from './components/views/CsvCompareView';
import { StatusBar } from './components/layout/StatusBar';

export const App: React.FC = () => {
  const {
    getActiveTab,
    createTab,
    closeTab,
    nextChunk,
    prevChunk,
    undoAction,
    redoAction,
    saveLeftFile,
    saveRightFile,
  } = useTabStore();

  const activeTab = getActiveTab();

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // New Tab: Cmd+T / Ctrl+T
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        createTab('welcome');
      }

      // Close Tab: Cmd+W / Ctrl+W
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const current = useTabStore.getState().getActiveTab();
        if (current) closeTab(current.id);
      }

      // Diff navigation: F7 / Shift+F7
      if (e.key === 'F7' && !e.shiftKey) {
        e.preventDefault();
        nextChunk();
      } else if (e.key === 'F7' && e.shiftKey) {
        e.preventDefault();
        prevChunk();
      }

      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoAction();
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redoAction();
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
  }, [createTab, closeTab, nextChunk, prevChunk, undoAction, redoAction, saveLeftFile, saveRightFile]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 antialiased font-sans">
      {/* Top Tab Bar */}
      <TabBar />

      {/* Main Active Tab Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {(!activeTab || activeTab.type === 'welcome') && <WelcomeView />}
        {activeTab?.type === 'folder' && <FolderCompareView />}
        {activeTab?.type === 'file' && <FileCompareView />}
        {activeTab?.type === 'csv' && <CsvCompareView />}
      </main>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  );
};

export default App;
