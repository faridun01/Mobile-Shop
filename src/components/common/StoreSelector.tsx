import React from 'react';
import { Store as StoreIcon, ChevronDown } from 'lucide-react';
import { Store } from '../../types';
import { formatStoreDisplayTitle, formatStoreName } from '../../utils/storeContext';

export interface StoreSelectorProps {
  value: string;
  onChange: (storeId: string) => void;
  stores: Store[];
  showAllOption?: boolean;
  allOptionLabel?: string;
  allOptionValue?: string;
  includeMainWarehouse?: boolean;
  retailOnly?: boolean;
  className?: string;
  title?: string;
  compact?: boolean;
}

export const StoreSelector: React.FC<StoreSelectorProps> = ({
  value,
  onChange,
  stores,
  showAllOption = false,
  allOptionLabel = 'Все магазины',
  allOptionValue = 'all',
  includeMainWarehouse = true,
  retailOnly = false,
  className = '',
  title = 'Выбрать магазин',
  compact = false,
}) => {
  const filteredStores = stores.filter((s) => {
    if (retailOnly) return !s.isMainWarehouse;
    if (!includeMainWarehouse) return !s.isMainWarehouse;
    return true;
  });

  const selectedStore = filteredStores.find((s) => s.id === value);
  const isAll = value === allOptionValue;

  const currentLabel = isAll
    ? allOptionLabel
    : selectedStore
    ? (compact || selectedStore.isMainWarehouse
        ? (selectedStore.isMainWarehouse ? 'Главный склад' : formatStoreName(selectedStore.name))
        : formatStoreDisplayTitle(selectedStore))
    : allOptionLabel;

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 bg-surface-raised hover:bg-surface border border-border hover:border-accent/40 rounded-xl transition-all shadow-2xs group min-w-0 max-w-full ${
        compact ? 'h-8 px-2 text-xs' : 'h-8.5 px-2.5 text-xs'
      } ${className}`}
      title={title}
    >
      <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0 group-hover:scale-105 transition-transform" />
      <span className="font-semibold text-fg truncate leading-none min-w-0 flex-1">
        {currentLabel}
      </span>
      <ChevronDown className="w-3.5 h-3.5 text-fg-subtle shrink-0 pointer-events-none group-hover:text-fg transition-colors" />

      {/* Hidden native select covering the full badge - ensures perfect touch / native dropdown without width blowout */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        title={title}
      >
        {showAllOption && (
          <option value={allOptionValue} className="bg-surface text-fg font-medium">
            {allOptionLabel}
          </option>
        )}
        {filteredStores.map((s) => (
          <option key={s.id} value={s.id} className="bg-surface text-fg font-medium">
            {formatStoreDisplayTitle(s)}
          </option>
        ))}
      </select>
    </div>
  );
};
