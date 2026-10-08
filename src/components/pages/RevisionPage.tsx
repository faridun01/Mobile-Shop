import React, { useState, useMemo } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatStoreName, formatStoreDisplayTitle } from '../../utils/storeContext';
import { Device } from '../../types';
import { soundEffects } from '../../utils/sound';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatUserName } from '../../utils/formatUser';
import {
  ClipboardCheck,
  Search,
  CheckCircle2,
  RotateCcw,
  Smartphone,
  Check,
  Store as StoreIcon,
  Printer,
  ChevronDown,
  Layers,
  List,
} from 'lucide-react';

interface ModelGroup {
  key: string;
  brand: string;
  model: string;
  storage?: string;
  color?: string;
  items: Device[];
  total: number;
  checked: number;
}

export const RevisionPage: React.FC = () => {
  const {
    currentUser,
    stores,
    devices,
    selectedStoreId,
    setSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'stores',
    'devices',
    'selectedStoreId',
    'setSelectedStoreId'
  );

  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';

  // Store resolution: Staff users audit their assigned store; Admins can choose store
  const defaultStoreId = stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id || '';
  const effectiveStoreId =
    (currentUser?.role === 'SELLER' || isPartner) && currentUser?.storeId
      ? currentUser.storeId
      : (selectedStoreId && selectedStoreId !== 'all' && stores.some((s) => s.id === selectedStoreId)
          ? selectedStoreId
          : defaultStoreId);

  const currentStore = stores.find((s) => s.id === effectiveStoreId);
  const isMain = currentStore?.isMainWarehouse;

  // Active in-stock devices belonging strictly to this store
  const storeDevices = useMemo(() => {
    return devices.filter((d) => {
      const locId = d.locationId;
      if (locId !== effectiveStoreId) return false;
      if (isMain) {
        return d.status === 'MAIN_WAREHOUSE' || d.status === 'STORE_STOCK';
      }
      return d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
    });
  }, [devices, effectiveStoreId, isMain]);

  // Checked IMEIs set for current revision session
  const [checkedImeis, setCheckedImeis] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Filter tabs: 'ALL' | 'UNCHECKED' | 'CHECKED'
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNCHECKED' | 'CHECKED'>('ALL');
  // View mode: 'GROUPS' (grouped by model) | 'ITEMS' (itemized list)
  const [viewMode, setViewMode] = useState<'GROUPS' | 'ITEMS'>('GROUPS');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  // Finish modal
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  // Reset confirmation dialog modal
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Reset revision session when store changes
  React.useEffect(() => {
    setCheckedImeis(new Set());
    setStatus(null);
    setExpandedGroups(new Set());
  }, [effectiveStoreId]);

  // Stats
  const totalCount = storeDevices.length;
  const checkedCount = storeDevices.filter((d) => checkedImeis.has(d.imei) || (d.imei2 && checkedImeis.has(d.imei2))).length;
  const uncheckedCount = totalCount - checkedCount;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const isAllReconciled = totalCount > 0 && uncheckedCount === 0;

  // 1-Click "Everything matches" reconciliation
  const handleCheckAll = () => {
    soundEffects.playAddToCartSuccess();
    const next = new Set<string>();
    storeDevices.forEach((d) => {
      next.add(d.imei);
      if (d.imei2) next.add(d.imei2);
    });
    setCheckedImeis(next);
    setStatus({
      tone: 'success',
      text: `✓ Все товары склада (${totalCount} шт.) подтверждены как сверенные`,
    });
  };

  // Toggle single item manual check
  const handleToggleCheck = (device: Device) => {
    setCheckedImeis((prev) => {
      const next = new Set(prev);
      if (next.has(device.imei)) {
        next.delete(device.imei);
        if (device.imei2) next.delete(device.imei2);
      } else {
        soundEffects.playAddToCartSuccess();
        next.add(device.imei);
        if (device.imei2) next.add(device.imei2);
      }
      return next;
    });
  };

  // Toggle whole model group check
  const handleToggleGroup = (group: ModelGroup, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    soundEffects.playAddToCartSuccess();
    setCheckedImeis((prev) => {
      const next = new Set(prev);
      const isGroupComplete = group.items.every((d) => next.has(d.imei));
      group.items.forEach((d) => {
        if (isGroupComplete) {
          next.delete(d.imei);
          if (d.imei2) next.delete(d.imei2);
        } else {
          next.add(d.imei);
          if (d.imei2) next.add(d.imei2);
        }
      });
      return next;
    });
  };

  // Toggle expand/collapse group
  const handleToggleExpand = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Open reset confirm dialog
  const handleOpenResetRevision = () => {
    if (checkedImeis.size === 0) {
      setStatus({ tone: 'info', text: 'Сверка ещё не начата (нет отметок для сброса).' });
      return;
    }
    setIsResetConfirmOpen(true);
  };

  // Perform reset
  const handleConfirmReset = () => {
    setCheckedImeis(new Set());
    setIsResetConfirmOpen(false);
    setStatus({ tone: 'info', text: 'Сверка сброшена.' });
  };

  // Grouped models list for display
  const modelGroups = useMemo(() => {
    const map = new Map<string, ModelGroup>();
    storeDevices.forEach((d) => {
      const key = `${d.brand}|||${d.model}|||${d.storage || ''}|||${d.color || ''}`.toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          brand: d.brand,
          model: d.model,
          storage: d.storage,
          color: d.color,
          items: [],
          total: 0,
          checked: 0,
        };
        map.set(key, group);
      }
      group.items.push(d);
      group.total += 1;
      if (checkedImeis.has(d.imei) || (d.imei2 && checkedImeis.has(d.imei2))) {
        group.checked += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const nameA = `${a.brand} ${a.model}`.toLowerCase();
      const nameB = `${b.brand} ${b.model}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [storeDevices, checkedImeis]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    return modelGroups.filter((g) => {
      const isComplete = g.checked === g.total;
      if (filterTab === 'CHECKED' && !isComplete) return false;
      if (filterTab === 'UNCHECKED' && isComplete) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchGroup =
        g.brand.toLowerCase().includes(q) ||
        g.model.toLowerCase().includes(q) ||
        (g.color && g.color.toLowerCase().includes(q)) ||
        (g.storage && g.storage.toLowerCase().includes(q));

      if (matchGroup) return true;
      return g.items.some((d) => d.imei.toLowerCase().includes(q) || (d.imei2 && d.imei2.toLowerCase().includes(q)));
    });
  }, [modelGroups, filterTab, searchQuery]);

  // Filtered flat devices list for display
  const filteredList = useMemo(() => {
    return storeDevices.filter((d) => {
      const isChecked = checkedImeis.has(d.imei) || (d.imei2 ? checkedImeis.has(d.imei2) : false);

      if (filterTab === 'CHECKED' && !isChecked) return false;
      if (filterTab === 'UNCHECKED' && isChecked) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        d.brand.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.imei.toLowerCase().includes(q) ||
        (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
        (d.color && d.color.toLowerCase().includes(q)) ||
        (d.storage && d.storage.toLowerCase().includes(q))
      );
    });
  }, [storeDevices, checkedImeis, filterTab, searchQuery]);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0 shadow-2xs">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-fg leading-tight">
                {currentStore?.isMainWarehouse ? 'Сверка склада' : 'Сверка остатков'}
              </h1>
              {!isAdmin && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25 shadow-2xs">
                  <StoreIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatStoreDisplayTitle(currentStore)}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle mt-0.5">
              Сверка фактического наличия товаров на складе
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
          {/* Admin Store Switcher */}
          {isAdmin && stores.length > 0 && (
            <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-surface-raised hover:bg-surface border border-border rounded-xl px-2.5 h-9 min-w-0 transition-colors shadow-2xs">
              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
              <select
                value={effectiveStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-transparent text-xs font-bold text-fg focus:outline-none cursor-pointer pr-1 truncate"
                title="Выбрать точку для сверки"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-surface text-fg font-medium">
                    {formatStoreDisplayTitle(s)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleOpenResetRevision}
              leftIcon={RotateCcw}
              className="h-9 px-2.5 text-xs text-fg-subtle hover:text-fg cursor-pointer"
              title="Сбросить отметки текущей сверки"
            >
              Сброс
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsSummaryModalOpen(true)}
              leftIcon={CheckCircle2}
              className="h-9 px-3 text-xs font-bold cursor-pointer"
            >
              Итоги сверки
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
        {/* Progress & Live Counters Bar */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider block">
                  Всего на складе
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-fg">
                  {totalCount} <span className="text-xs font-normal text-fg-subtle">шт.</span>
                </span>
              </div>

              <div className="w-px h-8 bg-border hidden sm:block" />

              <div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Сверено
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {checkedCount} <span className="text-xs font-normal opacity-75">шт.</span>
                </span>
              </div>

              <div className="w-px h-8 bg-border hidden sm:block" />

              <div>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Осталось проверить
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                  {uncheckedCount} <span className="text-xs font-normal opacity-75">шт.</span>
                </span>
              </div>
            </div>

            <div className="text-right sm:text-right">
              <span className="text-xs font-bold text-fg-subtle">Прогресс сверки:</span>
              <span className="text-lg font-black font-mono text-accent ml-2">
                {progressPercent}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-surface-raised border border-border overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isAllReconciled
                  ? 'bg-emerald-500'
                  : 'bg-accent'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* 1-Click "Everything matches" instant action */}
          {!isAllReconciled && totalCount > 0 ? (
            <button
              type="button"
              onClick={handleCheckAll}
              className="w-full py-2.5 px-4 rounded-xl bg-accent text-accent-fg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer shadow-xs select-none"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Всё сходится ({totalCount} шт.)</span>
            </button>
          ) : isAllReconciled ? (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Все товары склада сверены ({totalCount} шт.)</span>
            </div>
          ) : null}
        </div>

        {/* Devices Checklist & Tabs */}
        <div className="rounded-2xl bg-surface border border-border shadow-xs overflow-hidden">
          {/* Controls Bar: Tabs, View Toggle & Search */}
          <div className="p-3 border-b border-border bg-surface-raised flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setFilterTab('ALL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
                  filterTab === 'ALL'
                    ? 'bg-accent text-accent-fg shadow-2xs'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('UNCHECKED')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
                  filterTab === 'UNCHECKED'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Осталось проверить ({uncheckedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('CHECKED')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
                  filterTab === 'CHECKED'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Сверено ({checkedCount})
              </button>
            </div>

            {/* Right side: View Mode Toggle & Search Input */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* View mode toggle */}
              <div className="inline-flex rounded-xl bg-surface border border-border p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('GROUPS')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'GROUPS'
                      ? 'bg-accent text-accent-fg shadow-2xs'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                  title="Группировка по моделям"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>По моделям</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('ITEMS')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === 'ITEMS'
                      ? 'bg-accent text-accent-fg shadow-2xs'
                      : 'text-fg-subtle hover:text-fg'
                  }`}
                  title="Поштучный список"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Поштучно</span>
                </button>
              </div>

              {/* Search Input */}
              <div className="relative w-full sm:w-60 shrink-0">
                <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск модели, цвета, памяти..."
                  className="w-full h-9 pl-8.5 pr-3 rounded-xl border border-border bg-surface text-fg text-xs focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* List Content: Grouped by model or Flat List */}
          {viewMode === 'GROUPS' ? (
            /* GROUPED VIEW */
            <div className="divide-y divide-border">
              {filteredGroups.length === 0 ? (
                <div className="py-12 text-center text-fg-subtle space-y-2">
                  <Smartphone className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">Товары не найдены</p>
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isComplete = group.checked === group.total;
                  const isExpanded = expandedGroups.has(group.key);

                  return (
                    <div key={group.key} className="bg-surface transition-colors">
                      {/* Main Group Header Row */}
                      <div
                        onClick={() => handleToggleExpand(group.key)}
                        className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer ${
                          isComplete ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-surface-raised'
                        }`}
                      >
                        {/* Check button & Model info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => handleToggleGroup(group, e)}
                            className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                              isComplete
                                ? 'bg-emerald-500 border-emerald-600 text-white shadow-2xs'
                                : group.checked > 0
                                ? 'bg-amber-500 border-amber-600 text-white'
                                : 'bg-surface border-border text-transparent hover:border-accent'
                            }`}
                            title={isComplete ? 'Снять отметку' : 'Сверить всю группу'}
                          >
                            <Check className="w-4 h-4" strokeWidth={3} />
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-xs sm:text-sm font-bold truncate ${
                                isComplete ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'
                              }`}>
                                {group.brand} {group.model}
                              </p>
                              {isComplete ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Сходится
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-raised text-fg-subtle font-medium border border-border">
                                  Ожидает
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-fg-subtle flex-wrap mt-0.5">
                              {group.storage && <span>{group.storage}</span>}
                              {group.color && <span>• {group.color}</span>}
                              <span className="font-mono font-medium text-fg-subtle">
                                • {group.checked} из {group.total} шт.
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right side: Action button & Expand toggle */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleToggleGroup(group, e)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                              isComplete
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-surface-raised text-fg-subtle border-border hover:border-accent'
                            }`}
                          >
                            {isComplete ? 'Сверено ✓' : `Сверить (${group.total} шт.)`}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExpand(group.key);
                            }}
                            className="p-1 text-fg-subtle hover:text-fg rounded-lg transition-colors cursor-pointer"
                            title={isExpanded ? 'Свернуть' : 'Развернуть список IMEI'}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Sub-items (individual devices of this group if expanded) */}
                      {isExpanded && (
                        <div className="bg-surface-raised/40 border-t border-border/60 divide-y divide-border/40 pl-6 pr-3 py-1 animate-in fade-in duration-150">
                          {group.items.map((device) => {
                            const isChecked = checkedImeis.has(device.imei) || (device.imei2 && checkedImeis.has(device.imei2));
                            return (
                              <div
                                key={device.id}
                                onClick={() => handleToggleCheck(device)}
                                className="py-2 px-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-surface-raised/80 rounded-lg transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleCheck(device);
                                    }}
                                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                      isChecked
                                        ? 'bg-emerald-500 border-emerald-600 text-white'
                                        : 'bg-surface border-border text-transparent hover:border-accent'
                                    }`}
                                  >
                                    <Check className="w-3 h-3" strokeWidth={3} />
                                  </button>
                                  <span className="font-mono text-fg-subtle text-[11px] truncate">
                                    IMEI: <span className="font-semibold text-fg">{device.imei}</span>
                                  </span>
                                </div>
                                <span className={`text-[10px] font-medium ${isChecked ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-subtle'}`}>
                                  {isChecked ? 'В наличии ✓' : 'Не отмечен'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* FLAT ITEMS LIST VIEW */
            <div className="divide-y divide-border">
              {filteredList.length === 0 ? (
                <div className="py-12 text-center text-fg-subtle space-y-2">
                  <Smartphone className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">Товары не найдены</p>
                </div>
              ) : (
                filteredList.map((device) => {
                  const isChecked = checkedImeis.has(device.imei) || (device.imei2 ? checkedImeis.has(device.imei2) : false);

                  return (
                    <div
                      key={device.id}
                      onClick={() => handleToggleCheck(device)}
                      className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                          : 'hover:bg-surface-raised'
                      }`}
                    >
                      {/* Check indicator & Model details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCheck(device);
                          }}
                          className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-600 text-white shadow-2xs'
                              : 'bg-surface border-border text-transparent hover:border-accent'
                          }`}
                        >
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-xs sm:text-sm font-bold truncate ${
                              isChecked ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'
                            }`}>
                              {device.brand} {device.model}
                            </p>
                            {isChecked ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Сверено
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-raised text-fg-subtle font-medium border border-border">
                                Ожидает
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-fg-subtle flex-wrap mt-0.5">
                            {device.storage && <span>{device.storage}</span>}
                            {device.color && <span>• {device.color}</span>}
                            <span className="font-mono text-fg-subtle">• IMEI: {device.imei}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right action button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCheck(device);
                        }}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer shrink-0 ${
                          isChecked
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-surface-raised text-fg-subtle border-border hover:border-accent'
                        }`}
                      >
                        {isChecked ? 'Сверено ✓' : 'Сверить'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* SUMMARY MODAL */}
      <Dialog
        open={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        title="Итоги сверки склада"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              type="button"
              variant="secondary"
              leftIcon={Printer}
              onClick={() => window.print()}
              className="flex-1 sm:flex-initial"
            >
              Печать акта
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => setIsSummaryModalOpen(false)}
              className="flex-1 sm:flex-initial font-bold"
            >
              Готово
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pt-1">
          <div className="p-4 rounded-xl bg-surface-raised border border-border text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-fg-subtle">{currentStore?.isMainWarehouse ? 'Склад:' : 'Точка:'}</span>
              <span className="font-bold text-fg">{formatStoreDisplayTitle(currentStore)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-subtle">Проверяющий:</span>
              <span className="font-medium text-fg">{formatUserName(currentUser?.name)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-subtle">Дата сверки:</span>
              <span className="font-medium text-fg">{new Date().toLocaleString('ru-RU')}</span>
            </div>
            <div className="w-full h-px bg-border my-1" />
            <div className="flex justify-between">
              <span className="text-fg-subtle">Всего числится:</span>
              <span className="font-bold font-mono text-fg">{totalCount} шт.</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Фактически сверено:</span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{checkedCount} шт. ({progressPercent}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Расхождение / не сверено:</span>
              <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{uncheckedCount} шт.</span>
            </div>
          </div>

          {isAllReconciled ? (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Остатки полностью сошлись (0 расхождений). Сверка прошла успешно!</span>
            </div>
          ) : uncheckedCount > 0 ? (
            <div>
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1.5">
                Не подтвержденные позиции ({uncheckedCount} шт.):
              </h4>
              <div className="max-h-[160px] overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
                {storeDevices
                  .filter((d) => !checkedImeis.has(d.imei) && (!d.imei2 || !checkedImeis.has(d.imei2)))
                  .map((d) => (
                    <div key={d.id} className="p-2 flex justify-between items-center bg-surface">
                      <span className="font-semibold text-fg truncate">{d.brand} {d.model} ({d.storage || ''} {d.color || ''})</span>
                      <span className="font-mono text-fg-subtle text-[11px] shrink-0 ml-2">{d.imei}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>

      {/* Красивый диалог подтверждения сброса сверки вместо системного alert */}
      <ConfirmDialog
        open={isResetConfirmOpen}
        title="Сбросить отметки сверки?"
        message={
          <div className="space-y-1.5">
            <p className="font-semibold text-fg">
              Вы уверены, что хотите сбросить текущую сверку для магазина{' '}
              <span className="text-accent underline font-bold">«{currentStore?.name || 'магазина'}»</span>?
            </p>
            <p className="text-xs text-fg-subtle">
              Все отмеченные позиции ({checkedCount} из {totalCount} шт.) будут очищены, и сверка начнётся заново.
            </p>
          </div>
        }
        confirmLabel="Сбросить и начать заново"
        cancelLabel="Отмена"
        tone="danger"
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
