import React, { useState, useCallback, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { FileCheck2, Landmark, Store as StoreIcon, CheckCircle2 } from 'lucide-react';
import { CashDeskPanel } from '../finance/CashDeskPanel';
import { useUIStore } from '../../stores/useUIStore';
import { formatStoreDisplayTitle } from '../../utils/storeContext';
import { apiClient } from '../../api/client';

export const CashDeskPage: React.FC = () => {
  const { currentUser, stores, selectedStoreId } = useAppFields(
    'currentUser',
    'stores',
    'selectedStoreId'
  );
  const { setDailyClosingModalOpen } = useUIStore();
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isTodayClosed, setIsTodayClosed] = useState(false);

  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';

  const effectiveStoreId =
    isPartner && currentUser?.storeId
      ? currentUser.storeId
      : (selectedStoreId || 'all');

  const currentStore = stores.find((s) => s.id === effectiveStoreId);
  const isCentral = effectiveStoreId === 'all' || (currentStore?.isMainWarehouse === true);

  const checkTodayClosing = useCallback(async () => {
    if (!effectiveStoreId || effectiveStoreId === 'all' || currentStore?.isMainWarehouse) {
      setIsTodayClosed(false);
      return;
    }
    try {
      const summary = await apiClient<{ alreadyClosed: boolean }>(
        `/daily-closings/summary?storeId=${encodeURIComponent(effectiveStoreId)}`
      );
      setIsTodayClosed(Boolean(summary?.alreadyClosed));
    } catch {
      setIsTodayClosed(false);
    }
  }, [effectiveStoreId, currentStore?.isMainWarehouse]);

  useEffect(() => {
    void checkTodayClosing();
  }, [checkTodayClosing]);

  useEffect(() => {
    const handler = () => void checkTodayClosing();
    window.addEventListener('business-data-changed', handler);
    return () => window.removeEventListener('business-data-changed', handler);
  }, [checkTodayClosing]);

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел кассы доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 h-full overflow-y-auto min-h-0 bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Sticky Controls Bar */}
      {isCentral ? (
        // Central Cash Desk Mode: pure financial overview without switching to stores
        // Shifts are never closed in the central store/desk, only in retail stores
        isAdmin && (
          <div className="sticky top-0 z-20 px-3 sm:px-4 py-2 border-b border-border bg-surface/95 backdrop-blur-sm flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
                <Landmark className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-fg truncate">
                {currentStore?.isMainWarehouse ? 'Центральная касса (Главный склад)' : 'Центральная касса (Все точки)'}
              </span>
            </div>
          </div>
        )
      ) : (
        // Store Mode (Admin or Partner entered a specific retail store):
        // STRICTLY show only this store's cash desk — NO choice of other stores!
        <div className="sticky top-0 z-20 px-3 sm:px-4 py-1.5 border-b border-border bg-surface/95 backdrop-blur-sm flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-accent/10 text-accent border border-accent/25 truncate shadow-2xs">
              <StoreIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{formatStoreDisplayTitle(currentStore)}</span>
            </span>
          </div>

          {/* Quick Z-Report / Closing Button for this retail store only */}
          {currentStore && !currentStore.isMainWarehouse && (
            isTodayClosed ? (
              isAdmin ? (
                <button
                  type="button"
                  onClick={() => setDailyClosingModalOpen(true, effectiveStoreId)}
                  className="h-8 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-500/25 active:scale-95 transition-all shadow-2xs cursor-pointer shrink-0"
                  title="Смена закрыта. Нажмите для просмотра или отмены закрытия"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                  <span>Смена закрыта</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setDailyClosingModalOpen(true, effectiveStoreId)}
                  className="h-8 px-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-500/15 active:scale-95 transition-all shadow-2xs cursor-pointer shrink-0"
                  title="Смена на сегодня уже закрыта. Повторное закрытие недоступно. Только администратор может отменить закрытие"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                  <span>Смена закрыта</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setDailyClosingModalOpen(true, effectiveStoreId)}
                className="h-8 px-2.5 rounded-lg bg-accent text-accent-fg text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
                title="Закрыть смену / Z-отчёт"
              >
                <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                <span>Z-отчёт</span>
              </button>
            )
          )}
        </div>
      )}

      {/* Main Cash & Shift Closing Content */}
      <div className="p-3 sm:p-4 max-w-7xl mx-auto">
        <CashDeskPanel storeId={effectiveStoreId} />
      </div>
    </div>
  );
};
