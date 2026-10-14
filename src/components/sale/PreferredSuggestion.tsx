import React from 'react';
import { Star } from 'lucide-react';
import type { Device } from '../../types';

interface PreferredSuggestionProps {
  suggestion: Device;
  onReplace: () => void;
  compact?: boolean;
}

/** "Sell this identical phone first" — the dearer unit; its cost itself is never shown here. */
export const PreferredSuggestion: React.FC<PreferredSuggestionProps> = ({ suggestion, onReplace, compact }) => (
  <div className={`mt-1.5 rounded-lg bg-info/10 border border-info/30 flex items-center justify-between gap-2 ${compact ? 'p-1.5 text-[10.5px]' : 'p-2 text-xs'}`}>
    <span className="text-fg-muted flex items-start gap-1 min-w-0">
      <Star className="w-3.5 h-3.5 text-info shrink-0 mt-px" />
      <span>Рекомендуется продать сначала такой же телефон: IMEI <strong className="font-mono">{suggestion.imei}</strong></span>
    </span>
    <button
      type="button"
      onClick={onReplace}
      className={`rounded-md bg-info text-white font-bold shrink-0 cursor-pointer ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}
    >
      Заменить
    </button>
  </div>
);
