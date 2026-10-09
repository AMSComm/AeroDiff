import React, { useRef, useState, useEffect, useMemo } from 'react';
import { detectLanguage, highlightCodeHtml } from '../../utils/syntaxHighlighter';

interface CodeEditorPaneProps {
  title: string;
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDirty?: boolean;
  filePath?: string;
  language?: string | null;
}

const LINE_HEIGHT = 20;
const EDITOR_FONT_STYLE: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  fontSize: '13px',
  lineHeight: '20px',
  tabSize: 2,
  boxSizing: 'border-box',
};

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  title,
  content,
  onChange,
  placeholder,
  isDirty,
  filePath,
  language,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const lang = useMemo(() => language ?? detectLanguage(filePath), [language, filePath]);

  // Syntax highlighting HTML via Prism. Falls back to plaintext if unsupported or file > 250KB
  const highlightedHtml = useMemo(() => {
    if (!lang || !content || content.length > 250_000) return null;
    return highlightCodeHtml(content, lang);
  }, [content, lang]);

  const isHighlighted = Boolean(highlightedHtml);

  // Fast newline counting without massive array allocation
  const lineCount = useMemo(() => {
    if (!content) return 1;
    let count = 1;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) count++;
    }
    return count;
  }, [content]);

  // Track viewport height with ResizeObserver
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight || 600);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setViewportHeight(entry.contentRect.height);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  // Keep backdrop scroll in sync with textarea
  useEffect(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [content]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const top = e.currentTarget.scrollTop;
    const left = e.currentTarget.scrollLeft;
    setScrollTop(top);
    if (gutterRef.current) {
      gutterRef.current.scrollTop = top;
    }
    if (backdropRef.current) {
      backdropRef.current.scrollTop = top;
      backdropRef.current.scrollLeft = left;
    }
  };

  const handleGutterWheel = (e: React.WheelEvent) => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop += e.deltaY;
    }
  };

  // Indent with 2 spaces on Tab key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      onChange(newVal);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      });
    }
  };

  // Virtualized line number window: render only visible rows + padding buffer
  const startIdx = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 5);
  const endIdx = Math.min(lineCount, Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + 5);

  const visibleLineNumbers: number[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    visibleLineNumbers.push(i + 1);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-950 font-mono text-[13px]">
      {/* Editor Header */}
      <div className="bg-neutral-900/90 px-3 py-1.5 text-[11px] text-neutral-400 border-b border-neutral-800 flex justify-between items-center select-none shrink-0 font-sans">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-neutral-300">{title}</span>
          {isDirty && <span className="text-amber-400 font-bold text-[10px]">(Unsaved)</span>}
          {lang && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-emerald-400 font-mono text-[9px] border border-neutral-700">
              {lang.toUpperCase()}
            </span>
          )}
        </div>
        <span className="text-neutral-500 text-[10px]">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>

      {/* Editor Body with Gutter & Textarea */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Virtualized Line Numbers Gutter */}
        <div
          ref={gutterRef}
          onWheel={handleGutterWheel}
          className="w-12 bg-neutral-900/90 text-neutral-500 text-right pr-2.5 select-none text-[11px] leading-5 shrink-0 border-r border-neutral-800 font-mono py-2.5 overflow-hidden shadow-[1px_0_0_#27272a]"
        >
          <div
            style={{
              height: lineCount * LINE_HEIGHT,
              paddingTop: startIdx * LINE_HEIGHT,
              boxSizing: 'border-box',
            }}
          >
            {visibleLineNumbers.map((num) => (
              <div key={num} className="h-5 leading-5 truncate">
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Editor Area with Syntax Backdrop & Native Textarea */}
        <div className="flex-1 relative overflow-hidden bg-neutral-950">
          {/* Highlighted Backdrop */}
          {isHighlighted && (
            <pre
              ref={backdropRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden py-2.5 px-3 m-0 font-mono text-[13px] leading-5 whitespace-pre border-none select-none text-neutral-100"
              style={EDITOR_FONT_STYLE}
            >
              <code
                dangerouslySetInnerHTML={{ __html: highlightedHtml! }}
                className="font-mono text-[13px] leading-5 whitespace-pre block p-0 m-0 border-none"
                style={EDITOR_FONT_STYLE}
              />
            </pre>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className={`absolute inset-0 w-full h-full py-2.5 px-3 m-0 resize-none font-mono text-[13px] leading-5 focus:outline-none overflow-auto select-text border-none ${
              isHighlighted
                ? 'bg-transparent text-transparent caret-neutral-100 selection:bg-sky-500/30 selection:text-transparent'
                : 'bg-neutral-950 text-neutral-100 selection:bg-neutral-800'
            }`}
            style={EDITOR_FONT_STYLE}
          />
        </div>
      </div>
    </div>
  );
};
