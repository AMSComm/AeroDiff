import React from 'react';
import { Plus, X, FileText, FolderTree, Table, Home } from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { TabType } from '../../types/tab';

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTabId, closeTab, createTab } = useTabStore();

  const getTabIcon = (type: TabType) => {
    switch (type) {
      case 'file':
        return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case 'folder':
        return <FolderTree className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'csv':
        return <Table className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      default:
        return <Home className="w-3.5 h-3.5 text-neutral-400 shrink-0" />;
    }
  };

  return (
    <div className="h-9 bg-neutral-950 border-b border-neutral-800 flex items-center px-1 space-x-1 select-none overflow-x-auto shrink-0 scrollbar-none">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDirty = tab.isDirtyLeft || tab.isDirtyRight;

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            title={tab.title}
            className={`group h-7 max-w-xs min-w-36 px-2.5 flex items-center justify-between space-x-2 rounded-t text-xs cursor-pointer transition-colors border-t-2 ${
              isActive
                ? 'bg-neutral-900 text-neutral-100 border-emerald-500 font-medium'
                : 'bg-neutral-950/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 border-transparent'
            }`}
          >
            <div className="flex items-center space-x-1.5 truncate">
              {getTabIcon(tab.type)}
              <span className="truncate">{tab.title}</span>
              {isDirty && (
                <span
                  title="Unsaved changes"
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                />
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              title="Close Tab (Cmd+W)"
              className="p-0.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 opacity-60 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* New Tab Button */}
      <button
        onClick={() => createTab('welcome')}
        title="Open New Compare Tab"
        className="p-1 rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 transition-colors shrink-0 ml-1"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
