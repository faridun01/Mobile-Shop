import React, { useMemo } from 'react';
import { Store as StoreIcon, Warehouse } from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { cn } from '../../utils/cn';
import { TransferLocationSelectorProps } from './types';
import { CustomSelect, CustomSelectOption } from '../ui/CustomSelect';

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
  const originOptions = useMemo<CustomSelectOption[]>(() => {
    return stores.map(s => ({
      value: s.id,
      label: s.isMainWarehouse ? 'Главный склад' : formatStoreName(s.name),
      icon: s.isMainWarehouse ? <Warehouse className="w-3.5 h-3.5 text-warning shrink-0" /> : <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />,
      badge: s.isMainWarehouse ? 'Склад' : 'Магазин'
    }));
  }, [stores]);

  const destinationOptions = useMemo<CustomSelectOption[]>(() => {
    return stores
      .filter(s => s.id !== fromLocationId)
      .map(s => ({
        value: s.id,
        label: s.isMainWarehouse ? 'Главный склад' : formatStoreName(s.name),
        icon: s.isMainWarehouse ? <Warehouse className="w-3.5 h-3.5 text-warning shrink-0" /> : <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />,
        badge: s.isMainWarehouse ? 'Склад' : 'Магазин'
      }));
  }, [stores, fromLocationId]);

  return (
    <div className="px-2.5 py-1 border-b border-border bg-surface shrink-0">
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Откуда */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold text-fg-subtle flex items-center gap-1 truncate">
              <StoreIcon className="w-2.5 h-2.5 text-accent shrink-0" />
              <span className="truncate">Откуда</span>
            </span>
          </div>
          {isStoreScoped ? (
            <div className="h-7.5 px-2 rounded-lg bg-surface-raised border border-border text-fg font-medium text-xs flex items-center gap-1.5 truncate">
              <StoreIcon className="w-3 h-3 text-accent shrink-0" />
              <span className="truncate">{formatStoreName(sellerStoreName)}</span>
            </div>
          ) : (
            <CustomSelect
              value={fromLocationId ?? ''}
              onChange={onOriginChange}
              options={originOptions}
              placeholder="Откуда..."
              title="Выберите склад отправления"
              size="sm"
              className="w-full"
              triggerClassName="h-7.5 px-2 py-0 rounded-lg text-xs"
            />
          )}
        </div>

        {/* Куда */}
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold text-fg-subtle flex items-center gap-1 truncate">
              <Warehouse className="w-2.5 h-2.5 text-accent shrink-0" />
              <span className="truncate">Куда</span>
            </span>
            {!isStoreScoped && !toLocationId && (
              <span className="text-[9px] text-warning font-semibold truncate">выберите</span>
            )}
          </div>
          {isStoreScoped ? (
            <div className="h-7.5 px-2 rounded-lg bg-surface-raised border border-border text-fg font-medium text-xs flex items-center gap-1.5 truncate">
              <Warehouse className="w-3 h-3 text-accent shrink-0" />
              <span className="truncate">Главный склад</span>
            </div>
          ) : (
            <CustomSelect
              value={toLocationId ?? ''}
              onChange={onDestinationChange}
              options={destinationOptions}
              placeholder="Куда..."
              title="Выберите склад назначения"
              size="sm"
              className="w-full"
              triggerClassName={cn(
                'h-7.5 px-2 py-0 rounded-lg text-xs',
                !toLocationId && 'border-warning/60 text-warning'
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
};
