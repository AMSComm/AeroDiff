import React, { useRef, useMemo } from 'react';

interface CodeEditorPaneProps {
  title: string;
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isDirty?: boolean;
}

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  title,
  content,
  onChange,
  placeholder,
  isDirty,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => content.split('\n'), [content]);
  const lineCount = lines.length;

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleGutterWheel = (e: React.WheelEvent) => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop += e.deltaY;
    }
  };

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
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          onWheel={handleGutterWheel}
          className="w-12 bg-neutral-900/90 text-neutral-500 text-right pr-2.5 select-none text-[11px] leading-5 shrink-0 border-r border-neutral-800 font-mono py-2.5 overflow-hidden shadow-[1px_0_0_#27272a]"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="h-5 leading-5 truncate">
              {i + 1}
            </div>
          ))}
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
