import React, { useState } from 'react';
import { Device, Store as StoreType } from '../../types';
import { Smartphone, ChevronDown, SlidersHorizontal, Layers, Edit2 } from 'lucide-react';
import { DeviceRow } from './DeviceRow';
import { useGroupedDevices } from '../../hooks/useGroupedDevices';
import { formatUsd } from '../../utils/money';
import { RenameModelModal } from './RenameModelModal';

type DeviceGroup = ReturnType<typeof useGroupedDevices>[number];

interface ModelGroupedListProps {
  groups: DeviceGroup[];
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  stores: StoreType[];
  selectedLocationId: string;
  isAdmin: boolean;
  rate?: number;
  onSelectDevice: (device: Device) => void;
  onBatchRenameModel?: (params: { deviceIds: string[]; newModel: string; newBrand?: string }) => Promise<{ success: boolean; count?: number; message?: string }>;
  onNotify?: (msg: { tone: 'info' | 'warning' | 'error' | 'success'; text: string }) => void;
}

export const ModelGroupedList: React.FC<ModelGroupedListProps> = ({
  groups,
  expandedGroups,
  onToggleGroup,
  stores,
  selectedLocationId,
  isAdmin,
  rate,
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

  const allBrandNames = Array.from(new Set(groups.map(g => g.brand))).filter(Boolean);

  return (
    <div className="divide-y divide-border">
      {groups.map((group) => {
        const isExpanded = expandedGroups[group.key];
        const allDevices = group.devices || group.storageGroups.flatMap(sg => sg.colorGroups.flatMap(cg => cg.devices));
        const hasMultipleVariants = group.variants && group.variants.length > 1;

        return (
          <div key={group.key}>
            {/* Model Row Header */}
            <div className="w-full px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2.5 active:bg-surface-raised transition-colors hover:bg-surface-raised/40">
              <button
                type="button"
                onClick={() => onToggleGroup(group.key)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0 text-accent">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold text-fg truncate">
                    {group.brand} {group.model}
                  </p>
                </div>
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
                        brand: group.brand,
                        model: group.model,
                        deviceIds: allDevices.map(d => d.id),
                      });
                    }}
                    className="p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface-raised active:scale-95 transition-all cursor-pointer"
                    title="Переименовать модель"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}

                <div
                  onClick={() => onToggleGroup(group.key)}
                  className="flex items-center gap-1.5 cursor-pointer select-none"
                >
                  <div className="text-right">
                    <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-accent/10 text-accent border border-accent/20">
                      {group.count} шт.
                    </span>
                    {isAdmin && group.valueUsd > 0 && (
                      <span className="block text-[10px] text-fg-subtle font-mono leading-none mt-0.5 font-medium">
                        {formatUsd(group.valueUsd)}
                      </span>
                    )}
                  </div>
                  <div
                    className={`p-1 rounded-md text-fg-subtle transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-accent' : ''
                    }`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Model Devices Content (Compact) */}
            {isExpanded && (
              <div className="bg-surface/30 border-t border-border p-2 sm:p-2.5 space-y-1.5">
                {/* Multiple variants overview bar */}
                {hasMultipleVariants && (
                  <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-raised/60 border border-border/70 text-[11px]">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <SlidersHorizontal className="w-3 h-3 text-accent shrink-0" />
                      <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                        Конфигурации:
                      </span>
                      {group.variants.map((v) => (
                        <span
                          key={v.key}
                          className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] font-mono font-bold text-fg shadow-2xs"
                        >
                          {v.label} <span className="text-accent font-extrabold">({v.count})</span>
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-fg-subtle font-mono shrink-0">
                      Всего: <strong className="text-fg font-bold">{group.count} шт.</strong>
                    </div>
                  </div>
                )}

                {/* Variants breakdown (RAM and Storage configurations) */}
                {hasMultipleVariants ? (
                  group.variants.map((variant) => {
                    const isVariantCollapsed = !!collapsedVariantKeys[`${group.key}__${variant.key}`];
                    return (
                      <div
                        key={variant.key}
                        className="rounded-xl border border-border/70 bg-surface/50 overflow-hidden shadow-2xs"
                      >
                        {/* Variant Header Row */}
                        <div
                          onClick={() => handleToggleVariant(`${group.key}__${variant.key}`)}
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

                        {/* Compact Devices belonging to this variant */}
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
                  /* Single Variant or Fallback to flat device list */
                  <div className="space-y-1">
                    {group.variants && group.variants[0] && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-surface-raised/50 border border-border/60 text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3 h-3 text-accent shrink-0" />
                          <span className="font-bold text-fg text-[11px]">
                            {group.variants[0].label}
                          </span>
                          <span className="text-[10px] text-accent font-bold px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20">
                            {group.count} шт.
                          </span>
                        </div>
                        {isAdmin && group.valueUsd > 0 && (
                          <span className="text-[11px] text-fg-subtle font-medium">
                            {formatUsd(group.valueUsd)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="space-y-1">
                      {allDevices.map((dev) => {
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
