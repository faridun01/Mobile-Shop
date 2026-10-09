import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Landmark,
  Store as StoreIcon,
  Undo2,
  Gift,
  Banknote,
  CreditCard,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  FileCheck2,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatTjs, formatUsd } from '../../utils/money';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { type RegisterBalance } from './CashReconciliationModal';
import { UncollectedDaysDetailSection } from './UncollectedDaysDetailSection';
import { useUIStore } from '../../stores/useUIStore';

interface BonusAccountBalance {
  /** null until the account's first credit. */
  id: string | null;
  name: string;
  balanceUsd: string;
  balanceTjs: string;
}

interface CashCollection {
  id: string;
  transactionNumber: string;
  storeName: string;
  amountTjs: number;
  amountUsd: number;
  regularAmountUsd?: number;
  bonusAmountUsd?: number;
  bonusCount?: number;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
  createdByName: string;
}

const isZero = (value: string) => Number(value) === 0;

/**
 * «Инкассация» (ADMIN): a store register's whole cash is collected in one step.
 * - Store register is completely cleared to 0.
 * - Regular revenue goes to Central Cash.
 * - Bonus device proceeds automatically route to the dedicated Bonus Account.
 */
export interface CashCollectionPanelProps {
  month?: string;
  startDate?: string;
  endDate?: string;
  storeId?: string | null;
  onSelectStoreId?: (storeId: string | null) => void;
}

