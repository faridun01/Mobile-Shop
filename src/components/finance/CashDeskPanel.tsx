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

const getLocalCurrentMonth = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const getPrevMonth = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  if (m <= 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
};

const getNextMonth = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  if (m >= 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
};

export const CashDeskPanel: React.FC<CashDeskPanelProps> = ({ storeId }) => {
  const currentMonth = useMemo(() => getLocalCurrentMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const selectedStoreId = storeId || 'all';
  const isCurrentMonth = selectedMonth >= currentMonth;

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
    setSelectedMonth((prev) => getPrevMonth(prev));
  };

  const handleNextMonth = () => {
    if (isCurrentMonth) return;
    setSelectedMonth((prev) => getNextMonth(prev));
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(currentMonth);
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
            className="p-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer active:scale-95"
            title="Предыдущий месяц"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleCurrentMonth}
            disabled={isCurrentMonth}
            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
              isCurrentMonth
                ? 'bg-accent/10 border-accent/30 text-accent cursor-default'
                : 'bg-surface-raised border-border hover:bg-surface text-fg cursor-pointer active:scale-95'
            }`}
            title={isCurrentMonth ? 'Выбран текущий месяц' : 'Вернуться на текущий месяц'}
          >
            Текущий месяц
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isCurrentMonth}
            className="p-1 rounded-lg bg-surface-raised border border-border text-fg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:not-disabled:bg-surface active:not-disabled:scale-95"
            title={isCurrentMonth ? 'Текущий месяц (будущие месяцы недоступны)' : 'Следующий месяц'}
            aria-disabled={isCurrentMonth}
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
