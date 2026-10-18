import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
  clearable?: boolean;
}

/**
 * Free-text input with a tap-to-see-everything suggestion list — a drop-in replacement for
 * <input list="..."> + <datalist>. The native datalist popup on most mobile browsers (iOS
 * Safari in particular) only appears once the user starts typing, if it appears at all —
 * so on a touch device "known models show up for quick pick" silently never happens.
 * This opens the full option list immediately on focus/tap, narrows it as you type, and
 * still accepts free text for a genuinely new brand/model the list doesn't have yet.
 */
export const Combobox: React.FC<ComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder,
  className,
  required,
  autoFocus,
  clearable = true,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query)) : options;

  return (
    <div className="app-combobox relative" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          required={required}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className={cn('w-full', className, value && clearable ? '!pr-6' : '')}
          autoComplete="off"
        />

        {value && clearable && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setOpen(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors cursor-pointer select-none"
            title="Очистить"
            aria-label="Очистить"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg py-1">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              // Preserve the input focus on pointer down; activate on click so Enter/Space
              // and assistive-technology activation select the option as well.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-raised hover:text-accent transition-colors truncate"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
