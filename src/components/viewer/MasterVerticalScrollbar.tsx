import React, { useRef, useCallback, useEffect } from 'react';

interface MasterVerticalScrollbarProps {
  scrollTop: number;
  totalHeight: number;
  viewportHeight: number;
  onScrollChange: (newScrollTop: number) => void;
  className?: string;
}

export const MasterVerticalScrollbar: React.FC<MasterVerticalScrollbarProps> = ({
  scrollTop,
  totalHeight,
  viewportHeight,
  onScrollChange,
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);

  const maxScroll = Math.max(0, totalHeight - viewportHeight);
  const isScrollable = maxScroll > 0 && viewportHeight > 0;

  // Calculate thumb height with minimum grab size of 28px
  const thumbHeight = isScrollable
    ? Math.max(28, Math.min(viewportHeight, (viewportHeight / totalHeight) * viewportHeight))
    : 0;

  const maxThumbTop = Math.max(0, viewportHeight - thumbHeight);
  const thumbTop = isScrollable && maxThumbTop > 0
    ? Math.min(maxThumbTop, Math.max(0, (scrollTop / maxScroll) * maxThumbTop))
    : 0;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isScrollable) return;
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartScrollTopRef.current = scrollTop;
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current || maxThumbTop <= 0) return;
        const deltaY = moveEvent.clientY - dragStartYRef.current;
        const deltaScroll = (deltaY / maxThumbTop) * maxScroll;
        const targetScroll = Math.max(0, Math.min(maxScroll, dragStartScrollTopRef.current + deltaScroll));
        onScrollChange(targetScroll);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [isScrollable, maxScroll, maxThumbTop, onScrollChange, scrollTop]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isScrollable || !trackRef.current || maxThumbTop <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickY = e.clientY - rect.top;

      // Jump centering the thumb on the click position
      const targetThumbTop = clickY - thumbHeight / 2;
      const targetScroll = Math.max(0, Math.min(maxScroll, (targetThumbTop / maxThumbTop) * maxScroll));
      onScrollChange(targetScroll);
    },
    [isScrollable, maxScroll, maxThumbTop, onScrollChange, thumbHeight]
  );

  // Wheel event directly on scrollbar track
  const handleTrackWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isScrollable) return;
      e.preventDefault();
      e.stopPropagation();
      const targetScroll = Math.max(0, Math.min(maxScroll, scrollTop + e.deltaY));
      onScrollChange(targetScroll);
    },
    [isScrollable, maxScroll, onScrollChange, scrollTop]
  );

  return (
    <div
      ref={trackRef}
      data-testid="master-vertical-scrollbar"
      onClick={handleTrackClick}
      onWheel={handleTrackWheel}
      title="Master Vertical Scrollbar"
      className={`w-3 bg-neutral-900/90 border-l border-neutral-800 shrink-0 relative select-none cursor-pointer z-10 ${className}`}
      style={{ height: '100%' }}
    >
      {isScrollable && (
        <div
          data-testid="master-scrollbar-thumb"
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0.5 right-0.5 rounded-sm bg-neutral-500 hover:bg-neutral-400 active:bg-neutral-300 transition-colors cursor-grab active:cursor-grabbing shadow-xs"
          style={{
            top: `${thumbTop}px`,
            height: `${thumbHeight}px`,
          }}
        />
      )}
    </div>
  );
};
