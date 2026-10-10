import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { StoreSelector } from '../common/StoreSelector';
import { apiClient } from '../../api/client';
import { useAppFields } from '../../context/AppContext';
import { DailyClosingSummary, DailyCashClosing } from '../../types';
import { formatTjs, formatUsd } from '../../utils/money';
import { soundEffects } from '../../utils/sound';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Banknote,
  CreditCard,
  Clock,
  UserCheck,
  Calendar,
  Store as StoreIcon,
  Info,
  RotateCcw,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { formatStoreName, formatStoreDisplayTitle, useStoreContext } from '../../utils/storeContext';
import { useUIStore } from '../../stores/useUIStore';

interface DailyCashClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string;
  storeName?: string;
  businessDate?: string;
  readOnly?: boolean;
  onClosed?: (closing: DailyCashClosing) => void;
  onReopened?: () => void;
}

const getLocalCurrentDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

type DayFigures = {
  cashTjs: number; cashUsd: number;
  bankTjs: number; bankUsd: number;
  otherTjs: number; otherUsd: number;
  refundsTjs: number; refundsUsd: number;
  expensesTjs: number; expensesUsd: number;
  totalTjs: number; totalUsd: number;
};

const num = (value: number | string | null | undefined) => Number(value) || 0;

/** A day-total closing (or an open day's summary) as figures; null for closings made before the day-total rules. */
const dayFigures = (source: (DailyClosingSummary | DailyCashClosing) | undefined, total: 'expected' | 'actual'): DayFigures | null => {
  if (!source || source.salesCardUsd === null || source.salesCardUsd === undefined) return null;
  return {
    cashTjs: num(source.salesCashTjs), cashUsd: num(source.salesCashUsd),
    bankTjs: num(source.salesCardTjs), bankUsd: num(source.salesCardUsd),
    otherTjs: num(source.otherCashTjs), otherUsd: num(source.otherCashUsd),
    refundsTjs: num(source.refundsCashTjs), refundsUsd: num(source.refundsCashUsd),
    expensesTjs: num(source.expensesCashTjs), expensesUsd: num(source.expensesCashUsd),
    totalTjs: num(total === 'actual' ? (source as DailyCashClosing).actualCashTjs : source.expectedCashTjs),
    totalUsd: num(total === 'actual' ? (source as DailyCashClosing).actualCashUsd : source.expectedCashUsd),
  };
};

/**
 * The day on its own: cash and bank taken, debt repayments, refunds and the store's paid
 * expenses, and the day's total that goes to collection. The admin sees dollars first.
 */
const DayBreakdown: React.FC<{ figures: DayFigures; showUsd: boolean }> = ({ figures, showUsd }) => {
  const rows: { label: string; tjs: number; usd: number; sign: '' | '−' }[] = [
    { label: 'Наличные', tjs: figures.cashTjs, usd: figures.cashUsd, sign: '' },
    { label: 'Банк', tjs: figures.bankTjs, usd: figures.bankUsd, sign: '' },
    ...(figures.otherTjs || figures.otherUsd ? [{ label: 'Погашения долгов и прочее', tjs: figures.otherTjs, usd: figures.otherUsd, sign: '' as const }] : []),
    ...(figures.refundsTjs ? [{ label: 'Возвраты', tjs: figures.refundsTjs, usd: figures.refundsUsd, sign: '−' as const }] : []),
    ...(figures.expensesTjs ? [{ label: 'Расходы магазина', tjs: figures.expensesTjs, usd: figures.expensesUsd, sign: '−' as const }] : []),
  ];
  return (
    <div className="rounded-2xl bg-surface-raised border border-border p-3.5 space-y-1.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 text-fg-muted">
          <span>{row.label}</span>
          <span className="font-mono font-semibold text-right">
            {showUsd ? `${row.sign}${formatUsd(row.usd)}` : `${row.sign}${formatTjs(row.tjs)}`}
            {showUsd && <span className="block text-[11px] font-normal text-fg-subtle">{row.sign}{formatTjs(row.tjs)}</span>}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border font-bold text-fg">
        <span>Итог дня</span>
        <span className="font-mono text-right text-lg">
          {showUsd ? formatUsd(figures.totalUsd) : formatTjs(figures.totalTjs)}
          {showUsd && <span className="block text-[11px] font-normal text-fg-subtle">{formatTjs(figures.totalTjs)}</span>}
        </span>
      </div>
    </div>
  );
};

