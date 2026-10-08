import React, { useMemo } from 'react';
import { Store as StoreIcon, Warehouse, Building2 } from 'lucide-react';
import { Store } from '../../types';
import { formatStoreDisplayTitle, formatStoreName } from '../../utils/storeContext';
import { CustomSelect, CustomSelectOption } from '../ui/CustomSelect';

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
  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (retailOnly) return !s.isMainWarehouse;
      if (!includeMainWarehouse) return !s.isMainWarehouse;
      return true;
    });
  }, [stores, retailOnly, includeMainWarehouse]);

  const options = useMemo<CustomSelectOption[]>(() => {
    const list: CustomSelectOption[] = [];
    if (showAllOption) {
      list.push({
        value: allOptionValue,
        label: allOptionLabel,
        icon: <Building2 className="w-3.5 h-3.5 text-accent shrink-0" />,
      });
    }
    filteredStores.forEach((s) => {
      const isWarehouse = Boolean(s.isMainWarehouse);
      list.push({
        value: s.id,
        label: isWarehouse ? 'Главный склад' : (compact ? formatStoreName(s.name) : formatStoreDisplayTitle(s)),
        icon: isWarehouse ? (
          <Warehouse className="w-3.5 h-3.5 text-warning shrink-0" />
        ) : (
          <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
        ),
        badge: isWarehouse ? 'Склад' : 'Магазин',
      });
    });
    return list;
  }, [showAllOption, allOptionValue, allOptionLabel, filteredStores, compact]);

  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={title}
      title={title}
      size={compact ? 'sm' : 'md'}
      className={className}
    />
  );
};
