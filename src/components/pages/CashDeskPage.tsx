import React, { useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatStoreName } from '../../utils/storeContext';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { Wallet, Store as StoreIcon } from 'lucide-react';
import { CashDeskPanel } from '../finance/CashDeskPanel';

export const CashDeskPage: React.FC = () => {
  const { currentUser, stores, selectedStoreId, setSelectedStoreId } = useAppFields(
    'currentUser',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );

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
  const currentStore = stores.find((s) => s.id === effectiveStoreId);
  const pageTitle = isCentral
    ? 'Центральная касса (Общий итог по всем магазинам)'
    : currentStore?.isMainWarehouse
    ? `Центральная касса (${currentStore.name})`
    : `Касса: ${formatStoreName(currentStore?.name || 'Магазин')}`;

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел кассы доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight">
              {pageTitle}
            </h1>
            <p className="text-[11px] text-fg-subtle">
              Наличные деньги в кассе, должники и поставщики
            </p>
          </div>
        </div>

        {/* Store Selector (Admin) */}
        {isAdmin && stores.length > 0 && (
          <div className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-xl px-2.5 h-9 shrink-0">
            <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
            <select
              value={effectiveStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-transparent text-xs font-bold text-fg focus:outline-none cursor-pointer"
              title="Выбрать кассу / магазин"
            >
              <option value="all">
                Центральная касса (Общий итог)
              </option>
              {retailStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {stores.filter((s) => s.isMainWarehouse).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Главный склад)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Cash & Z-Report Content */}
      <div className="flex-1 overflow-y-auto">
        <CashDeskPanel storeId={effectiveStoreId} />
      </div>
    </div>
  );
};
