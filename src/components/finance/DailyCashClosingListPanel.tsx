import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { DailyCashClosing } from '../../types';
import { formatTjs, formatMoney } from '../../utils/money';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { DailyCashClosingModal } from './DailyCashClosingModal';
import { useUIStore } from '../../stores/useUIStore';
import { useAppFields } from '../../context/AppContext';
import {
  AlertCircle,
  FileCheck2,
  Calendar,
  Store,
  UserCheck,
  Banknote,
  CreditCard,
  ArrowUpDown,
  Filter,
  CheckCircle2,
} from 'lucide-react';

interface DailyCashClosingListPanelProps {
  month: string;
  storeId?: string | null;
}

const formatDayChip = (businessDate: string): string => {
  try {
    const [y, m, d] = businessDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return businessDate;
  }
};

const getClosingCardUsd = (c: DailyCashClosing): number => {
  const cardTjs = Number(c.salesCardTjs) || 0;
  if (cardTjs <= 0) return 0;
  if (c.exchangeRate && Number(c.exchangeRate) > 0) {
    return cardTjs / Number(c.exchangeRate);
  }
  const cashTjs = Number(c.actualCashTjs) || 0;
  const cashUsd = Number(c.actualCashUsd) || 0;
  if (cashTjs > 0 && cashUsd > 0) {
    return cardTjs / (cashTjs / cashUsd);
  }
  return 0;
};

