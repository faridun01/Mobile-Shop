import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatStoreName } from '../../utils/storeContext';
import { Device } from '../../types';
import { soundEffects } from '../../utils/sound';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { formatUserName } from '../../utils/formatUser';
import {
  ClipboardCheck,
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Smartphone,
  Check,
  X,
  Store as StoreIcon,
  Printer,
  ChevronRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

interface ForeignDeviceItem {
  id: string;
  imei: string;
  brand: string;
  model: string;
  storage?: string;
  color?: string;
  registeredStoreName: string;
}

export const RevisionPage: React.FC = () => {
  const {
    currentUser,
    stores,
    devices,
    openScanner,
    selectedStoreId,
    setSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'stores',
    'devices',
    'openScanner',
    'selectedStoreId',
    'setSelectedStoreId'
  );

  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';

  // Store resolution: Staff users audit their assigned store; Admins can choose store
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse && s.active), [stores]);
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
  // Foreign devices found (belonging to another store or unregistered)
  const [foreignDevices, setForeignDevices] = useState<ForeignDeviceItem[]>([]);

  // Scan input & feedback
  const [scanInput, setScanInput] = useState('');
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Filter tabs: 'ALL' | 'UNCHECKED' | 'CHECKED' | 'FOREIGN'
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNCHECKED' | 'CHECKED' | 'FOREIGN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Finish modal
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // When store changes, reset revision session
  useEffect(() => {
    setCheckedImeis(new Set());
    setForeignDevices([]);
    setStatus(null);
  }, [effectiveStoreId]);

  // Stats
  const totalCount = storeDevices.length;
  const checkedCount = storeDevices.filter((d) => checkedImeis.has(d.imei) || (d.imei2 && checkedImeis.has(d.imei2))).length;
  const uncheckedCount = totalCount - checkedCount;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Scan / Enter IMEI logic
  const handleProcessScan = useCallback((rawCode: string) => {
    const clean = rawCode.trim().replace(/\s+/g, '');
    if (!clean) return;

    // Check if matching device in this store (by exact IMEI, IMEI2, or suffix if 4+ digits)
    const exactMatch = storeDevices.find(
      (d) => d.imei === clean || (d.imei2 && d.imei2 === clean)
    );

    const suffixMatch = !exactMatch && clean.length >= 4
      ? storeDevices.find((d) => d.imei.endsWith(clean) || (d.imei2 && d.imei2.endsWith(clean)))
      : null;

    const matchedDevice = exactMatch || suffixMatch;

    if (matchedDevice) {
      if (checkedImeis.has(matchedDevice.imei)) {
        soundEffects.playAddToCartSuccess();
        setStatus({
          tone: 'info',
          text: `${matchedDevice.brand} ${matchedDevice.model} [IMEI: ${matchedDevice.imei}] уже был проверен ранее`,
        });
      } else {
        soundEffects.playAddToCartSuccess();
        setCheckedImeis((prev) => {
          const next = new Set(prev);
          next.add(matchedDevice.imei);
          if (matchedDevice.imei2) next.add(matchedDevice.imei2);
          return next;
        });
        setStatus({
          tone: 'success',
          text: `✓ Найдено: ${matchedDevice.brand} ${matchedDevice.model} (${matchedDevice.storage || ''} ${matchedDevice.color || ''}) [IMEI: ${matchedDevice.imei}]`,
        });
      }
      setScanInput('');
      setTimeout(() => scanInputRef.current?.focus(), 50);
      return;
    }

    // Not in this store: Check if device exists in company at all (another store / warehouse / sold)
    const otherDevice = devices.find(
      (d) => d.imei === clean || (d.imei2 && d.imei2 === clean)
    );

    if (otherDevice) {
      soundEffects.playError();
      const otherStoreName = stores.find((s) => s.id === otherDevice.locationId)?.name || otherDevice.locationName || 'другой точке';

      // Add to foreign devices if not already there
      setForeignDevices((prev) => {
        if (prev.some((f) => f.imei === otherDevice.imei)) return prev;
        return [
          {
            id: otherDevice.id,
            imei: otherDevice.imei,
            brand: otherDevice.brand,
            model: otherDevice.model,
            storage: otherDevice.storage,
            color: otherDevice.color,
            registeredStoreName: otherStoreName,
          },
          ...prev,
        ];
      });

      setStatus({
        tone: 'error',
        text: `⚠️ Внимание! ${otherDevice.brand} ${otherDevice.model} числится в «${otherStoreName}», а не в этом магазине!`,
      });
      setScanInput('');
      setTimeout(() => scanInputRef.current?.focus(), 50);
      return;
    }

    // Unknown IMEI
    soundEffects.playError();
    setStatus({
      tone: 'error',
      text: `❌ Устройство с IMEI ${clean} не найдено в базе данных!`,
    });
  }, [storeDevices, devices, stores, checkedImeis]);

  // Handle manual input submit
  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    handleProcessScan(scanInput);
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

  // Reset revision session
  const handleResetRevision = () => {
    if (window.confirm('Сбросить прогресс текущей ревизии и начать заново?')) {
      setCheckedImeis(new Set());
      setForeignDevices([]);
      setStatus({ tone: 'info', text: 'Ревизия сброшена. Начните сканирование устройств.' });
    }
  };

  // Filtered devices list for display
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
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight">
              Ревизия склада: {formatStoreName(currentStore?.name || 'Магазин')}
            </h1>
            <p className="text-[11px] text-fg-subtle">
              Сверка фактического наличия телефонов по IMEI
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Admin Store Switcher */}
          {isAdmin && stores.length > 0 && (
            <div className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-xl px-2.5 h-9 shrink-0">
              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
              <select
                value={effectiveStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-transparent text-xs font-bold text-fg focus:outline-none cursor-pointer"
                title="Выбрать магазин для ревизии"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.isMainWarehouse ? ' (Центральный склад)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleResetRevision}
            leftIcon={RotateCcw}
            className="h-9 px-2.5 text-xs text-fg-subtle hover:text-fg cursor-pointer"
            title="Сбросить текущую ревизию"
          >
            Сброс
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsSummaryModalOpen(true)}
            leftIcon={CheckCircle2}
            className="h-9 px-3.5 text-xs font-bold cursor-pointer"
          >
            Итоги ревизии
          </Button>
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
                  Проверено
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {checkedCount} <span className="text-xs font-normal opacity-75">шт.</span>
                </span>
              </div>

              <div className="w-px h-8 bg-border hidden sm:block" />

              <div>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Осталось найти
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                  {uncheckedCount} <span className="text-xs font-normal opacity-75">шт.</span>
                </span>
              </div>

              {foreignDevices.length > 0 && (
                <>
                  <div className="w-px h-8 bg-border hidden sm:block" />
                  <div>
                    <span className="text-[11px] font-bold text-danger uppercase tracking-wider block">
                      Чужие / Лишние
                    </span>
                    <span className="text-xl sm:text-2xl font-black font-mono text-danger">
                      {foreignDevices.length} <span className="text-xs font-normal opacity-75">шт.</span>
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="text-right sm:text-right">
              <span className="text-xs font-bold text-fg-subtle">Прогресс проверки:</span>
              <span className="text-lg font-black font-mono text-accent ml-2">
                {progressPercent}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-surface-raised border border-border overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progressPercent === 100
                  ? 'bg-emerald-500'
                  : 'bg-accent'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Quick Scan Input & Search Panel */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-fg flex items-center gap-2">
              <Barcode className="w-4 h-4 text-accent" />
              Сканирование устройства
            </h2>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openScanner((code) => handleProcessScan(code))}
              leftIcon={Barcode}
              className="h-8 text-xs cursor-pointer text-accent border-accent/30 hover:border-accent self-start sm:self-auto"
            >
              Камера-сканер
            </Button>
          </div>

          <form onSubmit={handleInputSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={scanInputRef}
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Отсканируйте сканером или введите IMEI (или последние 4-6 цифр)..."
                className="w-full h-11 pl-4 pr-10 rounded-xl border border-border bg-bg text-fg font-mono text-sm focus:outline-none focus:border-accent"
                autoFocus
              />
              {scanInput && (
                <button
                  type="button"
                  onClick={() => setScanInput('')}
                  className="absolute right-3 top-3 text-fg-subtle hover:text-fg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <Button
              type="submit"
              disabled={!scanInput.trim()}
              leftIcon={Check}
              className="h-11 px-5 cursor-pointer font-bold shrink-0"
            >
              Проверить
            </Button>
          </form>
        </div>

        {/* Devices Checklist & Tabs */}
        <div className="rounded-2xl bg-surface border border-border shadow-xs overflow-hidden">
          {/* Controls Bar: Tabs & Search */}
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
                Осталось найти ({uncheckedCount})
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
                Проверено ({checkedCount})
              </button>
              {foreignDevices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTab('FOREIGN')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
                    filterTab === 'FOREIGN'
                      ? 'bg-danger text-white shadow-2xs'
                      : 'text-danger hover:bg-danger/10'
                  }`}
                >
                  Чужие ({foreignDevices.length})
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64 shrink-0">
              <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск модели, цвета, IMEI..."
                className="w-full h-9 pl-8.5 pr-3 rounded-xl border border-border bg-surface text-fg text-xs focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* List Content */}
          {filterTab === 'FOREIGN' ? (
            /* Foreign devices found in this store */
            <div className="p-3 space-y-2">
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Эти телефоны были отсканированы в магазине, но в системе числятся на другом складе/точке!
                </span>
              </div>

              {foreignDevices.map((f, idx) => (
                <div
                  key={f.imei}
                  className="p-3 rounded-xl bg-surface-raised border border-danger/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-fg truncate">
                      {f.brand} {f.model}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-fg-subtle flex-wrap mt-0.5">
                      {f.storage && <span>{f.storage}</span>}
                      {f.color && <span>• {f.color}</span>}
                      <span className="font-mono text-accent font-semibold">• IMEI: {f.imei}</span>
                      <span className="text-danger font-semibold">• Числятся в: «{f.registeredStoreName}»</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Regular store devices checklist */
            <div className="divide-y divide-border">
              {filteredList.length === 0 ? (
                <div className="py-12 text-center text-fg-subtle space-y-2">
                  <Smartphone className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">Устройства не найдены</p>
                </div>
              ) : (
                filteredList.map((device, idx) => {
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
                                <Check className="w-3 h-3" /> Проверен
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
                            <span className="font-mono text-accent font-black">• IMEI: {device.imei}</span>
                            {device.imei2 && (
                              <span className="font-mono text-fg-subtle">• IMEI2: {device.imei2}</span>
                            )}
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
                        {isChecked ? 'Отмечен ✓' : 'Отметить'}
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
        title="Итоги ревизии склада"
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
              <span className="text-fg-subtle">Магазин:</span>
              <span className="font-bold text-fg">{currentStore?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-subtle">Проверяющий:</span>
              <span className="font-medium text-fg">{formatUserName(currentUser?.name)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-subtle">Дата проверки:</span>
              <span className="font-medium text-fg">{new Date().toLocaleString('ru-RU')}</span>
            </div>
            <div className="w-full h-px bg-border my-1" />
            <div className="flex justify-between">
              <span className="text-fg-subtle">Всего должно быть:</span>
              <span className="font-bold font-mono text-fg">{totalCount} шт.</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Фактически найдено:</span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{checkedCount} шт. ({progressPercent}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Не найдено (недостача?):</span>
              <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{uncheckedCount} шт.</span>
            </div>
            {foreignDevices.length > 0 && (
              <div className="flex justify-between text-danger font-semibold">
                <span>Лишние устройства (чужие):</span>
                <span className="font-bold font-mono">{foreignDevices.length} шт.</span>
              </div>
            )}
          </div>

          {uncheckedCount > 0 && (
            <div>
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1.5">
                Не проверенные телефоны ({uncheckedCount} шт.):
              </h4>
              <div className="max-h-[160px] overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs">
                {storeDevices
                  .filter((d) => !checkedImeis.has(d.imei) && (!d.imei2 || !checkedImeis.has(d.imei2)))
                  .map((d) => (
                    <div key={d.id} className="p-2 flex justify-between items-center bg-surface">
                      <span className="font-semibold text-fg truncate">{d.brand} {d.model} ({d.storage || ''})</span>
                      <span className="font-mono text-fg-subtle text-[11px] shrink-0 ml-2">{d.imei}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};