export const CashCollectionPanel: React.FC<CashCollectionPanelProps> = ({
  month,
  startDate,
  endDate,
  storeId,
  onSelectStoreId,
}) => {
  const [balances, setBalances] = useState<{
    stores: RegisterBalance[];
    central: RegisterBalance | null;
    bonusAccount: BonusAccountBalance | null;
  } | null>(null);
  const [history, setHistory] = useState<CashCollection[]>([]);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [collecting, setCollecting] = useState<RegisterBalance | null>(null);
  const [cancelling, setCancelling] = useState<CashCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const setDailyClosingModalOpen = useUIStore((s) => s.setDailyClosingModalOpen);

  // Local selection support if parent doesn't manage it directly
  const [localSelectedStoreId, setLocalSelectedStoreId] = useState<string | null>(null);
  const effectiveStoreId = storeId !== undefined ? storeId : localSelectedStoreId;

  const handleStoreClick = (clickedStoreId: string) => {
    const next = effectiveStoreId === clickedStoreId ? null : clickedStoreId;
    if (onSelectStoreId) {
      onSelectStoreId(next);
    } else {
      setLocalSelectedStoreId(next);
    }
  };

  const refresh = useCallback(() => setRevision((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    const balancesPromise = apiClient<{
      stores: RegisterBalance[];
      central: RegisterBalance | null;
      bonusAccount: BonusAccountBalance | null;
    }>('/cash-collections/balances');

    // Only load history when a specific store is selected
    if (!effectiveStoreId) {
      balancesPromise
        .then((b) => {
          if (cancelled) return;
          setBalances(b);
          setHistory([]);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить кассы');
        });
      return () => {
        cancelled = true;
      };
    }

    const params = new URLSearchParams();
    if (startDate) {
      params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
    } else if (month) {
      params.set('period', 'SPECIFIC_MONTH');
      params.set('month', month);
    } else {
      params.set('period', 'ALL');
    }
    params.set('storeId', effectiveStoreId);

    Promise.all([
      balancesPromise,
      apiClient<CashCollection[]>(`/cash-collections?${params.toString()}`),
    ])
      .then(([b, h]) => {
        if (cancelled) return;
        setBalances(b);
        setHistory(h);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить кассы');
      });

    return () => {
      cancelled = true;
    };
  }, [month, startDate, endDate, revision, effectiveStoreId]);

  const confirmCollect = async () => {
    if (!collecting || busy) return;
    setBusy(true);
    try {
      const result = await apiClient<CashCollection>('/cash-collections', {
        method: 'POST',
        body: JSON.stringify({ storeId: collecting.storeId, expectedCashUsd: collecting.cashUsd }),
      });
      const bonusText = result.bonusAmountUsd && result.bonusAmountUsd > 0
        ? ` (${formatUsd(result.regularAmountUsd ?? 0)} в Центр. кассу, ${formatUsd(result.bonusAmountUsd)} на Бонусный счёт)`
        : ' переданы в Центральную кассу';
      setStatus({ tone: 'success', text: `Инкассация ${result.transactionNumber}: ${formatTjs(result.amountTjs)} (${formatUsd(result.amountUsd)})${bonusText}` });
      setCollecting(null);
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Инкассация не выполнена' });
      setCollecting(null);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const confirmCancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true);
    try {
      await apiClient(`/cash-collections/${cancelling.id}/cancel`, { method: 'POST' });
      setStatus({ tone: 'success', text: `Инкассация ${cancelling.transactionNumber} отменена, наличные возвращены в кассу «${cancelling.storeName}»` });
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof Error ? e.message : 'Отмена не выполнена' });
    } finally {
      setCancelling(null);
      setBusy(false);
      refresh();
    }
  };

  if (loadError && !balances) {
    return (
      <div className="p-6">
        <EmptyState icon={AlertTriangle} title="Не удалось загрузить кассы" description={loadError} action={<Button onClick={refresh}>Повторить</Button>} />
      </div>
    );
  }
  if (!balances) return <LoadingState label="Загрузка касс…" />;

  const centralCashUsd = Number(balances.central?.cashUsd ?? 0);
  const bonusCashUsd = Number(balances.bonusAccount?.balanceUsd ?? 0);

  const neededCentralUsd = cancelling
    ? (cancelling.bonusAmountUsd !== undefined && cancelling.bonusAmountUsd > 0
        ? (cancelling.regularAmountUsd ?? 0)
        : cancelling.amountUsd)
    : 0;
  const neededBonusUsd = cancelling?.bonusAmountUsd ?? 0;

  const isCentralInsufficient = cancelling ? centralCashUsd < (neededCentralUsd - 0.001) : false;
  const isBonusInsufficient = cancelling && neededBonusUsd > 0 ? bonusCashUsd < (neededBonusUsd - 0.001) : false;
  const isCancelDisabled = isCentralInsufficient || isBonusInsufficient;

  const selectedStore = effectiveStoreId ? balances.stores.find((s) => s.storeId === effectiveStoreId) : null;

  return (
    <div className="space-y-4 w-full">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Balances: Central Cash & Bonus Account */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {balances.central && (
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-surface to-surface p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 text-accent flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle truncate">
                  Центральная касса
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-base sm:text-lg font-black font-mono text-fg tabular-nums truncate">
                    {formatTjs(balances.central.cashTjs)}
                  </p>
                  <span className="text-xs font-medium text-fg-subtle tabular-nums truncate">
                    ≈ {formatUsd(balances.central.cashUsd)}
                  </span>
                </div>
              </div>
            </div>
            <span className="hidden sm:inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 shrink-0">
              Куда сдаётся
            </span>
          </div>
        )}

        {balances.bonusAccount && (
          <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-surface to-surface p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle truncate">
                  Бонусный счёт
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className="text-base sm:text-lg font-black font-mono text-amber-500 dark:text-amber-400 tabular-nums truncate">
                    {formatTjs(balances.bonusAccount.balanceTjs)}
                  </p>
                  <span className="text-xs font-medium text-fg-subtle tabular-nums truncate">
                    ≈ {formatUsd(balances.bonusAccount.balanceUsd)}
                  </span>
                </div>
              </div>
            </div>
            <span className="hidden sm:inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 shrink-0">
              Бонусы
            </span>
          </div>
        )}
      </div>

      {/* Store registers list */}
      <section className="space-y-2.5" aria-label="Кассы магазинов">
        <div className="flex items-center justify-between px-1">
          {effectiveStoreId && selectedStore ? (
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-fg uppercase tracking-wider">
                Касса выбранного магазина
              </h2>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-fg-subtle uppercase tracking-wider">Кассы магазинов</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-raised border border-border text-fg-subtle">
                {balances.stores.length}
              </span>
            </div>
          )}

          {effectiveStoreId ? (
            <button
              type="button"
              onClick={() => {
                if (onSelectStoreId) onSelectStoreId(null);
                setLocalSelectedStoreId(null);
              }}
              className="text-xs font-bold text-accent hover:underline cursor-pointer flex items-center gap-1 transition-colors"
            >
              <span>← Все магазины ({balances.stores.length})</span>
            </button>
          ) : (
            <span className="text-[11px] text-fg-subtle font-medium">
              Нажмите на магазин для просмотра истории и инкассации
            </span>
          )}
        </div>

        {balances.stores.length === 0 ? (
          <p className="text-xs text-fg-subtle p-6 bg-surface rounded-2xl border border-border text-center">
            Магазинов нет
          </p>
        ) : (
          <div className="space-y-2.5">
            {balances.stores
              .filter((s) => !effectiveStoreId || s.storeId === effectiveStoreId)
              .map((store) => {
                const empty = isZero(store.cashUsd);
                const unreconciled = !isZero(store.unreconciledUsd);
                const hasBonus = Number(store.bonusCashUsd || 0) > 0;
                const isSelected = effectiveStoreId === store.storeId;

                return (
                  <div
                    key={store.storeId}
                    onClick={() => handleStoreClick(store.storeId)}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-accent bg-accent/5 ring-2 ring-accent/30 shadow-xs'
                        : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-raised/40 shadow-2xs'
                    }`}
                    title={isSelected ? 'Нажмите, чтобы показать все магазины' : 'Нажмите, чтобы показать кассу и историю этого магазина'}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                          empty
                            ? 'bg-surface-raised text-fg-subtle'
                            : isSelected
                            ? 'bg-accent text-accent-fg'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        <StoreIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-fg truncate">{store.storeName}</p>
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-fg font-bold">
                              Выбран
                            </span>
                          )}
                          {hasBonus && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-semibold shrink-0">
                              Бонусы: {formatUsd(store.bonusCashUsd || 0)} ({store.bonusCount} шт.)
                            </span>
                          )}
                          {!empty && store.isShiftClosed === false && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold shrink-0 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{store.unclosedReason || 'Смена не закрыта'}</span>
                            </span>
                          )}
                          {!empty && store.isShiftClosed === true && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-semibold shrink-0 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Смена закрыта</span>
                            </span>
                          )}
                          {store.daysWithoutCollection !== undefined && store.daysWithoutCollection > 0 && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 flex items-center gap-1 border ${
                                store.daysWithoutCollection >= 3
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                                  : store.daysWithoutCollection >= 2
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                  : 'bg-surface-raised border-border text-fg-subtle'
                              }`}
                              title={
                                store.lastCollectedAt
                                  ? `Последняя инкассация: ${new Date(store.lastCollectedAt).toLocaleString('ru-RU')}`
                                  : 'Первая инкассация кассы'
                              }
                            >
                              <Clock className="w-3 h-3" />
                              <span>
                                {store.daysWithoutCollection >= 2
                                  ? `Не инкассировался ${store.daysWithoutCollection} дн.`
                                  : 'Не инкассировался вчера'}
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline gap-2">
                          <span className="text-base sm:text-lg font-black font-mono text-fg tabular-nums">
                            {formatTjs(store.cashTjs)}
                          </span>
                          <span className="text-xs sm:text-sm font-medium text-fg-subtle tabular-nums">
                            ≈ {formatUsd(store.cashUsd)}
                          </span>
                        </div>

                        {!empty && (
                          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-mono font-medium">
                              <Banknote className="w-3 h-3 shrink-0" />
                              <span>Наличные: {formatTjs(store.cashOnlyTjs ?? store.cashTjs)}</span>
                            </span>
                            {Number(store.cardOnlyTjs || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md font-mono font-medium">
                                <CreditCard className="w-3 h-3 shrink-0" />
                                <span>Банк: {formatTjs(store.cardOnlyTjs)}</span>
                              </span>
                            )}
                          </div>
                        )}

                        <div className="text-[11px] text-fg-subtle pt-0.5">
                          {store.lastCollectedAt ? (
                            <span>
                              Посл. инкассация:{' '}
                              {new Date(store.lastCollectedAt).toLocaleDateString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          ) : (
                            <span className="text-accent font-medium">Первая инкассация (с открытия кассы)</span>
                          )}
                        </div>

                        {unreconciled && (
                          <p className="text-[11px] text-warning font-semibold">
                            Не сверена (расхождение {formatUsd(store.unreconciledUsd)})
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      {empty ? (
                        <span className="h-8 px-2.5 rounded-lg bg-surface-raised border border-border text-fg-subtle text-xs font-medium flex items-center gap-1.5 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle/50" />
                          <span>Касса пуста</span>
                        </span>
                      ) : store.isShiftClosed === false ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDailyClosingModalOpen(true, store.storeId);
                            }}
                            className="h-8 px-2.5 rounded-lg bg-surface-raised hover:bg-accent hover:text-accent-fg border border-border text-xs font-semibold text-fg transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
                            title="Закрыть смену / Z-отчёт"
                          >
                            <FileCheck2 className="w-3.5 h-3.5 text-accent" />
                            <span>Z-отчёт</span>
                          </button>
                          <button
                            type="button"
                            disabled
                            className="h-8 px-3 rounded-lg bg-surface-raised border border-border text-fg-subtle text-xs font-semibold flex items-center gap-1.5 opacity-50 cursor-not-allowed select-none"
                            title={store.unclosedReason ? `${store.unclosedReason}. Сначала выполните Z-отчёт` : 'Инкассация невозможна: сначала закройте смену (Z-отчёт)'}
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            <span>Инкассировать</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={unreconciled || busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollecting(store);
                          }}
                          className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          <span>Инкассировать</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* If a store is selected, show its multi-day uncollected details */}
      {effectiveStoreId && selectedStore && (
        <UncollectedDaysDetailSection
          store={selectedStore}
          onCollect={() => {
            setCollecting(selectedStore);
          }}
          busy={busy}
        />
      )}

      {/* History — shown ONLY when a specific store is selected, with collapse toggle */}
      {effectiveStoreId && selectedStore && (
        <section className="space-y-2.5 mt-4" aria-label="История инкассаций">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-bold text-fg-subtle uppercase tracking-wider">
                История инкассаций: <span className="text-fg font-extrabold">{selectedStore.storeName}</span>
              </h2>
              {history.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  {history.length}{' '}
                  {history.length === 1
                    ? 'операция'
                    : [2, 3, 4].includes(history.length % 10) && ![12, 13, 14].includes(history.length % 100)
                    ? 'операции'
                    : 'операций'}
                </span>
              )}
            </div>

            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHistoryCollapsed((c) => !c)}
                className="text-xs font-semibold text-fg-subtle hover:text-fg flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-surface-raised border border-border/60 transition-all cursor-pointer"
                title={isHistoryCollapsed ? 'Развернуть историю' : 'Свернуть историю'}
              >
                <span>{isHistoryCollapsed ? 'Развернуть' : 'Свернуть'}</span>
                {isHistoryCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          {!isHistoryCollapsed && (
            history.length === 0 ? (
              <div className="p-6 bg-surface rounded-2xl border border-border text-center">
                <Clock className="w-8 h-8 text-fg-subtle/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-fg-subtle">
                  За выбранный период инкассаций по магазину «{selectedStore.storeName}» не найдено
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-surface divide-y divide-border/60 overflow-hidden shadow-xs">
                {history.map((item) => {
                  const hasBonus = item.bonusAmountUsd !== undefined && item.bonusAmountUsd > 0;
                  const isCancelled = item.status === 'CANCELLED';

                  return (
                    <div
                      key={item.id}
                      className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-surface-raised/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-fg font-mono">{item.transactionNumber}</span>
                          {isCancelled ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">
                              Отменена
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Проведена
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-fg-subtle mt-1 flex items-center gap-1.5 flex-wrap">
                          <span>{new Date(item.createdAt).toLocaleString('ru-RU')}</span>
                          <span>·</span>
                          <span>
                            Сдал(а): <strong className="text-fg font-semibold">{item.createdByName}</strong>
                          </span>
                        </p>
                        {hasBonus && !isCancelled && (
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap">
                            <span className="inline-flex items-center gap-1 text-accent font-medium bg-accent/5 px-2 py-0.5 rounded border border-accent/15">
                              <Landmark className="w-3 h-3" />
                              Центр: {formatUsd(item.regularAmountUsd ?? 0)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400 font-medium bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/15">
                              <Gift className="w-3 h-3" />
                              Бонусы: {formatUsd(item.bonusAmountUsd ?? 0)} ({item.bonusCount ?? 0} шт.)
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right tabular-nums">
                          <p
                            className={`font-black font-mono text-sm sm:text-base ${
                              isCancelled ? 'line-through text-fg-subtle' : 'text-fg'
                            }`}
                          >
                            {formatTjs(item.amountTjs)}
                          </p>
                          <p className="text-[11px] text-fg-subtle">{formatUsd(item.amountUsd)}</p>
                        </div>
                        {item.status === 'POSTED' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setCancelling(item)}
                            className="h-8 px-2.5 rounded-lg bg-surface-raised hover:bg-danger/10 border border-border hover:border-danger/30 text-fg-subtle hover:text-danger text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            title={`Отменить инкассацию ${item.transactionNumber}`}
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Отменить</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </section>
      )}

      {/* Confirmation modal with bonus split preview */}
      <ConfirmDialog
        open={collecting !== null}
        tone="default"
        title="Инкассировать кассу?"
        confirmLabel="Инкассировать"
        loading={busy}
        onConfirm={confirmCollect}
        onCancel={() => {
          if (!busy) setCollecting(null);
        }}
        message={
          collecting && (
            <div className="space-y-3 text-xs">
              <p className="text-fg-subtle">Касса «{collecting.storeName}»</p>
              <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-fg">
                  <span>Инкассируется всего:</span>
                  <span className="tabular-nums">
                    {formatTjs(collecting.cashTjs)} · {formatUsd(collecting.cashUsd)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border/60 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Banknote className="w-3.5 h-3.5 shrink-0" />
                      Наличными в кассе:
                    </span>
                    <span className="font-semibold tabular-nums font-mono">
                      {formatTjs(collecting.cashOnlyTjs ?? collecting.cashTjs)}
                    </span>
                  </div>
                  {Number(collecting.cardOnlyTjs || 0) > 0 && (
                    <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                      <span className="flex items-center gap-1.5 font-medium">
                        <CreditCard className="w-3.5 h-3.5 shrink-0" />
                        Банк:
                      </span>
                      <span className="font-semibold tabular-nums font-mono">
                        {formatTjs(collecting.cardOnlyTjs)}
                      </span>
                    </div>
                  )}
                </div>
                {Number(collecting.bonusCashUsd || 0) > 0 ? (
                  <div className="pt-2 border-t border-border/60 space-y-1.5 text-fg-subtle">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-accent" />
                        В Центральную кассу:
                      </span>
                      <span className="font-semibold text-fg tabular-nums">
                        {formatTjs(collecting.regularCashTjs || 0)} · {formatUsd(collecting.regularCashUsd || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-amber-500 dark:text-amber-400">
                      <span className="flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" />
                        На Бонусный счёт ({collecting.bonusCount || 0} шт.):
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatTjs(collecting.bonusCashTjs || 0)} · {formatUsd(collecting.bonusCashUsd || 0)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )
        }
      />

      <ConfirmDialog
        open={cancelling !== null}
        title="Отменить инкассацию?"
        confirmLabel="Отменить инкассацию"
        loading={busy}
        confirmDisabled={isCancelDisabled}
        onConfirm={confirmCancel}
        onCancel={() => {
          if (!busy) setCancelling(null);
        }}
        message={
          cancelling && (
            <div className="space-y-2.5 text-xs">
              <p>
                {formatTjs(cancelling.amountTjs)} ({formatUsd(cancelling.amountUsd)}) вернутся в кассу «
                {cancelling.storeName}».
              </p>
              {cancelling.bonusAmountUsd !== undefined && cancelling.bonusAmountUsd > 0 ? (
                <p className="text-fg-subtle">
                  Из Центральной кассы будет списано {formatUsd(cancelling.regularAmountUsd ?? 0)}, а с
                  Бонусного счёта — {formatUsd(cancelling.bonusAmountUsd)}.
                </p>
              ) : (
                <p className="text-fg-subtle">
                  Сумма {formatUsd(cancelling.amountUsd)} должна быть в Центральной кассе.
                </p>
              )}

              {isCentralInsufficient && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Недостаточно средств в Центральной кассе
                  </div>
                  <div>
                    В Центральной кассе сейчас {formatUsd(centralCashUsd)}, а для отмены требуется{' '}
                    {formatUsd(neededCentralUsd)}.
                  </div>
                </div>
              )}

              {isBonusInsufficient && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Недостаточно средств на Бонусном счёте
                  </div>
                  <div>
                    На счёте сейчас {formatUsd(bonusCashUsd)}, а для отмены требуется{' '}
                    {formatUsd(neededBonusUsd)}.
                  </div>
                </div>
              )}
            </div>
          )
        }
      />
    </div>
  );
};
