import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, items }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Ensure menu stays within window boundaries
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - (items.length * 32 + 20));

  return (
    <div
      ref={menuRef}
      style={{ left: Math.max(10, adjustedX), top: Math.max(10, adjustedY) }}
      className="fixed z-50 min-w-[210px] bg-neutral-900 border border-neutral-800 rounded-md shadow-2xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={index} className="h-px bg-neutral-800 my-1" />;
        }

        return (
          <button
            key={index}
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
              item.disabled
                ? 'opacity-30 cursor-not-allowed text-neutral-500'
                : item.danger
                ? 'text-rose-400 hover:bg-rose-500/15'
                : 'text-neutral-200 hover:bg-neutral-800 hover:text-emerald-400'
            }`}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span className="truncate flex-1 font-medium">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
