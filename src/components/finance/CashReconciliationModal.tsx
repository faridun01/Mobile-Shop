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
  FileCheck2,
  Gift,
  Receipt,
  Search,
  X,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatTjs, formatUsd } from '../../utils/money';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import { useUIStore } from '../../stores/useUIStore';

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
  lastCollectedAt?: string | null;
  daysWithoutCollection?: number;
  isShiftClosed?: boolean;
  unclosedDates?: string[];
  unclosedReason?: string | null;
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

export interface BreakdownDailyItem {
  date: string;
  dateLabel: string;
  daysAgo: number;
  isToday: boolean;
  salesCount: number;
  salesTotalTjs: number;
  salesCashTjs: number;
  salesCardTjs: number;
  salesDebtTjs: number;
  expensesCount: number;
  expensesTotalTjs: number;
  netCashTjs: number;
  hasClosing: boolean;
  closing?: {
    id: string;
    businessDate: string;
    closedByName: string;
    createdAt: string;
    openingCashTjs: number;
    expectedCashTjs: number;
    actualCashTjs: number;
    differenceTjs: number;
    comment?: string | null;
  } | null;
  sales: BreakdownSale[];
  expenses: BreakdownExpense[];
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
    expensesCount?: number;
    expensesTotalTjs?: string;
    customerPaymentsCount?: number;
    customerPaymentsTotalTjs?: string;
    refundedCount: number;
    refundedTotalTjs: string;
  };
  days?: BreakdownDailyItem[];
  sales: BreakdownSale[];
  expenses?: BreakdownExpense[];
}

