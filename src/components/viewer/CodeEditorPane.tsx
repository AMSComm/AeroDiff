import React, { useRef, useState, useEffect, useMemo } from 'react';

interface CodeEditorPaneProps {
  title: string;
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDirty?: boolean;
}

const LINE_HEIGHT = 20;

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  title,
  content,
  onChange,
  placeholder,
  isDirty,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

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

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const top = e.currentTarget.scrollTop;
    setScrollTop(top);
    if (gutterRef.current) {
      gutterRef.current.scrollTop = top;
    }
  };

  const handleGutterWheel = (e: React.WheelEvent) => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop += e.deltaY;
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

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder={placeholder}
          wrap="off"
          spellCheck={false}
          className="flex-1 py-2.5 px-3 bg-neutral-950 text-neutral-100 resize-none font-mono text-[13px] leading-5 focus:outline-none overflow-auto select-text"
        />
      </div>
    </div>
  );
};
