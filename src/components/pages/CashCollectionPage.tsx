import React, { useState } from 'react';
import { HandCoins, Store as StoreIcon } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { CashCollectionPanel } from '../finance/CashCollectionPanel';
import { DateRangePicker } from '../ui/DateRangePicker';
import { getBusinessDateKey, currentBusinessMonth } from '../../utils/businessDate';

export const CashCollectionPage: React.FC = () => {
  const { stores } = useAppFields('stores');
  const todayKey = getBusinessDateKey();
  const currentMonth = todayKey.substring(0, 7);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');

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

  const isTodaySelected = Boolean(startDate && (!endDate || startDate === endDate) && startDate === todayKey);
  const selectableStores = stores.filter((s) => !s.isMainWarehouse);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <HandCoins className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight">
              Инкассация
            </h1>
            <p className="text-[11px] text-fg-subtle">
              Сдача наличных касс магазинов в центральную кассу и на бонусный счёт
            </p>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Store Filter */}
          <div className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-xl px-2.5 h-9">
            <StoreIcon className="w-3.5 h-3.5 text-fg-subtle" />
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-fg focus:outline-none cursor-pointer"
            >
              <option value="all">Все магазины</option>
              {selectableStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Picker (Range, Month, Day) */}
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            selectedMonth={selectedMonth || undefined}
            currentMonthStr={currentBusinessMonth()}
            isToday={isTodaySelected}
            onChange={handleDateChange}
            onResetMonth={handleResetToCurrentMonth}
            className="shrink-0"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
        <div className="max-w-4xl mx-auto">
          <CashCollectionPanel
            month={selectedMonth}
            startDate={startDate}
            endDate={endDate}
            storeId={selectedStoreId === 'all' ? null : selectedStoreId}
            onSelectStoreId={(id) => setSelectedStoreId(id || 'all')}
          />
        </div>
      </div>
    </div>
  );
};
