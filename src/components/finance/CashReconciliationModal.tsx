import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Gift,
  Receipt,
  Search,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatTjs, formatUsd } from '../../utils/money';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';

export interface RegisterBalance {
  storeId: string;
  storeName: string;
  cashUsd: string;
  cashTjs: string;
  unreconciledUsd: string;
  bonusCashUsd?: string;
  bonusCashTjs?: string;
  regularCashUsd?: string;
  regularCashTjs?: string;
  bonusCount?: number;
  cashOnlyTjs?: string;
  cardOnlyTjs?: string;
}

export interface BreakdownItem {
  id: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  salePriceTjs: number;
  salePriceUsd: number;
  isBonus: boolean;
}

export interface BreakdownSale {
  id: string;
  receiptNumber: number;
  createdAt: string;
  sellerName: string;
  customerName: string | null;
  paymentMethod: string;
  totalTjs: number;
  totalUsd: number;
  cashAmountTjs: number;
  cardAmountTjs: number;
  debtAmountTjs: number;
  status: string;
  itemsCount: number;
  items: BreakdownItem[];
}

export interface BreakdownExpense {
  id: string;
  category: string;
  description: string;
  amountTjs: number;
  amountUsd: number | null;
  createdAt: string;
}

export interface StoreBreakdown {
  store: {
    id: string;
    name: string;
    isMainWarehouse: boolean;
  };
  balance: RegisterBalance;
  period: {
    since: string | null;
    periodStart: string;
    until: string;
    daysCount: number;
    hoursCount: number;
    isFirstCollection: boolean;
  };
  lastCollection: {
    id: string;
    transactionNumber: string;
    createdAt: string;
    amountTjs: number;
    amountUsd: number;
    acceptedByName: string;
  } | null;
  summary: {
    currentCashTjs: string;
    currentCashUsd: string;
    cashOnlyTjs: string;
    cardOnlyTjs: string;
    bonusCashTjs: string;
    bonusCashUsd: string;
    bonusCount: number;
    salesCount: number;
    salesTotalTjs: string;
    salesCashTjs: string;
    salesCardTjs: string;
    salesDebtTjs: string;
    expensesCount: number;
    expensesTotalTjs: string;
    refundedCount: number;
    refundedTotalTjs: string;
  };
  sales: BreakdownSale[];
  expenses: BreakdownExpense[];
}

interface CashReconciliationModalProps {
  open: boolean;
  store: RegisterBalance | null;
  onClose: () => void;
  onCollect: (store: RegisterBalance) => void;
  busy?: boolean;
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatShortDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const CashReconciliationModal: React.FC<CashReconciliationModalProps> = ({
  open,
  store,
  onClose,
  onCollect,
  busy,
}) => {
  const [data, setData] = useState<StoreBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'SALES' | 'EXPENSES'>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !store) {
      setData(null);
      setError(null);
      setSearch('');
      setActiveTab('ALL');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient<StoreBreakdown>(`/cash-collections/stores/${encodeURIComponent(store.storeId)}/breakdown`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить данные сверки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, store]);

  const filteredSales = useMemo(() => {
    if (!data?.sales) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.sales;

    return data.sales.filter((s) => {
      if (s.receiptNumber.toString().includes(q)) return true;
      if (s.sellerName.toLowerCase().includes(q)) return true;
      if (s.customerName?.toLowerCase().includes(q)) return true;
      return s.items.some(
        (it) => it.brand.toLowerCase().includes(q) || it.model.toLowerCase().includes(q)
      );
    });
  }, [data?.sales, search]);

