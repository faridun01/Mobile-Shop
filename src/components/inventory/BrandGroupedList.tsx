import React, { useState } from 'react';
import { Device, Store as StoreType } from '../../types';
import { formatUsd } from '../../utils/money';
import { Sparkles, ChevronDown, Smartphone, SlidersHorizontal, Layers, Edit2 } from 'lucide-react';
import { DeviceRow } from './DeviceRow';
import { BrandGroupItem } from './types';
import { RenameModelModal } from './RenameModelModal';

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
  rate,
  totalFilteredDevicesCount,
  onSelectDevice,
  onBatchRenameModel,
  onNotify,
}) => {
  const [collapsedVariantKeys, setCollapsedVariantKeys] = useState<Record<string, boolean>>({});
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

  const handleToggleVariant = (vKey: string) => {
    setCollapsedVariantKeys(prev => ({
      ...prev,
      [vKey]: !prev[vKey],
    }));
  };

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
                  {isAdmin && (
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

            {/* Brand Models Accordion Body */}
            {isBrandExpanded && (
              <div className="bg-surface/30 border-t border-border px-2 sm:px-3 py-2 space-y-1.5">
                {bGroup.modelGroups.map((mGroup) => {
                  const isModelExpanded = !!expandedModelKeys[mGroup.key];
                  const hasMultipleVariants = mGroup.variants && mGroup.variants.length > 1;

                  return (
                    <div key={mGroup.key} className="space-y-1.5">
                      {/* Model Row Header */}
                      <div className="w-full py-1.5 px-2.5 sm:px-3 rounded-xl flex items-center justify-between gap-2 bg-surface-raised/50 hover:bg-surface-raised active:bg-surface-raised border border-border/70 hover:border-border transition-colors">
                        <button
                          type="button"
                          onClick={() => onToggleModelKey(mGroup.key)}
                          className="min-w-0 flex-1 flex items-center gap-2 text-left cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                            <Smartphone className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs sm:text-sm font-extrabold text-fg truncate">
                            {mGroup.model}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Quick Rename Button */}
                          {onBatchRenameModel && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameModal({
                                  isOpen: true,
                                  brand: bGroup.brand,
                                  model: mGroup.model,
                                  deviceIds: mGroup.devices.map(d => d.id),
                                });
                              }}
                              className="p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface active:scale-95 transition-all cursor-pointer"
                              title="Переименовать модель"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <div
                            onClick={() => onToggleModelKey(mGroup.key)}
                            className="flex items-center gap-1.5 cursor-pointer select-none"
                          >
                            <div className="text-right">
                              <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                                {mGroup.count} шт.
                              </span>
                              {isAdmin && (
                                <span className="block text-[10px] text-fg-subtle font-mono leading-none mt-0.5 font-medium">
                                  {formatUsd(mGroup.valueUsd)}
                                </span>
                              )}
                            </div>
                            <div
                              className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${
                                isModelExpanded ? 'rotate-180 text-accent' : ''
                              }`}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Model Devices Content (Compact & Consolidated) */}
                      {isModelExpanded && (
                        <div className="space-y-1.5 pl-1 sm:pl-3 my-1">
                          {/* If multiple configurations exist, show a compact variant overview bar */}
                          {hasMultipleVariants && (
                            <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-raised/60 border border-border/70 text-[11px]">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <SlidersHorizontal className="w-3 h-3 text-accent shrink-0" />
                                <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                                  Конфигурации:
                                </span>
                                {mGroup.variants.map((v) => (
                                  <span
                                    key={v.key}
                                    className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] font-mono font-bold text-fg shadow-2xs"
                                  >
                                    {v.label} <span className="text-accent font-extrabold">({v.count})</span>
                                  </span>
                                ))}
                              </div>
                              <div className="text-[10px] text-fg-subtle font-mono shrink-0">
                                Всего: <strong className="text-fg font-bold">{mGroup.count} шт.</strong>
                              </div>
                            </div>
                          )}

                          {/* Render Variants breakdown */}
                          {hasMultipleVariants ? (
                            mGroup.variants.map((variant) => {
                              const isVariantCollapsed = !!collapsedVariantKeys[`${mGroup.key}__${variant.key}`];
                              return (
                                <div
                                  key={variant.key}
                                  className="rounded-xl border border-border/70 bg-surface/50 overflow-hidden shadow-2xs"
                                >
                                  {/* Variant Header Row */}
                                  <div
                                    onClick={() => handleToggleVariant(`${mGroup.key}__${variant.key}`)}
                                    className="w-full px-2.5 py-1.5 bg-surface-raised/70 hover:bg-surface-raised active:bg-surface-raised flex items-center justify-between gap-2 transition-colors cursor-pointer select-none border-b border-border/50"
                                  >
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                                      {variant.ram && (
                                        <span className="px-1.5 py-0.2 rounded-md text-[10px] font-extrabold bg-accent/15 text-accent border border-accent/25 font-mono">
                                          ОЗУ: {variant.ram}
                                        </span>
                                      )}
                                      <span className="px-1.5 py-0.2 rounded-md text-[10px] font-black bg-surface border border-border text-fg font-mono shadow-2xs">
                                        Память: {variant.storage}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="px-1.5 py-0.2 rounded-md text-[11px] font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                                        {variant.count} шт.
                                      </span>
                                      {isAdmin && variant.valueUsd > 0 && (
                                        <span className="text-[10px] text-fg-subtle font-mono font-semibold">
                                          {formatUsd(variant.valueUsd)}
                                        </span>
                                      )}
                                      <div
                                        className={`p-0.5 text-fg-subtle transition-transform duration-200 ${
                                          isVariantCollapsed ? '-rotate-90' : 'rotate-0'
                                        }`}
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Compact Devices List inside Variant */}
                                  {!isVariantCollapsed && (
                                    <div className="p-1 space-y-1 bg-surface/30">
                                      {variant.devices.map((dev) => {
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
                                            onClick={() => onSelectDevice(dev)}
                                          />
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            /* Single Variant or Flat List: Render a compact header + sleek device rows directly */
                            <div className="space-y-1">
                              {mGroup.variants && mGroup.variants[0] && (
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-surface-raised/50 border border-border/60 text-xs font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <Layers className="w-3 h-3 text-accent shrink-0" />
                                    <span className="font-bold text-fg text-[11px]">
                                      {mGroup.variants[0].label}
                                    </span>
                                    <span className="text-[10px] text-accent font-bold px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20">
                                      {mGroup.count} шт.
                                    </span>
                                  </div>
                                  {isAdmin && mGroup.valueUsd > 0 && (
                                    <span className="text-[11px] text-fg-subtle font-medium">
                                      {formatUsd(mGroup.valueUsd)}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="space-y-1">
                                {mGroup.devices.map((dev) => {
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
                                      onClick={() => onSelectDevice(dev)}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          )}
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
