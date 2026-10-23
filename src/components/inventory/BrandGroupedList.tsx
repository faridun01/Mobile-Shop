import React, { useState } from 'react';
import { Device, Store as StoreType } from '../../types';
import { formatUsd, sumMoney } from '../../utils/money';
import { formatPhoneColor } from '../../utils/phoneSpecs';
import { Sparkles, ChevronDown, Edit2 } from 'lucide-react';
import { DeviceRow } from './DeviceRow';
import { BrandGroupItem } from './types';
import { RenameModelModal } from './RenameModelModal';

/** One stock line inside a brand: the same model, memory and colour. */
interface StockLine {
  key: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
  devices: Device[];
  valueUsd: number;
  /** Every phone of the model (all its lines): a rename applies to the whole model. */
  modelDeviceIds: string[];
}

function stockLines(bGroup: BrandGroupItem): StockLine[] {
  const lines: StockLine[] = [];
  for (const mGroup of bGroup.modelGroups) {
    const modelDeviceIds = mGroup.devices.map((d) => d.id);
    for (const variant of mGroup.variants) {
      const byColor = new Map<string, Device[]>();
      for (const dev of variant.devices) {
        const color = formatPhoneColor(dev.color) || 'Стандарт';
        byColor.set(color, [...(byColor.get(color) ?? []), dev]);
      }
      for (const [color, devices] of [...byColor].sort(([x], [y]) => x.localeCompare(y, 'ru'))) {
        lines.push({
          key: `${mGroup.key}__${variant.key}__${color}`,
          model: mGroup.model,
          ram: variant.ram,
          storage: variant.storage,
          color,
          devices,
          valueUsd: sumMoney(devices.map((d) => d.purchaseCostUsd || 0)),
          modelDeviceIds,
        });
      }
    }
  }
  return lines;
}

interface BrandGroupedListProps {
  brandGroups: BrandGroupItem[];
  expandedBrandKeys: Record<string, boolean>;
  onToggleBrandKey: (key: string) => void;
  onSetAllBrandKeys: (keys: Record<string, boolean>) => void;
  expandedModelKeys: Record<string, boolean>;
  onToggleModelKey: (key: string) => void;
  stores: StoreType[];
  selectedLocationId: string;
  activeStore: StoreType | null;
  isAdmin: boolean;
  /** Totals of stock value (sums over many units): the admin only; `isAdmin` here gates the cost of each unit. */
  showStockValue?: boolean;
  rate?: number;
  totalFilteredDevicesCount: number;
  onSelectDevice: (device: Device) => void;
  onBatchRenameModel?: (params: { deviceIds: string[]; newModel: string; newBrand?: string }) => Promise<{ success: boolean; count?: number; message?: string }>;
  onNotify?: (msg: { tone: 'info' | 'warning' | 'error' | 'success'; text: string }) => void;
}

