import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Device } from '../../types';
import { formatMoney } from '../../utils/money';
import { Badge } from '../ui/Badge';
import { formatPhoneColor } from '../../utils/phoneSpecs';
import { CopyImeiButton } from '../common/CopyImeiButton';

/** One sellable variant in the POS catalog: same brand, model, RAM, storage and colour. */
export interface SaleVariant {
  variantKey: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  devices: Device[];
}

/** The shelf price of a phone, or undefined when none is set. */
export const retailPriceOf = (device: Device): number | undefined =>
  device.retailPriceTjs && device.retailPriceTjs > 0 ? device.retailPriceTjs : undefined;

interface SaleVariantRowProps {
  variant: SaleVariant;
  expanded: boolean;
  /** The admin sees purchase costs and which unit cost the most. */
  showCosts: boolean;
  onSelect: (variant: SaleVariant) => void;
  onAddDevice: (device: Device) => void;
}

/** A catalog row: tap adds the only unit, or expands the IMEI list when there are several. */
export const SaleVariantRow: React.FC<SaleVariantRowProps> = ({ variant, expanded, showCosts, onSelect, onAddDevice }) => {
  const costs = variant.devices.map((d) => d.purchaseCostUsd ?? d.costBasisUsd ?? 0);
  const maxCost = costs.length ? Math.max(...costs) : 0;
  const hasCostVariance = costs.length > 1 && maxCost > Math.min(...costs);
  const sortedDevices = [...variant.devices].sort((a, b) => (b.purchaseCostUsd ?? b.costBasisUsd ?? 0) - (a.purchaseCostUsd ?? a.costBasisUsd ?? 0));
  const retailPrices = variant.devices.map(retailPriceOf).filter((p): p is number => p !== undefined);
  const minRetail = retailPrices.length ? Math.min(...retailPrices) : undefined;
  const maxRetail = retailPrices.length ? Math.max(...retailPrices) : undefined;

  return (
    <div>
      <button
        onClick={() => onSelect(variant)}
        className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors hover:bg-surface-raised/40 cursor-pointer"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg-muted truncate">{variant.brand} {variant.model}</p>
          <p className="text-xs text-fg-subtle mt-0.5">
            {variant.ram ? `${variant.ram} · ` : ''}{variant.storage} · {formatPhoneColor(variant.color)}
          </p>
        </div>

        <div className="text-right shrink-0 flex items-center gap-2">
          <div className="flex flex-col items-end gap-0.5">
            {minRetail !== undefined && (
              <span className="text-sm font-bold tabular-nums text-accent whitespace-nowrap">
                {formatMoney(minRetail)}{maxRetail !== undefined && maxRetail > minRetail ? `–${formatMoney(maxRetail)}` : ''} TJS
              </span>
            )}
            <span className="text-xs text-fg-subtle tabular-nums">{variant.devices.length} шт.</span>
          </div>
          {variant.devices.length > 1 && (
            <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="bg-surface/60 border-t border-border px-4 py-2 space-y-2">
          {sortedDevices.map((dev) => {
            const devCost = dev.purchaseCostUsd ?? dev.costBasisUsd ?? 0;
            const isHighestCost = showCosts && hasCostVariance && devCost === maxCost;
            const price = retailPriceOf(dev);
            return (
              <div
                key={dev.id}
                role="button"
                tabIndex={0}
                onClick={() => onAddDevice(dev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAddDevice(dev);
                  }
                }}
                className={`w-full p-3 text-left rounded-lg flex items-center justify-between gap-2 border transition-colors cursor-pointer select-none ${
                  isHighestCost ? 'border-warning bg-warning/10' : 'border-border bg-surface hover:bg-surface-raised'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-fg-muted font-mono flex items-center gap-1 flex-wrap">
                    <span>IMEI: {dev.imei}</span>
                    <CopyImeiButton imei={dev.imei} />
                    {dev.imei2 && (
                      <>
                        <span className="opacity-50">/</span>
                        <span>{dev.imei2}</span>
                        <CopyImeiButton imei={dev.imei2} />
                      </>
                    )}
                  </div>
                  {showCosts && devCost > 0 && <p className="text-xs text-fg-subtle mt-0.5">Закупка: ${devCost}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {price !== undefined && <span className="text-xs font-semibold tabular-nums text-fg-muted">{formatMoney(price)} TJS</span>}
                  <Badge tone={isHighestCost ? 'warning' : 'accent'}>Выбрать</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