interface CashReconciliationModalProps {
  open: boolean;
  store: RegisterBalance | null;
  onClose: () => void;
  onCollect: (store: RegisterBalance) => void;
  busy?: boolean;
  initialDate?: string | null;
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
  initialDate,
}) => {
  const [data, setData] = useState<StoreBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || 'ALL');
  const setDailyClosingModalOpen = useUIStore((s) => s.setDailyClosingModalOpen);

  useEffect(() => {
    if (!open || !store) {
      setData(null);
      setError(null);
      setSearch('');
      setSelectedDate('ALL');
      return;
    }

    if (initialDate) {
      setSelectedDate(initialDate);
    } else {
      setSelectedDate('ALL');
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient<StoreBreakdown>(`/cash-collections/stores/${encodeURIComponent(store.storeId)}/breakdown`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить историю продаж');
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
    let list = data.sales;
    if (selectedDate !== 'ALL') {
      list = list.filter((s) => s.createdAt.slice(0, 10) === selectedDate);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;

    return list.filter((s) => {
      if (s.receiptNumber.toString().includes(q)) return true;
      if (s.sellerName.toLowerCase().includes(q)) return true;
      if (s.customerName?.toLowerCase().includes(q)) return true;
      return s.items.some(
        (it) => it.brand.toLowerCase().includes(q) || it.model.toLowerCase().includes(q)
      );
    });
  }, [data?.sales, search, selectedDate]);

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
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-border bg-surface-raised/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-fg truncate">
                  Сверка кассы · {store.storeName.replace(/^[«"'\s]+|[»"'\s]+$/g, '')}
                </h3>
                {data?.period && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                    {data.period.daysCount > 0
                      ? `${data.period.daysCount} дн. без инкассации`
                      : data.period.hoursCount > 0
                      ? `${data.period.hoursCount} ч. без инкассации`
                      : 'За сегодня'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {loading && <LoadingState label="Загрузка чеков продаж…" />}

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
              {/* Unclosed shift warning banner */}
              {(data?.balance?.isShiftClosed === false || store.isShiftClosed === false) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{data?.balance?.unclosedReason || store.unclosedReason || 'Кассовая смена не закрыта'}. Перед проведением инкассации необходимо закрыть смену (Z-отчёт).</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={FileCheck2}
                    onClick={() => {
                      const targetDate = data?.balance?.unclosedDates?.[0] || store.unclosedDates?.[0];
                      setDailyClosingModalOpen(true, store.storeId, targetDate);
                    }}
                    className="shrink-0 font-semibold text-xs"
                  >
                    Закрыть смену
                  </Button>
                </div>
              )}

              {/* Period banner */}
              <div className="px-3 py-2 rounded-xl bg-surface-raised/60 border border-border flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2 text-fg">
                  <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="text-fg-subtle text-[11px]">Период:</span>
                  <span className="font-mono text-[11px] font-semibold text-fg">
                    {formatDate(data.period.periodStart)} — {formatDate(data.period.until)}
                  </span>
                </div>
                {data.lastCollection && (
                  <div className="text-[11px] text-fg-subtle font-mono">
                    Пред. инкассация: <span className="text-fg font-medium">#{data.lastCollection.transactionNumber}</span> ({formatTjs(data.lastCollection.amountTjs)})
                  </div>
                )}
              </div>

              {/* Summary Cards - with debt sales separation */}
              {(() => {
                const debtSum = Number(data.summary.salesDebtTjs || 0);
                const customerPaymentsSum = Number(data.summary.customerPaymentsTotalTjs || 0);
                const hasDebt = debtSum > 0;
                const hasCustomerPayments = customerPaymentsSum > 0;
                const salesCount = data.summary.salesCount || 0;
                const countText = salesCount === 1 ? '1 чек' : (salesCount >= 2 && salesCount <= 4) ? `${salesCount} чека` : `${salesCount} чеков`;

                return (
                  <div className={`grid gap-2 ${hasDebt || hasCustomerPayments ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
                    {/* 1. Cash In Register */}
                    <div className="p-2.5 sm:p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-0.5">
                      <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5 shrink-0" />
                          <span>В кассе (нал)</span>
                        </span>
                        <span className="text-[10px] text-fg-subtle font-mono font-normal">
                          ≈ {formatTjs(data.summary.cashOnlyTjs ?? data.summary.currentCashTjs)}
                        </span>
                      </div>
                      <p className="text-base sm:text-lg font-bold font-mono text-fg tabular-nums pt-0.5">
                        {formatUsd(data.summary.currentCashUsd)}
                      </p>
                      <p className="text-[10px] text-fg-subtle truncate">
                        к инкассации
                      </p>
                    </div>

                    {/* 2. Sales Cash */}
                    <div className="p-2.5 sm:p-3 rounded-xl border border-border bg-surface-raised/50 space-y-0.5">
                      <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-fg-subtle">
                        <span className="flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Выручка (нал)</span>
                        </span>
                        <span className="text-[10px] text-fg-subtle font-normal">
                          {countText}
                        </span>
                      </div>
                      <p className="text-base sm:text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums pt-0.5">
                        +{formatTjs(data.summary.salesCashTjs)}
                      </p>
                      <p className="text-[10px] text-fg-subtle truncate">
                        по чекам продаж
                      </p>
                    </div>

                    {/* 3. Customer debt repayments in cash (if any) or Bank */}
                    {hasCustomerPayments ? (
                      <div className="p-2.5 sm:p-3 rounded-xl border border-emerald-500/25 bg-surface-raised/50 space-y-0.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>Оплата долгов</span>
                          </span>
                        </div>
                        <p className="text-base sm:text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums pt-0.5">
                          +{formatTjs(customerPaymentsSum)}
                        </p>
                        <p className="text-[10px] text-fg-subtle truncate">
                          погашено клиентами
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 sm:p-3 rounded-xl border border-border bg-surface-raised/50 space-y-0.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-fg-subtle">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>Банк и переводы</span>
                          </span>
                        </div>
                        <p className="text-base sm:text-lg font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums pt-0.5">
                          {formatTjs(data.summary.salesCardTjs)}
                        </p>
                        <p className="text-[10px] text-fg-subtle truncate">
                          на банковский счёт
                        </p>
                      </div>
                    )}

                    {/* 4. Sales Debt (if any) */}
                    {hasDebt && (
                      <div className="p-2.5 sm:p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-0.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Остаток в долг</span>
                          </span>
                        </div>
                        <p className="text-base sm:text-lg font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums pt-0.5">
                          {formatTjs(data.summary.salesDebtTjs)}
                        </p>
                        <p className="text-[10px] text-fg-subtle truncate">
                          долг клиентов
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Bonus notification if any */}
              {data.summary.bonusCount > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Бонусные устройства ({data.summary.bonusCount} шт.)</span>
                  </div>
                  <span className="font-mono font-bold">{formatUsd(data.summary.bonusCashUsd)}</span>
                </div>
              )}

              {/* Status callout only if there is a discrepancy */}
              {(() => {
                const salesCash = Number(data.summary.salesCashTjs || 0);
                const customerPaymentsCash = Number(data.summary.customerPaymentsTotalTjs || 0);
                const cashInReg = Number(data.summary.cashOnlyTjs ?? data.summary.currentCashTjs ?? 0);
                const expensesCash = Number(data.summary.expensesTotalTjs || 0);
                const netCashInflow = salesCash + customerPaymentsCash - expensesCash;
                const diff = cashInReg - netCashInflow;

                if (Math.abs(diff) < 0.01) return null;

                return (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="font-semibold text-fg">Расхождение</span>
                    </div>
                    <span className="font-mono font-bold">
                      {diff > 0 ? `+${formatTjs(diff)}` : `-${formatTjs(Math.abs(diff))}`}
                    </span>
                  </div>
                );
              })()}

              {/* Day filter pills if multi-day */}
              {data.days && data.days.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSelectedDate('ALL')}
                    className={`h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                      selectedDate === 'ALL'
                        ? 'bg-accent text-accent-fg shadow-2xs'
                        : 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg'
                    }`}
                  >
                    Все дни ({data.sales.length})
                  </button>
                  {data.days.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDate(day.date)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                        selectedDate === day.date
                          ? 'bg-accent text-accent-fg shadow-2xs'
                          : 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg'
                      }`}
                    >
                      <span>{day.dateLabel}</span>
                      <span className={`text-[10px] px-1 py-0.2 rounded ${
                        selectedDate === day.date ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface text-fg-subtle'
                      }`}>
                        {day.salesCount} ч.
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Sales List Header & Search */}
              <div className="flex items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-2 shrink-0">
                  <h4 className="text-xs font-bold text-fg uppercase tracking-wide">
                    Чеки продаж
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-fg-subtle font-mono">
                    {filteredSales.length}
                  </span>
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по чеку, товару, продавцу…"
                    className="w-full h-8 pl-8 pr-7 text-xs bg-surface-raised border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-accent text-fg placeholder:text-fg-subtle"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sales Transactions List */}
              <div className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden text-xs">
                {filteredSales.map((sale) => {
                  const cashPaid = sale.cashAmountTjs || 0;
                  const cardPaid = sale.cardAmountTjs || 0;
                  const paidAtSale = cashPaid + cardPaid;
                  const currentDebt = sale.debtAmountTjs ?? 0;
                  const initialDebt = Math.max(0, Math.round((sale.totalTjs - paidAtSale) * 100) / 100);
                  const repaidLater = Math.max(0, Math.round((initialDebt - currentDebt) * 100) / 100);
                  const hasDebtHistory = initialDebt > 0 || currentDebt > 0 || sale.paymentMethod === 'DEBT';
                  const isPartial = currentDebt > 0 && paidAtSale > 0;
                  const isFullDebt = currentDebt > 0 && paidAtSale === 0;

                  return (
                    <div
                      key={sale.id}
                      className="p-2.5 sm:p-3 hover:bg-surface-raised/40 transition-colors flex items-center justify-between gap-3"
                    >
                      {/* Left: Receipt info, items, customer */}
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-fg">Чек #{sale.receiptNumber}</span>
                          <span className="text-[10px] text-fg-subtle font-mono">
                            {formatShortDate(sale.createdAt)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-raised border border-border text-fg-subtle font-medium">
                            {sale.sellerName}
                          </span>
                          {sale.status === 'REFUNDED' ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-danger/10 text-danger border border-danger/20 font-semibold">
                              Возврат
                            </span>
                          ) : initialDebt > 0 && currentDebt === 0 ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-semibold">
                              Долг погашен
                            </span>
                          ) : isPartial ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-semibold">
                              Частично в долг
                            </span>
                          ) : isFullDebt ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-semibold">
                              В долг
                            </span>
                          ) : sale.paymentMethod === 'CARD' ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-medium">
                              Банк
                            </span>
                          ) : sale.paymentMethod === 'MIXED' ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 font-medium">
                              Смешанная
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium">
                              Наличные
                            </span>
                          )}
                        </div>

                        {/* Sold Items + Customer */}
                        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
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
                                {it.brand} {it.model} {it.storage || ''}
                              </span>
                            </span>
                          ))}

                          {sale.customerName && (
                            <span className="text-[11px] text-fg-subtle flex items-center gap-1 ml-0.5">
                              <span>Клиент:</span>
                              <span className={`font-medium ${currentDebt > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-fg'}`}>
                                {sale.customerName}
                              </span>
                              {currentDebt > 0 && (
                                <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-medium">
                                  должник
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Total amount and concise payment inflow */}
                      <div className="text-right shrink-0 space-y-0.5 tabular-nums">
                        <div className="font-bold font-mono text-sm sm:text-base text-fg">
                          {formatTjs(sale.totalTjs)}
                        </div>

                        {hasDebtHistory ? (
                          <div className="flex items-center justify-end gap-1.5 text-[11px] font-mono text-fg-subtle flex-wrap">
                            {cashPaid > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                Нал: +{formatTjs(cashPaid)}
                              </span>
                            )}
                            {cardPaid > 0 && (
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                {cashPaid > 0 ? '· ' : ''}Банк: +{formatTjs(cardPaid)}
                              </span>
                            )}
                            {repaidLater > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {(cashPaid > 0 || cardPaid > 0) ? '· ' : ''}Погашено: +{formatTjs(repaidLater)}
                              </span>
                            )}
                            {currentDebt > 0 && (
                              <span className="text-amber-600 dark:text-amber-400 font-bold">
                                {paidAtSale > 0 ? '· ' : ''}Долг: {formatTjs(currentDebt)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono flex items-center justify-end gap-1.5 text-fg-subtle">
                            {sale.cashAmountTjs > 0 && (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Нал: {formatTjs(sale.cashAmountTjs)}
                              </span>
                            )}
                            {sale.cardAmountTjs > 0 && (
                              <span className="text-blue-600 dark:text-blue-400">
                                Банк: {formatTjs(sale.cardAmountTjs)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredSales.length === 0 && (
                  <div className="p-8 text-center text-fg-subtle space-y-1">
                    <Receipt className="w-8 h-8 mx-auto text-fg-subtle/50 mb-2" />
                    <p className="font-semibold text-fg">Чеков продаж не найдено</p>
                    <p className="text-[11px]">
                      {search ? 'Попробуйте изменить поисковый запрос' : 'За этот период продаж не было'}
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
              disabled={busy || !store || (data?.balance?.isShiftClosed ?? store.isShiftClosed) === false}
              onClick={() => {
                onClose();
                onCollect(store);
              }}
              className="gap-1.5"
              title={(data?.balance?.isShiftClosed ?? store.isShiftClosed) === false ? 'Инкассация невозможна: сначала закройте смену (Z-отчёт)' : undefined}
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Инкассировать {formatUsd(store.cashUsd)} (≈ {formatTjs(store.cashTjs)})</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
