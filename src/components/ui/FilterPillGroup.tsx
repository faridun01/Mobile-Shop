import React from 'react';
import { cn } from '../../utils/cn';

export interface FilterPillOption<T extends string = string> {
  value: T;
  label: string;
}

interface FilterPillGroupProps<T extends string = string> {
  options: FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  scrollable?: boolean;
}

/** Shared segmented/pill filter — covers period toggles, brand filters, category filters, status filters. */
export function FilterPillGroup<T extends string = string>({
  options,
  value,
  onChange,
  className,
  scrollable,
}: FilterPillGroupProps<T>) {
  return (
    <div className={cn('flex gap-1.5', scrollable ? 'overflow-x-auto scrollbar-none' : 'flex-wrap', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'shrink-0 h-9 px-3 rounded-lg border text-xs font-semibold transition-colors',
              active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted hover:text-fg'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
