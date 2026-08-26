import React from 'react';
import { Search, X, Scan } from 'lucide-react';
import { IconButton } from './IconButton';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onScan?: () => void;
  placeholder?: string;
  className?: string;
}

/** The search+scan input row duplicated near-verbatim across every list screen. */
export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, onScan, placeholder = 'Поиск…', className }) => (
  <div className={`flex items-center gap-2 ${className || ''}`}>
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 rounded-lg bg-surface border border-border pl-9 pr-9 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-fg-subtle hover:text-fg"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
    {onScan && <IconButton icon={Scan} aria-label="Сканировать" onClick={onScan} tone="accent" />}
  </div>
);
