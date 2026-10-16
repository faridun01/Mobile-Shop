import React from 'react';
import { Percent, Store, AlertTriangle, UserPlus, Warehouse } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatUserName } from '../../utils/formatUser';
import { formatStoreName } from '../../utils/storeContext';
import { Store as StoreType, Owner, StoreProfitShare } from '../../types';

interface StoreSharesSectionProps {
  stores: StoreType[];
  adminOwner?: Owner;
  partnerForStore: (storeId: string) => Owner | undefined;
  storeProfitShares: StoreProfitShare[];
  showMainWarehouseNote: boolean;
  onEdit: (storeId: string) => void;
}

/**
 * How each store's profit is split: the store's partner gets the share the admin sets, the
 * admin gets the rest. One row per store, with the action that store needs.
 */
export const StoreSharesSection: React.FC<StoreSharesSectionProps> = ({
  stores,
  adminOwner,
  partnerForStore,
  storeProfitShares,
  showMainWarehouseNote,
  onEdit,
}) => {
  const adminName = formatUserName(adminOwner?.name, 'Администратор');

  return (
    <section className="space-y-2 sm:space-y-2.5">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
        <h2 className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide">Доли прибыли по магазинам</h2>
      </div>
     

      <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden">
        {stores.length === 0 && (
          <div className="p-3 text-xs text-fg-subtle">Магазинов пока нет.</div>
        )}
        {stores.map((store) => {
          const partner = partnerForStore(store.id);
          const share = partner ? storeProfitShares.find((sh) => sh.storeId === store.id && sh.ownerId === partner.id) : undefined;
          const partnerPct = share ? Number(share.sharePercent) : undefined;
          const adminPct = partnerPct !== undefined ? Math.round((100 - partnerPct) * 100) / 100 : 100;

          return (
            <div key={store.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
              <div className="flex items-center gap-2 min-w-0 sm:w-56 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-fg-subtle shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-fg truncate">{formatStoreName(store.name)}</div>
                  <div className="text-[11px] text-fg-subtle truncate">
                    {partner ? `Партнёр: ${formatUserName(partner.name, 'Партнёр')}` : 'Партнёра нет'}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                {!partner ? (
                  <div className="flex items-start gap-1.5 text-[11px] text-fg-subtle leading-snug">
                    <UserPlus className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      Вся прибыль у администратора. Чтобы поделить её, добавьте сотрудника с ролью «Партнёр» для этого магазина на странице «Сотрудники».
                    </span>
                  </div>
                ) : partnerPct === undefined ? (
                  <div className="flex items-start gap-1.5 text-[11px] text-warning font-medium leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>Доля не задана — сейчас вся прибыль магазина идёт администратору.</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-bg border border-border">
                      <div className="h-full bg-accent" style={{ width: `${adminPct}%` }} />
                      <div className="h-full bg-info" style={{ width: `${partnerPct}%` }} />
                    </div>
                    <div className="flex justify-between gap-2 text-[11px]">
                      <span className="text-fg-subtle truncate">{adminName}: <strong className="text-accent font-mono">{adminPct}%</strong></span>
                      <span className="text-fg-subtle truncate">{formatUserName(partner.name, 'Партнёр')}: <strong className="text-info font-mono">{partnerPct}%</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {partner && (
                <button
                  type="button"
                  onClick={() => onEdit(store.id)}
                  className={cn(
                    'h-9 px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 self-stretch sm:self-auto',
                    partnerPct === undefined
                      ? 'bg-accent hover:bg-accent-strong text-accent-fg shadow-xs'
                      : 'bg-surface-raised hover:bg-surface border border-border text-fg'
                  )}
                >
                  {partnerPct === undefined ? 'Задать долю' : 'Изменить'}
                </button>
              )}
            </div>
          );
        })}
        {showMainWarehouseNote && (
          <div className="px-3 py-2.5 flex items-center gap-2 text-[11px] text-fg-subtle bg-surface-raised/40">
            <Warehouse className="w-3.5 h-3.5 shrink-0" />
            <span>Главный склад: вся прибыль у администратора — доли партнёров для него не задаются.</span>
          </div>
        )}
      </div>
    </section>
  );
};
