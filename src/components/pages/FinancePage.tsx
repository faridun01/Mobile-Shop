import { getBusinessDateKey } from '../../utils/businessDate';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ProfitReport } from '../finance/ProfitReport';
import { BonusesFinancePanel } from '../finance/BonusesFinancePanel';
import { CashCollectionPanel } from '../finance/CashCollectionPanel';
import { DailyCashClosingListPanel } from '../finance/DailyCashClosingListPanel';
import { useStoreContext } from '../../utils/storeContext';

type Tab = 'REPORT' | 'STORES' | 'CASH' | 'CLOSINGS' | 'BONUSES';
const TABS: { value: Tab; label: string }[] = [
  { value: 'REPORT', label: 'Отчёт' },
  { value: 'STORES', label: 'По магазинам' },
  { value: 'CASH', label: 'Инкассация' },
  { value: 'CLOSINGS', label: 'Закрытие смен' },
  { value: 'BONUSES', label: 'Бонусы' },
];

export const FinancePage: React.FC = () => {
  const { currentUser } = useAppFields('currentUser');
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  const isSeller = currentUser?.role === 'SELLER';

  // The tab lives in the URL (?tab=STORES) so a reload keeps the tab the user was on;
  // no tab param means the report, which is what the page opens on.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tabs = storeCtx.mode === 'STORE' ? TABS.filter((t) => t.value !== 'STORES') : TABS;
  const tab: Tab = urlTab && tabs.some((t) => t.value === urlTab) ? urlTab : 'REPORT';
  const setTab = (next: Tab) => setSearchParams(next === 'REPORT' ? {} : { tab: next }, { replace: true });
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const todayKey = getBusinessDateKey();
  const currentMonth = todayKey.substring(0, 7);
  // Date filter state: month, custom startDate and endDate
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

  const activeMonth = selectedMonth || (startDate ? startDate.slice(0, 7) : currentMonth);

  // Hooks are unconditional above this point — RestrictedAccess for SELLER is decided
  // only in the render output, matching ExpensesPage/ReportsPage's own gating pattern.
  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел финансов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="border-b border-border bg-bg shrink-0 px-3 pt-2 pb-2.5">
        <FilterPillGroup
          options={tabs}
          value={tab}
          onChange={setTab}
          scrollable
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'BONUSES' ? (
          <BonusesFinancePanel
            month={activeMonth}
            onMonthChange={(m) => {
              setSelectedMonth(m);
              setStartDate('');
              setEndDate('');
            }}
          />
        ) : tab === 'CASH' ? (
          <CashCollectionPanel month={activeMonth} storeId={storeCtx.storeId} />
        ) : tab === 'CLOSINGS' ? (
          <DailyCashClosingListPanel month={activeMonth} storeId={storeCtx.storeId} />
        ) : (
          <ProfitReport
            key={tab}
            view={tab === 'REPORT' ? 'summary' : 'stores'}
            month={selectedMonth}
            startDate={startDate}
            endDate={endDate}
            onDateChange={handleDateChange}
            onResetToCurrentMonth={handleResetToCurrentMonth}
          />
        )}
      </div>
    </div>
  );
};
