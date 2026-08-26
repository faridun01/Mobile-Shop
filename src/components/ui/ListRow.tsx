import React from 'react';
import { cn } from '../../utils/cn';

interface ListRowProps {
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * Shared row for every "browse a list of records" screen (repairs, suppliers,
 * invoices, bonuses, expenses, sales...). `actions` render always-visible —
 * never hover-only, since hover doesn't exist on touch.
 */
export const ListRow: React.FC<ListRowProps> = ({ title, meta, trailing, leading, actions, onClick, className }) => {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
        onClick && 'cursor-pointer active:bg-surface-raised',
        className
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg truncate">{title}</div>
        {meta && <div className="text-xs text-fg-subtle truncate mt-0.5">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
      {actions && (
        <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
};
