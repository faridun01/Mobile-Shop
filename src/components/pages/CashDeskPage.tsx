import React, { useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatStoreName } from '../../utils/storeContext';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { Wallet, FileCheck2 } from 'lucide-react';
import { CashDeskPanel } from '../finance/CashDeskPanel';
import { StoreSelector } from '../common/StoreSelector';
import { useUIStore } from '../../stores/useUIStore';

export const CashDeskPage: React.FC = () => {
  const { currentUser, stores, selectedStoreId, setSelectedStoreId } = useAppFields(
    'currentUser',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );
  const { setDailyClosingModalOpen } = useUIStore();

  const [status, setStatus] = useState<StatusMessage | null>(null);

  const retailStores = stores.filter((s) => !s.isMainWarehouse);

  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';

  const effectiveStoreId =
    isPartner && currentUser?.storeId
      ? currentUser.storeId
      : (selectedStoreId || 'all');

  const isCentral = effectiveStoreId === 'all';
  const currentStore = retailStores.find((s) => s.id === effectiveStoreId);
  const pageTitle = isCentral
    ? 'Центральная касса (Общий итог)'
    : `Касса: ${formatStoreName(currentStore?.name || 'Магазин')}`;

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

      {/* Compact Sticky Header */}
      <header className="sticky top-0 z-20 px-3 sm:px-4 py-2 border-b border-border bg-surface/95 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-bold text-fg leading-tight truncate">
              {pageTitle}
            </h1>
            <p className="text-[10px] text-fg-subtle truncate">
              Наличные средства и баланс кассы
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end min-w-0">
          {/* Store Selector (Admin) - retail stores only; main warehouse has no cash register */}
          {isAdmin && retailStores.length > 0 && (
            <StoreSelector
              value={effectiveStoreId}
              onChange={setSelectedStoreId}
              stores={retailStores}
              retailOnly
              showAllOption
              allOptionLabel="Центральная касса (Все)"
              allOptionValue="all"
              className="flex-1 sm:flex-initial max-w-[220px] sm:max-w-56"
              compact
            />
          )}

          {/* Quick Z-Report Button - only for specific retail stores, never on central cash desk */}
          {!isCentral && (
            <button
              type="button"
              onClick={() => setDailyClosingModalOpen(true, effectiveStoreId)}
              className="h-8 px-2.5 rounded-lg bg-accent text-accent-fg text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
              title="Закрыть смену / Z-отчёт"
            >
              <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Z-отчёт</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Cash & Shift Closing Content */}
      <div className="p-3 sm:p-4 max-w-7xl mx-auto">
        <CashDeskPanel storeId={effectiveStoreId} />
      </div>
    </div>
  );
};
