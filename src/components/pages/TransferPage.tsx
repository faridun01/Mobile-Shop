import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Trash2,
  Scan,
  Store as StoreIcon,
  Search,
  Check,
  Smartphone,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Send
} from 'lucide-react';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';

export const TransferPage: React.FC = () => {
  const location = useLocation();

  const {
    currentUser,
    stores,
    devices,
    transfers,
    createTransferRequest,
    approveTransferRequest,
    rejectTransferRequest
  } = useApp();

  const [activeTab, setActiveTab] = useState<'create' | 'list'>(() => {
    if (location.state && (location.state as any).tab === 'list') return 'list';
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === 'list') return 'list';
    return 'create';
  });

  useEffect(() => {
    if (location.state && (location.state as any).tab === 'list') {
      setActiveTab('list');
    }
  }, [location.state]);
  const defaultNonWarehouseId = useMemo(() => {
    return stores.find(s => !s.isMainWarehouse)?.id || stores[0]?.id || 'main-warehouse';
  }, [stores]);

  const [fromLocationId, setFromLocationId] = useState<string>(() => {
    return currentUser?.role === 'SELLER' ? (currentUser.storeId || defaultNonWarehouseId) : 'main-warehouse';
  });
  const [toLocationId, setToLocationId] = useState<string>(() => {
    return currentUser?.role === 'SELLER' ? 'main-warehouse' : defaultNonWarehouseId;
  });

  useEffect(() => {
    if (stores.length > 0) {
      const validFrom = stores.some(s => s.id === fromLocationId)
        ? fromLocationId
        : (currentUser?.role === 'SELLER' ? (currentUser.storeId || defaultNonWarehouseId) : 'main-warehouse');
      if (validFrom !== fromLocationId) {
        setFromLocationId(validFrom);
      }

      const availableTargets = stores.filter(s => s.id !== validFrom);
      if (availableTargets.length > 0 && (!toLocationId || !availableTargets.some(s => s.id === toLocationId))) {
        setToLocationId(availableTargets[0].id);
      }
    }
  }, [stores, currentUser, fromLocationId, toLocationId, defaultNonWarehouseId]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  // Reject modal state
  const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const isSeller = currentUser?.role === 'SELLER';
  const isAdminOrPartner = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  // Available devices in the selected origin location (excluding already selected ones)
  const availableOriginDevices = useMemo(() => {
    return devices.filter(d => {
      if (d.locationId !== fromLocationId) return false;
      const isAvailable = d.status !== 'SOLD' && d.status !== 'IN_REPAIR' && d.status !== 'TRANSFER_PENDING';
      if (!isAvailable) return false;
      if (selectedDeviceIds.includes(d.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesModel = `${d.brand} ${d.model}`.toLowerCase().includes(q);
        const matchesImei = d.imei.toLowerCase().includes(q);
        const matchesImei2 = d.imei2?.toLowerCase().includes(q);
        const matchesBarcode = d.barcode?.toLowerCase().includes(q);
        const matchesColor = d.color.toLowerCase().includes(q);
        if (!matchesModel && !matchesImei && !matchesImei2 && !matchesBarcode && !matchesColor) return false;
      }
      return true;
    });
  }, [devices, fromLocationId, searchQuery, selectedDeviceIds]);

  const selectedDevicesList = useMemo(() => {
    return selectedDeviceIds
      .map(id => devices.find(d => d.id === id))
      .filter((d): d is typeof devices[0] => Boolean(d));
  }, [selectedDeviceIds, devices]);

  const fromStoreName = stores.find(s => s.id === fromLocationId)?.name || 'Не выбрано';
  const toStoreName = stores.find(s => s.id === toLocationId)?.name || 'Не выбрано';

  // Toggle device selection
  const handleToggleDevice = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    );
  };

  const handleScanDeviceToTransfer = () => {
    setIsScannerOpen(true);
  };

  const handleScanSuccess = (code: string) => {
    setIsScannerOpen(false);
    const found = availableOriginDevices.find(d => d.imei === code || d.imei2 === code || d.barcode === code);
    if (found) {
      if (!selectedDeviceIds.includes(found.id)) {
        setSelectedDeviceIds(prev => [...prev, found.id]);
        setStatusMessage({ type: 'success', text: `Добавлено: ${found.brand} ${found.model} (IMEI: ${found.imei})` });
      } else {
        setStatusMessage({ type: 'error', text: 'Устройство уже выбрано' });
      }
    } else {
      setStatusMessage({
        type: 'error',
        text: `Устройство со штрихкодом/IMEI ${code} не найдено на складе "${fromStoreName}"`
      });
    }
  };

  const handleOpenTransferModal = () => {
    if (selectedDeviceIds.length === 0) return;
    if (fromLocationId === toLocationId) {
      setStatusMessage({ type: 'error', text: 'Склад отправки и назначения не могут совпадать' });
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleSubmitTransfer = async () => {
    if (selectedDeviceIds.length === 0) return;
    if (fromLocationId === toLocationId) {
      setStatusMessage({ type: 'error', text: 'Склад отправки и назначения не могут совпадать' });
      return;
    }

    const res = await createTransferRequest({
      fromLocationId,
      toLocationId,
      deviceIds: selectedDeviceIds
    });

    if (res.success) {
      setIsConfirmModalOpen(false);
      setSelectedDeviceIds([]);
      setStatusMessage({
        type: 'success',
        text: 'Товары успешно перемещены на новый склад! Администратор получил уведомление.'
      });
      setActiveTab('list');
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания перемещения' });
    }
  };

  const handleApprove = async (transferId: string) => {
    const res = await approveTransferRequest(transferId);
    if (res.success) {
      setStatusMessage({ type: 'success', text: 'Перемещение успешно подтверждено! Товары зачислены на склад.' });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка подтверждения' });
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectingTransferId) return;
    const res = await rejectTransferRequest(rejectingTransferId, rejectReasonInput || 'Отклонено администратором');
    if (res.success) {
      setStatusMessage({ type: 'success', text: 'Запрос на перемещение отклонен' });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка' });
    }
    setRejectingTransferId(null);
    setRejectReasonInput('');
  };

  // Filter transfers for history
  const visibleTransfers = useMemo(() => {
    const list = isAdminOrPartner ? transfers : transfers.filter(
      t => t.fromLocationId === currentUser?.storeId || t.toLocationId === currentUser?.storeId
    );
    return [...list].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [transfers, isAdminOrPartner, currentUser]);

  const pendingCount = visibleTransfers.filter(t => t.status === 'PENDING_APPROVAL').length;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#0F1219] text-slate-100">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-slate-800 bg-[#0B0E14] flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold font-mono uppercase text-slate-100 flex items-center space-x-2">
            <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
            <span>ПЕРЕМЕЩЕНИЕ И ТРАНЗИТ</span>
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {isSeller
              ? 'Формирование запросов на перемещение между складами'
              : 'Управление передачей устройств между филиалами и центральным складом'}
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-2.5 p-2.5 rounded-lg text-xs flex items-center justify-between shrink-0 font-mono ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
        }`}>
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-[#0B0E14] px-3 sm:px-4 pt-2 text-xs font-mono shrink-0">
        <button
          onClick={() => setActiveTab('create')}
          className={`pb-2.5 px-3 transition-colors border-b-2 font-bold uppercase tracking-wider bg-transparent ${
            activeTab === 'create'
              ? 'border-[#22c55e] text-[#22c55e]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {isSeller ? 'Новый запрос' : 'Новое перемещение'}
        </button>

        <button
          onClick={() => setActiveTab('list')}
          className={`pb-2.5 px-3 transition-colors border-b-2 flex items-center space-x-2 font-bold uppercase tracking-wider ${
            activeTab === 'list'
              ? 'border-blue-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>История и подтверждения</span>
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-black px-1.5 py-0.2 rounded-full font-bold text-[10px]">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeTab === 'create' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Origin & Destination Selector Bar */}
            <div className="p-3 sm:p-4 border-b border-slate-800 bg-[#0F1219] shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px] uppercase font-bold">Откуда (Отправитель):</label>
                  {isSeller ? (
                    <div className="p-2 rounded bg-[#0B0E14] border border-slate-800 text-slate-200 font-bold flex items-center space-x-2">
                      <StoreIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{currentUser?.storeName || 'Мой магазин'}</span>
                    </div>
                  ) : (
                    <select
                      value={fromLocationId ?? ''}
                      onChange={(e) => {
                        setFromLocationId(e.target.value);
                        setSelectedDeviceIds([]);
                      }}
                      className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                    >
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px] uppercase font-bold">Куда (Получатель):</label>
                  <select
                    value={toLocationId ?? ''}
                    onChange={(e) => setToLocationId(e.target.value)}
                    className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {stores.filter(s => isSeller || s.id !== fromLocationId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {isSeller && (
                <div className="mt-2.5 p-2 rounded bg-amber-950/30 border border-amber-900/40 text-[11px] font-mono text-amber-300 flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Запрос поступит Администратору. Товар переместится только после подтверждения.</span>
                </div>
              )}
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 bg-[#0B0E14] border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery ?? ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск устройств в этой точке (модель, IMEI)..."
                  className="w-full rounded bg-[#0F1219] border border-slate-800 pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleScanDeviceToTransfer}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-mono font-bold rounded border border-slate-800 shrink-0 transition-colors"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>СКАНЕР</span>
              </button>
            </div>

            {/* Grouped Device Selection List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 bg-[#0B0E14] p-3 space-y-3 pb-24">
              {availableOriginDevices.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs font-mono">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Нет доступных устройств в локации «{fromStoreName}»</p>
                </div>
              ) : (
                (() => {
                  const groupedMap = new Map<string, { brand: string; model: string; devices: typeof availableOriginDevices }>();

                  availableOriginDevices.forEach((dev) => {
                    const key = `${dev.brand} ${dev.model}`;
                    if (!groupedMap.has(key)) {
                      groupedMap.set(key, { brand: dev.brand, model: dev.model, devices: [] });
                    }
                    groupedMap.get(key)!.devices.push(dev);
                  });

                  return Array.from(groupedMap.values()).map((group) => {
                    const groupKey = `${group.brand}-${group.model}`;
                    const isExpanded = Boolean(searchQuery.trim()) || expandedModels[groupKey];

                    const storageMap = new Map<string, typeof group.devices>();
                    group.devices.forEach((dev) => {
                      const stKey = dev.storage || 'Стандарт';
                      if (!storageMap.has(stKey)) storageMap.set(stKey, []);
                      storageMap.get(stKey)!.push(dev);
                    });

                    const storageSummary = Array.from(storageMap.keys()).join(', ');

                    const selectedInGroup = group.devices.filter((dev) => selectedDeviceIds.includes(dev.id)).length;

                    const isSingleUnit = group.devices.length === 1;
                    const singleDev = group.devices[0];
                    const isSingleSelected = isSingleUnit && selectedDeviceIds.includes(singleDev.id);

                    return (
                      <div
                        key={groupKey}
                        className={`rounded-lg border font-mono overflow-hidden transition-colors ${
                          isSingleSelected
                            ? 'bg-emerald-500/15 border-emerald-500'
                            : 'bg-[#0F1219] border-slate-800'
                        }`}
                      >
                        {/* Compact Model Header */}
                        <div
                          onClick={() => {
                            if (isSingleUnit) {
                              handleToggleDevice(singleDev.id);
                            } else {
                              setExpandedModels((prev) => ({
                                ...prev,
                                [groupKey]: !prev[groupKey],
                              }));
                            }
                          }}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-900/80 transition-colors select-none"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            {isSingleUnit ? (
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] shrink-0 ${
                                  isSingleSelected
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-slate-700 bg-slate-900'
                                }`}
                              >
                                {isSingleSelected ? <Check className="w-3 h-3" /> : null}
                              </span>
                            ) : (
                              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}

                            <div className="truncate">
                              <h3 className="text-xs sm:text-sm font-bold text-slate-100 uppercase tracking-tight truncate">
                                {group.brand} {group.model}
                              </h3>
                              <p className="text-[10px] text-slate-500 truncate">
                                {isSingleUnit
                                  ? `${singleDev.storage} • ${singleDev.color} • IMEI: ${singleDev.imei}`
                                  : `Память: ${storageSummary}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {isSingleUnit ? (
                              <span
                                className={`text-[10px] font-mono px-2.5 py-1 rounded font-bold border transition-colors ${
                                  isSingleSelected
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-900 text-slate-400 border-slate-800'
                                }`}
                              >
                                {isSingleSelected ? 'ВЫБРАНО' : '+ ДОБАВИТЬ'}
                              </span>
                            ) : (
                              <>
                                {selectedInGroup > 0 && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    выбрано: {selectedInGroup} шт.
                                  </span>
                                )}
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                                  в наличии: {group.devices.length} шт.
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Expanded Devices List */}
                        {isExpanded && (
                          <div className="p-3 border-t border-slate-800/80 bg-[#0B0E14] space-y-2">
                            {Array.from(storageMap.entries()).map(([storageName, devList]) => (
                              <div key={storageName} className="space-y-1.5">
                                <div className="text-[11px] font-bold text-emerald-300 uppercase px-1">
                                  Объем памяти: {storageName} ({devList.length} шт.)
                                </div>

                                <div className="divide-y divide-slate-800/50 rounded bg-[#0F1219] border border-slate-800/80">
                                  {devList.map((dev) => {
                                    const isSelected = selectedDeviceIds.includes(dev.id);

                                    return (
                                      <div
                                        key={dev.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleDevice(dev.id);
                                        }}
                                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                                          isSelected
                                            ? 'bg-emerald-500/15 border-l-2 border-emerald-500'
                                            : 'hover:bg-slate-900/60'
                                        }`}
                                      >
                                        <div className="flex items-center space-x-2.5 truncate">
                                          <span
                                            className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] shrink-0 ${
                                              isSelected
                                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                                : 'border-slate-700 bg-slate-900'
                                            }`}
                                          >
                                            {isSelected && <Check className="w-3 h-3" />}
                                          </span>
                                          <div className="truncate">
                                             <span className="text-slate-200 font-medium">{dev.color}</span>
                                             <span className="text-slate-500 mx-1.5">•</span>
                                             <span className="text-slate-400 font-mono">
                                               IMEI 1: <strong className="text-slate-300">{dev.imei}</strong>
                                               {dev.imei2 ? <span> • IMEI 2: <strong className="text-slate-300">{dev.imei2}</strong></span> : null}
                                               <span> • EAN / Баркод: <strong className="text-amber-400">{dev.barcode || '—'}</strong></span>
                                             </span>
                                           </div>
                                        </div>

                                        <span
                                          className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors shrink-0 ${
                                            isSelected
                                              ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                                          }`}
                                        >
                                          {isSelected ? 'ВЫБРАНО' : '+ ДОБАВИТЬ'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* FLOATING ACTION BAR: Opens modal for review & confirmation when clicked */}
            {selectedDeviceIds.length > 0 && (
              <div className="fixed bottom-16 md:bottom-4 left-3 right-3 md:left-64 md:right-4 z-40 max-w-xl mx-auto">
                <div
                  onClick={handleOpenTransferModal}
                  className="p-3 rounded-2xl bg-[#0F131D] border border-emerald-500/40 shadow-[0_8px_30px_rgba(0,0,0,0.85)] flex items-center justify-between gap-3 backdrop-blur-md cursor-pointer hover:border-emerald-500/70 transition-all select-none"
                >
                  <div className="flex items-center space-x-3 min-w-0 pl-1">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.5)]">
                      {selectedDeviceIds.length}
                    </div>
                    <div className="truncate text-xs font-mono">
                      <span className="text-slate-100 font-bold block truncate">
                        {fromStoreName} → {toStoreName}
                      </span>
                      <span className="text-[10px] text-emerald-400 block">
                        Нажмите чтобы открыть список ({selectedDeviceIds.length} шт.)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDeviceIds([]);
                      }}
                      className="px-2.5 py-2 text-[11px] font-mono text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      Сброс
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTransferModal();
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all"
                    >
                      <span>ПЕРЕМЕСТИТЬ ({selectedDeviceIds.length})</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* List of Transfer Requests & History */
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#0B0E14]">
            {visibleTransfers.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs font-mono">
                <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>История перемещений пуста</p>
              </div>
            ) : (
              visibleTransfers.map((tr) => {
                const isPending = tr.status === 'PENDING_APPROVAL';

                return (
                  <div
                    key={tr.id}
                    className="p-3.5 rounded-lg bg-[#0F1219] border border-slate-800 space-y-2.5 font-mono text-xs"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-emerald-400">{tr.transferNumber}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                          tr.status === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                          tr.status === 'PENDING_APPROVAL' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                          'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}>
                          {tr.status === 'APPROVED' ? 'Подтвержден' : tr.status === 'PENDING_APPROVAL' ? 'Ожидает одобрения' : 'Отклонен'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {new Date(tr.requestedAt).toLocaleString('ru-RU')}
                      </span>
                    </div>

                    {/* Route Details */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-200">{tr.fromLocationName}</span>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-bold text-slate-200">{tr.toLocationName}</span>
                      <span className="text-slate-500 ml-auto">ОПЕРАТОР: {tr.requestedBy}</span>
                    </div>

                    {/* Devices list */}
                    <div className="bg-[#0B0E14] p-2.5 rounded border border-slate-800 space-y-1">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">
                        Устройства ({tr.deviceImeis.length} шт.):
                      </p>
                      <div className="divide-y divide-slate-800/60 max-h-32 overflow-y-auto pr-1">
                        {tr.deviceImeis.map((imei, idx) => (
                          <div key={idx} className="py-1 flex items-center justify-between text-[11px]">
                            <span className="text-slate-300">{tr.deviceModels[idx] || 'Устройство'}</span>
                            <span className="font-mono text-slate-500">{imei}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Admin Approval Actions */}
                    {isPending && isAdminOrPartner && (
                      <div className="pt-2 flex space-x-2 justify-end border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setRejectingTransferId(tr.id)}
                          className="px-3 py-1.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-900 text-xs font-bold transition-colors"
                        >
                          ОТКЛОНИТЬ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(tr.id)}
                          className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-sm transition-colors"
                        >
                          ПОДТВЕРДИТЬ ПЕРЕМЕЩЕНИЕ
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* MODAL: Review & Confirm Transfer */}
      {isConfirmModalOpen && (() => {
        const nextTransferNum = `TR-${((transfers?.length || 0) + 1).toString().padStart(4, '0')}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-100 shadow-2xl space-y-4 font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-bold uppercase text-white">НАКЛАДНАЯ ПЕРЕМЕЩЕНИЯ {nextTransferNum}</h4>
                </div>
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Route summary */}
              <div className="p-3 bg-[#0B0E14] rounded-lg border border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">№ Накладной:</span>
                  <span className="font-bold text-amber-400">{nextTransferNum}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Отправитель:</span>
                  <span className="font-bold text-slate-200">{fromStoreName}</span>
                </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Получатель:</span>
                <span className="font-bold text-emerald-400">{toStoreName}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Количество:</span>
                <span className="font-bold text-slate-100">{selectedDevicesList.length} шт.</span>
              </div>
            </div>

            {/* Selected items list */}
            <div>
              <label className="block text-[11px] text-slate-400 uppercase font-bold mb-1.5">
                Список выбранных устройств ({selectedDevicesList.length}):
              </label>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800 bg-[#0B0E14] rounded-lg border border-slate-800 p-2">
                {selectedDevicesList.map(dev => (
                  <div key={dev.id} className="py-1.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-200 truncate">{dev.brand} {dev.model}</p>
                      <p className="text-[10px] text-slate-500">IMEI: {dev.imei}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleDevice(dev.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Удалить из списка"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 uppercase transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSubmitTransfer}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-xs font-bold text-white uppercase shadow-lg transition-all flex items-center justify-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>ПОДТВЕРДИТЬ ПЕРЕМЕЩЕНИЕ</span>
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Reject reason modal */}
      {rejectingTransferId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-sm rounded-lg bg-[#0F1219] border border-slate-800 p-5 text-slate-100 font-mono">
            <h4 className="text-sm font-bold text-rose-400 mb-2 uppercase">ОТКЛОНИТЬ ПЕРЕМЕЩЕНИЕ</h4>
            <label className="block text-xs text-slate-400 mb-1">Причина отклонения:</label>
            <input
              type="text"
              value={rejectReasonInput ?? ''}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="Товар нужен в текущем магазине..."
              className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-xs text-slate-100 mb-4 focus:border-rose-500 focus:outline-none"
            />
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setRejectingTransferId(null)}
                className="flex-1 py-2 rounded bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 uppercase"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleRejectSubmit}
                className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white uppercase"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
