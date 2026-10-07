import React, { useState } from 'react';
import { HandCoins, RefreshCw, Calendar, Store as StoreIcon } from 'lucide-react';
import { useAppFields } from '../../context/AppContext';
import { CashCollectionPanel } from '../finance/CashCollectionPanel';
import { Button } from '../ui/Button';

export const CashCollectionPage: React.FC = () => {
  const { stores } = useAppFields('stores');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('business-data-changed'));
    setRefreshKey((k) => k + 1);
  };

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

          {/* Month Picker */}
          <div className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-xl px-2.5 h-9">
            <Calendar className="w-3.5 h-3.5 text-fg-subtle" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-semibold text-fg focus:outline-none cursor-pointer"
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={RefreshCw}
            onClick={handleRefresh}
            className="h-9 px-3"
            title="Обновить"
          >
            <span className="hidden sm:inline">Обновить</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div key={refreshKey} className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
        <div className="max-w-7xl mx-auto">
          <div className="bg-surface rounded-2xl border border-border shadow-xs p-4 sm:p-5">
            <CashCollectionPanel
              month={selectedMonth}
              storeId={selectedStoreId === 'all' ? null : selectedStoreId}
              onSelectStoreId={(id) => setSelectedStoreId(id || 'all')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