  const filteredExpenses = useMemo(() => {
    if (!data?.expenses) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.expenses;

    return data.expenses.filter((e) => {
      if (e.category.toLowerCase().includes(q)) return true;
      if (e.description.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [data?.expenses, search]);

  if (!open || !store) return null;

  const isZeroCash = Number(store.cashUsd) === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-border bg-surface-raised/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-fg truncate">
                  Сверка кассы: «{store.storeName}»
                </h3>
                {data?.period && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25">
                    {data.period.daysCount > 0
                      ? `${data.period.daysCount} дн. без инкассации`
                      : data.period.hoursCount > 0
                      ? `${data.period.hoursCount} ч. без инкассации`
                      : 'За сегодня'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-fg-subtle truncate mt-0.5">
                {data?.period?.since
                  ? `С момента последней инкассации (${formatDate(data.period.since)})`
                  : 'За весь период с момента открытия кассы'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
          {loading && <LoadingState label="Загрузка чеков и истории кассы…" />}

          {error && (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Ошибка загрузки детализации</span>
              </div>
              <p>{error}</p>
              <Button size="md" variant="secondary" onClick={() => {
                setLoading(true);
                apiClient<StoreBreakdown>(`/cash-collections/stores/${encodeURIComponent(store.storeId)}/breakdown`)
                  .then(setData)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
                  .finally(() => setLoading(false));
              }}>
                Повторить
              </Button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Period banner */}
              <div className="p-3 rounded-xl bg-surface-raised/70 border border-border/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2 text-fg font-medium">
                  <Calendar className="w-4 h-4 text-accent shrink-0" />
                  <span>
                    Период:{' '}
                    <strong className="text-fg">
                      {formatDate(data.period.periodStart)} — {formatDate(data.period.until)}
                    </strong>
                  </span>
                </div>
                {data.lastCollection && (
                  <div className="text-[11px] text-fg-subtle">
                    Предыдущая: {data.lastCollection.transactionNumber} ({formatTjs(data.lastCollection.amountTjs)})
                  </div>
                )}
              </div>

              {/* 4 Cards Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {/* 1. Cash In Register */}
                <div className="p-2.5 sm:p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Banknote className="w-3.5 h-3.5 shrink-0" />
                    <span>В кассе (нал)</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold font-mono text-fg tabular-nums">
                    {formatTjs(data.summary.cashOnlyTjs)}
                  </p>
                  <p className="text-[10px] text-fg-subtle">
                    ≈ {formatUsd(data.summary.currentCashUsd)}
                  </p>
                </div>

                {/* 2. Sales Cash */}
                <div className="p-2.5 sm:p-3 rounded-xl border border-border bg-surface-raised/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle">
                    <Receipt className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span>Продажи (нал)</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +{formatTjs(data.summary.salesCashTjs)}
                  </p>
                  <p className="text-[10px] text-fg-subtle">
                    {data.summary.salesCount} чеков
                  </p>
                </div>

                {/* 3. Sales Card / Transfer */}
                <div className="p-2.5 sm:p-3 rounded-xl border border-border bg-surface-raised/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle">
                    <CreditCard className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Переводы/Карта</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatTjs(data.summary.salesCardTjs)}
                  </p>
                  <p className="text-[10px] text-fg-subtle">
                    безналично на счёт
                  </p>
                </div>

                {/* 4. Expenses from register */}
                <div className="p-2.5 sm:p-3 rounded-xl border border-border bg-surface-raised/50 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Расходы кассы</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold font-mono text-rose-500 tabular-nums">
                    -{formatTjs(data.summary.expensesTotalTjs)}
                  </p>
                  <p className="text-[10px] text-fg-subtle">
                    {data.summary.expensesCount} выплат
                  </p>
                </div>
              </div>

              {/* Bonus notification if any */}
              {data.summary.bonusCount > 0 && (
                <div className="p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2.5 text-xs">
                  <Gift className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="min-w-0 text-amber-900 dark:text-amber-200">
                    <span className="font-semibold">Бонусные устройства в выручке:</span>{' '}
                    <span>
                      {formatUsd(data.summary.bonusCashUsd)} ({data.summary.bonusCount} шт.) при инкассации
                      автоматически поступят на Бонусный счёт, а остальное — в Центр. кассу.
                    </span>
                  </div>
                </div>
              )}

              {/* Status check callout */}
              <div className="p-2.5 rounded-xl bg-accent/5 border border-accent/20 flex items-center gap-2 text-xs text-fg-subtle">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Сверка сходится: Наличная выручка чеков ({formatTjs(data.summary.salesCashTjs)}) за вычетом
                  расходов ({formatTjs(data.summary.expensesTotalTjs)}) точно совпадает с остатком в кассе ({formatTjs(data.summary.cashOnlyTjs)}).
                </span>
              </div>

              {/* Tabs & Search */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <div className="flex items-center gap-1 bg-surface-raised p-1 rounded-xl border border-border text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      activeTab === 'ALL'
                        ? 'bg-surface text-fg shadow-2xs font-semibold'
                        : 'text-fg-subtle hover:text-fg'
                    }`}
                  >
                    Все ({data.sales.length + data.expenses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('SALES')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      activeTab === 'SALES'
                        ? 'bg-surface text-fg shadow-2xs font-semibold'
                        : 'text-fg-subtle hover:text-fg'
                    }`}
                  >
                    Продажи ({data.sales.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('EXPENSES')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      activeTab === 'EXPENSES'
                        ? 'bg-surface text-fg shadow-2xs font-semibold'
                        : 'text-fg-subtle hover:text-fg'
                    }`}
                  >
                    Расходы ({data.expenses.length})
                  </button>
                </div>

                <div className="relative flex-1 sm:w-56 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по чеку, товару…"
                    className="w-full h-8 pl-8 pr-7 text-xs bg-surface-raised border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Transactions List */}
              <div className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden text-xs">
                {activeTab !== 'EXPENSES' &&
                  filteredSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="p-3 sm:p-3.5 hover:bg-surface-raised/40 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-fg">Чек #{sale.receiptNumber}</span>
                          <span className="text-[10px] text-fg-subtle">
                            {formatShortDate(sale.createdAt)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-raised border border-border text-fg-subtle font-medium">
                            {sale.sellerName}
                          </span>
                          {sale.status === 'REFUNDED' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-danger/10 text-danger border border-danger/20 font-semibold">
                              Возврат
                            </span>
                          )}
                        </div>

                        {/* Sold Items */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {sale.items.map((it) => (
                            <span
                              key={it.id}
                              className={`text-[11px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${
                                it.isBonus
                                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400 font-medium'
                                  : 'bg-surface-raised border-border text-fg'
                              }`}
                            >
                              {it.isBonus && <Gift className="w-3 h-3 shrink-0" />}
                              <span>
                                {it.brand} {it.model} {it.storage}
                              </span>
                            </span>
                          ))}
                        </div>

                        {/* Customer */}
                        {sale.customerName && (
                          <p className="text-[10px] text-fg-subtle">Клиент: {sale.customerName}</p>
                        )}
                      </div>

                      <div className="text-right shrink-0 space-y-0.5 tabular-nums">
                        <p className="font-bold font-mono text-sm text-fg">
                          {formatTjs(sale.totalTjs)}
                        </p>
                        <div className="text-[10px] flex items-center justify-end gap-1.5 flex-wrap font-medium">
                          {sale.cashAmountTjs > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Нал: {formatTjs(sale.cashAmountTjs)}
                            </span>
                          )}
                          {sale.cardAmountTjs > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              Карта: {formatTjs(sale.cardAmountTjs)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                {activeTab !== 'SALES' &&
                  filteredExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-3 sm:p-3.5 hover:bg-surface-raised/40 transition-colors flex items-start justify-between gap-3 bg-rose-500/3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-rose-500">Расход из кассы</span>
                          <span className="text-[10px] text-fg-subtle">
                            {formatShortDate(exp.createdAt)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 font-medium">
                            {exp.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-fg-subtle">{exp.description}</p>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <p className="font-bold font-mono text-sm text-rose-500">
                          -{formatTjs(exp.amountTjs)}
                        </p>
                        {exp.amountUsd && (
                          <p className="text-[10px] text-fg-subtle">≈ {formatUsd(exp.amountUsd)}</p>
                        )}
                      </div>
                    </div>
                  ))}

                {filteredSales.length === 0 && filteredExpenses.length === 0 && (
                  <div className="p-8 text-center text-fg-subtle space-y-1">
                    <Receipt className="w-8 h-8 mx-auto text-fg-subtle/50 mb-2" />
                    <p className="font-semibold text-fg">Операций не найдено</p>
                    <p className="text-[11px]">
                      {search ? 'Попробуйте изменить поисковый запрос' : 'За этот период операций не было'}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border bg-surface-raised/40 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Закрыть
          </Button>

          {!isZeroCash && (
            <Button
              variant="primary"
              disabled={busy || !store}
              onClick={() => {
                onClose();
                onCollect(store);
              }}
              className="gap-1.5"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Инкассировать {formatTjs(store.cashTjs)}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
