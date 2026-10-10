import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { StoreSelector } from '../common/StoreSelector';
import { apiClient } from '../../api/client';
import { useAppFields } from '../../context/AppContext';
import { DailyClosingSummary, DailyCashClosing } from '../../types';
import { formatTjs } from '../../utils/money';
import { soundEffects } from '../../utils/sound';
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
} from 'lucide-react';
import { formatStoreName, formatStoreDisplayTitle, useStoreContext } from '../../utils/storeContext';
import { useUIStore } from '../../stores/useUIStore';

interface DailyCashClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string;
  storeName?: string;
  businessDate?: string;
  onClosed?: (closing: DailyCashClosing) => void;
}

/** Cash and bank for the day, as two large figures. */
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
  onClosed,
}) => {
  const { currentUser, stores, selectedStoreId } = useAppFields('currentUser', 'stores', 'selectedStoreId');
  const storeCtx = useStoreContext();
  const isAdmin = currentUser?.role === 'ADMIN';

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
      const target = (explicitStoreId && explicitStoreId !== 'all' ? explicitStoreId : '') || detectedStoreId;
      setSelectedStoreIdState(target);
      setSelectedDateState(explicitBusinessDate || '');
    }
  }, [isOpen, explicitStoreId, detectedStoreId, explicitBusinessDate]);

  const effectiveStoreId = useMemo(() => {
    if (selectedStoreIdState && selectedStoreIdState !== 'all') return selectedStoreIdState;
    if (explicitStoreId && explicitStoreId !== 'all') return explicitStoreId;
    return detectedStoreId || '';
  }, [selectedStoreIdState, explicitStoreId, detectedStoreId]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === effectiveStoreId),
    [stores, effectiveStoreId]
  );
  const effectiveStoreName = explicitStoreName || (activeStore ? formatStoreName(activeStore.name) : 'Магазин');
  const isStoreScoped =
    Boolean(explicitStoreId && explicitStoreId !== 'all') ||
    storeCtx.mode === 'STORE' ||
    Boolean(selectedStoreId && selectedStoreId !== 'all');

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DailyClosingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (submitting || summary?.alreadyClosed) return;
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

  const closing = summary?.closing;
  const closedDifference = Number(closing?.differenceTjs ?? 0);

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={() => { if (!submitting) onClose(); }}
        title={summary?.alreadyClosed ? 'Смена закрыта' : 'Закрытие смены'}
        subtitle={noRetailStores ? undefined : `${effectiveStoreName} · ${summary?.businessDate || explicitBusinessDate || 'Сегодня'}`}
        maxWidth="sm"
        footer={
          <div className="w-full flex flex-wrap items-center justify-end gap-2">
            {!summary?.alreadyClosed && summary && !noRetailStores ? (
              <>
                <Button variant="secondary" onClick={onClose} disabled={submitting} className="flex-1 sm:flex-initial">
                  Отмена
                </Button>
                <Button
                  onClick={handleCloseShift}
                  loading={submitting}
                  disabled={loading || submitting}
                  leftIcon={CheckCircle2}
                  className="flex-1 sm:flex-initial font-bold"
                >
                  Закрыть смену
                </Button>
              </>
            ) : (
              <Button onClick={onClose} className="w-full sm:w-auto">Закрыть</Button>
            )}
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
                {isAdmin && !isStoreScoped && retailStores.length > 1 ? (
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
              <input
                type="date"
                value={selectedDateState || summary.businessDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  if (newDate) {
                    setSelectedDateState(newDate);
                  }
                }}
                className="text-xs font-bold font-mono text-fg bg-surface px-2.5 py-1 rounded-lg border border-border focus:outline-hidden focus:border-accent cursor-pointer"
              />
            </div>

            {summary.alreadyClosed ? (
              <>
                <DayTotals cashTjs={closing?.actualCashTjs} bankTjs={closing?.salesCardTjs} />
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
                  <div className="space-y-0.5">
                    <p className="font-bold">Кассовая смена закрыта</p>
                    <p className="text-[11px] opacity-90">
                      Смена за {summary.businessDate} успешно зафиксирована. Касса закрывается только один раз в день.
                    </p>
                  </div>
                </div>
                {closedDifference !== 0 && (
                  <p className={`text-xs font-semibold ${closedDifference < 0 ? 'text-danger' : 'text-info'}`}>
                    {closedDifference < 0 ? 'Недостача' : 'Излишек'}: {closedDifference > 0 ? '+' : ''}{formatTjs(closedDifference)}
                  </p>
                )}
              </>
            ) : (
              <DayTotals cashTjs={summary.expectedCashTjs} bankTjs={summary.salesCardTjs} />
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
    </>
  );
};
