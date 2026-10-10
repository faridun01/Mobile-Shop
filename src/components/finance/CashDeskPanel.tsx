import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Users,
  Truck,
  Package,
  HandCoins,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { CashDeskSummary } from '../../types';
import { useAppFields } from '../../context/AppContext';
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
  const navigate = useNavigate();
  const { stores, currentUser } = useAppFields('stores', 'currentUser');
  const isAdmin = currentUser?.role === 'ADMIN';

  const [summaryData, setSummaryData] = useState<CashDeskSummary | null>(null);
  const currentMonth = useMemo(() => getLocalCurrentMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const selectedStoreId = storeId || 'all';
  const isCurrentMonth = selectedMonth >= currentMonth;
  const isCentral = selectedStoreId === 'all';
  const currentStore = stores.find((s) => s.id === selectedStoreId);

  const loadSummary = useCallback(async () => {
    try {
      const url = `/cash-desk/summary${selectedStoreId !== 'all' ? `?storeId=${encodeURIComponent(selectedStoreId)}` : ''}`;
      const res = await apiClient<CashDeskSummary>(url);
      setSummaryData(res);
    } catch {
      // ignore
    }
  }, [selectedStoreId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const handleUpdate = () => void loadSummary();
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
      {/* 1. 4 KPI КАРТОЧКИ: КАССА, СКЛАД, КЛИЕНТЫ, ПОСТАВЩИКИ (USD в основном, TJS альтернативно) */}
      {/* 1. 4 KPI КАРТОЧКИ: КАССА, СКЛАД, КЛИЕНТЫ, ПОСТАВЩИКИ (USD в основном, TJS альтернативно) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* КАРТОЧКА 1: ДЕНЬГИ В КАССЕ */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2.5 transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
            {isAdmin && isCentral && (
              <button
                type="button"
                onClick={() => navigate('/cash-collection')}
                className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors cursor-pointer shrink-0"
                title="Перейти к инкассации"
              >
                <HandCoins className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block leading-tight">
              {isCentral ? 'В кассе (Всего)' : 'В кассе точки'}
            </span>
            <div className="text-lg sm:text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 leading-tight tabular-nums">
              ${formatMoney(summaryData?.cash.totalUsd || 0)}
            </div>
          </div>
          <div className="pt-2 border-t border-border/50 text-[10.5px] text-fg-subtle flex flex-col gap-0.5">
            <span className="font-mono font-medium text-fg-muted whitespace-nowrap">
              ≈ {formatMoney(summaryData?.cash.totalTjs || 0)} TJS
            </span>
            <span className="text-[10px] text-fg-subtle leading-tight">
              {isCentral ? 'Центральная + точки' : formatStoreName(currentStore?.name || 'Касса')}
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 2: СКЛАД ТОВАРОВ */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2.5 transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="p-1.5 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти на склад"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
            </button>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block leading-tight">
              Склад товаров
            </span>
            <div className="text-lg sm:text-xl font-black font-mono text-indigo-600 dark:text-indigo-400 leading-tight tabular-nums">
              ${formatMoney(summaryData?.inventory.totalCostUsd || 0)}
            </div>
          </div>
          <div className="pt-2 border-t border-border/50 text-[10.5px] text-fg-subtle flex flex-col gap-0.5">
            <span className="font-mono font-medium text-fg-muted whitespace-nowrap">
              ≈ {formatMoney(summaryData?.inventory.totalCostTjs || 0)} TJS
            </span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-[10px] leading-tight">
              {summaryData?.inventory.totalCount || 0} шт. (товары)
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 3: ДОЛГИ КЛИЕНТОВ */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2.5 transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            {(isAdmin || currentUser?.role === 'PARTNER') && (
              <button
                type="button"
                onClick={() => navigate('/customers')}
                className="p-1.5 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
                title="Перейти к клиентам"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
              </button>
            )}
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block leading-tight">
              Долги клиентов
            </span>
            <div className="text-lg sm:text-xl font-black font-mono text-amber-600 dark:text-amber-400 leading-tight tabular-nums">
              ${formatMoney(summaryData?.customers.totalDebtUsd || 0)}
            </div>
          </div>
          <div className="pt-2 border-t border-border/50 text-[10.5px] text-fg-subtle flex flex-col gap-0.5">
            <span className="font-mono font-medium text-fg-muted whitespace-nowrap">
              ≈ {formatMoney(summaryData?.customers.totalDebtTjs || 0)} TJS
            </span>
            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold text-[10px] leading-tight">
              {summaryData?.customers.debtorsCount || 0} чел.
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 4: ДОЛГИ ПОСТАВЩИКАМ */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-2.5 transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="w-8 h-8 rounded-lg bg-danger/15 border border-danger/25 flex items-center justify-center text-danger shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/suppliers')}
                className="p-1.5 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
                title="Перейти к поставщикам"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
              </button>
            )}
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block leading-tight">
              Долг поставщикам
            </span>
            <div className="text-lg sm:text-xl font-black font-mono text-danger leading-tight tabular-nums">
              ${formatMoney(summaryData?.suppliers.totalDebtUsd || 0)}
            </div>
          </div>
          <div className="pt-2 border-t border-border/50 text-[10.5px] text-fg-subtle flex flex-col gap-0.5">
            <span className="font-mono font-medium text-fg-muted whitespace-nowrap">
              ≈ {formatMoney(summaryData?.suppliers.totalDebtTjs || 0)} TJS
            </span>
            <span className="font-mono text-danger font-bold text-[10px] leading-tight">
              {summaryData?.suppliers.debtorsCount || 0} пост.
            </span>
          </div>
        </div>
      </div>

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

      {/* Closed Shifts List with Day Sorting and Filtering */}
      <DailyCashClosingListPanel
        month={selectedMonth}
        storeId={selectedStoreId}
        onMonthChange={setSelectedMonth}
      />
    </div>
  );
};
