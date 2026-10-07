import React from 'react';
import {
  Search,
  X,
  Scan,
  Check,
  ArrowLeftRight,
  ArrowUpDown,
  CheckSquare,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { formatMoney } from '../../utils/money';
import { LoadingState } from '../ui/Skeleton';
import { cn } from '../../utils/cn';
import { TransferDeviceGridProps, TransferDeviceSortOption } from './types';

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
}) => {
  const selectedCount = selectedDeviceIds.length;

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

      {/* Devices Toolbar: Counts + Sorting + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-2.5 sm:px-3 py-1.5 border-b border-border/60 bg-surface/50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg-muted text-[11px]">
            {onlySelected ? 'Выбранные устройства' : 'Доступные товары'}
          </span>
          <span className="px-1.5 py-0.2 rounded-full bg-surface-raised border border-border/80 text-[10px] font-bold text-fg-subtle font-mono">
            {availableDevices.length}
          </span>
          {selectedCount > 0 && !onlySelected && (
            <span className="px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold text-[10px] flex items-center gap-1">
              <Check className="w-2.5 h-2.5 stroke-3" />
              <span>Выбрано: {selectedCount}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
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

      {/* Devices Checklist */}
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
        ) : (
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