export const BrandGroupedList: React.FC<BrandGroupedListProps> = ({
  brandGroups,
  expandedBrandKeys,
  onToggleBrandKey,
  onSetAllBrandKeys,
  expandedModelKeys,
  onToggleModelKey,
  stores,
  selectedLocationId,
  activeStore,
  isAdmin,
  showStockValue = isAdmin,
  rate,
  totalFilteredDevicesCount,
  onSelectDevice,
  onBatchRenameModel,
  onNotify,
}) => {
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    brand: string;
    model: string;
    deviceIds: string[];
  }>({
    isOpen: false,
    brand: '',
    model: '',
    deviceIds: [],
  });

  const allExpanded = brandGroups.length > 0 && brandGroups.every(b => expandedBrandKeys[b.key]);

  const handleToggleAll = () => {
    const next: Record<string, boolean> = {};
    if (!allExpanded) {
      brandGroups.forEach(b => {
        next[b.key] = true;
      });
    }
    onSetAllBrandKeys(next);
  };

  const allBrandNames = brandGroups.map(b => b.brand);

  return (
    <div className="divide-y divide-border">
      {/* Header controls: Expand/Collapse All */}
      <div className="py-1.5 px-3 sm:py-2 sm:px-4 bg-surface-raised/40 flex items-center justify-between gap-2 border-b border-border">
        <span className="text-xs font-semibold text-fg-subtle flex items-center gap-1.5 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span>Брендов: <strong className="text-fg">{brandGroups.length}</strong></span>
          <span className="opacity-60">·</span>
          <span>Телефонов: <strong className="text-accent">{totalFilteredDevicesCount}</strong> шт.</span>
          {activeStore && (
            <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 text-[10px] font-bold">
              {activeStore.name}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={handleToggleAll}
          className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
        >
          <span className="sm:hidden">{allExpanded ? 'Свернуть' : 'Развернуть'}</span>
          <span className="hidden sm:inline">{allExpanded ? 'Свернуть все бренды' : 'Развернуть все бренды'}</span>
        </button>
      </div>

      {brandGroups.map((bGroup) => {
        const isBrandExpanded = !!expandedBrandKeys[bGroup.key];
        return (
          <div key={bGroup.key} className="transition-colors">
            {/* Brand Row Header */}
            <div
              onClick={() => onToggleBrandKey(bGroup.key)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors hover:bg-surface-raised/40 cursor-pointer select-none"
            >
              {/* Left: Brand name and model count */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-extrabold text-fg truncate">
                    {bGroup.brand}
                  </h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-raised text-fg-subtle border border-border">
                    {bGroup.distinctModelsCount}{' '}
                    {bGroup.distinctModelsCount === 1
                      ? 'модель'
                      : bGroup.distinctModelsCount < 5
                      ? 'модели'
                      : 'моделей'}
                  </span>
                </div>
              </div>

              {/* Right: Phone count & financial value */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-1">
                    <span className="text-sm sm:text-base font-black text-accent font-mono">
                      {bGroup.totalCount}
                    </span>
                    <span className="text-xs text-fg-subtle font-medium">
                      {bGroup.totalCount === 1 ? 'телефон' : bGroup.totalCount < 5 ? 'телефона' : 'телефонов'}
                    </span>
                  </div>
                  {showStockValue && (
                    <div className="text-[11px] text-fg-subtle font-mono mt-0.5">
                      <span className="font-bold text-fg-muted">{formatUsd(bGroup.totalValueUsd)}</span>
                    </div>
                  )}
                </div>

                <div
                  className={`w-7 h-7 rounded-xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle transition-transform duration-200 ${
                    isBrandExpanded ? 'rotate-180 text-accent border-accent/40' : ''
                  }`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Brand body: one line per configuration (model · memory · colour); a tap shows its IMEIs */}
            {isBrandExpanded && (
              <div className="bg-surface/30 border-t border-border px-2 sm:px-3 py-2 space-y-1.5">
                {stockLines(bGroup).map((line) => {
                  const isOpen = !!expandedModelKeys[line.key];
                  return (
                    <div key={line.key} className="rounded-xl border border-border/70 bg-surface overflow-hidden">
                      <div
                        onClick={() => onToggleModelKey(line.key)}
                        className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface-raised/40 active:bg-surface-raised transition-colors cursor-pointer select-none"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-fg truncate">{line.model}</p>
                          <p className="text-xs text-fg-subtle mt-0.5 truncate">
                            {[line.ram, line.storage, line.color].filter(Boolean).join(' · ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Quick Rename Button: renames the whole model, all its configurations */}
                          {onBatchRenameModel && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameModal({
                                  isOpen: true,
                                  brand: bGroup.brand,
                                  model: line.model,
                                  deviceIds: line.modelDeviceIds,
                                });
                              }}
                              className="p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface-raised active:scale-95 transition-all cursor-pointer"
                              title="Переименовать модель"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="text-right">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                              {line.devices.length} шт.
                            </span>
                            {showStockValue && line.valueUsd > 0 && (
                              <span className="block text-[10px] text-fg-subtle font-mono leading-none mt-0.5 font-medium">
                                {formatUsd(line.valueUsd)}
                              </span>
                            )}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform duration-200 ${isOpen ? 'rotate-180 text-accent' : ''}`} />
                        </div>
                      </div>

                      {isOpen && (
                        <div className="border-t border-border/60 p-1.5 space-y-1 bg-surface/40">
                          {line.devices.map((dev) => {
                            const store = stores.find(s => s.id === dev.locationId);
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
                                hideColor
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
            )}
          </div>
        );
      })}

      {/* Model Rename Dialog */}
      {onBatchRenameModel && (
        <RenameModelModal
          isOpen={renameModal.isOpen}
          initialBrand={renameModal.brand}
          initialModel={renameModal.model}
          deviceIds={renameModal.deviceIds}
          existingBrands={allBrandNames}
          onClose={() => setRenameModal(prev => ({ ...prev, isOpen: false }))}
          onRename={onBatchRenameModel}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