/** Cash and bank for the day, as two large figures (closings made before the day-total rules). */
const DayTotals: React.FC<{ cashTjs: number | string | undefined; bankTjs: number | string | undefined }> = ({ cashTjs, bankTjs }) => (
  <div className="grid grid-cols-2 gap-2.5">
    <div className="p-3.5 rounded-2xl bg-surface-raised border border-border">
      <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5">
        <Banknote className="w-4 h-4 text-success" />
        Наличные
      </span>
      <p className="text-xl sm:text-2xl font-black font-mono text-fg mt-1.5 tracking-tight break-all">{formatTjs(cashTjs)}</p>
    </div>
    <div className="p-3.5 rounded-2xl bg-surface-raised border border-border">
      <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5">
        <CreditCard className="w-4 h-4 text-info" />
        Банк
      </span>
      <p className="text-xl sm:text-2xl font-black font-mono text-fg mt-1.5 tracking-tight break-all">{formatTjs(bankTjs)}</p>
    </div>
  </div>
);

/**
 * Shift closing. The seller or partner confirms the day as the system calculated it: cash in
 * the register and bank (card) takings. The admin sees the same figures and can reopen a day.
 */
export const DailyCashClosingModal: React.FC<DailyCashClosingModalProps> = ({
  isOpen,
  onClose,
  storeId: explicitStoreId,
  storeName: explicitStoreName,
  businessDate: explicitBusinessDate,
  readOnly,
  onClosed,
  onReopened,
}) => {
  const { currentUser, stores, selectedStoreId, setSelectedStoreId } = useAppFields(
    'currentUser',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );
  const { triggerStoreTransition } = useUIStore();
  const storeCtx = useStoreContext();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [isConfirmReopenOpen, setIsConfirmReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);

  const retailStores = useMemo(
    () => stores.filter((s) => !s.isMainWarehouse && s.active),
    [stores]
  );

  // Auto-detect the target retail store
  const detectedStoreId = useMemo(() => {
    // 1. Explicit prop passed to modal
    if (explicitStoreId && explicitStoreId !== 'all') {
      const found = stores.find((s) => s.id === explicitStoreId && !s.isMainWarehouse);
      if (found) return found.id;
    }
    // 2. Non-admin users (SELLER / PARTNER) are strictly tied to their store
    if ((currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER') && currentUser.storeId) {
      return currentUser.storeId;
    }
    // 3. Active store context (from topbar switch / context)
    if (storeCtx.mode === 'STORE' && storeCtx.storeId) {
      return storeCtx.storeId;
    }
    // 4. AppContext selectedStoreId
    if (selectedStoreId && selectedStoreId !== 'all') {
      const match = stores.find((s) => s.id === selectedStoreId && !s.isMainWarehouse);
      if (match) return match.id;
    }
    // 5. UIStore selectedStoreId
    const uiStoreId = useUIStore.getState().selectedStoreId;
    if (uiStoreId && uiStoreId !== 'all') {
      const match = stores.find((s) => s.id === uiStoreId && !s.isMainWarehouse);
      if (match) return match.id;
    }
    // 6. UIStore dailyClosingStoreId
    const uiClosingId = useUIStore.getState().dailyClosingStoreId;
    if (uiClosingId && uiClosingId !== 'all') {
      const match = stores.find((s) => s.id === uiClosingId && !s.isMainWarehouse);
      if (match) return match.id;
    }
    // 7. Fallback for admin: default to first retail store if available
    if (retailStores.length > 0) {
      return retailStores[0].id;
    }
    return '';
  }, [explicitStoreId, currentUser?.role, currentUser?.storeId, storeCtx, selectedStoreId, stores, retailStores]);

  const [selectedStoreIdState, setSelectedStoreIdState] = useState<string>('');
  const [selectedDateState, setSelectedDateState] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const explicitValid =
        explicitStoreId &&
          explicitStoreId !== 'all' &&
          stores.some((s) => s.id === explicitStoreId && !s.isMainWarehouse)
          ? explicitStoreId
          : '';
      const target = explicitValid || detectedStoreId;
      setSelectedStoreIdState(target);
      setSelectedDateState(explicitBusinessDate || '');
    }
  }, [isOpen, explicitStoreId, detectedStoreId, explicitBusinessDate, stores]);

  const effectiveStoreId = useMemo(() => {
    if (selectedStoreIdState && selectedStoreIdState !== 'all') {
      const found = stores.find((s) => s.id === selectedStoreIdState && !s.isMainWarehouse);
      if (found) return found.id;
    }
    if (explicitStoreId && explicitStoreId !== 'all') {
      const found = stores.find((s) => s.id === explicitStoreId && !s.isMainWarehouse);
      if (found) return found.id;
    }
    return detectedStoreId || '';
  }, [selectedStoreIdState, explicitStoreId, detectedStoreId, stores]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === effectiveStoreId),
    [stores, effectiveStoreId]
  );
  const effectiveStoreName = explicitStoreName || (activeStore ? formatStoreName(activeStore.name) : 'Магазин');
  const isStoreScoped =
    Boolean(explicitStoreId && explicitStoreId !== 'all') ||
    storeCtx.mode === 'STORE' ||
    Boolean(selectedStoreId && selectedStoreId !== 'all');

  const isInsideTargetStore = storeCtx.mode === 'STORE' && storeCtx.storeId === effectiveStoreId;

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DailyClosingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCloseShift = isInsideTargetStore && !readOnly && !summary?.alreadyClosed;
  const isReadOnly = Boolean(readOnly || summary?.alreadyClosed || !isInsideTargetStore);

  const noRetailStores = retailStores.length === 0;

  const fetchSummary = async (dateOverride?: string) => {
    const targetStoreId = effectiveStoreId || explicitStoreId || selectedStoreIdState;
    if (!targetStoreId) return;
    const targetDate = dateOverride ?? (selectedDateState || explicitBusinessDate);
    setLoading(true);
    setError(null);
    try {
      let url = `/daily-closings/summary?storeId=${encodeURIComponent(targetStoreId)}`;
      if (targetDate) {
        url += `&businessDate=${encodeURIComponent(targetDate)}`;
      }
      setSummary(await apiClient<DailyClosingSummary>(url));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить данные кассы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && effectiveStoreId) {
      void fetchSummary(selectedDateState || explicitBusinessDate);
    }
  }, [isOpen, effectiveStoreId, selectedDateState, explicitBusinessDate]);

  // The seller/partner/admin confirms the calculated day; no counted amount is sent.
  const handleCloseShift = async () => {
    if (submitting || summary?.alreadyClosed || !canCloseShift) return;
    const finalStoreId = effectiveStoreId || summary?.storeId;
    if (!finalStoreId || finalStoreId === 'all') {
      setError('Выберите магазин');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const closingDate = selectedDateState || explicitBusinessDate || summary?.businessDate;
      const result = await apiClient<DailyCashClosing>('/daily-closings', {
        method: 'POST',
        body: JSON.stringify({ storeId: finalStoreId, businessDate: closingDate }),
      });
      soundEffects.playAddToCartSuccess();
      window.dispatchEvent(new CustomEvent('business-data-changed'));
      onClosed?.(result);
      await fetchSummary(closingDate);
    } catch (err: any) {
      setError(err?.message || 'Не удалось закрыть смену');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenClosing = async () => {
    if (!closing?.id || reopening) return;
    setReopening(true);
    setError(null);
    try {
      await apiClient(`/daily-closings/${closing.id}`, { method: 'DELETE' });
      soundEffects.playAddToCartSuccess();
      window.dispatchEvent(new CustomEvent('business-data-changed'));
      setIsConfirmReopenOpen(false);
      onReopened?.();
      const targetDate = selectedDateState || explicitBusinessDate || summary?.businessDate;
      await fetchSummary(targetDate);
    } catch (err: any) {
      setError(err?.message || 'Не удалось отменить закрытие смены');
    } finally {
      setReopening(false);
    }
  };

  const closing = summary?.closing;
  const closedDifference = Number(closing?.differenceTjs ?? 0);

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={() => { if (!submitting && !reopening) onClose(); }}
        title={
          readOnly
            ? 'Просмотр закрытой смены'
            : summary?.alreadyClosed
            ? 'Смена закрыта'
            : isInsideTargetStore
            ? 'Закрытие смены'
            : 'Просмотр кассы'
        }
        subtitle={noRetailStores ? undefined : `${effectiveStoreName} · ${summary?.businessDate || explicitBusinessDate || 'Сегодня'}`}
        maxWidth="sm"
        footer={
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <div>
              {isAdmin && summary?.alreadyClosed && closing?.id && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  leftIcon={RotateCcw}
                  onClick={() => setIsConfirmReopenOpen(true)}
                  disabled={submitting || reopening}
                  loading={reopening}
                  className="font-medium"
                >
                  Отменить закрытие
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canCloseShift && summary && !noRetailStores ? (
                <>
                  <Button variant="secondary" onClick={onClose} disabled={submitting || reopening} className="flex-1 sm:flex-initial">
                    Отмена
                  </Button>
                  <Button
                    onClick={handleCloseShift}
                    loading={submitting}
                    disabled={loading || submitting || reopening}
                    leftIcon={CheckCircle2}
                    className="flex-1 sm:flex-initial font-bold"
                  >
                    Закрыть смену
                  </Button>
                </>
              ) : (
                <Button onClick={onClose} disabled={reopening} className="w-full sm:w-auto">
                  Закрыть
                </Button>
              )}
            </div>
          </div>
        }
      >
        {noRetailStores ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <StoreIcon className="w-6 h-6" />
            </div>
            <p className="text-sm text-fg-subtle">Нет розничных магазинов</p>
          </div>
        ) : loading && !summary ? (
          <div className="p-8 text-center text-fg-subtle space-y-3">
            <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Загрузка…</p>
          </div>
        ) : error && !summary ? (
          <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{error}</p>
              <Button variant="secondary" onClick={() => void fetchSummary()} className="mt-3">
                Повторить
              </Button>
            </div>
          </div>
        ) : summary ? (
          <div className="space-y-3.5">
            {activeStore && (
              <div className="flex items-center justify-between gap-2 p-2 px-2.5 rounded-xl bg-surface-raised border border-border">
                <span className="text-xs font-semibold text-fg-subtle">
                  Магазин:
                </span>
                {!isInsideTargetStore && isAdmin && retailStores.length > 1 ? (
                  <StoreSelector
                    value={effectiveStoreId}
                    onChange={setSelectedStoreIdState}
                    stores={retailStores}
                    retailOnly
                    className="max-w-[200px]"
                    compact
                  />
                ) : (
                  <span className="text-xs font-bold text-fg flex items-center gap-1.5 truncate">
                    <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="truncate">{formatStoreDisplayTitle(activeStore)}</span>
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 p-2 px-2.5 rounded-xl bg-surface-raised border border-border">
              <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                Дата смены:
              </span>
              {isReadOnly ? (
                <span className="text-xs font-bold font-mono text-fg bg-surface px-2.5 py-1 rounded-lg border border-border select-all">
                  {selectedDateState || summary.businessDate || explicitBusinessDate}
                </span>
              ) : isAdmin ? (
                <input
                  type="date"
                  value={selectedDateState || summary.businessDate}
                  max={getLocalCurrentDate()}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    if (newDate) {
                      setSelectedDateState(newDate);
                    }
                  }}
                  className="text-xs font-bold font-mono text-fg bg-surface px-2.5 py-1 rounded-lg border border-border focus:outline-hidden focus:border-accent cursor-pointer"
                />
              ) : (
                <span className="text-xs font-bold font-mono text-fg bg-surface px-2.5 py-1 rounded-lg border border-border">
                  {summary.businessDate}
                </span>
              )}
            </div>

            {summary.alreadyClosed ? (
              <>
                {dayFigures(closing, 'actual')
                  ? <DayBreakdown figures={dayFigures(closing, 'actual')!} showUsd={isAdmin} />
                  : <DayTotals cashTjs={closing?.actualCashTjs} bankTjs={closing?.salesCardTjs} />}
                <p className="text-xs text-fg-subtle flex items-center gap-1.5 flex-wrap">
                  <UserCheck className="w-3.5 h-3.5 text-success" />
                  <span>{closing?.closedByName}</span>
                  <span>·</span>
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {closing?.createdAt
                      ? new Date(closing.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                </p>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <p className="font-bold">Кассовая смена закрыта</p>
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      Смена за {summary.businessDate} успешно зафиксирована. Повторное закрытие кассы заблокировано.
                    </p>
                  </div>
                </div>

                {isAdmin ? (
                  <div className="p-3 rounded-xl bg-accent/10 border border-accent/25 text-fg text-xs flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-accent mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <p className="font-bold text-accent">Управление сменой (Администратор)</p>
                      <p className="text-[11px] text-fg-subtle leading-relaxed">
                        Повторное закрытие заблокировано для сотрудников. Если необходимо внести исправления или пересчитать кассу, нажмите кнопку «Отменить закрытие» внизу.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
                    <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="space-y-0.5 flex-1">
                      <p className="font-bold">Повторное закрытие заблокировано</p>
                      <p className="text-[11px] opacity-90 leading-relaxed">
                        Касса на сегодня уже закрыта. Повторное закрытие недоступно. Только администратор может отменить закрытие и переоткрыть смену.
                      </p>
                    </div>
                  </div>
                )}

                {closedDifference !== 0 && (
                  <p className={`text-xs font-semibold ${closedDifference < 0 ? 'text-danger' : 'text-info'}`}>
                    {closedDifference < 0 ? 'Недостача' : 'Излишек'}: {closedDifference > 0 ? '+' : ''}{formatTjs(closedDifference)}
                  </p>
                )}
              </>
            ) : (
              <>
                {dayFigures(summary, 'expected')
                  ? <DayBreakdown figures={dayFigures(summary, 'expected')!} showUsd={isAdmin} />
                  : <DayTotals cashTjs={summary.expectedCashTjs} bankTjs={summary.salesCardTjs} />}
                {!isInsideTargetStore && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>Закрыть кассу можно только находясь в самом магазине. Из центральной кассы доступен только просмотр.</span>
                    </div>
                    {isAdmin && activeStore && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          triggerStoreTransition({
                            storeName: formatStoreDisplayTitle(activeStore),
                            storeId: activeStore.id,
                            isCentral: false,
                          });
                          setSelectedStoreId(activeStore.id);
                          useUIStore.getState().setSelectedStoreId(activeStore.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-accent text-accent-fg font-semibold text-xs whitespace-nowrap active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
                      >
                        Перейти в магазин
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={isConfirmReopenOpen}
        title="Отменить закрытие кассы?"
        message={
          <div className="space-y-2 text-xs text-fg-subtle">
            <p>
              Вы собираетесь отменить закрытие смены за <strong className="text-fg">{summary?.businessDate || explicitBusinessDate}</strong> магазина <strong className="text-fg">{effectiveStoreName}</strong>.
            </p>
            <p>
              Смена снова станет открытой. Запись закрытия будет удалена, а сотрудники смогут продолжить кассовые операции или закрыть смену заново.
            </p>
          </div>
        }
        confirmLabel="Да, отменить закрытие"
        cancelLabel="Назад"
        tone="danger"
        loading={reopening}
        onConfirm={handleReopenClosing}
        onCancel={() => { if (!reopening) setIsConfirmReopenOpen(false); }}
      />
    </>
  );
};
