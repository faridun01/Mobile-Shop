import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Device, Store as StoreType } from '../../types';
import { decimal, moneyNumber } from '../../utils/money';
import { formatPhoneColor } from '../../utils/phoneSpecs';
import { DeviceRow } from './DeviceRow';

type SortBy = 'COUNT_DESC' | 'COUNT_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'PRICE_DESC' | 'PRICE_ASC';

/** One stock line, as in the POS catalog: same brand, model, RAM, storage and colour. */
interface StockVariant {
  key: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  valueUsd: number;
  devices: Device[];
}

interface InventoryVariantListProps {
  devices: Device[];
  sortBy: SortBy;
  stores: StoreType[];
  selectedLocationId: string;
  isAdmin: boolean;
  rate?: number;
  onSelectDevice: (device: Device) => void;
}

const titleOf = (v: StockVariant) => `${v.brand} ${v.model}`;

/** Warehouse phones as POS-style rows: name, «RAM · storage · colour», count; tap opens the unit or its IMEI list. */
export const InventoryVariantList: React.FC<InventoryVariantListProps> = ({
  devices,
  sortBy,
  stores,
  selectedLocationId,
  isAdmin,
  rate,
  onSelectDevice,
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const variants = useMemo(() => {
    const map = new Map<string, StockVariant>();
    for (const dev of devices) {
      const ram = dev.ram?.trim() || '';
      const color = formatPhoneColor(dev.color);
      const key = `${dev.brand}_${dev.model}_${ram}_${dev.storage}_${color}`;
      let v = map.get(key);
      if (!v) {
        v = { key, brand: dev.brand, model: dev.model, ram: ram || undefined, storage: dev.storage, color, valueUsd: 0, devices: [] };
        map.set(key, v);
      }
      v.devices.push(dev);
      v.valueUsd = moneyNumber(decimal(v.valueUsd).plus(dev.purchaseCostUsd || 0));
    }

    const byName = (a: StockVariant, b: StockVariant) =>
      titleOf(a).localeCompare(titleOf(b), 'ru', { numeric: true })
      || (a.ram || '').localeCompare(b.ram || '', 'ru', { numeric: true })
      || (a.storage || '').localeCompare(b.storage || '', 'ru', { numeric: true })
      || a.color.localeCompare(b.color, 'ru');
    const list = Array.from(map.values());
    list.sort((a, b) => {
      switch (sortBy) {
        case 'COUNT_ASC': return a.devices.length - b.devices.length || byName(a, b);
        case 'NAME_ASC': return byName(a, b);
        case 'NAME_DESC': return byName(b, a);
        case 'PRICE_DESC': return b.valueUsd - a.valueUsd || byName(a, b);
        case 'PRICE_ASC': return a.valueUsd - b.valueUsd || byName(a, b);
        default: return b.devices.length - a.devices.length || byName(a, b);
      }
    });
    return list;
  }, [devices, sortBy]);

  const handleSelect = (v: StockVariant) => {
    if (v.devices.length === 1) {
      onSelectDevice(v.devices[0]);
    } else {
      setExpandedKey((prev) => (prev === v.key ? null : v.key));
    }
  };

  return (
    <div className="divide-y divide-border bg-surface">
      {variants.map((v) => {
        const expanded = expandedKey === v.key;
        return (
          <div key={v.key}>
            <button
              type="button"
              onClick={() => handleSelect(v)}
              className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors hover:bg-surface-raised/40 cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg-muted truncate">{titleOf(v)}</p>
                <p className="text-xs text-fg-subtle mt-0.5">
                  {v.ram ? `${v.ram} · ` : ''}{v.storage} · {v.color}
                </p>
              </div>

              <div className="text-right shrink-0 flex items-center gap-2">
                <span className="text-xs text-fg-subtle tabular-nums">{v.devices.length} шт.</span>
                {v.devices.length > 1 && (
                  <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
                )}
              </div>
            </button>

            {expanded && (
              <div className="bg-surface/60 border-t border-border px-4 py-2 space-y-1">
                {v.devices.map((dev) => {
                  const store = stores.find((s) => s.id === dev.locationId);
                  const isWh = store?.isMainWarehouse || dev.status === 'MAIN_WAREHOUSE';
                  const storeName = isWh ? 'Главный склад' : dev.locationName || store?.name || 'Магазин';
                  return (
                    <DeviceRow
                      key={dev.id}
                      device={dev}
                      isAdmin={isAdmin}
                      storeName={selectedLocationId === 'ALL' ? storeName : undefined}
                      isMainWarehouse={isWh}
                      rate={rate}
                      hideModelName
                      compact
                      hideSpecs
                      onClick={() => onSelectDevice(dev)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
