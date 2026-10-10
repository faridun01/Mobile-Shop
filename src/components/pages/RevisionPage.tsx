import React, { useState, useMemo } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatStoreDisplayTitle } from '../../utils/storeContext';
import { apiClient } from '../../api/client';
import { Device, StockRevision } from '../../types';
import { soundEffects } from '../../utils/sound';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { formatUserName } from '../../utils/formatUser';
import { StoreSelector } from '../common/StoreSelector';
import { SearchBar } from '../ui/SearchBar';
import { DEVICE_STATUS_LABELS, findDeviceByCode, normalizeScanCode } from '../../utils/scanLookup';
import { formatPhoneColor } from '../../utils/phoneSpecs';
import { RevisionHistoryPanel } from '../revision/RevisionHistoryPanel';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import {
  CheckCircle2,
  RotateCcw,
  Smartphone,
  Check,
  Store as StoreIcon,
  ChevronDown,
  Layers,
  List,
  AlertTriangle,
  X,
  History,
  FileCheck2,
  ClipboardCheck,
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
    openScanner,
  } = useAppFields(
    'currentUser',
    'stores',
    'devices',
    'selectedStoreId',
    'setSelectedStoreId',
    'openScanner'
  );

  if (currentUser?.role !== 'ADMIN') {
    return <RestrictedAccess message="Раздел ревизии склада доступен только администраторам." />;
  }

  const isAdmin = true;

  // Store resolution: Admin can audit any store from selector or default store
  const defaultStoreId = stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id || '';
  const effectiveStoreId =
    selectedStoreId && selectedStoreId !== 'all' && stores.some((s) => s.id === selectedStoreId)
      ? selectedStoreId
      : defaultStoreId;

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
  // Scanned IMEIs that are not on this store's stock (излишки), with where they are registered.
  const [surplus, setSurplus] = useState<Array<{ code: string; note: string }>>([]);
  const [scanInput, setScanInput] = useState('');

  // Filter tabs: 'ALL' | 'UNCHECKED' | 'CHECKED'
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNCHECKED' | 'CHECKED'>('ALL');
  // View mode: 'GROUPS' (grouped by model) | 'ITEMS' (itemized list)
  const [viewMode, setViewMode] = useState<'GROUPS' | 'ITEMS'>('GROUPS');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  // Finish modal
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  // Reset confirmation dialog modal
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Active page tab: 'AUDIT' (live scanning) vs 'HISTORY' (past revisions)
  const [pageTab, setPageTab] = useState<'AUDIT' | 'HISTORY'>('AUDIT');
  const [revisionComment, setRevisionComment] = useState('');
  const [isSavingRevision, setIsSavingRevision] = useState(false);

  // Reset revision session when store changes
  React.useEffect(() => {
    setCheckedImeis(new Set());
    setSurplus([]);
    setRevisionComment('');
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

  /** One scan (camera or USB scanner): ticks a phone of this store, or records a surplus. */
  const handleScanCode = (raw: string) => {
    const code = normalizeScanCode(raw);
    if (!code) return;
    setScanInput('');
    const own = findDeviceByCode(storeDevices, code);
    if (own) {
      if (checkedImeis.has(own.imei) || (own.imei2 && checkedImeis.has(own.imei2))) {
        setStatus({ tone: 'info', text: `${own.brand} ${own.model} уже отмечен` });
        return;
      }
      soundEffects.playAddToCartSuccess();
      setCheckedImeis((prev) => {
        const next = new Set(prev);
        next.add(own.imei);
        if (own.imei2) next.add(own.imei2);
        return next;
      });
      setStatus({ tone: 'success', text: `✓ ${own.brand} ${own.model}` });
      return;
    }
    if (surplus.some((item) => item.code === code)) {
      setStatus({ tone: 'info', text: `IMEI ${code} уже в излишках` });
      return;
    }
    const elsewhere = findDeviceByCode(devices, code);
    const note = elsewhere
      ? `${elsewhere.brand} ${elsewhere.model} · ${stores.find((st) => st.id === elsewhere.locationId)?.name || elsewhere.locationName || 'другая точка'} · ${DEVICE_STATUS_LABELS[elsewhere.status] || elsewhere.status}`
      : 'Нет на остатке этой точки';
    soundEffects.playError();
    setSurplus((prev) => [...prev, { code, note }]);
    setStatus({ tone: 'warning', text: `Излишек: IMEI ${code}` });
  };

  const handleScanCamera = () => openScanner((code) => handleScanCode(code));

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
    if (checkedImeis.size === 0 && surplus.length === 0) {
      setStatus({ tone: 'info', text: 'Сверка ещё не начата' });
      return;
    }
    setIsResetConfirmOpen(true);
  };

  // Perform reset
  const handleConfirmReset = () => {
    setCheckedImeis(new Set());
    setSurplus([]);
    setRevisionComment('');
    setIsResetConfirmOpen(false);
    setStatus({ tone: 'info', text: 'Сверка сброшена.' });
  };

  // Complete and save revision to history
  const handleSaveRevision = async () => {
    setIsSavingRevision(true);
    try {
      await apiClient<StockRevision>('/revisions', {
        method: 'POST',
        body: JSON.stringify({
          storeId: effectiveStoreId,
          comment: revisionComment.trim() || undefined,
          checkedImeis: Array.from(checkedImeis),
          surplusDevices: surplus,
        }),
      });

      soundEffects.playAddToCartSuccess();
      setStatus({
        tone: 'success',
        text: '✓ Ревизия успешно сохранена в истории',
      });

      // Clear current audit session
      setCheckedImeis(new Set());
      setSurplus([]);
      setRevisionComment('');
      setIsSummaryModalOpen(false);

      // Navigate to History tab so user immediately sees the saved record
      setPageTab('HISTORY');
    } catch (err: any) {
      soundEffects.playError();
      setStatus({
        tone: 'error',
        text: err?.message || 'Не удалось сохранить ревизию',
      });
    } finally {
      setIsSavingRevision(false);
    }
  };

  // Grouped models list for display
  const modelGroups = useMemo(() => {
    const map = new Map<string, ModelGroup>();
    storeDevices.forEach((d) => {
      const normColor = formatPhoneColor(d.color);
      const key = `${d.brand}|||${d.model}|||${d.storage || ''}|||${normColor}`.toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          brand: d.brand,
          model: d.model,
          storage: d.storage,
          color: normColor,
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
      return true;
    });
  }, [modelGroups, filterTab]);

  // Filtered flat devices list for display
  const filteredList = useMemo(() => {
    return storeDevices.filter((d) => {
      const isChecked = checkedImeis.has(d.imei) || (d.imei2 ? checkedImeis.has(d.imei2) : false);
      if (filterTab === 'CHECKED' && !isChecked) return false;
      if (filterTab === 'UNCHECKED' && isChecked) return false;
      return true;
    });
  }, [storeDevices, checkedImeis, filterTab]);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-y-auto min-h-0 bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Bar */}
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-border bg-surface shrink-0 shadow-2xs sticky top-0 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Left Group: Store Selector + Tabs (Desktop) */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
            {!isAdmin && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-accent/10 text-accent border border-accent/25 shrink-0">
                <StoreIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-44">{formatStoreDisplayTitle(currentStore)}</span>
              </span>
            )}

            {isAdmin && stores.length > 0 && (
              <StoreSelector
                value={effectiveStoreId}
                onChange={setSelectedStoreId}
                stores={stores}
                compact
                className="w-full xs:w-auto xs:max-w-48 sm:max-w-52 shrink-0"
                title="Точка для сверки"
              />
            )}

            {/* Desktop Tabs */}
            <div className="hidden sm:flex items-center bg-surface-raised border border-border rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setPageTab('AUDIT')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  pageTab === 'AUDIT'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Сверка склада</span>
                {checkedCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    pageTab === 'AUDIT' ? 'bg-black/20 text-white' : 'bg-accent/15 text-accent'
                  }`}>
                    {checkedCount}/{totalCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPageTab('HISTORY')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  pageTab === 'HISTORY'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>История ревизий</span>
              </button>
            </div>
          </div>

          {/* Right Group on Desktop / Row 2 on Mobile: Mobile Tabs + Action Buttons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            {/* Mobile Tabs (only shown on screen < sm) */}
            <div className="flex sm:hidden items-center bg-surface-raised border border-border rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setPageTab('AUDIT')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  pageTab === 'AUDIT'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Сверка</span>
                {checkedCount > 0 && (
                  <span className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
                    pageTab === 'AUDIT' ? 'bg-black/20 text-white' : 'bg-accent/15 text-accent'
                  }`}>
                    {checkedCount}/{totalCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPageTab('HISTORY')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  pageTab === 'HISTORY'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <History className="w-3.5 h-3.5 shrink-0" />
                <span>История</span>
              </button>
            </div>

            {/* Actions */}
            {pageTab === 'AUDIT' ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenResetRevision}
                  leftIcon={RotateCcw}
                  data-compact="true"
                  className="min-h-0 h-7.5 px-2.5 text-xs text-fg-subtle hover:text-fg cursor-pointer"
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
                  data-compact="true"
                  className="min-h-0 h-7.5 px-3 text-xs font-bold cursor-pointer shadow-xs whitespace-nowrap"
                >
                  Итоги сверки
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setPageTab('AUDIT')}
                  leftIcon={ClipboardCheck}
                  data-compact="true"
                  className="min-h-0 h-7.5 px-3 text-xs font-bold cursor-pointer shadow-xs whitespace-nowrap"
                >
                  Новая сверка
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {pageTab === 'AUDIT' ? (
        <div className="p-2 sm:p-2.5 space-y-2">
        {/* Progress & Live Counters Bar */}
        <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap text-xs">
              <span className="text-fg-subtle">
                Всего: <strong className="font-mono text-fg font-black">{totalCount}</strong> шт.
              </span>
              <span className="text-border">•</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                Сверено: <strong className="font-mono font-black">{checkedCount}</strong> шт.
              </span>
              <span className="text-border">•</span>
              <span className="text-amber-600 dark:text-amber-400">
                Осталось: <strong className="font-mono font-black">{uncheckedCount}</strong> шт.
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold shrink-0">
              <span className="text-fg-subtle">Прогресс:</span>
              <span className={`font-mono font-black text-xs sm:text-sm ${isAllReconciled ? 'text-emerald-500' : 'text-accent'}`}>
                {progressPercent}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1 sm:h-1.5 rounded-full bg-surface-raised border border-border overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isAllReconciled ? 'bg-emerald-500' : 'bg-accent'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Actions & Scanner row */}
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex-1 min-w-0">
              <SearchBar
                value={scanInput}
                onChange={setScanInput}
                onScan={handleScanCamera}
                onSubmit={handleScanCode}
                placeholder="Сканируйте IMEI или штрихкод..."
              />
            </div>

            {!isAllReconciled && totalCount > 0 && (
              <button
                type="button"
                data-compact="true"
                onClick={handleCheckAll}
                className="min-h-0 h-11 px-2.5 sm:px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0 whitespace-nowrap active:scale-[0.98]"
                title="Подтвердить все товары как сверенные"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Подтвердить все ({totalCount} шт.)</span>
                <span className="sm:hidden">Все ({totalCount} шт.)</span>
              </button>
            )}
          </div>
        </div>

        {surplus.length > 0 && (
          <div className="p-2 rounded-xl bg-danger/10 border border-danger/30 space-y-1" role="region" aria-label="Излишки">
            <h3 className="text-xs font-bold text-danger flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Излишки ({surplus.length} шт.)
            </h3>
            <div className="divide-y divide-danger/20 text-xs">
              {surplus.map((item) => (
                <div key={item.code} className="py-0.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-mono font-bold text-fg text-xs">{item.code}</span>
                    <span className="text-fg-subtle truncate text-[11px]">{item.note}</span>
                  </div>
                  <button
                    type="button"
                    data-compact="true"
                    aria-label={`Убрать ${item.code} из излишков`}
                    onClick={() => setSurplus((prev) => prev.filter((x) => x.code !== item.code))}
                    className="min-h-0 w-6 h-6 shrink-0 rounded flex items-center justify-center text-fg-subtle hover:text-danger hover:bg-danger/10 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Devices Checklist & Tabs */}
        <div className="rounded-xl bg-surface border border-border shadow-2xs overflow-hidden">
          {/* Controls Bar: Tabs & View Toggle (Search removed, single compact row) */}
          <div className="px-2 py-1.5 border-b border-border bg-surface-raised flex items-center justify-between gap-1.5">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs">
              <button
                type="button"
                data-compact="true"
                onClick={() => setFilterTab('ALL')}
                className={`min-h-0 h-6 px-2 text-[11px] font-semibold rounded-md transition-all cursor-pointer shrink-0 ${
                  filterTab === 'ALL'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все ({totalCount})
              </button>
              <button
                type="button"
                data-compact="true"
                onClick={() => setFilterTab('UNCHECKED')}
                className={`min-h-0 h-6 px-2 text-[11px] font-semibold rounded-md transition-all cursor-pointer shrink-0 ${
                  filterTab === 'UNCHECKED'
                    ? 'bg-amber-500 text-white shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Осталось ({uncheckedCount})
              </button>
              <button
                type="button"
                data-compact="true"
                onClick={() => setFilterTab('CHECKED')}
                className={`min-h-0 h-6 px-2 text-[11px] font-semibold rounded-md transition-all cursor-pointer shrink-0 ${
                  filterTab === 'CHECKED'
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Сверено ({checkedCount})
              </button>
            </div>

            {/* View mode toggle */}
            <div className="inline-flex rounded-lg bg-surface border border-border p-0.5 shrink-0">
              <button
                type="button"
                data-compact="true"
                onClick={() => setViewMode('GROUPS')}
                className={`min-h-0 h-5.5 px-2 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'GROUPS'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
                title="Группировка по моделям"
              >
                <Layers className="w-3 h-3" />
                <span>Модели</span>
              </button>
              <button
                type="button"
                data-compact="true"
                onClick={() => setViewMode('ITEMS')}
                className={`min-h-0 h-5.5 px-2 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'ITEMS'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
                title="Поштучный список"
              >
                <List className="w-3 h-3" />
                <span>Штучно</span>
              </button>
            </div>
          </div>

          {/* List Content: Grouped by model or Flat List */}
          {viewMode === 'GROUPS' ? (
            /* GROUPED VIEW */
            <div className="divide-y divide-border">
              {filteredGroups.length === 0 ? (
                <div className="py-6 text-center text-fg-subtle space-y-1">
                  <Smartphone className="w-5 h-5 opacity-40 mx-auto" />
                  <p className="text-xs font-medium">Товары не найдены</p>
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
                        className={`px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer text-xs ${
                          isComplete ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'hover:bg-surface-raised'
                        }`}
                      >
                        {/* Check button & Model info */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <button
                            type="button"
                            data-compact="true"
                            onClick={(e) => handleToggleGroup(group, e)}
                            className={`min-h-0 w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                              isComplete
                                ? 'bg-emerald-500 border-emerald-600 text-white shadow-2xs'
                                : group.checked > 0
                                ? 'bg-amber-500 border-amber-600 text-white'
                                : 'bg-surface border-border text-transparent hover:border-accent'
                            }`}
                            title={isComplete ? 'Снять отметку' : 'Сверить всю группу'}
                          >
                            <Check className="w-3 h-3 stroke-3" />
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold text-xs truncate ${
                                isComplete ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'
                              }`}>
                                {group.brand} {group.model}
                              </span>

                              {group.storage && (
                                <span className="px-1.5 py-0.2 rounded bg-surface-raised border border-border text-[10px] font-mono font-bold text-fg shrink-0">
                                  {group.storage}
                                </span>
                              )}

                              {group.color && (
                                <span className="text-[10px] text-fg-muted shrink-0">
                                  • {formatPhoneColor(group.color)}
                                </span>
                              )}

                              {isComplete ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 shrink-0">
                                  <Check className="w-2.5 h-2.5 stroke-3" /> Сходится
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface-raised text-fg-subtle font-medium border border-border shrink-0">
                                  {group.checked} из {group.total}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right side: Action button & Expand toggle */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            data-compact="true"
                            onClick={(e) => handleToggleGroup(group, e)}
                            className={`min-h-0 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                              isComplete
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-surface-raised text-fg-subtle border-border hover:border-accent'
                            }`}
                          >
                            {isComplete ? 'Сверено ✓' : `Сверить (${group.total})`}
                          </button>

                          <button
                            type="button"
                            data-compact="true"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExpand(group.key);
                            }}
                            className="min-h-0 p-1 text-fg-subtle hover:text-fg rounded transition-colors cursor-pointer"
                            title={isExpanded ? 'Свернуть' : 'Развернуть список IMEI'}
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Sub-items (individual devices of this group if expanded) */}
                      {isExpanded && (
                        <div className="bg-surface-raised/40 border-t border-border/60 divide-y divide-border/40 pl-7 pr-2.5 py-0.5 animate-in fade-in duration-150 text-xs">
                          {group.items.map((device) => {
                            const isChecked = checkedImeis.has(device.imei) || (device.imei2 && checkedImeis.has(device.imei2));
                            return (
                              <div
                                key={device.id}
                                onClick={() => handleToggleCheck(device)}
                                className="py-1 px-1.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-surface-raised/80 rounded transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <button
                                    type="button"
                                    data-compact="true"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleCheck(device);
                                    }}
                                    className={`min-h-0 w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                      isChecked
                                        ? 'bg-emerald-500 border-emerald-600 text-white'
                                        : 'bg-surface border-border text-transparent hover:border-accent'
                                    }`}
                                  >
                                    <Check className="w-2.5 h-2.5 stroke-3" />
                                  </button>
                                  <span className="font-mono text-fg-subtle text-[11px] truncate">
                                    IMEI: <strong className="text-fg font-semibold">{device.imei}</strong>
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
                <div className="py-6 text-center text-fg-subtle space-y-1">
                  <Smartphone className="w-5 h-5 opacity-40 mx-auto" />
                  <p className="text-xs font-medium">Товары не найдены</p>
                </div>
              ) : (
                filteredList.map((device) => {
                  const isChecked = checkedImeis.has(device.imei) || (device.imei2 ? checkedImeis.has(device.imei2) : false);

                  return (
                    <div
                      key={device.id}
                      onClick={() => handleToggleCheck(device)}
                      className={`px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors cursor-pointer text-xs ${
                        isChecked
                          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                          : 'hover:bg-surface-raised'
                      }`}
                    >
                      {/* Check indicator & Model details */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          data-compact="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCheck(device);
                          }}
                          className={`min-h-0 w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-600 text-white shadow-2xs'
                              : 'bg-surface border-border text-transparent hover:border-accent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-3" />
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-bold text-xs truncate ${
                              isChecked ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'
                            }`}>
                              {device.brand} {device.model}
                            </span>

                            {device.storage && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-raised border border-border text-[10px] font-mono font-bold text-fg shrink-0">
                                {device.storage}
                              </span>
                            )}

                            {device.color && (
                              <span className="text-[10px] text-fg-muted shrink-0">
                                • {formatPhoneColor(device.color)}
                              </span>
                            )}

                            <span className="font-mono text-fg-subtle text-[10px] bg-surface-raised/80 px-1 py-0.2 rounded border border-border/50 shrink-0">
                              IMEI: <strong className="text-fg font-medium">{device.imei}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right action button */}
                      <button
                        type="button"
                        data-compact="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCheck(device);
                        }}
                        className={`min-h-0 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 ${
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
      ) : (
        <div className="p-2 sm:p-4 max-w-5xl mx-auto w-full">
          <RevisionHistoryPanel storeId={effectiveStoreId} isAdmin={isAdmin} />
        </div>
      )}

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
              onClick={() => setIsSummaryModalOpen(false)}
              disabled={isSavingRevision}
              className="flex-1 sm:flex-initial"
            >
              Продолжить сверку
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveRevision}
              disabled={isSavingRevision}
              leftIcon={FileCheck2}
              className="flex-1 sm:flex-initial font-bold"
            >
              {isSavingRevision ? 'Сохранение...' : 'Завершить и сохранить в историю'}
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
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Недостача (не найдено):</span>
              <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{uncheckedCount} шт.</span>
            </div>
            <div className="flex justify-between">
              <span className="text-danger font-semibold">Излишки:</span>
              <span className="font-bold font-mono text-danger">{surplus.length} шт.</span>
            </div>
          </div>

          {/* Optional comment */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-fg-subtle">
              Комментарий к ревизии (необязательно):
            </label>
            <textarea
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
              placeholder="Укажите примечание или причину расхождений..."
              rows={2}
              className="w-full p-2.5 text-xs rounded-xl bg-surface-raised border border-border text-fg placeholder:text-fg-subtle focus:outline-hidden focus:border-accent resize-none"
            />
          </div>

          {uncheckedCount > 0 && (
            <div>
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1.5">
                Недостача ({uncheckedCount} шт.):
              </h4>
              <div className="max-h-[160px] overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
                {storeDevices
                  .filter((d) => !checkedImeis.has(d.imei) && (!d.imei2 || !checkedImeis.has(d.imei2)))
                  .map((d) => (
                    <div key={d.id} className="p-2 flex justify-between items-center bg-surface">
                      <span className="font-semibold text-fg truncate">{d.brand} {d.model} ({[d.storage, formatPhoneColor(d.color)].filter(Boolean).join(' ')})</span>
                      <span className="font-mono text-fg-subtle text-[11px] shrink-0 ml-2">{d.imei}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {surplus.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-danger mb-1.5">Излишки ({surplus.length} шт.):</h4>
              <div className="max-h-[160px] overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
                {surplus.map((item) => (
                  <div key={item.code} className="p-2 flex justify-between items-center gap-2 bg-surface">
                    <span className="text-fg-subtle truncate">{item.note}</span>
                    <span className="font-mono text-fg text-[11px] shrink-0">{item.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Премиальный диалог подтверждения сброса сверки */}
      <ConfirmDialog
        open={isResetConfirmOpen}
        title="Сбросить отметки сверки?"
        confirmLabel="Сбросить и начать заново"
        cancelLabel="Отмена"
        tone="danger"
        icon={RotateCcw}
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetConfirmOpen(false)}
        message={
          <div className="space-y-3">
            <p className="font-medium text-fg text-sm">
              Вы уверены, что хотите сбросить текущую сверку для{' '}
              <span className="inline-flex items-center gap-1.5 font-bold text-fg bg-surface-raised border border-border px-2 py-0.5 rounded-lg text-xs align-baseline shadow-2xs">
                <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                {formatStoreDisplayTitle(currentStore)}
              </span>
              ?
            </p>

            {/* Impact & progress info card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-subtle">Прогресс проверки:</span>
                <span className="font-mono font-bold text-fg">
                  {checkedCount} из {totalCount} шт. ({progressPercent}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              </div>

              <div className="text-[11px] text-fg-subtle leading-normal">
                {checkedCount > 0 ? (
                  <span>
                    Все <strong className="text-danger font-semibold">{checkedCount} шт.</strong> отмеченных позиций будут очищены, и сверка начнётся заново.
                  </span>
                ) : (
                  <span>Отмеченные позиции будут сброшены, сверка начнётся заново.</span>
                )}
                {surplus.length > 0 && (
                  <span className="block text-warning font-medium mt-1">
                    ⚠️ Также будут удалены {surplus.length} шт. зафиксированных излишков.
                  </span>
                )}
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
};