/** Closed shifts for the month: cash and bank per day, day sorting, and day filtering. */
export const DailyCashClosingListPanel: React.FC<DailyCashClosingListPanelProps> = ({
  month,
  storeId,
}) => {
  const { setDailyClosingModalOpen } = useUIStore();
  const { stores, currentUser } = useAppFields('stores', 'currentUser');
  const isAdmin = currentUser?.role === 'ADMIN';

  const [closings, setClosings] = useState<DailyCashClosing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [inspectClosing, setInspectClosing] = useState<DailyCashClosing | null>(null);

  // Sorting & day filter
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedDay, setSelectedDay] = useState<string>('all');

  // Reset selected day on month change
  useEffect(() => {
    setSelectedDay('all');
  }, [month]);

  // Today date string (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Shift closing is strictly for retail stores, never for central cash desk/warehouse
  const isRetailStore = Boolean(
    storeId &&
    storeId !== 'all' &&
    stores.some((s) => s.id === storeId && !s.isMainWarehouse)
  );

  // Check if today's shift is already closed for the active store
  const isTodayClosed = useMemo(() => {
    if (!storeId || storeId === 'all') return false;
    return closings.some((c) => c.businessDate === todayStr && c.storeId === storeId);
  }, [closings, todayStr, storeId]);

  const refresh = useCallback(() => setRevision((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const now = new Date();
    const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearMonth = month.length === 7 ? month : defaultYm;
    const startDate = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    let url = `/daily-closings?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    if (storeId && storeId !== 'all') {
      url += `&storeId=${encodeURIComponent(storeId)}`;
    }

    apiClient<DailyCashClosing[]>(url)
      .then((data) => {
        if (!cancelled) setClosings(Array.isArray(data) ? data : []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить закрытые смены');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, storeId, revision]);

  // Unique days in the dataset
  const uniqueDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of closings) {
      map.set(c.businessDate, (map.get(c.businessDate) || 0) + 1);
    }
    const days = Array.from(map.keys()).sort((a, b) =>
      sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b)
    );
    return days.map((date) => ({ date, count: map.get(date)! }));
  }, [closings, sortOrder]);

  // Filtered and sorted closings
  const displayedClosings = useMemo(() => {
    let list = selectedDay === 'all'
      ? closings
      : closings.filter((c) => c.businessDate === selectedDay);

    return [...list].sort((a, b) => {
      const dateCmp = a.businessDate.localeCompare(b.businessDate);
      if (dateCmp !== 0) {
        return sortOrder === 'desc' ? -dateCmp : dateCmp;
      }
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [closings, selectedDay, sortOrder]);

  // Sums for displayed closings (USD primary, TJS secondary)
  const totals = useMemo(() => {
    let cashTjs = 0;
    let cashUsd = 0;
    let bankTjs = 0;
    let bankUsd = 0;

    for (const c of displayedClosings) {
      const cTjs = Number(c.actualCashTjs) || 0;
      const cUsd = Number(c.actualCashUsd) || 0;
      const bTjs = Number(c.salesCardTjs) || 0;
      const bUsd = getClosingCardUsd(c);

      cashTjs += cTjs;
      cashUsd += cUsd;
      bankTjs += bTjs;
      bankUsd += bUsd;
    }

    return {
      count: displayedClosings.length,
      cashTjs,
      cashUsd,
      bankTjs,
      bankUsd,
    };
  }, [displayedClosings]);

  return (
    <div className="space-y-3.5">
      {/* Header with Close Shift button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-border">
        <h2 className="text-sm font-bold text-fg flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-accent" />
          Закрытые смены
          {closings.length > 0 && (
            <span className="text-xs text-fg-subtle font-normal font-mono">
              ({closings.length})
            </span>
          )}
        </h2>
        {isRetailStore && (
          isTodayClosed ? (
            isAdmin ? (
              <Button
                variant="secondary"
                leftIcon={CheckCircle2}
                onClick={() => setDailyClosingModalOpen(true, storeId!)}
                className="w-full sm:w-auto border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 font-medium"
                title="Смена на сегодня уже закрыта. Нажмите для просмотра или отмены закрытия"
              >
                Смена закрыта · Управление
              </Button>
            ) : (
              <div
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold select-none shadow-2xs"
                title="Смена на сегодня уже закрыта. Повторное закрытие недоступно. Только администратор может отменить закрытие"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>Смена на сегодня закрыта</span>
              </div>
            )
          ) : (
            <Button
              leftIcon={FileCheck2}
              onClick={() => setDailyClosingModalOpen(true, storeId!)}
              className="w-full sm:w-auto"
            >
              Закрыть смену
            </Button>
          )
        )}
      </div>

      {/* Summary KPI Cards: Смен, Наличные ($ USD / ≈ TJS), Банк ($ USD / ≈ TJS) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        <div className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-fg-subtle">Смен</span>
          <p className="text-lg sm:text-xl font-black font-mono text-fg mt-1 tabular-nums">{totals.count}</p>
        </div>
        <div className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border flex flex-col justify-between min-w-0">
          <span className="text-[11px] font-semibold text-fg-subtle flex items-center gap-1 leading-tight">
            <Banknote className="w-3.5 h-3.5 text-success shrink-0" />
            <span>Наличные</span>
          </span>
          <div className="mt-1 space-y-0.5">
            <p className="text-sm sm:text-base md:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums leading-snug">
              ${formatMoney(totals.cashUsd)}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-fg-subtle block font-mono whitespace-nowrap">
              ≈ {formatTjs(totals.cashTjs)}
            </span>
          </div>
        </div>
        <div className="p-2.5 sm:p-3 rounded-xl bg-surface border border-border flex flex-col justify-between min-w-0">
          <span className="text-[11px] font-semibold text-fg-subtle flex items-center gap-1 leading-tight">
            <CreditCard className="w-3.5 h-3.5 text-info shrink-0" />
            <span>Банк</span>
          </span>
          <div className="mt-1 space-y-0.5">
            <p className="text-sm sm:text-base md:text-lg font-black font-mono text-info tabular-nums leading-snug">
              ${formatMoney(totals.bankUsd)}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-fg-subtle block font-mono whitespace-nowrap">
              ≈ {formatTjs(totals.bankTjs)}
            </span>
          </div>
        </div>
      </div>

      {/* Sorting & Day Filter Bar */}
      {closings.length > 0 && (
        <div className="flex flex-col gap-2 bg-surface p-2.5 rounded-xl border border-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-accent" />
              Фильтр по дням:
            </span>
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg text-xs font-medium transition-colors cursor-pointer active:scale-95"
              title="Изменить порядок сортировки по дням"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-accent" />
              <span>{sortOrder === 'desc' ? 'Сначала новые дни' : 'Сначала старые дни'}</span>
            </button>
          </div>

          {/* Horizontal scrollable Day Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedDay('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                selectedDay === 'all'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'bg-surface-raised text-fg-subtle hover:text-fg border border-border hover:bg-surface'
              }`}
            >
              Все дни ({closings.length})
            </button>
            {uniqueDays.map(({ date, count }) => {
              const isSelected = selectedDay === date;
              return (
                <button
                  type="button"
                  key={date}
                  onClick={() => setSelectedDay(isSelected ? 'all' : date)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'bg-surface-raised text-fg-subtle hover:text-fg border border-border hover:bg-surface'
                  }`}
                >
                  <span>{formatDayChip(date)}</span>
                  <span className={`text-[10px] font-mono opacity-80`}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading && closings.length === 0 ? (
        <div className="p-12 text-center text-fg-subtle space-y-2">
          <div className="w-7 h-7 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Загрузка…</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center justify-between gap-2" role="alert">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" onClick={refresh}>Повторить</Button>
        </div>
      ) : closings.length === 0 ? (
        <EmptyState icon={FileCheck2} title="Закрытых смен нет" description="За выбранный месяц смены не закрывались" />
      ) : (
        <div className="space-y-2.5">
          {/* Phones */}
          <div className="md:hidden space-y-2">
            {displayedClosings.map((c) => {
              const cardUsd = getClosingCardUsd(c);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setInspectClosing(c)}
                  className="w-full text-left p-3.5 rounded-2xl bg-surface border border-border shadow-xs space-y-2 active:bg-surface-raised transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-bold font-mono text-xs text-fg">
                    <Calendar className="w-3.5 h-3.5 text-accent" />
                    <span>{c.businessDate}</span>
                    <span className="text-[10px] text-fg-subtle font-normal truncate">
                      · {c.store?.name || 'Магазин'} · {c.closedByName}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="text-[10px] text-fg-subtle block">Наличные</span>
                      <span className="font-bold font-mono text-sm text-emerald-600 dark:text-emerald-400 block">
                        ${formatMoney(c.actualCashUsd)}
                      </span>
                      <span className="text-[10px] text-fg-subtle font-mono block">
                        ≈ {formatTjs(c.actualCashTjs)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-fg-subtle block">Банк</span>
                      <span className="font-bold font-mono text-sm text-info block">
                        ${formatMoney(cardUsd)}
                      </span>
                      <span className="text-[10px] text-fg-subtle font-mono block">
                        ≈ {formatTjs(c.salesCardTjs)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tablet and desktop */}
          <div className="hidden md:block bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-raised/50 border-b border-border text-[11px] text-fg-subtle uppercase tracking-wider font-semibold select-none">
                  <tr>
                    <th className="py-3 px-4">Дата</th>
                    <th className="py-3 px-4">Магазин</th>
                    <th className="py-3 px-4">Закрыл</th>
                    <th className="py-3 px-4 text-right">Наличные</th>
                    <th className="py-3 px-4 text-right">Банк</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayedClosings.map((c) => {
                    const cardUsd = getClosingCardUsd(c);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-surface-raised/30 transition-colors cursor-pointer"
                        onClick={() => setInspectClosing(c)}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-bold font-mono text-fg">
                            <Calendar className="w-3.5 h-3.5 text-accent" />
                            <span>{c.businessDate}</span>
                          </div>
                          <span className="text-[10px] text-fg-subtle block font-mono mt-0.5">
                            {new Date(c.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-fg font-medium">
                            <Store className="w-3.5 h-3.5 text-fg-subtle" />
                            {c.store?.name || 'Магазин'}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-fg-subtle">
                            <UserCheck className="w-3.5 h-3.5" />
                            {c.closedByName}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                          <div className="text-emerald-600 dark:text-emerald-400">
                            ${formatMoney(c.actualCashUsd)}
                          </div>
                          <div className="text-[10px] text-fg-subtle font-normal">
                            ≈ {formatTjs(c.actualCashTjs)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                          <div className="text-info">
                            ${formatMoney(cardUsd)}
                          </div>
                          <div className="text-[10px] text-fg-subtle font-normal">
                            ≈ {formatTjs(c.salesCardTjs)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {inspectClosing && (
        <DailyCashClosingModal
          isOpen={true}
          onClose={() => setInspectClosing(null)}
          storeId={inspectClosing.storeId}
          storeName={inspectClosing.store?.name}
          businessDate={inspectClosing.businessDate}
          readOnly={true}
          onReopened={() => {
            setInspectClosing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
};
