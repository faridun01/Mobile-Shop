import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Calendar,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatTjs } from '../../utils/money';
import { Button } from '../ui/Button';
import { LoadingState } from '../ui/Skeleton';
import type { RegisterBalance, StoreBreakdown, BreakdownDailyItem } from './CashReconciliationModal';
import { useUIStore } from '../../stores/useUIStore';

export interface UncollectedDaysDetailSectionProps {
  store: RegisterBalance;
  onOpenReconciliation?: (initialDate?: string | null) => void;
  onCollect: () => void;
  busy?: boolean;
}

const formatDayDate = (day: BreakdownDailyItem): string => {
  try {
    const dateObj = new Date(day.date + 'T12:00:00Z');
    const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
    const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'];
    const weekdays = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const monthStr = months[dateObj.getUTCMonth()];
    const weekdayStr = weekdays[dateObj.getUTCDay()];
    return `${dayNum} ${monthStr}, ${weekdayStr}`;
  } catch {
    return day.dateLabel || day.date;
  }
};

const formatDayAmount = (amount: number): string => {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded === 0) return formatTjs(0);
  if (rounded > 0) return `+${formatTjs(rounded)}`;
  return `-${formatTjs(Math.abs(rounded))}`;
};

export const UncollectedDaysDetailSection: React.FC<UncollectedDaysDetailSectionProps> = ({
  store,
  onOpenReconciliation: _onOpenReconciliation,
  onCollect,
  busy,
}) => {
  const [data, setData] = useState<StoreBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setDailyClosingModalOpen = useUIStore((s) => s.setDailyClosingModalOpen);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    apiClient<StoreBreakdown>(`/cash-collections/stores/${encodeURIComponent(store.storeId)}/breakdown`)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, [store.storeId]);

  const daysList = data?.days ?? [];
  const daysCount = daysList.length > 0 ? daysList.length : (store.daysWithoutCollection || 1);

  return (
    <section className="space-y-2.5 pt-2" aria-label="Дни без инкассации">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent shrink-0" />
          <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
            {daysCount > 1 ? `Дни без инкассации (${daysCount})` : 'Выручка к инкассации'}
          </h3>
        </div>
      </div>

      {loading && !data && (
        <div className="p-4 bg-surface rounded-2xl border border-border">
          <LoadingState label="Загрузка данных по дням…" />
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={fetchData}>
            Повторить
          </Button>
        </div>
      )}

      {!loading && (
        <div className="space-y-2">
          {/* Days list: Purely date and amount */}
          {daysList.length > 0 ? (
            daysList.map((day: BreakdownDailyItem) => {
              const isNegative = day.netCashTjs < 0;
              const isPositive = day.netCashTjs > 0;

              return (
                <div
                  key={day.date}
                  className="rounded-xl border border-border bg-surface shadow-2xs px-3.5 py-3 flex items-center justify-between gap-3"
                >
                  {/* Left: Date */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-raised flex items-center justify-center text-accent shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-bold text-fg">
                        {formatDayDate(day)}
                      </span>
                      {day.isToday && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          сегодня
                        </span>
                      )}
                      {day.daysAgo === 1 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-raised border border-border text-fg-subtle">
                          вчера
                        </span>
                      )}
                      {day.daysAgo > 1 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {day.daysAgo} дн. назад
                        </span>
                      )}
                      {day.hasClosing ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Z-отчёт закрыт</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Смена не закрыта</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Amount */}
                  <span
                    className={`text-sm sm:text-base font-bold font-mono tabular-nums shrink-0 ${
                      isNegative
                        ? 'text-rose-600 dark:text-rose-400'
                        : isPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-fg-subtle'
                    }`}
                  >
                    {formatDayAmount(day.netCashTjs)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-border bg-surface px-3.5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-raised flex items-center justify-center text-accent shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-fg">Текущий остаток кассы</span>
              </div>
              <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatTjs(store.cashTjs)}
              </span>
            </div>
          )}

          {/* Action Footer: Total sum & Collection Button */}
          {(data?.balance?.isShiftClosed === false || store.isShiftClosed === false) && Number(store.cashUsd) > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between flex-wrap gap-2 mt-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{data?.balance?.unclosedReason || store.unclosedReason || 'Кассовая смена не закрыта'}. Перед проведением инкассации необходимо закрыть смену.</span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={FileCheck2}
                onClick={() => setDailyClosingModalOpen(true, store.storeId)}
                className="shrink-0 font-semibold text-xs"
              >
                Закрыть смену
              </Button>
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-surface-raised/50 border border-border flex items-center justify-between gap-3 mt-3">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                Итого к инкассации
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-base sm:text-lg font-black font-mono text-fg tabular-nums">
                  {formatTjs(store.cashTjs)}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              disabled={
                Number(store.cashUsd) === 0 ||
                busy ||
                (data?.balance?.isShiftClosed ?? store.isShiftClosed) === false
              }
              onClick={onCollect}
              className="font-bold shadow-xs active:scale-95"
              title={(data?.balance?.isShiftClosed ?? store.isShiftClosed) === false ? 'Инкассация невозможна: сначала выполните закрытие смены (Z-отчёт)' : undefined}
            >
              <ArrowDownToLine className="w-4 h-4 mr-1.5" />
              <span>Инкассировать</span>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
