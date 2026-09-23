import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  ArrowRight,
  FolderOpen,
  FileCode,
  FileText,
  UploadCloud,
  X,
  AlertCircle,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { pickPath, readFileContent, extractDroppedItem } from '../../utils/filePicker';
import { cleanPath } from '../../utils/pathUtils';
import { isTauri, invokeCheckPath, fileContentCache } from '../../utils/ipc';

export const WelcomeView: React.FC = () => {
  const { startCompareInActiveTab, updateActiveTab } = useTabStore();

  const [leftPath, setLeftPath] = useState('');
  const [rightPath, setRightPath] = useState('');
  const [leftKind, setLeftKind] = useState<'file' | 'folder' | null>(null);
  const [rightKind, setRightKind] = useState<'file' | 'folder' | null>(null);
  const [leftContent, setLeftContent] = useState<string | undefined>(undefined);
  const [rightContent, setRightContent] = useState<string | undefined>(undefined);

  const [isLeftDragOver, setIsLeftDragOver] = useState(false);
  const [isRightDragOver, setIsRightDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const leftBoxRef = useRef<HTMLDivElement>(null);
  const rightBoxRef = useRef<HTMLDivElement>(null);

  /**
   * Helper: Assign a path to either side, detect file/folder, and pre-read content
   */
  const handleAssignPath = async (side: 'left' | 'right', rawPath: string) => {
    const cleaned = cleanPath(rawPath);
    if (!cleaned) return;

    setErrorMessage(null);

    try {
      const info = await invokeCheckPath(cleaned);
      const isFolder = info.is_dir;

      if (side === 'left') {
        setLeftPath(cleaned);
        setLeftKind(isFolder ? 'folder' : 'file');
      } else {
        setRightPath(cleaned);
        setRightKind(isFolder ? 'folder' : 'file');
      }

      // Pre-read content for files
      if (!isFolder) {
        try {
          const content = await readFileContent(cleaned);
          if (side === 'left') {
            setLeftContent(content);
          } else {
            setRightContent(content);
          }
          fileContentCache.set(cleaned, content);
        } catch (readErr: any) {
          console.warn(`Could not pre-read ${side} file:`, readErr);
        }
      } else {
        if (side === 'left') setLeftContent(undefined);
        else setRightContent(undefined);
      }
    } catch (err: any) {
      setErrorMessage(`Failed to check path '${cleaned}': ${err?.message || err}`);
    }
  };

  /**
   * Native Tauri Drag & Drop Hook:
   * WKWebView / WebView2 intercept OS file drag events natively.
   * onDragDropEvent provides physical coordinates and paths array.
   */
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
          const payload = event.payload;

          if (payload.type === 'enter' || payload.type === 'over') {
            const pos = payload.position;
            const logicalX = pos ? pos.x / (window.devicePixelRatio || 1) : 0;
            const isLeft = logicalX < window.innerWidth / 2;
            setIsLeftDragOver(isLeft);
            setIsRightDragOver(!isLeft);
          } else if (payload.type === 'leave') {
            setIsLeftDragOver(false);
            setIsRightDragOver(false);
          } else if (payload.type === 'drop') {
            setIsLeftDragOver(false);
            setIsRightDragOver(false);
            const paths = payload.paths;
            if (!paths || paths.length === 0) return;

            if (paths.length >= 2) {
              // Smart dual-drop: 1st file/folder to Left, 2nd to Right
              await handleAssignPath('left', paths[0]);
              await handleAssignPath('right', paths[1]);
            } else {
              // Single drop: check drop coordinate
              const pos = payload.position;
              const logicalX = pos ? pos.x / (window.devicePixelRatio || 1) : 0;
              const side = logicalX < window.innerWidth / 2 ? 'left' : 'right';
              await handleAssignPath(side, paths[0]);
            }
          }
        });

        unlisten = unlistenFn;
      } catch (err) {
        console.warn('Could not register Tauri dragDropEvent listener:', err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  /**
   * File / Folder Picker handlers
   */
  const handlePick = async (side: 'left' | 'right', type: 'file' | 'folder') => {
    setErrorMessage(null);
    const chosen = await pickPath(type);
    if (chosen) {
      await handleAssignPath(side, chosen);
    }
  };

  /**
   * HTML5 Drag & Drop handlers (fallback for web browser & Playwright)
   */
  const handleHtml5Drop = async (e: React.DragEvent, side: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setErrorMessage(null);

    if (side === 'left') setIsLeftDragOver(false);
    else setIsRightDragOver(false);

    const dropped = await extractDroppedItem(e);
    if (dropped) {
      const cleaned = cleanPath(dropped.path);
      if (side === 'left') {
        setLeftPath(cleaned);
        setLeftKind(dropped.isFolder ? 'folder' : 'file');
        if (dropped.content !== undefined) {
          setLeftContent(dropped.content);
          fileContentCache.set(cleaned, dropped.content);
        }
      } else {
        setRightPath(cleaned);
        setRightKind(dropped.isFolder ? 'folder' : 'file');
        if (dropped.content !== undefined) {
          setRightContent(dropped.content);
          fileContentCache.set(cleaned, dropped.content);
        }
      }
    }
  };

  /**
   * Start Comparison in Active Tab
   */
  const handleStartComparison = async () => {
    const lPath = cleanPath(leftPath);
    const rPath = cleanPath(rightPath);

    if (!lPath || !rPath) {
      setErrorMessage('Please select or specify targets for both Left and Right sides.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      let lContent = leftContent;
      let rContent = rightContent;

      const isFolder = leftKind === 'folder' || rightKind === 'folder';

      // If not folder, ensure both contents are loaded
      if (!isFolder) {
        if (lContent === undefined) {
          try {
            lContent = await readFileContent(lPath);
          } catch (e: any) {
            throw new Error(`Failed to read Left file: ${e?.message || e}`);
          }
        }

        if (rContent === undefined) {
          try {
            rContent = await readFileContent(rPath);
          } catch (e: any) {
            throw new Error(`Failed to read Right file: ${e?.message || e}`);
          }
        }
      }

      await startCompareInActiveTab(lPath, rPath, {
        leftContent: lContent,
        rightContent: rContent,
        forceType: isFolder ? 'folder' : undefined,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start comparison.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenScratchpadText = () => {
    updateActiveTab({
      type: 'file',
      title: 'Text Diff',
      leftContent: '// Paste or type Left text here\n',
      rightContent: '// Paste or type Right text here\n',
      isEditing: true,
    });
  };

  const canStart = leftPath.trim().length > 0 && rightPath.trim().length > 0 && !isLoading;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-950 text-neutral-100 overflow-y-auto select-none">
      <div className="w-full max-w-4xl bg-neutral-900/90 border border-neutral-800 rounded-xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center space-x-2 text-emerald-400 font-bold text-xl tracking-tight">
            <Zap className="w-5 h-5 fill-emerald-400/20" />
            <span>AeroDiff</span>
            <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-medium">
              v0.1
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            High-performance cross-platform diff & merge tool for files, folders, and tabular data.
          </p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Side-by-Side Target Selectors with Drag & Drop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* === LEFT TARGET CONTAINER === */}
          <div
            ref={leftBoxRef}
            onDragOver={(e) => {
              e.preventDefault();
              setIsLeftDragOver(true);
            }}
            onDragLeave={() => setIsLeftDragOver(false)}
            onDrop={(e) => handleHtml5Drop(e, 'left')}
            className={`flex flex-col bg-neutral-950 rounded-lg p-4 border transition-all ${
              isLeftDragOver
                ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                : leftPath
                ? 'border-neutral-700'
                : 'border-neutral-800 border-dashed'
            }`}
          >
            {/* Header & Type Indicator */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wide">
                  Left Target
                </span>
                {leftKind && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                    {leftKind}
                  </span>
                )}
              </div>

              {leftPath && (
                <button
                  onClick={() => {
                    setLeftPath('');
                    setLeftKind(null);
                    setLeftContent(undefined);
                  }}
                  className="text-neutral-500 hover:text-neutral-300 text-xs p-1"
                  title="Clear Left Target"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropzone Area / Info Display */}
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-neutral-400 space-y-2">
              <UploadCloud
                className={`w-8 h-8 transition-colors ${
                  isLeftDragOver ? 'text-emerald-400' : 'text-neutral-600'
                }`}
              />
              <div className="text-xs">
                {leftPath ? (
                  <span className="font-mono text-emerald-400 break-all font-medium">
                    {leftPath.split(/[/\\]/).pop()}
                  </span>
                ) : (
                  <span>Drag & drop a file or folder here, or browse</span>
                )}
              </div>
            </div>

            {/* Path Input Field */}
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={leftPath}
                onChange={(e) => {
                  setLeftPath(e.target.value);
                  setLeftKind(null);
                  setLeftContent(undefined);
                }}
                onBlur={() => {
                  if (leftPath.trim()) handleAssignPath('left', leftPath);
                }}
                placeholder="Path to left file or directory..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
              />

              {/* Action Buttons for Left */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePick('left', 'file')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5 text-sky-400" />
                  <span>Choose File</span>
                </button>
                <button
                  onClick={() => handlePick('left', 'folder')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Choose Folder</span>
                </button>
              </div>
            </div>
          </div>

          {/* === RIGHT TARGET CONTAINER === */}
          <div
            ref={rightBoxRef}
            onDragOver={(e) => {
              e.preventDefault();
              setIsRightDragOver(true);
            }}
            onDragLeave={() => setIsRightDragOver(false)}
            onDrop={(e) => handleHtml5Drop(e, 'right')}
            className={`flex flex-col bg-neutral-950 rounded-lg p-4 border transition-all ${
              isRightDragOver
                ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                : rightPath
                ? 'border-neutral-700'
                : 'border-neutral-800 border-dashed'
            }`}
          >
            {/* Header & Type Indicator */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wide">
                  Right Target
                </span>
                {rightKind && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                    {rightKind}
                  </span>
                )}
              </div>

              {rightPath && (
                <button
                  onClick={() => {
                    setRightPath('');
                    setRightKind(null);
                    setRightContent(undefined);
                  }}
                  className="text-neutral-500 hover:text-neutral-300 text-xs p-1"
                  title="Clear Right Target"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropzone Area / Info Display */}
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-neutral-400 space-y-2">
              <UploadCloud
                className={`w-8 h-8 transition-colors ${
                  isRightDragOver ? 'text-emerald-400' : 'text-neutral-600'
                }`}
              />
              <div className="text-xs">
                {rightPath ? (
                  <span className="font-mono text-emerald-400 break-all font-medium">
                    {rightPath.split(/[/\\]/).pop()}
                  </span>
                ) : (
                  <span>Drag & drop a file or folder here, or browse</span>
                )}
              </div>
            </div>

            {/* Path Input Field */}
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={rightPath}
                onChange={(e) => {
                  setRightPath(e.target.value);
                  setRightKind(null);
                  setRightContent(undefined);
                }}
                onBlur={() => {
                  if (rightPath.trim()) handleAssignPath('right', rightPath);
                }}
                placeholder="Path to right file or directory..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
              />

              {/* Action Buttons for Right */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePick('right', 'file')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5 text-sky-400" />
                  <span>Choose File</span>
                </button>
                <button
                  onClick={() => handlePick('right', 'folder')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Choose Folder</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleStartComparison}
            disabled={!canStart}
            className="flex-1 w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-neutral-950 font-bold rounded-lg text-sm transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
          >
            <span>{isLoading ? 'Loading...' : 'Start Compare'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenScratchpadText}
            className="w-full sm:w-auto px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 font-medium rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-neutral-400" />
            <span>Compare Text (Scratchpad)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
