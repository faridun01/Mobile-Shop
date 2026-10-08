import React from 'react';
import { Store as StoreIcon, Warehouse } from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { cn } from '../../utils/cn';
import { TransferLocationSelectorProps } from './types';

export const TransferLocationSelector: React.FC<TransferLocationSelectorProps> = ({
  stores,
  mainWarehouse,
  isStoreScoped,
  sellerStoreName,
  fromLocationId,
  toLocationId,
  onOriginChange,
  onDestinationChange,
}) => {
  return (
    <div className="px-2.5 py-1.5 border-b border-border bg-surface shrink-0">
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Откуда */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold text-fg-subtle flex items-center gap-1 truncate">
              <StoreIcon className="w-3 h-3 text-accent shrink-0" />
              <span className="truncate">Откуда</span>
            </span>
          </div>
          {isStoreScoped ? (
            <div className="h-8 px-2 rounded-lg bg-surface-raised border border-border text-fg font-medium text-xs flex items-center gap-1.5 truncate">
              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">{formatStoreName(sellerStoreName)}</span>
            </div>
          ) : (
            <select
              value={fromLocationId ?? ''}
              onChange={(e) => onOriginChange(e.target.value)}
              className="w-full h-8 rounded-lg bg-surface-raised border border-border px-2 text-xs font-medium text-fg focus:border-accent focus:outline-none cursor-pointer truncate"
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.isMainWarehouse ? `Центр. склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Куда */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold text-fg-subtle flex items-center gap-1 truncate">
              <Warehouse className="w-3 h-3 text-accent shrink-0" />
              <span className="truncate">Куда</span>
            </span>
            {!isStoreScoped && !toLocationId && (
              <span className="text-[9px] text-warning font-semibold truncate">выберите</span>
            )}
          </div>
          {isStoreScoped ? (
            <div className="h-8 px-2 rounded-lg bg-surface-raised border border-border text-fg font-medium text-xs flex items-center gap-1.5 truncate">
              <Warehouse className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">
                {mainWarehouse
                  ? (mainWarehouse.isMainWarehouse && !mainWarehouse.name.toLowerCase().includes('центральн')
                      ? `Центр. склад (${formatStoreName(mainWarehouse.name)})`
                      : formatStoreName(mainWarehouse.name))
                  : 'Центральный склад'}
              </span>
            </div>
          ) : (
            <select
              value={toLocationId ?? ''}
              onChange={(e) => onDestinationChange(e.target.value)}
              className={cn(
                'w-full h-8 rounded-lg bg-surface-raised border px-2 text-xs font-medium text-fg focus:border-accent focus:outline-none transition-colors cursor-pointer truncate',
                !toLocationId ? 'border-warning/60 text-warning' : 'border-border'
              )}
            >
              <option value="">Выберите склад...</option>
              {stores.filter(s => s.id !== fromLocationId).map(s => (
                <option key={s.id} value={s.id}>
                  {s.isMainWarehouse ? `Центр. склад (${formatStoreName(s.name)})` : formatStoreName(s.name)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
};
