import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { DailyCashClosingListPanel } from './DailyCashClosingListPanel';

interface CashDeskPanelProps {
  storeId?: string | null;
}

export const CashDeskPanel: React.FC<CashDeskPanelProps> = ({ storeId }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const selectedStoreId = storeId || 'all';

  const monthLabel = useMemo(() => {
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      const date = new Date(y, m - 1, 1);
      return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(prev.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(next.toISOString().slice(0, 7));
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(new Date().toISOString().slice(0, 7));
  };

  return (
    <div className="space-y-3.5 select-none">
      {/* Month Selector Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-surface p-2 sm:p-2.5 rounded-xl border border-border shadow-2xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold text-fg capitalize">{monthLabel}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer"
            title="Предыдущий месяц"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleCurrentMonth}
            className="px-2 py-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-[11px] font-semibold text-fg transition-colors cursor-pointer"
          >
            Текущий месяц
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer"
            title="Следующий месяц"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Closed Shifts List */}
      <DailyCashClosingListPanel
        month={selectedMonth}
        storeId={selectedStoreId}
      />
    </div>
  );
};
