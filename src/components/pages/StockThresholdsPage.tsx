import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { StockThreshold, Device } from '../../types';
import { IN_STOCK_STATUSES, getBrandBadgeStyle } from '../inventory/types';
import { computeStockStatus, buildThresholdKey, StockStatusType } from '../../utils/stockThresholds';
import {
  SlidersHorizontal,
  Warehouse,
  Store as StoreIcon,
  Search,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Flame,
  Zap,
  Package,
  Plus,
  Minus,
  Sparkles,
  Loader2,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { StatCard } from '../ui/StatCard';
import { LoadingState } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';

interface ModelRowData {
  key: string;
  brand: string;
  model: string;
  storage: string;
  currentCount: number;
  minQuantity: number;
  status: StockStatusType;
  deficit: number;
  thresholdId?: string;
}

export const StockThresholdsPage: React.FC = () => {
  const { currentUser, stores, devices } = useAppFields('currentUser', 'stores', 'devices');

  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';
  const isSeller = currentUser?.role === 'SELLER';

  // 1. Store Selection
  const activeStores = useMemo(() => stores.filter((s) => s.active), [stores]);
  const mainWarehouse = useMemo(() => activeStores.find((s) => s.isMainWarehouse) || activeStores[0], [activeStores]);

  const defaultStoreId = useMemo(() => {
    if (isAdmin) {
      return mainWarehouse?.id || activeStores[0]?.id || '';
    }
    return currentUser?.storeId || activeStores[0]?.id || '';
  }, [isAdmin, mainWarehouse, activeStores, currentUser?.storeId]);

  const [selectedStoreId, setSelectedStoreId] = useState<string>(defaultStoreId);

  // If currentUser has restricted store
  useEffect(() => {
    if ((isSeller || isPartner) && currentUser?.storeId) {
      setSelectedStoreId(currentUser.storeId);
    }
  }, [isSeller, isPartner, currentUser?.storeId]);

  const currentStore = useMemo(() => {
    return activeStores.find((s) => s.id === selectedStoreId) || mainWarehouse;
  }, [activeStores, selectedStoreId, mainWarehouse]);

  const canEdit = isAdmin || (isPartner && (!currentUser?.storeId || currentUser.storeId === selectedStoreId));

  // 2. Thresholds Data
  const [thresholds, setThresholds] = useState<StockThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DEFICIT' | 'AT_RISK' | 'NORMAL' | 'NONE'>('ALL');
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [savedSuccessKeys, setSavedSuccessKeys] = useState<Record<string, boolean>>({});

  // Fetch thresholds for selected store
  const fetchThresholds = useCallback(async () => {
    if (!selectedStoreId) return;
    try {
      setLoading(true);
      const data = await apiClient<StockThreshold[]>(`/stock-thresholds?storeId=${selectedStoreId}`);
      setThresholds(data || []);
    } catch (err) {
      console.error('Failed to load stock thresholds', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    fetchThresholds();
  }, [fetchThresholds]);

  // Listen to realtime updates or changes
  useEffect(() => {
    const handleUpdate = () => {
      fetchThresholds();
    };
    window.addEventListener('business-data-changed', handleUpdate);
    return () => window.removeEventListener('business-data-changed', handleUpdate);
  }, [fetchThresholds]);

  // Threshold Map for rapid lookup
  const thresholdMap = useMemo(() => {
    const map = new Map<string, StockThreshold>();
    for (const t of thresholds) {
      map.set(buildThresholdKey(t.brand, t.model, t.storage), t);
    }
    return map;
  }, [thresholds]);

  // 3. Aggregate all distinct Brand + Model + Storage variants
  const allModelRows: ModelRowData[] = useMemo(() => {
    if (!selectedStoreId) return [];

    // Distinct models across whole catalog or existing thresholds
    const rowMap = new Map<string, { brand: string; model: string; storage: string; currentCount: number }>();

    // Step A: Catalog variants from devices
    for (const d of devices) {
      const brand = d.brand?.trim() || 'Без бренда';
      const model = d.model?.trim() || 'Без модели';
      const storage = d.storage?.trim() || '—';
      const key = buildThresholdKey(brand, model, storage);

      let row = rowMap.get(key);
      if (!row) {
        row = { brand, model, storage, currentCount: 0 };
        rowMap.set(key, row);
      }

      // Check if device is in stock at the chosen store
      if (d.locationId === selectedStoreId && IN_STOCK_STATUSES.includes(d.status)) {
        row.currentCount++;
      }
    }

    // Step B: Ensure existing configured thresholds appear even if 0 currently in stock
    for (const t of thresholds) {
      const key = buildThresholdKey(t.brand, t.model, t.storage);
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          brand: t.brand,
          model: t.model,
          storage: t.storage,
          currentCount: 0,
        });
      }
    }

    // Convert map to ModelRowData array with statuses
    const list: ModelRowData[] = [];
    for (const [key, item] of rowMap.entries()) {
      const threshold = thresholdMap.get(key);
      const minQuantity = threshold ? threshold.minQuantity : 0;
      const status = computeStockStatus(item.currentCount, minQuantity);
      const deficit = minQuantity > item.currentCount ? minQuantity - item.currentCount : 0;

      list.push({
        key,
        brand: item.brand,
        model: item.model,
        storage: item.storage,
        currentCount: item.currentCount,
        minQuantity,
        status,
        deficit,
        thresholdId: threshold?.id,
      });
    }

    // Sort: Deficit first, then Brand, then Model, then Storage
    return list.sort((a, b) => {
      if (a.status === 'DEFICIT' && b.status !== 'DEFICIT') return -1;
      if (a.status !== 'DEFICIT' && b.status === 'DEFICIT') return 1;
      if (a.status === 'AT_RISK' && b.status !== 'AT_RISK') return -1;
      if (a.status !== 'AT_RISK' && b.status === 'AT_RISK') return 1;
      const cmpBrand = a.brand.localeCompare(b.brand);
      if (cmpBrand !== 0) return cmpBrand;
      const cmpModel = a.model.localeCompare(b.model);
      if (cmpModel !== 0) return cmpModel;
      return a.storage.localeCompare(b.storage);
    });
  }, [devices, selectedStoreId, thresholds, thresholdMap]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let deficitCount = 0;
    let atRiskCount = 0;
    let normalCount = 0;
    let noneCount = 0;

    for (const row of allModelRows) {
      if (row.status === 'DEFICIT') deficitCount++;
      else if (row.status === 'AT_RISK') atRiskCount++;
      else if (row.status === 'NORMAL') normalCount++;
      else noneCount++;
    }

    return {
      total: allModelRows.length,
      deficit: deficitCount,
      atRisk: atRiskCount,
      normal: normalCount,
      none: noneCount,
    };
  }, [allModelRows]);

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    return allModelRows.filter((row) => {
      // Status filter
      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const brandMatch = row.brand.toLowerCase().includes(query);
        const modelMatch = row.model.toLowerCase().includes(query);
        const storageMatch = row.storage.toLowerCase().includes(query);
        if (!brandMatch && !modelMatch && !storageMatch) return false;
      }
      return true;
    });
  }, [allModelRows, statusFilter, searchQuery]);

  // Update threshold handler
  const handleSetThreshold = async (row: ModelRowData, newMin: number) => {
    if (!canEdit || !selectedStoreId) return;
    const sanitizedMin = Math.max(0, Math.floor(newMin));
    const rowKey = row.key;

    // Optimistic local update
    setThresholds((prev) => {
      const idx = prev.findIndex((t) => buildThresholdKey(t.brand, t.model, t.storage) === rowKey);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], minQuantity: sanitizedMin };
        return copy;
      }
      return [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          storeId: selectedStoreId,
          brand: row.brand,
          model: row.model,
          storage: row.storage,
          minQuantity: sanitizedMin,
        },
      ];
    });

    try {
      setSavingKeys((prev) => ({ ...prev, [rowKey]: true }));
      const updated = await apiClient<StockThreshold>('/stock-thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: selectedStoreId,
          brand: row.brand,
          model: row.model,
          storage: row.storage,
          minQuantity: sanitizedMin,
        }),
      });

      // Update state with actual DB record
      setThresholds((prev) => {
        const filtered = prev.filter((t) => buildThresholdKey(t.brand, t.model, t.storage) !== rowKey);
        return [...filtered, updated];
      });

      // Show temporary green checkmark
      setSavedSuccessKeys((prev) => ({ ...prev, [rowKey]: true }));
      setTimeout(() => {
        setSavedSuccessKeys((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });
      }, 1500);
    } catch (err) {
      console.error('Failed to update threshold', err);
      // Rollback on failure
      fetchThresholds();
    } finally {
      setSavingKeys((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    }
  };

  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-4">
      {/* 1. Header & Location Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center text-accent">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-fg tracking-tight">Минимальные остатки</h1>
              <p className="text-xs text-fg-subtle">
                Контроль неснижаемого запаса товаров по точкам продаж и центральному складу
              </p>
            </div>
          </div>
        </div>

        {/* Store Selector (Admin can switch between Main Warehouse & Retail Stores) */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {activeStores.map((s) => {
              const isSelected = s.id === selectedStoreId;
              const isWh = s.isMainWarehouse;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStoreId(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? isWh
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-accent text-accent-fg shadow-xs'
                      : 'bg-surface-raised border border-border text-fg-muted hover:bg-surface-raised/70'
                  }`}
                >
                  {isWh ? <Warehouse className="w-3.5 h-3.5" /> : <StoreIcon className="w-3.5 h-3.5" />}
                  <span>{isWh ? 'Главный склад' : s.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {!isAdmin && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-raised border border-border text-xs font-bold text-fg self-start md:self-auto">
            {currentStore?.isMainWarehouse ? <Warehouse className="w-4 h-4 text-amber-500" /> : <StoreIcon className="w-4 h-4 text-accent" />}
            <span>{currentStore?.isMainWarehouse ? 'Главный склад' : currentStore?.name || 'Мой магазин'}</span>
          </div>
        )}
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard
          label="Всего позиций"
          value={`${metrics.total} шт.`}
          icon={Package}
        />
        <div
          onClick={() => setStatusFilter(statusFilter === 'DEFICIT' ? 'ALL' : 'DEFICIT')}
          className={`cursor-pointer transition-transform active:scale-[0.98] ${
            statusFilter === 'DEFICIT' ? 'ring-2 ring-danger rounded-2xl' : ''
          }`}
        >
          <StatCard
            label="Заканчиваются"
            value={`${metrics.deficit} шт.`}
            subvalue={metrics.deficit > 0 ? 'Требуется заказ/перемещение' : 'Дефицита нет'}
            icon={AlertTriangle}
            tone={metrics.deficit > 0 ? 'danger' : 'neutral'}
          />
        </div>
        <div
          onClick={() => setStatusFilter(statusFilter === 'AT_RISK' ? 'ALL' : 'AT_RISK')}
          className={`cursor-pointer transition-transform active:scale-[0.98] ${
            statusFilter === 'AT_RISK' ? 'ring-2 ring-amber-500 rounded-2xl' : ''
          }`}
        >
          <StatCard
            label="На пределе"
            value={`${metrics.atRisk} шт.`}
            subvalue="Осталось ровно минимум"
            icon={AlertCircle}
            tone={metrics.atRisk > 0 ? 'warning' : 'neutral'}
          />
        </div>
        <div
          onClick={() => setStatusFilter(statusFilter === 'NORMAL' ? 'ALL' : 'NORMAL')}
          className={`cursor-pointer transition-transform active:scale-[0.98] ${
            statusFilter === 'NORMAL' ? 'ring-2 ring-emerald-500 rounded-2xl' : ''
          }`}
        >
          <StatCard
            label="В норме"
            value={`${metrics.normal} шт.`}
            subvalue="Запас выше минимума"
            icon={CheckCircle2}
            tone="accent"
          />
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-surface border border-border rounded-xl p-2.5 sm:p-3 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по бренду, модели или памяти..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-surface-raised border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-accent text-accent-fg'
                : 'bg-surface-raised text-fg-muted hover:bg-surface-raised/70'
            }`}
          >
            Все ({metrics.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('DEFICIT')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              statusFilter === 'DEFICIT'
                ? 'bg-danger text-white'
                : metrics.deficit > 0
                ? 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20'
                : 'bg-surface-raised text-fg-muted hover:bg-surface-raised/70'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Дефицит ({metrics.deficit})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('AT_RISK')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              statusFilter === 'AT_RISK'
                ? 'bg-amber-500 text-white'
                : 'bg-surface-raised text-fg-muted hover:bg-surface-raised/70'
            }`}
          >
            <span>На пределе ({metrics.atRisk})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('NORMAL')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer ${
              statusFilter === 'NORMAL'
                ? 'bg-emerald-600 text-white'
                : 'bg-surface-raised text-fg-muted hover:bg-surface-raised/70'
            }`}
          >
            <span>В норме ({metrics.normal})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('NONE')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === 'NONE'
                ? 'bg-fg-muted text-surface'
                : 'bg-surface-raised text-fg-subtle hover:bg-surface-raised/70'
            }`}
          >
            Без лимита ({metrics.none})
          </button>
        </div>
      </div>

      {/* 4. Model Thresholds List */}
      {loading ? (
        <LoadingState label="Загрузка лимитов остатков…" />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Товары не найдены"
          description="Попробуйте изменить поисковый запрос или фильтр по статусу остатка"
        />
      ) : (
        <div className="bg-surface border border-border rounded-2xl shadow-2xs divide-y divide-border overflow-hidden">
          {/* Header Row for Desktop */}
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 bg-surface-raised/60 text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
            <div className="col-span-5">Модель устройства</div>
            <div className="col-span-2 text-center">В наличии</div>
            <div className="col-span-3 text-center">Минимальный порог</div>
            <div className="col-span-2 text-right">Статус</div>
          </div>

          {/* Rows */}
          {filteredRows.map((row) => {
            const isSaving = savingKeys[row.key];
            const isSaved = savedSuccessKeys[row.key];
            const brandStyle = getBrandBadgeStyle(row.brand);

            return (
              <div
                key={row.key}
                className={`p-3.5 sm:p-4 transition-colors hover:bg-surface-raised/40 ${
                  row.status === 'DEFICIT' ? 'bg-danger/5 dark:bg-danger/10' : ''
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Col 1: Model & Storage */}
                  <div className="md:col-span-5 flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border shrink-0 ${brandStyle.bg} ${brandStyle.border}`}
                    >
                      {row.brand}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs sm:text-sm text-fg truncate">
                          {row.model}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-surface-raised border border-border text-fg-muted shrink-0">
                          {row.storage}
                        </span>
                      </div>
                      <span className="text-[11px] text-fg-subtle block">
                        Локация: {currentStore?.name || 'Точка'}
                      </span>
                    </div>
                  </div>

                  {/* Col 2: Current In-Stock Count */}
                  <div className="md:col-span-2 flex md:justify-center items-center gap-2">
                    <span className="text-xs text-fg-subtle md:hidden font-semibold">В наличии:</span>
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-base sm:text-lg font-black font-mono leading-none ${
                          row.status === 'DEFICIT'
                            ? 'text-danger'
                            : row.status === 'AT_RISK'
                            ? 'text-amber-500'
                            : 'text-fg'
                        }`}
                      >
                        {row.currentCount}
                      </span>
                      <span className="text-[11px] text-fg-subtle font-mono">шт.</span>
                    </div>
                  </div>

                  {/* Col 3: Minimum Threshold Controller */}
                  <div className="md:col-span-3 flex flex-col md:items-center gap-1.5">
                    {canEdit ? (
                      <div className="flex items-center gap-1.5">
                        {/* Stepper Controller */}
                        <div className="flex items-center rounded-xl bg-surface-raised border border-border shadow-2xs overflow-hidden">
                          <button
                            type="button"
                            disabled={isSaving || row.minQuantity <= 0}
                            onClick={() => handleSetThreshold(row, row.minQuantity - 1)}
                            className="p-1.5 sm:p-2 text-fg-subtle hover:text-fg hover:bg-surface active:bg-surface transition-colors disabled:opacity-30 cursor-pointer"
                            title="Уменьшить минимум на 1"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            max="999"
                            value={row.minQuantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              handleSetThreshold(row, isNaN(val) ? 0 : val);
                            }}
                            className="w-12 text-center text-xs sm:text-sm font-extrabold font-mono text-fg bg-transparent focus:outline-none"
                          />

                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSetThreshold(row, row.minQuantity + 1)}
                            className="p-1.5 sm:p-2 text-fg-subtle hover:text-fg hover:bg-surface active:bg-surface transition-colors cursor-pointer"
                            title="Увеличить минимум на 1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Quick Preset Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetThreshold(row, 5)}
                            className={`px-1.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                              row.minQuantity === 5
                                ? 'bg-danger/20 text-danger border-danger/40'
                                : 'bg-surface border-border text-fg-subtle hover:text-fg'
                            }`}
                            title="Хит (5 шт.)"
                          >
                            Хит 5
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetThreshold(row, 2)}
                            className={`px-1.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                              row.minQuantity === 2
                                ? 'bg-accent/20 text-accent border-accent/40'
                                : 'bg-surface border-border text-fg-subtle hover:text-fg'
                            }`}
                            title="Ходовой (2 шт.)"
                          >
                            Ход 2
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetThreshold(row, 1)}
                            className={`px-1.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                              row.minQuantity === 1
                                ? 'bg-surface-raised text-fg border-border'
                                : 'bg-surface border-border text-fg-subtle hover:text-fg'
                            }`}
                            title="Редкий (1 шт.)"
                          >
                            1
                          </button>
                          {row.minQuantity > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSetThreshold(row, 0)}
                              className="px-1.5 py-1 rounded-md text-[10px] font-medium text-fg-subtle hover:text-danger border border-border/50 hover:border-danger/30 transition-colors cursor-pointer"
                              title="Сбросить лимит"
                            >
                              0
                            </button>
                          )}
                        </div>

                        {/* Status feedback icon */}
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                        ) : isSaved ? (
                          <Check className="w-3.5 h-3.5 text-accent shrink-0 animate-in zoom-in-50" />
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-fg-subtle md:hidden font-semibold">Минимум:</span>
                        <span className="font-extrabold font-mono text-xs text-fg bg-surface-raised px-2.5 py-1 rounded-lg border border-border">
                          {row.minQuantity > 0 ? `${row.minQuantity} шт.` : 'Не задан'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Col 4: Status Badge */}
                  <div className="md:col-span-2 flex md:justify-end items-center">
                    {row.status === 'DEFICIT' ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-danger/15 text-danger border border-danger/30 text-xs font-bold animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Не хватает {row.deficit} шт.</span>
                      </div>
                    ) : row.status === 'AT_RISK' ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 text-xs font-bold">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>На пределе ({row.currentCount}/{row.minQuantity})</span>
                      </div>
                    ) : row.status === 'NORMAL' ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>В норме (+{row.currentCount - row.minQuantity})</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-fg-subtle font-medium">Без лимита</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
