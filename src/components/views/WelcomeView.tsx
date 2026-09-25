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
  History,
  Trash2,
} from 'lucide-react';
import { useTabStore } from '../../stores/tabStore';
import { pickPath, readFileContent, extractDroppedItem } from '../../utils/filePicker';
import { cleanPath } from '../../utils/pathUtils';
import { isTauri, invokeCheckPath, fileContentCache } from '../../utils/ipc';
import { getRecentPaths, saveRecentPath, clearRecentPaths, removeRecentPath } from '../../utils/recentPaths';

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

  // Recent Paths History state
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [showLeftHistory, setShowLeftHistory] = useState(false);
  const [showRightHistory, setShowRightHistory] = useState(false);

  const leftBoxRef = useRef<HTMLDivElement>(null);
  const rightBoxRef = useRef<HTMLDivElement>(null);
  const currentHoverSideRef = useRef<'left' | 'right'>('left');

  // Load recent paths & subscribe to changes
  useEffect(() => {
    setRecentPaths(getRecentPaths());
    const onUpdated = () => setRecentPaths(getRecentPaths());
    window.addEventListener('aerodiff-recent-paths-updated', onUpdated);
    return () => window.removeEventListener('aerodiff-recent-paths-updated', onUpdated);
  }, []);

  /**
   * Helper: Assign a path to either side, detect file/folder, and pre-read content with encoding
   */
  const handleAssignPath = async (
    side: 'left' | 'right',
    rawPath: string
  ) => {
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

      // Pre-read content for files with auto-detected encoding
      if (!isFolder) {
        try {
          const res = await readFileContent(cleaned);
          if (side === 'left') {
            setLeftContent(res.content);
          } else {
            setRightContent(res.content);
          }
          fileContentCache.set(cleaned, res.content);
        } catch (readErr: any) {
          console.warn(`Could not pre-read ${side} file:`, readErr);
          setErrorMessage(readErr?.message || String(readErr));
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
            if (pos && (pos.x !== 0 || pos.y !== 0)) {
              const dpr = window.devicePixelRatio || 1;
              const logicalX = pos.x / dpr;

              const rightRect = rightBoxRef.current?.getBoundingClientRect();
              const leftRect = leftBoxRef.current?.getBoundingClientRect();

              let targetSide: 'left' | 'right' = 'left';

              if (rightRect && leftRect) {
                // Divider boundary between left and right target boxes
                const midBoundary = (leftRect.right + rightRect.left) / 2;
                targetSide = (logicalX >= midBoundary || pos.x >= midBoundary) ? 'right' : 'left';
              } else {
                targetSide = (logicalX >= window.innerWidth / 2 || pos.x >= window.innerWidth / 2) ? 'right' : 'left';
              }

              currentHoverSideRef.current = targetSide;
              setIsLeftDragOver(targetSide === 'left');
              setIsRightDragOver(targetSide === 'right');
            }
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
              // Single drop: check drop coordinates or use hovered target
              let targetSide = currentHoverSideRef.current;
              const pos = payload.position;
              if (pos && (pos.x !== 0 || pos.y !== 0)) {
                const dpr = window.devicePixelRatio || 1;
                const logicalX = pos.x / dpr;
                const rightRect = rightBoxRef.current?.getBoundingClientRect();
                const leftRect = leftBoxRef.current?.getBoundingClientRect();

                if (rightRect && leftRect) {
                  const midBoundary = (leftRect.right + rightRect.left) / 2;
                  targetSide = (logicalX >= midBoundary || pos.x >= midBoundary) ? 'right' : 'left';
                } else {
                  targetSide = (logicalX >= window.innerWidth / 2 || pos.x >= window.innerWidth / 2) ? 'right' : 'left';
                }
              }

              await handleAssignPath(targetSide, paths[0]);
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
            const resL = await readFileContent(lPath);
            lContent = resL.content;
          } catch (e: any) {
            throw new Error(`Failed to read Left file: ${e?.message || e}`);
          }
        }

        if (rContent === undefined) {
          try {
            const resR = await readFileContent(rPath);
            rContent = resR.content;
          } catch (e: any) {
            throw new Error(`Failed to read Right file: ${e?.message || e}`);
          }
        }
      }

      // Save to recent paths history
      saveRecentPath(lPath);
      saveRecentPath(rPath);

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
      {/* Native Browser Datalist for Autocomplete Suggestions */}
      <datalist id="recent-paths-history">
        {recentPaths.map((p, idx) => (
          <option key={idx} value={p} />
        ))}
      </datalist>

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
            High-performance cross-platform diff & merge tool.
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
              className="text-rose-400 hover:text-rose-200 cursor-pointer"
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
                  className="text-neutral-500 hover:text-neutral-300 text-xs p-1 cursor-pointer"
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
                  <span>Drag & drop Left file/folder here, or browse</span>
                )}
              </div>
            </div>

            {/* Path Input Field with Autocomplete & History Menu */}
            <div className="mt-2 space-y-2 relative">
              <div className="relative flex items-center">
                <input
                  type="text"
                  list="recent-paths-history"
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
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 pr-8 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
                />

                {/* History Suggestion Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowLeftHistory(!showLeftHistory);
                    setShowRightHistory(false);
                  }}
                  title="Recent paths suggestion"
                  className={`absolute right-1.5 p-1 rounded hover:bg-neutral-800 transition-colors ${
                    showLeftHistory ? 'text-emerald-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* History Dropdown Menu for Left */}
              {showLeftHistory && (
                <div className="absolute top-8 left-0 w-full z-30 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl py-1 text-xs max-h-52 overflow-y-auto">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-neutral-500 border-b border-neutral-800/80 flex items-center justify-between">
                    <span>Recent Targets</span>
                    {recentPaths.length > 0 && (
                      <button
                        onClick={() => clearRecentPaths()}
                        className="text-rose-400 hover:text-rose-300 flex items-center space-x-1"
                        title="Clear History"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                  {recentPaths.length === 0 ? (
                    <div className="px-3 py-2 text-neutral-500 text-[11px] italic">
                      No recent paths recorded yet
                    </div>
                  ) : (
                    recentPaths.map((p, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          handleAssignPath('left', p);
                          setShowLeftHistory(false);
                        }}
                        className="px-2.5 py-1.5 hover:bg-neutral-800/80 cursor-pointer text-neutral-300 hover:text-white flex items-center justify-between group"
                      >
                        <span className="font-mono text-[11px] truncate flex-1">{p}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentPath(p);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 p-0.5 ml-2"
                          title="Remove from history"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Action Buttons for Left */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={() => handlePick('left', 'file')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-sky-400" />
                  <span>Choose File</span>
                </button>
                <button
                  onClick={() => handlePick('left', 'folder')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors cursor-pointer"
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
                  className="text-neutral-500 hover:text-neutral-300 text-xs p-1 cursor-pointer"
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
                  <span>Drag & drop Right file/folder here, or browse</span>
                )}
              </div>
            </div>

            {/* Path Input Field with Autocomplete & History Menu */}
            <div className="mt-2 space-y-2 relative">
              <div className="relative flex items-center">
                <input
                  type="text"
                  list="recent-paths-history"
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
                  className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 pr-8 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500"
                />

                {/* History Suggestion Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowRightHistory(!showRightHistory);
                    setShowLeftHistory(false);
                  }}
                  title="Recent paths suggestion"
                  className={`absolute right-1.5 p-1 rounded hover:bg-neutral-800 transition-colors ${
                    showRightHistory ? 'text-emerald-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* History Dropdown Menu for Right */}
              {showRightHistory && (
                <div className="absolute top-8 left-0 w-full z-30 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl py-1 text-xs max-h-52 overflow-y-auto">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-neutral-500 border-b border-neutral-800/80 flex items-center justify-between">
                    <span>Recent Targets</span>
                    {recentPaths.length > 0 && (
                      <button
                        onClick={() => clearRecentPaths()}
                        className="text-rose-400 hover:text-rose-300 flex items-center space-x-1"
                        title="Clear History"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                  {recentPaths.length === 0 ? (
                    <div className="px-3 py-2 text-neutral-500 text-[11px] italic">
                      No recent paths recorded yet
                    </div>
                  ) : (
                    recentPaths.map((p, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          handleAssignPath('right', p);
                          setShowRightHistory(false);
                        }}
                        className="px-2.5 py-1.5 hover:bg-neutral-800/80 cursor-pointer text-neutral-300 hover:text-white flex items-center justify-between group"
                      >
                        <span className="font-mono text-[11px] truncate flex-1">{p}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentPath(p);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 p-0.5 ml-2"
                          title="Remove from history"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Action Buttons for Right */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={() => handlePick('right', 'file')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-sky-400" />
                  <span>Choose File</span>
                </button>
                <button
                  onClick={() => handlePick('right', 'folder')}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 rounded text-xs transition-colors cursor-pointer"
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
