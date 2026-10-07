import React, { useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ProfitReport } from '../finance/ProfitReport';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { getBusinessDateKey } from '../../utils/businessDate';
import {
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../ui/Button';

export const FinancePage: React.FC = () => {
  const { currentUser, todayRate } = useAppFields(
    'currentUser',
    'todayRate'
  );

  const isSeller = currentUser?.role === 'SELLER';
  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Date filter state for ProfitReport
  const todayKey = getBusinessDateKey();
  const currentMonth = todayKey.substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleDateChange = (start: string, end: string, monthStr?: string) => {
    setStartDate(start);
    setEndDate(end);
    setSelectedMonth(monthStr || '');
  };

  const handleResetToCurrentMonth = () => {
    setSelectedMonth(currentMonth);
    setStartDate('');
    setEndDate('');
  };

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('business-data-changed'));
    setStatus({ tone: 'success', text: 'Данные отчётов обновлены' });
  };

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел отчётов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  const pageTitle = 'Отчёты';

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight flex items-center gap-2">
              {pageTitle}
              {currentUser?.role === 'ADMIN' && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  1 USD = {rate.toFixed(2)} TJS
                </span>
              )}
            </h1>
            <p className="text-[11px] text-fg-subtle">
              Финансовые результаты, доходы, расходы и маржинальность бизнеса
            </p>
          </div>
        </div>

        {/* Quick Actions Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={RefreshCw}
            onClick={handleRefresh}
            className="h-9 px-2.5 text-xs cursor-pointer"
            title="Обновить данные"
          >
            <span className="hidden sm:inline">Обновить</span>
          </Button>
        </div>
      </div>

      {/* Main Report Content */}
      <div className="flex-1 overflow-y-auto">
        <ProfitReport
          key="profit-report"
          view="summary"
          month={selectedMonth}
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          onResetToCurrentMonth={handleResetToCurrentMonth}
        />
      </div>
    </div>
  );
};
