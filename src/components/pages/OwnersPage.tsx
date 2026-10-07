import React, { useState, useMemo } from 'react';
import { formatUserName } from '../../utils/formatUser';
import { capitalByLocation } from '../../utils/ownerCapital';
import { useAppFields } from '../../context/AppContext';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import {
  Plus,
  Percent,
  Users,
  Coins,
  Briefcase,
  Loader2,
  FileText
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useStoreContext } from '../../utils/storeContext';
import { OwnerTransactionModal } from '../owners/OwnerTransactionModal';
import { StoreSharesModal } from '../owners/StoreSharesModal';
import { QuarterReportModal } from '../owners/QuarterReportModal';
import { OwnerCard } from '../owners/OwnerCard';
import { OwnerTransactionsTable } from '../owners/OwnerTransactionsTable';

export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    storeProfitShares,
    users,
    stores,
    devices,
    ownerTransactions,
    todayRate,
    createOwnerTransaction,
    setStoreProfitShares,
    closeQuarterPeriod,
    initializeOwners
  } = useAppFields(
    'currentUser',
    'owners',
    'storeProfitShares',
    'users',
    'stores',
    'devices',
    'ownerTransactions',
    'todayRate',
    'createOwnerTransaction',
    'setStoreProfitShares',
    'closeQuarterPeriod',
    'initializeOwners'
  );

  const [isInitializing, setIsInitializing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal open states
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txModalOwnerId, setTxModalOwnerId] = useState<string | undefined>(undefined);
  const [txModalType, setTxModalType] = useState<'INVESTMENT' | 'WITHDRAWAL'>('INVESTMENT');

  const [isSharesModalOpen, setIsSharesModalOpen] = useState(false);
  const [selectedSharesStoreId, setSelectedSharesStoreId] = useState<string>('');

  const [isQuarterModalOpen, setIsQuarterModalOpen] = useState(false);

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;
  const storeCtx = useStoreContext();

  const handleInitializeOwners = async () => {
    setIsInitializing(true);
    const res = await initializeOwners();
    setIsInitializing(false);
    if (res.success) {
      setStatusBanner({ tone: 'success', text: 'Владельцы успешно инициализированы (50% / 50%)' });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка инициализации владельцев' });
    }
  };

  const ownerRoleRank = (role?: string) => (role === 'ADMIN' ? 0 : role === 'PARTNER' ? 1 : 2);

  // Admin inside a store sees the admin and that store's partners; Central Cash shows everyone.
  const displayOwners = useMemo(() => {
    const inStore = storeCtx.mode === 'STORE'
      ? owners.filter((o) => {
          const role = o.userId ? users.find(u => u.id === o.userId)?.role : undefined;
          return role === 'ADMIN' || o.storeId === storeCtx.storeId || storeProfitShares.some((sh) => sh.ownerId === o.id && sh.storeId === storeCtx.storeId);
        })
      : owners;
    return [...inStore].sort((a, b) => {
      const roleA = a.userId ? users.find(u => u.id === a.userId)?.role : undefined;
      const roleB = b.userId ? users.find(u => u.id === b.userId)?.role : undefined;
      return ownerRoleRank(roleA) - ownerRoleRank(roleB);
    });
  }, [owners, users, storeCtx, storeProfitShares]);

  const getOwnerDetails = (owner: { id: string; name?: string; userId?: string }) => {
    const linkedUser = owner.userId ? users.find(u => u.id === owner.userId) : undefined;
    const rawName = owner.name || linkedUser?.name;
    if (linkedUser?.role === 'ADMIN') {
      return { name: formatUserName(rawName, 'Администратор'), roleTag: 'Администратор', roleSub: 'Владелец & Управляющий' };
    }
    if (linkedUser?.role === 'PARTNER') {
      return { name: formatUserName(rawName, 'Партнер'), roleTag: 'Партнер', roleSub: 'Соучредитель бизнеса' };
    }
    return { name: formatUserName(rawName, 'Владелец'), roleTag: 'Владелец', roleSub: 'Совладелец бизнеса' };
  };

  const mainWarehouse = useMemo(() => stores.find(s => s.isMainWarehouse), [stores]);
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  const adminOwner = useMemo(() => {
    return owners.find(o => !o.storeId || users.find(u => u.id === o.userId)?.role === 'ADMIN') || owners[0];
  }, [owners, users]);

  // A partner's share is stored per store (the admin always gets the rest of that store's profit).
  const sharePairOf = (storeId: string) => storeProfitShares.find(sh => sh.storeId === storeId);
  const partnerForStore = (storeId: string) => {
    const pair = sharePairOf(storeId);
    return (pair && owners.find(o => o.id === pair.ownerId))
      || owners.find(o => o.storeId === storeId && o.id !== adminOwner?.id);
  };
  const ownerShareLabel = (ownerId: string) => {
    if (ownerId === adminOwner?.id) return 'остаток прибыли магазинов';
    const pairs = storeProfitShares.filter(sh => sh.ownerId === ownerId);
    if (!pairs.length) return 'доля не задана';
    return pairs.map(sh => `${stores.find(st => st.id === sh.storeId)?.name || 'Магазин'} ${sh.sharePercent}%`).join(', ');
  };

  // Track invested capital separately for each store and owner (used in owner cards)
  const storeInvestmentsByOwner = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    owners.forEach(owner => {
      result[owner.id] = capitalByLocation({
        capitalUsd: owner.capitalBalanceUsd || 0,
        transactions: ownerTransactions.filter(tx => tx.ownerId === owner.id),
        stores,
      });
    });
    return result;
  }, [owners, stores, ownerTransactions]);

  // Devices currently in stock across warehouses and stores
  const inStockDevices = useMemo(() => {
    return (devices || []).filter(d =>
      d.status === 'MAIN_WAREHOUSE' || d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE'
    );
  }, [devices]);

  // Breakdown of stock and cash per store / warehouse
  const storeAssetsBreakdown = useMemo(() => {
    return stores.map(store => {
      const storeDevs = inStockDevices.filter(d =>
        d.locationId === store.id ||
        (d as any).storeId === store.id ||
        (store.isMainWarehouse && (d.status === 'MAIN_WAREHOUSE' || d.locationId === 'main_warehouse'))
      );
      const stockCost = storeDevs.reduce((sum, d) => sum + (d.costBasisUsd ?? d.purchaseCostUsd ?? 0), 0);
      const cash = store.cashBalanceUsd || 0;
      return {
        id: store.id,
        name: store.name,
        isMainWarehouse: Boolean(store.isMainWarehouse),
        stockCount: storeDevs.length,
        stockCostUsd: stockCost,
        cashUsd: cash,
        totalUsd: stockCost + cash
      };
    });
  }, [stores, inStockDevices]);

  const openSharesModal = (ownerId?: string) => {
    if (ownerId) {
      const partnerStore = stores.find(s => {
        const pair = sharePairOf(s.id);
        return (pair && pair.ownerId === ownerId) || (owners.find(o => o.id === ownerId)?.storeId === s.id);
      });
      if (partnerStore) {
        setSelectedSharesStoreId(partnerStore.id);
      }
    }
    setIsSharesModalOpen(true);
  };

  const openTxModalForOwner = (ownerId: string, type: 'INVESTMENT' | 'WITHDRAWAL') => {
    setTxModalOwnerId(ownerId);
    setTxModalType(type);
    setIsTxModalOpen(true);
  };

  const handleCreateTx = async (data: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL';
    amountUsd: number;
    storeId: string;
    note?: string;
  }) => {
    if (isSubmitting) return;
    setStatusBanner(null);

    const targetStore = stores.find(s => s.id === data.storeId) || mainWarehouse || stores.find(s => s.isMainWarehouse) || stores[0];
    if (!targetStore) {
      setStatusBanner({ tone: 'error', text: 'Касса не найдена' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createOwnerTransaction({
        ownerId: data.ownerId,
        type: data.type,
        amountUsd: data.amountUsd,
        storeId: targetStore.id,
        destination: targetStore.name,
        source: targetStore.name,
        note: data.note,
      });

      if (res.success) {
        setIsTxModalOpen(false);
        const typeText = data.type === 'INVESTMENT' ? 'Внесение капитала' : 'Изъятие капитала';
        setStatusBanner({
          tone: 'success',
          text: `Операция «${typeText}» на сумму $${data.amountUsd.toLocaleString()} успешно проведена`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка транзакции' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveShares = async (storeId: string, partnerOwnerId: string, partnerSharePercent: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const targetStore = stores.find(s => s.id === storeId);
      const partnerOwner = owners.find(o => o.id === partnerOwnerId);
      const adminNum = Math.round((100 - partnerSharePercent) * 100) / 100;
      const res = await setStoreProfitShares(storeId, [{ ownerId: partnerOwnerId, sharePercent: partnerSharePercent }]);
      if (res.success) {
        setIsSharesModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Доли магазина «${targetStore?.name || ''}» сохранены: ${formatUserName(adminOwner?.name)} ${adminNum}%, ${formatUserName(partnerOwner?.name)} ${partnerSharePercent}%. Действуют для прибыли с этого момента.`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка сохранения долей' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCloseQuarter = async (data: { quarterName: string; transferRemainingToCapital: boolean }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await closeQuarterPeriod({
        quarterName: data.quarterName,
        transferRemainingToCapital: data.transferRemainingToCapital
      });

      if (res.success) {
        setIsQuarterModalOpen(false);
        setStatusBanner({
          tone: 'success',
          text: `Финансовый период «${data.quarterName}» успешно закрыт`
        });
      } else {
        setStatusBanner({ tone: 'error', text: res.message || 'Ошибка закрытия периода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Top Header Bar */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border bg-surface shrink-0">
        <div className="max-w-6xl xl:max-w-7xl mx-auto w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
              <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide truncate">
                Капитал и Учредители
              </h1>
              <p className="text-[10px] text-fg-subtle truncate">
                Учёт капитала и истории финансовых операций
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {owners.length === 0 && currentUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={handleInitializeOwners}
                disabled={isInitializing}
                className="px-2.5 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs shadow-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isInitializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
                <span>Инициализировать</span>
              </button>
            )}

            {currentUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setIsQuarterModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-500 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Сводная ведомость, закрытие периода и архив отчётов"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Отчёт за период</span>
                <span className="sm:hidden">Период</span>
              </button>
            )}

            {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
              <button
                type="button"
                onClick={() => {
                  const myOwner = currentUser?.role === 'PARTNER'
                    ? displayOwners.find(o => o.userId === currentUser.id) || displayOwners[0]
                    : displayOwners[0];
                  setTxModalOwnerId(myOwner?.id);
                  setTxModalType('INVESTMENT');
                  setIsTxModalOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Операция</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-6 bg-bg">
        <div className="max-w-6xl xl:max-w-7xl mx-auto w-full space-y-3 sm:space-y-4">
          {/* Section: Partner Cards */}
          <div className="space-y-2 sm:space-y-2.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
              <h2 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide">
                Соучредители бизнеса
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
              {displayOwners.map((owner) => {
                const info = getOwnerDetails(owner);
                return (
                  <OwnerCard
                    key={owner.id}
                    owner={owner}
                    info={info}
                    rate={rate}
                    onOpenTxModal={(type) => openTxModalForOwner(owner.id, type)}
                  />
                );
              })}
            </div>
          </div>

          {/* Section: Transaction History */}
          <OwnerTransactionsTable
            ownerTransactions={ownerTransactions}
            stores={stores}
            mainWarehouse={mainWarehouse}
            retailStores={retailStores}
            displayOwners={displayOwners}
            getOwnerDetails={getOwnerDetails}
            rate={rate}
            isCentralMode={storeCtx.mode === 'CENTRAL'}
            defaultStoreId={storeCtx.storeId}
          />
        </div>
      </div>

      {/* MODAL: Edit Shares */}
      <StoreSharesModal
        open={isSharesModalOpen}
        onClose={() => setIsSharesModalOpen(false)}
        onSave={handleSaveShares}
        retailStores={retailStores}
        stores={stores}
        adminOwner={adminOwner}
        partnerForStore={partnerForStore}
        storeProfitShares={storeProfitShares}
        initialStoreId={selectedSharesStoreId}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Transaction */}
      <OwnerTransactionModal
        open={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        onSubmit={handleCreateTx}
        displayOwners={displayOwners}
        getOwnerDetails={getOwnerDetails}
        stores={stores}
        mainWarehouse={mainWarehouse}
        retailStores={retailStores}
        rate={rate}
        initialOwnerId={txModalOwnerId}
        initialTxType={txModalType}
        isSubmitting={isSubmitting}
      />

      {/* MODAL: Quarterly Report */}
      <QuarterReportModal
        open={isQuarterModalOpen}
        onClose={() => setIsQuarterModalOpen(false)}
        onConfirmClose={handleConfirmCloseQuarter}
        displayOwners={displayOwners}
        getOwnerDetails={getOwnerDetails}
        ownerShareLabel={ownerShareLabel}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
