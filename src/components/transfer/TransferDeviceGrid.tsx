import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  X,
  Scan,
  Check,
  Minus,
  ArrowLeftRight,
  ArrowUpDown,
  CheckSquare,
  Smartphone,
  Layers,
  List,
  ChevronDown,
} from 'lucide-react';
import { formatMoney } from '../../utils/money';
import { LoadingState } from '../ui/Skeleton';
import { cn } from '../../utils/cn';
import { TransferDeviceGridProps, TransferDeviceSortOption } from './types';
import { getPhoneColorHex, formatRam } from '../../utils/phoneSpecs';
import { Device } from '../../types';

interface ModelGroupItem {
  key: string;
  brand: string;
  model: string;
  devices: Device[];
  totalCount: number;
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  storageList: { storage: string; count: number; selectedCount: number }[];
  colorList: { color: string; count: number }[];
  minPrice: number;
  maxPrice: number;
}

export const TransferDeviceGrid: React.FC<TransferDeviceGridProps> = ({
  availableDevices,
  totalAvailableCount = 0,
  selectedDeviceIds,
  searchQuery,
  setSearchQuery,
  onToggleSelectDevice,
  onSelectAllFiltered,
  onClearSelection,
  onDeviceCode,
  onScanDevice,
  isInitialLoading,
  fromStoreName,
  sortBy,
  setSortBy,
  selectedBrand,
  setSelectedBrand,
  availableBrands,
  onlySelected,
  setOnlySelected,
  onToggleBatchDevices,
}) => {
  const selectedCount = selectedDeviceIds.length;
  const [viewMode, setViewMode] = useState<'BY_MODEL' | 'BY_DEVICE'>('BY_MODEL');
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  // Group devices by model
  const modelGroups = useMemo(() => {
    const map = new Map<string, {
      key: string;
      brand: string;
      model: string;
      devices: Device[];
      storageMap: Map<string, { storage: string; count: number; selectedCount: number }>;
      colorMap: Map<string, number>;
    }>();

    for (const dev of availableDevices) {
      const key = `${dev.brand}__${dev.model}`.toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          brand: dev.brand,
          model: dev.model,
          devices: [],
          storageMap: new Map(),
          colorMap: new Map(),
        };
        map.set(key, group);
      }
      group.devices.push(dev);

      const storageKey = dev.storage || 'Без памяти';
      let sInfo = group.storageMap.get(storageKey);
      if (!sInfo) {
        sInfo = { storage: storageKey, count: 0, selectedCount: 0 };
        group.storageMap.set(storageKey, sInfo);
      }
      sInfo.count++;
      if (selectedDeviceIds.includes(dev.id)) {
        sInfo.selectedCount++;
      }

      if (dev.color) {
        group.colorMap.set(dev.color, (group.colorMap.get(dev.color) || 0) + 1);
      }
    }

    const result: ModelGroupItem[] = [];
    const selectedSet = new Set(selectedDeviceIds);

    for (const g of map.values()) {
      const groupSelectedCount = g.devices.filter(d => selectedSet.has(d.id)).length;
      const totalCount = g.devices.length;
      const prices = g.devices
        .map(d => d.retailPriceTjs ?? 0)
        .filter(p => p > 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      result.push({
        key: g.key,
        brand: g.brand,
        model: g.model,
        devices: g.devices,
        totalCount,
        selectedCount: groupSelectedCount,
        allSelected: totalCount > 0 && groupSelectedCount === totalCount,
        someSelected: groupSelectedCount > 0 && groupSelectedCount < totalCount,
        storageList: Array.from(g.storageMap.values()),
        colorList: Array.from(g.colorMap.entries()).map(([color, count]) => ({ color, count })),
        minPrice,
        maxPrice,
      });
    }

    return result.sort((a, b) => {
      if (sortBy === 'SELECTED_FIRST') {
        if (a.selectedCount > 0 && b.selectedCount === 0) return -1;
        if (a.selectedCount === 0 && b.selectedCount > 0) return 1;
      }
      if (sortBy === 'NAME_DESC') {
        return `${b.brand} ${b.model}`.localeCompare(`${a.brand} ${a.model}`);
      }
      if (sortBy === 'PRICE_DESC') {
        return b.maxPrice - a.maxPrice;
      }
      if (sortBy === 'PRICE_ASC') {
        return a.minPrice - b.minPrice;
      }
      return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
    });
  }, [availableDevices, selectedDeviceIds, sortBy]);

  // Auto-expand group if search query matches an IMEI
  useEffect(() => {
    if (searchQuery && searchQuery.trim().length >= 3) {
      const q = searchQuery.toLowerCase().trim();
      const toExpand = new Set<string>();
      for (const g of modelGroups) {
        if (g.devices.some(d => d.imei.toLowerCase().includes(q) || (d.imei2 && d.imei2.toLowerCase().includes(q)))) {
          toExpand.add(g.key);
        }
      }
      if (toExpand.size > 0) {
        setExpandedGroupKeys(prev => new Set([...prev, ...toExpand]));
      }
    }
  }, [searchQuery, modelGroups]);

  const toggleExpandGroup = (key: string) => {
    setExpandedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleGroupSelect = (group: ModelGroupItem) => {
    const groupDeviceIds = group.devices.map(d => d.id);
    const shouldSelect = !group.allSelected;

    if (onToggleBatchDevices) {
      onToggleBatchDevices(groupDeviceIds, shouldSelect);
    } else {
      for (const id of groupDeviceIds) {
        const isCurrentlySelected = selectedDeviceIds.includes(id);
        if (shouldSelect && !isCurrentlySelected) {
          onToggleSelectDevice(id);
        } else if (!shouldSelect && isCurrentlySelected) {
          onToggleSelectDevice(id);
        }
      }
    }
  };

  return (
    <>
      {/* Device search & actions bar */}
      <div className="p-2 sm:p-2.5 bg-surface border-b border-border shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onDeviceCode(searchQuery, 'enter');
                }
              }}
              enterKeyHint="search"
              placeholder="Поиск устройства (модель, IMEI, цвет)..."
              className="w-full h-9 rounded-xl bg-surface-raised border border-border pl-8 pr-8 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                title="Очистить"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onScanDevice}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-accent-strong p-0.5 transition-colors cursor-pointer"
                title="Сканировать IMEI или штрихкод"
              >
                <Scan className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scan button on mobile/desktop */}
          <button
            type="button"
            onClick={onScanDevice}
            className="h-9 px-2.5 sm:px-3 rounded-xl bg-surface-raised hover:bg-surface border border-border hover:border-accent text-accent text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
            title="Сканировать сканером или камерой"
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Сканер</span>
          </button>
        </div>

        {/* Brand & Selection Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => {
              setSelectedBrand('ALL');
              setOnlySelected(false);
            }}
            className={cn(
              'h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5',
              selectedBrand === 'ALL' && !onlySelected
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg'
            )}
          >
            <span>Все</span>
            <span
              className={cn(
                'text-[10px] px-1 py-0.2 rounded font-mono',
                selectedBrand === 'ALL' && !onlySelected
                  ? 'bg-accent-fg/20 text-accent-fg'
                  : 'bg-surface text-fg-subtle'
              )}
            >
              {totalAvailableCount || availableDevices.length}
            </span>
          </button>

          {/* Quick Filter: Selected Only */}
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlySelected(!onlySelected)}
              className={cn(
                'h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5',
                onlySelected
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
              )}
            >
              <CheckSquare className="w-3 h-3 shrink-0" />
              <span>Выбранные</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-white/20 font-mono">
                {selectedCount}
              </span>
            </button>
          )}

          {/* Brand Pills */}
          {availableBrands.map((b) => {
            const isBrandActive = selectedBrand === b.brand && !onlySelected;
            return (
              <button
                key={b.brand}
                type="button"
                onClick={() => {
                  setOnlySelected(false);
                  setSelectedBrand(selectedBrand === b.brand ? 'ALL' : b.brand);
                }}
                className={cn(
                  'h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5',
                  isBrandActive
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg'
                )}
              >
                <span>{b.brand}</span>
                <span
                  className={cn(
                    'text-[10px] px-1 py-0.2 rounded font-mono',
                    isBrandActive
                      ? 'bg-accent-fg/20 text-accent-fg'
                      : 'bg-surface text-fg-subtle'
                  )}
                >
                  {b.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Devices Toolbar: Counts + View Mode + Sorting + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-2.5 sm:px-3 py-1.5 border-b border-border/60 bg-surface/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg-muted text-[11px]">
            {onlySelected ? 'Выбранные устройства' : 'Доступные товары'}
          </span>
          <span className="px-1.5 py-0.2 rounded-full bg-surface-raised border border-border/80 text-[10px] font-bold text-fg-subtle font-mono">
            {viewMode === 'BY_MODEL' ? `${modelGroups.length} мод. (${availableDevices.length} шт.)` : `${availableDevices.length} шт.`}
          </span>
          {selectedCount > 0 && !onlySelected && (
            <span className="px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold text-[10px] flex items-center gap-1">
              <Check className="w-2.5 h-2.5 stroke-3" />
              <span>Выбрано: {selectedCount}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* View mode toggle: By model vs Individual */}
          <div className="inline-flex rounded-xl bg-surface-raised border border-border p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('BY_MODEL')}
              className={cn(
                'h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer',
                viewMode === 'BY_MODEL'
                  ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                  : 'text-fg-subtle hover:text-fg'
              )}
              title="Группировка по моделям (список)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>По моделям</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('BY_DEVICE')}
              className={cn(
                'h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer',
                viewMode === 'BY_DEVICE'
                  ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                  : 'text-fg-subtle hover:text-fg'
              )}
              title="Поштучный список устройств"
            >
              <List className="w-3.5 h-3.5" />
              <span>Поштучно</span>
            </button>
          </div>

          {/* Sort Selector Dropdown */}
          <div className="flex items-center gap-1 text-[11px] bg-surface-raised border border-border rounded-lg px-2 py-1">
            <ArrowUpDown className="w-3 h-3 text-accent shrink-0" />
            <span className="text-fg-subtle hidden sm:inline">Сортировка:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as TransferDeviceSortOption)}
              className="bg-transparent text-xs font-semibold text-fg focus:outline-none cursor-pointer pr-1"
            >
              <option value="SELECTED_FIRST">Сначала выбранные</option>
              <option value="NAME_ASC">Модель: А → Я</option>
              <option value="NAME_DESC">Модель: Я → А</option>
              <option value="NEWEST">Сначала новые</option>
              <option value="OLDEST">Сначала старые</option>
              <option value="PRICE_DESC">Цена: по убыванию</option>
              <option value="PRICE_ASC">Цена: по возрастанию</option>
            </select>
          </div>

          {availableDevices.length > 0 && (
            <button
              type="button"
              onClick={onSelectAllFiltered}
              className="text-[11px] text-accent hover:underline font-bold cursor-pointer whitespace-nowrap"
            >
              Выбрать все ({availableDevices.length})
            </button>
          )}

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[11px] text-fg-subtle hover:text-danger hover:underline cursor-pointer whitespace-nowrap"
            >
              Сбросить ({selectedCount})
            </button>
          )}
        </div>
      </div>

      {/* Devices Content */}
      <div className="flex-1 overflow-y-auto bg-bg p-2 sm:p-2.5 space-y-2 pb-24 flex flex-col">
        {isInitialLoading ? (
          <LoadingState label="Загрузка устройств…" />
        ) : availableDevices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto min-h-[260px]">
            <div className="w-13 h-13 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 shadow-xs">
              <ArrowLeftRight className="w-6 h-6" />
            </div>

            <h3 className="text-sm sm:text-base font-bold text-fg">
              {onlySelected
                ? 'Нет выбранных устройств'
                : searchQuery
                ? 'Устройства не найдены'
                : selectedBrand !== 'ALL'
                ? `Нет устройств бренда ${selectedBrand}`
                : 'Нет доступных устройств'}
            </h3>

            <p className="text-xs text-fg-subtle mt-1.5 max-w-xs leading-relaxed">
              {onlySelected
                ? 'Вы пока не выбрали ни одного устройства для перемещения.'
                : searchQuery
                ? `По запросу «${searchQuery}» устройства не найдены в этой точке.`
                : selectedBrand !== 'ALL'
                ? `В точке «${fromStoreName}» нет устройств бренда ${selectedBrand}.`
                : `В локации «${fromStoreName}» сейчас нет товаров на балансе для перемещения.`}
            </p>

            <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
              {(searchQuery || selectedBrand !== 'ALL' || onlySelected) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedBrand('ALL');
                    setOnlySelected(false);
                  }}
                  className="h-8.5 px-3.5 rounded-xl bg-surface-raised border border-border text-fg text-xs font-semibold hover:border-accent hover:text-accent transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Сбросить фильтры</span>
                </button>
              )}
              <button
                type="button"
                onClick={onScanDevice}
                className="h-8.5 px-3.5 rounded-xl bg-surface-raised border border-border text-accent text-xs font-semibold hover:border-accent hover:bg-accent/10 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Сканировать IMEI</span>
              </button>
            </div>
          </div>
        ) : viewMode === 'BY_MODEL' ? (
          /* GROUPED BY MODEL LIST VIEW */
          <div className="space-y-2">
            {modelGroups.map((group) => {
              const isExpanded = expandedGroupKeys.has(group.key);
              const allSelected = group.allSelected;
              const someSelected = group.someSelected;

              return (
                <div
                  key={group.key}
                  className={cn(
                    'rounded-xl border transition-all overflow-hidden shadow-2xs',
                    allSelected
                      ? 'border-accent/50 bg-accent/5'
                      : someSelected
                      ? 'border-accent/30 bg-surface'
                      : 'border-border/80 bg-surface hover:border-border'
                  )}
                >
                  {/* Model Header Row */}
                  <div className="p-2.5 sm:p-3 flex items-center justify-between gap-3">
                    <div
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none"
                      onClick={() => toggleExpandGroup(group.key)}
                    >
                      {/* Checkbox for whole group */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleGroupSelect(group);
                        }}
                        className={cn(
                          'w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 cursor-pointer',
                          allSelected
                            ? 'bg-accent border-accent text-accent-fg'
                            : someSelected
                            ? 'bg-accent/25 border-accent text-accent'
                            : 'border-border bg-surface-raised hover:border-accent'
                        )}
                        title={allSelected ? 'Снять выделение со всех' : 'Выбрать все устройства этой модели'}
                      >
                        {allSelected ? (
                          <Check className="w-3.5 h-3.5 stroke-3" />
                        ) : someSelected ? (
                          <Minus className="w-3 h-3 stroke-3" />
                        ) : null}
                      </button>

                      <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center shrink-0 text-accent">
                        <Smartphone className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-fg truncate">
                            {group.brand} {group.model}
                          </span>
                          {allSelected ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-accent text-accent-fg font-bold">
                              Выбраны все ({group.totalCount})
                            </span>
                          ) : someSelected ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-accent/15 border border-accent/30 text-accent font-bold">
                              Выбрано: {group.selectedCount} из {group.totalCount}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-surface-raised border border-border text-fg-subtle font-mono">
                              {group.totalCount} шт.
                            </span>
                          )}
                        </div>

                        {/* Storage and color chips */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px] text-fg-subtle">
                          {group.storageList.map((st) => (
                            <span
                              key={st.storage}
                              className={cn(
                                'px-1.5 py-0.2 rounded text-[10px] font-mono border',
                                st.selectedCount > 0
                                  ? 'bg-accent/10 border-accent/25 text-accent font-semibold'
                                  : 'bg-surface-raised border-border/70 text-fg-muted'
                              )}
                            >
                              {st.storage} ({st.count} шт.)
                            </span>
                          ))}
                          {group.colorList.length > 0 && (
                            <span className="text-[10px] text-fg-subtle truncate">
                              Цвета: {group.colorList.map(c => c.color).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Price, Select all button & Chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden sm:block">
                        <span className="text-xs font-bold font-mono text-fg block">
                          {group.minPrice > 0 ? (
                            group.minPrice === group.maxPrice
                              ? `${formatMoney(group.minPrice)} TJS`
                              : `от ${formatMoney(group.minPrice)} TJS`
                          ) : '—'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleGroupSelect(group)}
                        className={cn(
                          'h-7 px-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shrink-0',
                          allSelected
                            ? 'bg-surface-raised border-border text-fg-subtle hover:text-danger hover:border-danger/30'
                            : 'bg-accent/15 border-accent/30 text-accent hover:bg-accent hover:text-accent-fg font-bold'
                        )}
                      >
                        {allSelected ? 'Снять' : `Выбрать (${group.totalCount})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpandGroup(group.key)}
                        className="w-7 h-7 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg flex items-center justify-center transition-colors cursor-pointer"
                        title={isExpanded ? 'Свернуть' : 'Развернуть список устройств'}
                      >
                        <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', isExpanded && 'rotate-180 text-accent')} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Devices List */}
                  {isExpanded && (
                    <div className="border-t border-border/70 bg-surface-raised/30 p-2 sm:p-2.5 divide-y divide-border/50">
                      {group.devices.map((dev) => {
                        const isChecked = selectedDeviceIds.includes(dev.id);
                        const colorHex = getPhoneColorHex(dev.color);
                        const formattedRam = formatRam(dev.ram);

                        return (
                          <div
                            key={dev.id}
                            onClick={() => onToggleSelectDevice(dev.id)}
                            className={cn(
                              'p-2 rounded-lg flex items-center justify-between gap-2.5 text-xs transition-colors cursor-pointer select-none',
                              isChecked
                                ? 'bg-accent/10 border border-accent/30 shadow-2xs'
                                : 'hover:bg-surface-raised'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={cn(
                                  'w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0',
                                  isChecked
                                    ? 'bg-accent border-accent text-accent-fg'
                                    : 'border-border bg-surface'
                                )}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-3" />}
                              </div>

                              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                {dev.storage && (
                                  <span className="font-mono font-bold text-fg text-xs">
                                    {dev.storage}
                                  </span>
                                )}
                                {formattedRam && !dev.storage.toLowerCase().includes(formattedRam.toLowerCase()) && (
                                  <span className="text-[10px] text-accent font-mono font-semibold">
                                    {formattedRam}
                                  </span>
                                )}
                                {dev.color && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                                    {colorHex && (
                                      <span
                                        className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                                        style={{ backgroundColor: colorHex }}
                                      />
                                    )}
                                    <span>{dev.color}</span>
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-fg-subtle ml-1">
                                  IMEI: {dev.imei}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-xs text-accent">
                                {(dev.retailPriceTjs ?? 0) > 0 ? `${formatMoney(dev.retailPriceTjs)} TJS` : '—'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* FLAT CARDS GRID VIEW */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {availableDevices.map((dev) => {
              const isChecked = selectedDeviceIds.includes(dev.id);

              return (
                <button
                  type="button"
                  key={dev.id}
                  onClick={() => onToggleSelectDevice(dev.id)}
                  aria-pressed={isChecked}
                  className={cn(
                    'w-full text-left p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all shadow-2xs relative overflow-hidden',
                    isChecked
                      ? 'bg-accent/10 border-accent/50 shadow-xs ring-1 ring-accent/30'
                      : 'bg-surface hover:bg-surface-raised/70 border-border/80'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      aria-hidden="true"
                      className={cn(
                        'w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors',
                        isChecked
                          ? 'bg-accent border-accent text-accent-fg'
                          : 'border-border bg-surface-raised'
                      )}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-3" />}
                    </div>

                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-fg truncate">
                        {dev.brand} {dev.model}
                      </span>
                      <span className="block text-[11px] text-fg-muted truncate">
                        {dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}
                      </span>
                      <span className="block text-[10px] text-fg-subtle font-mono truncate">
                        IMEI: {dev.imei}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-accent font-mono block">
                      {(dev.retailPriceTjs ?? 0) > 0 ? `${formatMoney(dev.retailPriceTjs)} TJS` : '—'}
                    </span>
                    {isChecked && (
                      <span className="text-[10px] font-bold text-accent">
                        Выбран
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
