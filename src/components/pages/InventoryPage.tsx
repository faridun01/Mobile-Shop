import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Device, DeviceStatus } from '../../types';
import {
  Search,
  Scan,
  Smartphone,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Store,
  History,
  DollarSign,
  Download
} from 'lucide-react';
import { exportInventoryReport } from '../../utils/exportReports';
import { formatDeviceIdentifiers } from '../../utils/formatters';

const STATUS_LABELS: Record<DeviceStatus, { text: string; bg: string; color: string; border: string }> = {
  MAIN_WAREHOUSE: { text: 'ГЛАВНЫЙ СКЛАД', bg: 'bg-slate-900', color: 'text-slate-300', border: 'border-slate-800' },
  STORE_STOCK: { text: 'В МАГАЗИНЕ', bg: 'bg-emerald-500/20', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  SOLD: { text: 'ПРОДАН', bg: 'bg-slate-900/60', color: 'text-slate-500', border: 'border-slate-800' },
  IN_STOCK_AFTER_EXCHANGE: { text: 'ОБМЕН (СКЛАД)', bg: 'bg-emerald-500/20', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  IN_REPAIR: { text: 'В РЕМОНТЕ', bg: 'bg-amber-500/10', color: 'text-amber-400', border: 'border-amber-500/30' },
  TRANSFER_PENDING: { text: 'ТРАНЗИТ...', bg: 'bg-purple-500/10', color: 'text-purple-400', border: 'border-purple-500/30' }
};

export const InventoryPage: React.FC = () => {
  const {
    currentUser,
    devices,
    stores,
    selectedStoreId,
    setSelectedStoreId,
    openScanner
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('IN_STOCK');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  // Determine allowed store filter based on role
  const isSeller = currentUser?.role === 'SELLER';
  const effectiveStoreId = isSeller
    ? (currentUser?.storeId || 'store-1')
    : (selectedStoreId || 'all');

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // 1. Role / Location Filter - allow 'all' for admin/partner
      if (effectiveStoreId !== 'all' && d.locationId !== effectiveStoreId) {
        return false;
      }

      // 2. Status Filter
      if (selectedStatus === 'IN_STOCK') {
        if (d.status !== 'STORE_STOCK' && d.status !== 'MAIN_WAREHOUSE' && d.status !== 'IN_STOCK_AFTER_EXCHANGE') {
          return false;
        }
      } else if (selectedStatus === 'GIFTS') {
        if ((d.purchaseCostUsd !== 0 && !d.isBonus) || d.status === 'SOLD') {
          return false;
        }
      } else if (selectedStatus !== 'ALL') {
        if (d.status !== selectedStatus) return false;
      }

      // 3. Brand Filter
      if (selectedBrand !== 'ALL' && d.brand !== selectedBrand) {
        return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesImei = d.imei.toLowerCase().includes(q);
        const matchesSerial = d.serialNumber?.toLowerCase().includes(q);
        const matchesBarcode = d.barcode?.toLowerCase().includes(q);
        const matchesBrand = d.brand.toLowerCase().includes(q);
        const matchesModel = d.model.toLowerCase().includes(q);
        const matchesColor = d.color.toLowerCase().includes(q);
        const matchesStorage = d.storage.toLowerCase().includes(q);
        const matchesSupplier = d.supplierName?.toLowerCase().includes(q);

        if (!matchesImei && !matchesSerial && !matchesBarcode && !matchesBrand && !matchesModel && !matchesColor && !matchesStorage && !matchesSupplier) {
          return false;
        }
      }

      return true;
    });
  }, [devices, isSeller, currentUser, effectiveStoreId, selectedStatus, selectedBrand, searchQuery]);

  // Brands list
  const brands = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => set.add(d.brand));
    return ['ALL', ...Array.from(set)];
  }, [devices]);

  const handleScanDevice = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const match = devices.find(d => 
        (d.imei === code || d.barcode === code || d.serialNumber === code) &&
        (!isSeller || d.locationId === currentUser?.storeId)
      );

      if (match) {
        setSelectedDevice(match);
      } else {
        setSearchQuery(code);
      }
    });
  };

  const isAdminOrPartner = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300">
      {/* Top Controls Bar */}
      <div className="p-2.5 border-b border-slate-800 bg-[#0F1219] space-y-2 shrink-0">
        {/* Row 1: Search & Scanner */}
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по IMEI / штрихкоду / модели..."
              className="w-full rounded bg-[#0B0E14] border border-slate-800 pl-8 pr-8 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={handleScanDevice}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 rounded text-xs font-mono font-bold text-emerald-400 border border-slate-800 hover:border-slate-700 transition-colors shrink-0"
            title="Сканировать IMEI"
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">СКАНЕР</span>
          </button>
        </div>

        {/* Row 2: Warehouse and Status Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {!isSeller ? (
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="text-[10px] text-slate-400 font-mono uppercase font-bold">ВЫБЕРИТЕ СКЛАД:</span>
                <div className="flex items-center space-x-1 bg-[#0B0E14] p-0.5 rounded border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedStoreId('all')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all bg-transparent ${
                      effectiveStoreId === 'all'
                        ? 'text-[#22c55e] font-bold underline decoration-2 underline-offset-4'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ВСЕ СКЛАДЫ
                  </button>
                  {stores.map(s => {
                    const isSelected = effectiveStoreId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStoreId(s.id)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all bg-transparent ${
                          isSelected
                            ? 'text-[#22c55e] font-bold underline decoration-2 underline-offset-4'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 shrink-0 bg-[#0B0E14] px-2.5 py-1 rounded border border-slate-800">
                <Store className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-slate-400 font-mono uppercase">Склад магазина:</span>
                <span className="text-xs font-mono font-bold text-slate-100">{currentUser?.storeName || 'Мой магазин'}</span>
              </div>
            )}

            <div className="flex items-center space-x-1 shrink-0">
              <span className="text-[10px] text-slate-500 font-mono uppercase">Статус:</span>
              <select
                value={selectedStatus ?? 'IN_STOCK'}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-[#0B0E14] border border-slate-800 text-slate-200 text-xs font-mono rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
              >
                <option value="IN_STOCK">В НАЛИЧИИ</option>
                <option value="GIFTS">🎁 ПОДАРОЧНЫЕ ($0)</option>
                <option value="ALL">ВСЕ СТАТУСЫ</option>
                <option value="SOLD">ПРОДАННЫЕ</option>
                <option value="IN_REPAIR">В РЕМОНТЕ</option>
                <option value="TRANSFER_PENDING">В ТРАНЗИТЕ</option>
              </select>
            </div>
          </div>

          <div className="ml-auto flex items-center space-x-2 text-[11px] font-mono text-slate-400 shrink-0">
            <span>Найдено: <strong className="text-emerald-400">{filteredDevices.length}</strong> шт.</span>

            {!isSeller && (
              <button
                onClick={() => exportInventoryReport(filteredDevices, stores)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 text-[10px] font-mono font-bold transition-colors"
                title="Скачать отфильтрованные остатки в CSV"
              >
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">ЭКСПОРТ</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 3: Brands on their own dedicated row as requested */}
        <div className="flex items-center space-x-2 overflow-x-auto pt-1 border-t border-slate-800/80 text-xs scrollbar-none">
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${
                selectedBrand === b
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {b === 'ALL' ? 'ВСЕ БРЕНДЫ' : b}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Warehouse Inventory List (Model -> Storage Option -> Color breakdown) */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 bg-[#0B0E14] p-3 space-y-3">
        {filteredDevices.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-25" />
            <p className="text-xs font-mono uppercase tracking-wider">Устройства не найдены</p>
            <p className="text-[11px] text-slate-600 font-mono mt-1">Попробуйте изменить параметры поиска или фильтров</p>
          </div>
        ) : (
          (() => {
            // Group devices by Brand + Model
            const groupedMap = new Map<string, { brand: string; model: string; devices: Device[] }>();

            filteredDevices.forEach((dev) => {
              const key = `${dev.brand} ${dev.model}`;
              if (!groupedMap.has(key)) {
                groupedMap.set(key, { brand: dev.brand, model: dev.model, devices: [] });
              }
              groupedMap.get(key)!.devices.push(dev);
            });

            return Array.from(groupedMap.values()).map((group) => {
              const groupKey = `${group.brand}-${group.model}`;
              const isExpanded = Boolean(searchQuery.trim()) || expandedModels[groupKey];

              // Group within model by Storage Option
              const storageMap = new Map<string, { storage: string; colorsMap: Map<string, Device[]> }>();

              group.devices.forEach((dev) => {
                const storageKey = dev.storage || 'Стандарт';
                if (!storageMap.has(storageKey)) {
                  storageMap.set(storageKey, { storage: storageKey, colorsMap: new Map() });
                }
                const colorsMap = storageMap.get(storageKey)!.colorsMap;
                const colorKey = dev.color || 'Базовый';
                if (!colorsMap.has(colorKey)) {
                  colorsMap.set(colorKey, []);
                }
                colorsMap.get(colorKey)!.push(dev);
              });

              const storageSummary = Array.from(storageMap.keys()).join(', ');

              return (
                <div
                  key={groupKey}
                  className="rounded-lg border border-slate-800 bg-[#0F1219] font-mono overflow-hidden transition-colors"
                >
                  {/* Compact Model Row Header */}
                  <div
                    onClick={() =>
                      setExpandedModels((prev) => ({
                        ...prev,
                        [groupKey]: !prev[groupKey],
                      }))
                    }
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-900/80 transition-colors select-none"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="truncate">
                        <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-tight truncate">
                          {group.brand} {group.model}
                        </h3>
                        <p className="text-[10px] text-slate-500 truncate">
                          Память: {storageSummary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5 shrink-0">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                        {group.devices.length} шт.
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Options & Color Breakdown */}
                  {isExpanded && (
                    <div className="p-3 border-t border-slate-800/80 bg-[#0B0E14] space-y-2.5">
                      {Array.from(storageMap.values()).map((opt) => {
                        const storageTotal = Array.from(opt.colorsMap.values()).reduce(
                          (sum, list) => sum + list.length,
                          0
                        );

                        return (
                          <div
                            key={opt.storage}
                            className="p-2.5 rounded bg-[#0F1219] border border-slate-800/70 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-200 uppercase flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2" />
                                Объем памяти: <strong className="ml-1 text-emerald-300">{opt.storage}</strong>
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                                {storageTotal} шт.
                              </span>
                            </div>

                            {/* Color breakdown badges */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {Array.from(opt.colorsMap.entries()).map(([colorName, colorDevs]) => (
                                <div
                                  key={colorName}
                                  className="flex items-center space-x-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px]"
                                >
                                  <span className="text-slate-300">{colorName}:</span>
                                  <span className="font-bold text-emerald-400">{colorDevs.length} шт.</span>
                                </div>
                              ))}
                            </div>

                            {/* List of individual devices in this storage option */}
                            <div className="mt-2 divide-y divide-slate-800/40 border-t border-slate-800/50 pt-1.5">
                              {Array.from(opt.colorsMap.values())
                                .flat()
                                .map((dev) => {
                                  const statusConfig = STATUS_LABELS[dev.status] || {
                                    text: dev.status,
                                    bg: 'bg-slate-900',
                                    color: 'text-slate-400',
                                    border: 'border-slate-800',
                                  };

                                  return (
                                    <div
                                      key={dev.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDevice(dev);
                                      }}
                                      className="py-1.5 px-2 hover:bg-slate-900/80 rounded flex items-center justify-between cursor-pointer transition-colors text-[11px]"
                                    >
                                      <div className="flex items-center space-x-2 truncate">
                                        <span className="text-slate-300 font-medium">{dev.color}</span>
                                        <span className="text-slate-500">•</span>
                                        <span className="text-slate-400 font-mono">
                                          IMEI: {dev.imei}{dev.imei2 ? ` / ${dev.imei2}` : ''}
                                          {dev.barcode ? <span className="text-amber-400/90 font-mono ml-1.5">• EAN: {dev.barcode}</span> : null}
                                        </span>
                                      </div>

                                      <div className="flex items-center space-x-2 shrink-0">
                                        <span
                                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}
                                        >
                                          {statusConfig.text}
                                        </span>
                                        {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                            🎁 ПОДАРОК ($0)
                                          </span>
                                        )}
                                        {isAdminOrPartner && (dev.purchaseCostUsd > 0 && !dev.isBonus) && (
                                          <span className="text-slate-300 font-mono font-bold">${dev.purchaseCostUsd}</span>
                                        )}
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()
        )}
      </div>

      {/* MODAL: Device Details & Chronological Timeline */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg bg-[#0F1219] border border-slate-800 p-4 sm:p-5 shadow-2xl text-slate-200 max-h-[90vh] flex flex-col font-mono">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 shrink-0">
              <div>
                <span className="text-[10px] uppercase text-slate-500">КАРТОЧКА УСТРОЙСТВА</span>
                <h3 className="text-sm sm:text-base font-bold text-white font-mono truncate">
                  {selectedDevice.brand} {selectedDevice.model}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDevice(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="space-y-3.5 overflow-y-auto flex-1 pr-1">
              {/* Technical Spec Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-[#0B0E14] p-3 rounded border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">ПАМЯТЬ / ЦВЕТ:</span>
                  <span className="font-bold text-slate-200">{selectedDevice.storage} • {selectedDevice.color}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">ЛОКАЦИЯ:</span>
                  <span className="font-bold text-emerald-400 flex items-center mt-0.5 truncate">
                    <Store className="w-3 h-3 mr-1 shrink-0" />
                    <span className="truncate">{selectedDevice.locationName}</span>
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-500 block text-[10px] uppercase">IMEI ИДЕНТИФИКАТОР:</span>
                  <span className="text-xs font-bold text-slate-100 select-all tracking-wider break-all">
                    {selectedDevice.imei} {selectedDevice.imei2 ? `| IMEI 2: ${selectedDevice.imei2}` : ''}
                  </span>
                </div>
                {selectedDevice.serialNumber && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">СЕРИЙНЫЙ НОМЕР:</span>
                    <span className="text-slate-300 break-all">{selectedDevice.serialNumber}</span>
                  </div>
                )}
                {selectedDevice.barcode && (
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">ШТРИХКОД:</span>
                    <span className="text-slate-300">{selectedDevice.barcode}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">ТЕКУЩИЙ СТАТУС:</span>
                  <span className="font-bold text-slate-200">
                    {STATUS_LABELS[selectedDevice.status]?.text || selectedDevice.status}
                  </span>
                </div>
              </div>

              {/* Financial Data (ADMIN / PARTNER ONLY) */}
              {isAdminOrPartner && (
                <div className="bg-[#0B0E14] p-3 rounded border border-slate-800 space-y-2 text-xs">
                  <p className="font-bold text-slate-300 flex items-center space-x-1.5 uppercase text-[10px] tracking-wider">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>ФИНАНСОВЫЙ АУДИТ</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">ПОСТАВЩИК:</span>
                      <span className="text-slate-300 truncate block">{selectedDevice.supplierName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">НАКЛАДНАЯ:</span>
                      <span className="text-slate-300 truncate block">{selectedDevice.invoiceNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">ЦЕНА ЗАКУПКИ:</span>
                      <span className="font-bold text-emerald-400">${selectedDevice.purchaseCostUsd}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">СЕБЕСТОИМОСТЬ:</span>
                      <span className="font-bold text-slate-300">${selectedDevice.costBasisUsd}</span>
                    </div>
                  </div>
                  {selectedDevice.isBonus && (
                    <p className="text-[10px] text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/30">
                      БОНУС ПОСТАВЩИКА
                    </p>
                  )}
                </div>
              )}

              {/* Chronological Timeline */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>ИСТОРИЯ ПЕРЕМЕЩЕНИЙ И СОБЫТИЙ</span>
                </p>

                <div className="border border-slate-800 rounded bg-[#0B0E14] p-3 space-y-2.5">
                  {selectedDevice.timeline && selectedDevice.timeline.length > 0 ? (
                    selectedDevice.timeline.map((event, idx) => (
                      <div key={event.id || idx} className="relative pl-4 before:absolute before:left-1 before:top-1.5 before:bottom-0 before:w-px before:bg-slate-800 last:before:hidden">
                        <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-emerald-400" />
                        <div className="text-xs">
                          <div className="flex items-baseline justify-between">
                            <span className="font-bold text-slate-200 uppercase text-[11px]">{event.type}</span>
                            <span className="text-[9px] text-slate-500">{event.date}</span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-0.5 font-sans">{event.description}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">ОПЕРАТОР: {event.user}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">История событий пуста</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2.5 border-t border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedDevice(null)}
                className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
