import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Users,
  Truck,
  HandCoins,
  ArrowUpRight,
  Package,
  Store as StoreIcon,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Landmark,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { CashDeskSummary } from '../../types';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { LoadingState } from '../ui/Skeleton';
import { useAppFields } from '../../context/AppContext';
import { DailyCashClosingListPanel } from './DailyCashClosingListPanel';

interface CashDeskPanelProps {
  storeId?: string | null;
}

export const CashDeskPanel: React.FC<CashDeskPanelProps> = ({ storeId }) => {
  const navigate = useNavigate();
  const { stores, setSelectedStoreId, currentUser } = useAppFields('stores', 'setSelectedStoreId', 'currentUser');
  // Cash collection, the customer base and suppliers are ADMIN-only pages.
  const isAdmin = currentUser?.role === 'ADMIN';

  const [data, setData] = useState<CashDeskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const selectedStoreId = storeId || 'all';

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/cash-desk/summary${selectedStoreId !== 'all' ? `?storeId=${encodeURIComponent(selectedStoreId)}` : ''}`;
      const res = await apiClient<CashDeskSummary>(url);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить данные кассы');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const handleUpdate = () => loadSummary();
    window.addEventListener('business-data-changed', handleUpdate);
    return () => window.removeEventListener('business-data-changed', handleUpdate);
  }, [loadSummary]);

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

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col h-64 bg-bg items-center justify-center p-8">
        <LoadingState label="Загрузка данных кассы…" />
      </div>
    );
  }

  const isCentral = selectedStoreId === 'all';
  const currentStore = stores.find((s) => s.id === selectedStoreId);
  const currentStoreName = currentStore?.name || (isCentral ? 'Центральная касса + магазины' : 'Магазин');
  const storeRegisters = (data?.cash?.stores || []).filter((s) => !s.isMainWarehouse);
  const centralCash = data?.cash?.central;

  return (
    <div className="space-y-3.5 select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {error && (
        <div className="p-2.5 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
          {error}
        </div>
      )}


      {/* 1. COMPACT KPI METRICS: КАССА, СКЛАД, КЛИЕНТЫ, ПОСТАВЩИКИ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* КАРТОЧКА 1: ДЕНЬГИ В КАССЕ */}
        <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2 transition-shadow hover:shadow-xs">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Banknote className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  {isCentral ? 'В кассе (Всего)' : 'В кассе точки'}
                </span>
                <div className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 leading-tight truncate">
                  {formatMoney(data?.cash.totalTjs || 0)} TJS
                </div>
              </div>
            </div>
            {isAdmin && <button
              type="button"
              onClick={() => navigate('/cash-collection')}
              className="p-1 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors cursor-pointer shrink-0"
              title="Перейти к инкассации"
            >
              <HandCoins className="w-3.5 h-3.5" />
            </button>}
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center justify-between pt-1.5 border-t border-border/50">
            <span className="font-mono font-medium">≈ ${formatMoney(data?.cash.totalUsd || 0)} USD</span>
            <span className="text-[9px] text-fg-subtle truncate max-w-28">
              {isCentral ? 'Центральная + точки' : formatStoreName(currentStoreName)}
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 2: ТОВАРЫ ПО СЕБЕСТОИМОСТИ */}
        <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2 transition-shadow hover:shadow-xs">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Склад товаров
                </span>
                <div className="text-base sm:text-lg font-black font-mono text-indigo-600 dark:text-indigo-400 leading-tight truncate">
                  ${formatMoney(data?.inventory.totalCostUsd || 0)} USD
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="p-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти на склад"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
            </button>
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center justify-between pt-1.5 border-t border-border/50">
            <span className="font-mono font-medium">≈ {formatMoney(data?.inventory.totalCostTjs || 0)} TJS</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{data?.inventory.totalCount || 0} шт. (товары)</span>
          </div>
        </div>

        {/* КАРТОЧКА 3: ДОЛГИ КЛИЕНТОВ */}
        <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2 transition-shadow hover:shadow-xs">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Долги клиентов
                </span>
                <div className="text-base sm:text-lg font-black font-mono text-amber-600 dark:text-amber-400 leading-tight truncate">
                  {formatMoney(data?.customers.totalDebtTjs || 0)} TJS
                </div>
              </div>
            </div>
            {isAdmin && <button
              type="button"
              onClick={() => navigate('/customers')}
              className="p-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти к клиентам"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
            </button>}
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center justify-between pt-1.5 border-t border-border/50">
            <span className="font-mono font-medium">≈ ${formatMoney(data?.customers.totalDebtUsd || 0)} USD</span>
            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{data?.customers.debtorsCount || 0} чел.</span>
          </div>
        </div>

        {/* КАРТОЧКА 4: ДОЛГИ ПОСТАВЩИКАМ */}
        <div className="p-3 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2 transition-shadow hover:shadow-xs">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-danger/15 border border-danger/25 flex items-center justify-center text-danger shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Поставщикам
                </span>
                <div className="text-base sm:text-lg font-black font-mono text-danger leading-tight truncate">
                  ${formatMoney(data?.suppliers.totalDebtUsd || 0)} USD
                </div>
              </div>
            </div>
            {isAdmin && <button
              type="button"
              onClick={() => navigate('/suppliers')}
              className="p-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти к поставщикам"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
            </button>}
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center justify-between pt-1.5 border-t border-border/50">
            <span className="font-mono font-medium">≈ {formatMoney(data?.suppliers.totalDebtTjs || 0)} TJS</span>
            <span className="font-mono text-danger font-bold">{data?.suppliers.debtorsCount || 0} пост.</span>
          </div>
        </div>
      </div>

      {/* 2. РАСПРЕДЕЛЕНИЕ СРЕДСТВ: ЦЕНТРАЛЬНАЯ КАССА И РОЗНИЧНЫЕ МАГАЗИНЫ */}
      {isCentral && (
        <div className="space-y-2.5">
          {/* КАРТОЧКА ЦЕНТРАЛЬНОЙ КАССЫ */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-br from-accent/10 via-surface to-surface border border-accent/25 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 text-accent flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-bold text-fg">Центральная касса</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent/15 text-accent font-semibold border border-accent/20">
                    Основной фонд
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle truncate mt-0.5">
                  Сюда поступает выручка после инкассации магазинов
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
              <div className="text-left sm:text-right">
                <div className="text-base sm:text-lg font-black font-mono text-accent leading-tight">
                  {formatMoney(centralCash?.cashTjs || 0)} TJS
                </div>
                <div className="text-[10px] font-mono text-fg-subtle">
                  ≈ ${formatMoney(centralCash?.cashUsd || 0)} USD
                </div>
              </div>

              {isAdmin && <button
                type="button"
                onClick={() => navigate('/cash-collection')}
                className="h-8 px-2.5 rounded-lg bg-accent text-accent-fg text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>Инкассация</span>
              </button>}
            </div>
          </div>

          {/* КАССЫ МАГАЗИНОВ (ТОЛЬКО РОЗНИЧНЫЕ ТОЧКИ, БЕЗ СКЛАДА) */}
          {storeRegisters.length > 0 && (
            <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StoreIcon className="w-4 h-4 text-accent" />
                  <h2 className="text-xs sm:text-sm font-bold text-fg">Остатки в кассах магазинов</h2>
                </div>
                <span className="text-[10px] text-fg-subtle">
                  Выручка до инкассации ({storeRegisters.length})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {storeRegisters.map((st) => {
                  const hasCash = (st.cashTjs || 0) > 0;
                  return (
                    <div
                      key={st.id}
                      onClick={() => setSelectedStoreId(st.id)}
                      className="p-2.5 rounded-lg bg-surface-raised border border-border hover:border-accent/40 transition-all flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-fg truncate">{formatStoreName(st.name)}</span>
                          {hasCash ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 font-semibold border border-amber-500/25">
                              К инкассации
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-fg-subtle/10 text-fg-subtle font-medium">
                              Инкассировано
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-fg-subtle">
                          ≈ ${formatMoney(st.cashUsd)} USD
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs sm:text-sm font-black font-mono block ${hasCash ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-subtle'}`}>
                          {formatMoney(st.cashTjs)} TJS
                        </span>
                        <span className="text-[9px] text-accent font-semibold hover:underline">
                          Смотреть →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. ЗАКРЫТЫЕ СМЕНЫ / Z-ОТЧЕТЫ (ТОЛЬКО ДЛЯ РОЗНИЧНЫХ МАГАЗИНОВ, В ЦЕНТРАЛЬНОЙ КАССЕ СМЕН НЕТ) */}
      {!isCentral && (
        <div className="space-y-2.5 pt-1">
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

          {/* Closed Shifts Panel */}
          <DailyCashClosingListPanel
            month={selectedMonth}
            storeId={selectedStoreId}
          />
        </div>
      )}
    </div>
  );
};
