import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface MonthPickerProps {
  /** 'YYYY-MM', same format the native <input type="month"> this replaces used. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Drop-in replacement for <input type="month">. The native picker's calendar popup always
 * renders in the browser/OS locale — on an English-locale machine that means English month
 * names no matter what language the rest of the app is in, with no way to override it from
 * HTML/CSS. This renders its own dropdown instead, so month names are always Russian and
 * picking one applies immediately (no separate "confirm" step some native pickers require).
 */
export const MonthPicker: React.FC<MonthPickerProps> = ({ value, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [valueYearStr, valueMonthStr] = value.split('-');
  const valueYear = Number(valueYearStr) || undefined;
  const valueMonth = Number(valueMonthStr) || undefined; // 1-indexed

  // The year shown in the grid can be paged independently of the actual selection —
  // reset to the selected year every time the popover is (re)opened.
  const [viewYear, setViewYear] = useState<number>(valueYear || new Date().getFullYear());
  useEffect(() => {
    if (open) setViewYear(valueYear || new Date().getFullYear());
  }, [open, valueYear]);

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

  const label = valueMonth && valueYear ? `${MONTH_NAMES_RU[valueMonth - 1]} ${valueYear}` : 'Выберите месяц';

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('inline-flex items-center gap-1.5 cursor-pointer', className)}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-52 rounded-lg border border-border bg-surface shadow-lg p-2">
          <div className="flex items-center justify-between mb-1.5">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Предыдущий год"
              className="p-1 rounded-md hover:bg-surface-raised text-fg-muted"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-fg-muted">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Следующий год"
              className="p-1 rounded-md hover:bg-surface-raised text-fg-muted"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES_RU.map((name, idx) => {
              const isSelected = valueYear === viewYear && valueMonth === idx + 1;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(`${viewYear}-${String(idx + 1).padStart(2, '0')}`);
                    setOpen(false);
                  }}
                  className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                    isSelected ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-raised'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
