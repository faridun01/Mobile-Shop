import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  User,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatTjs, formatUsd } from '../../utils/money';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import type { RegisterBalance, StoreBreakdown, BreakdownDailyItem } from './CashReconciliationModal';

export interface UncollectedDaysDetailSectionProps {
  store: RegisterBalance;
  onOpenReconciliation: (initialDate?: string | null) => void;
  onCollect: () => void;
  busy?: boolean;
}

const formatRuDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRuTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDaysCount = (n: number) => {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`;
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} дня`;
  return `${n} дней`;
};

export const UncollectedDaysDetailSection: React.FC<UncollectedDaysDetailSectionProps> = ({
  store,
  onOpenReconciliation,
  onCollect,
  busy,
}) => {
  const [data, setData] = useState<StoreBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  const fetchData = () => {
    setLoading(true);
    setError(null);
    apiClient<StoreBreakdown>(`/cash-collections/stores/${encodeURIComponent(store.storeId)}/breakdown`)
      .then((res) => {
        setData(res);
        // Expand the first day by default if available
        if (res.days && res.days.length > 0) {
          setExpandedDates({ [res.days[0].date]: true });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить разбивку по дням');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, [store.storeId]);

  const toggleDay = (date: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const daysCount = data?.days?.length ?? (store.daysWithoutCollection || 1);
  const isMultiDay = daysCount > 1;

  return (
    <section className="space-y-3 pt-2" aria-label="Детализация неинкассированных дней">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent shrink-0" />
          <h3 className="text-xs font-bold text-fg uppercase tracking-wide">
            Детализация по дням накопления выручки
          </h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
            isMultiDay
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
              : 'bg-accent/15 border-accent/25 text-accent'
          }`}>
            {formatDaysCount(daysCount)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="h-7 w-7 rounded-lg border border-border bg-surface hover:bg-surface-raised text-fg-subtle hover:text-fg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            title="Обновить данные"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onOpenReconciliation(null)}
            className="h-7 px-2.5 rounded-lg border border-border bg-surface hover:bg-surface-raised text-fg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
            <span>Сверка продаж</span>
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="p-6 bg-surface rounded-2xl border border-border">
          <LoadingState label="Загрузка данных по дням продаж…" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Ошибка при загрузке разбивки</span>
          </div>
          <p>{error}</p>
          <Button size="sm" variant="secondary" onClick={fetchData}>
            Повторить
          </Button>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-2.5">
          {/* Multi-day alert notification */}
          {isMultiDay && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">
                  Касса «{store.storeName}» накапливала выручку {formatDaysCount(daysCount)} без инкассации
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Период накопления:{' '}
                  <strong>{formatRuDate(data.period.periodStart)}</strong> —{' '}
                  <strong>{formatRuDate(data.period.until)}</strong>.
                  Проверьте выручку за каждый день и статус закрытия смен (Z-отчетов) перед сдачей денег в Центральную кассу.
                </p>
              </div>
            </div>
          )}

          {/* Period & previous collection info */}
          <div className="p-3 rounded-xl bg-surface border border-border text-xs flex items-center justify-between flex-wrap gap-2 text-fg-subtle">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>
                Период:{' '}
                <strong className="text-fg">
                  {formatRuDate(data.period.periodStart)} — {formatRuDate(data.period.until)}
                </strong>
              </span>
            </div>
            {data.lastCollection ? (
              <div className="text-[11px]">
                Посл. инкассация: <strong>{data.lastCollection.transactionNumber}</strong> от{' '}
                {formatRuDate(data.lastCollection.createdAt)} ({data.lastCollection.acceptedByName})
              </div>
            ) : (
              <div className="text-[11px] text-accent font-medium">
                Первая инкассация (с открытия кассы)
              </div>
            )}
          </div>

          {/* Days breakdown list */}
          {data.days && data.days.length > 0 ? (
            <div className="space-y-2">
              {data.days.map((day: BreakdownDailyItem) => {
                const isExpanded = !!expandedDates[day.date];
                const hasExpenses = day.expensesTotalTjs > 0;

                return (
                  <div
                    key={day.date}
                    className="rounded-xl border border-border bg-surface shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Day summary row (clickable to expand) */}
                    <div
                      onClick={() => toggleDay(day.date)}
                      className="p-3 sm:p-3.5 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-surface-raised/40 select-none transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-fg">
                            {day.dateLabel}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-surface-raised border border-border text-fg-subtle">
                            {day.isToday ? 'Сегодня' : day.daysAgo === 1 ? 'Вчера' : `${day.daysAgo} дн. назад`}
                          </span>

                          {/* Shift Z-report status badge */}
                          {day.hasClosing && day.closing ? (
                            <span
                              className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0"
                              title={`Смена закрыта: ${day.closing.closedByName}. Факт: ${formatTjs(day.closing.actualCashTjs)}`}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              <span>Z-отчёт сдан ({day.closing.closedByName})</span>
                            </span>
                          ) : (
                            <span
                              className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center gap-1 shrink-0"
                              title="Кассир не закрыл смену в этот день"
                            >
                              <AlertCircle className="w-3 h-3 text-amber-500" />
                              <span>Z-отчёт не сформирован</span>
                            </span>
                          )}
                        </div>

                        {/* Financial metrics for the day */}
                        <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap text-fg-subtle pt-0.5">
                          <span className="text-fg font-medium">
                            Продажи: <strong className="text-fg font-mono">{formatTjs(day.salesTotalTjs)}</strong> ({day.salesCount} чеков)
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                            Наличные: +{formatTjs(day.salesCashTjs)}
                          </span>
                          {day.salesCardTjs > 0 && (
                            <span className="text-blue-600 dark:text-blue-400 font-mono">
                              Карта: {formatTjs(day.salesCardTjs)}
                            </span>
                          )}
                          {hasExpenses && (
                            <span className="text-danger font-mono">
                              Расход: -{formatTjs(day.expensesTotalTjs)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right side: Day net cash & accordion arrow */}
                      <div className="shrink-0 flex items-center gap-2.5">
                        <div className="text-right">
                          <p className="text-xs sm:text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{formatTjs(day.netCashTjs)}
                          </p>
                          <p className="text-[10px] text-fg-subtle">в кассу за день</p>
                        </div>
                        <div className="w-6 h-6 rounded-md bg-surface-raised flex items-center justify-center text-fg-subtle">
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded details: sales checks & expenses for this specific day */}
                    {isExpanded && (
                      <div className="border-t border-border/70 bg-surface-raised/20 p-3 sm:p-4 space-y-3 text-xs">
                        {/* Day shift closing details if available */}
                        {day.closing && (
                          <div className="p-2.5 rounded-lg bg-surface border border-border flex items-center justify-between flex-wrap gap-2 text-[11px]">
                            <div className="flex items-center gap-2">
                              <FileCheck2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>
                                <strong>Z-отчёт смены:</strong> Закрыл {day.closing.closedByName} в{' '}
                                {formatRuTime(day.closing.createdAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono">
                              <span>Факт: {formatTjs(day.closing.actualCashTjs)}</span>
                              {day.closing.differenceTjs !== 0 && (
                                <span className={day.closing.differenceTjs < 0 ? 'text-danger font-bold' : 'text-emerald-500 font-bold'}>
                                  (Разница: {formatTjs(day.closing.differenceTjs)})
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Top bar with quick button to open full modal for this day */}
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-semibold text-fg flex items-center gap-1.5 text-xs">
                            <Receipt className="w-3.5 h-3.5 text-accent" />
                            <span>Чеки продаж ({day.sales.length})</span>
                          </h4>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReconciliation(day.date);
                            }}
                            className="text-[11px] text-accent hover:underline font-semibold cursor-pointer flex items-center gap-1"
                          >
                            <span>Открыть этот день в полной сверке →</span>
                          </button>
                        </div>

                        {/* Sales list for this day */}
                        {day.sales.length === 0 ? (
                          <p className="text-fg-subtle text-center py-2">Чеков продаж нет</p>
                        ) : (
                          <div className="rounded-lg border border-border bg-surface divide-y divide-border/60 overflow-hidden max-h-60 overflow-y-auto">
                            {day.sales.map((sale) => (
                              <div
                                key={sale.id}
                                className="p-2.5 flex items-start justify-between gap-2 hover:bg-surface-raised/40 transition-colors"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-fg">Чек #{sale.receiptNumber}</span>
                                    <span className="text-[10px] text-fg-subtle">
                                      {formatRuTime(sale.createdAt)}
                                    </span>
                                    <span className="text-[10px] text-fg-subtle">
                                      · {sale.sellerName}
                                    </span>
                                    {sale.customerName && (
                                      <span className="text-[10px] text-fg-subtle">
                                        · {sale.customerName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-fg-subtle truncate">
                                    {sale.items.map((it) => `${it.brand} ${it.model}`).join(', ') || 'Товары'}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-bold font-mono text-fg tabular-nums">
                                    {formatTjs(sale.totalTjs)}
                                  </p>
                                  <div className="flex items-center gap-1 justify-end text-[10px] text-fg-subtle">
                                    {sale.cashAmountTjs > 0 && <span>Нал: {formatTjs(sale.cashAmountTjs)}</span>}
                                    {sale.cardAmountTjs > 0 && <span className="text-blue-500">Карта: {formatTjs(sale.cardAmountTjs)}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Expenses list for this day if any */}
                        {day.expenses.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <h4 className="font-semibold text-fg flex items-center gap-1.5 text-xs text-danger">
                              <TrendingDown className="w-3.5 h-3.5" />
                              <span>Расходы из кассы ({day.expenses.length})</span>
                            </h4>
                            <div className="rounded-lg border border-border bg-surface divide-y divide-border/60 overflow-hidden">
                              {day.expenses.map((exp) => (
                                <div
                                  key={exp.id}
                                  className="p-2 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <span className="font-medium text-fg">{exp.category}</span>
                                    <span className="text-fg-subtle text-[11px]"> · {exp.description}</span>
                                  </div>
                                  <span className="font-bold font-mono text-danger shrink-0">
                                    -{formatTjs(exp.amountTjs)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="p-4 bg-surface rounded-xl border border-border text-center text-xs text-fg-subtle">
              В кассе нет зафиксированных чеков продаж за этот период.
            </p>
          )}

          {/* Action footer */}
          <div className="p-3 rounded-xl bg-surface-raised/40 border border-border flex items-center justify-between flex-wrap gap-2.5">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-fg">
                Всего к инкассации: <strong className="font-mono font-bold text-fg">{formatTjs(store.cashTjs)}</strong> ({formatUsd(store.cashUsd)})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenReconciliation(null)}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-accent" />
                Сверить все дни
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={Number(store.cashUsd) === 0 || busy}
                onClick={onCollect}
              >
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1" />
                Инкассировать {formatTjs(store.cashTjs)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
