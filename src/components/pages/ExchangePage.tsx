import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Device, Sale } from '../../types';
import {
  RefreshCw,
  Search,
  Scan,
  Smartphone,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Banknote,
  CreditCard,
  X
} from 'lucide-react';

export const ExchangePage: React.FC = () => {
  const location = useLocation();
  const {
    currentUser,
    sales,
    devices,
    todayRate,
    openScanner,
    processExchange
  } = useApp();

  // Step 1: Customer Returned Device
  const [receiptSearch, setReceiptSearch] = useState('');
  const [selectedOldDevice, setSelectedOldDevice] = useState<{
    brand: string;
    model: string;
    storage: string;
    color: string;
    imei: string;
    originalPriceTjs: number;
    originalSaleId?: string;
  } | null>(null);

  const [exchangeInValueTjs, setExchangeInValueTjs] = useState<number>(0);

  // Step 2: Replacement Device
  const [replacementDevice, setReplacementDevice] = useState<Device | null>(null);
  const [newPriceTjs, setNewPriceTjs] = useState<number>(0);
  const [exchangePaymentMethod, setExchangePaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [givenCashTjs, setGivenCashTjs] = useState<string>('');

  // Search & Status
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-populate when navigated from Receipt details modal with location state
  useEffect(() => {
    if (location.state?.saleReceiptNumber || location.state?.item) {
      const st = location.state;
      if (st.saleReceiptNumber) {
        setReceiptSearch(`#${st.saleReceiptNumber}`);
      }
      if (st.item) {
        const itm = st.item;
        setSelectedOldDevice({
          brand: itm.brand || 'Apple',
          model: itm.model || '',
          storage: itm.storage || '256 GB',
          color: itm.color || 'Black',
          imei: itm.imei || '',
          originalPriceTjs: itm.salePriceTjs || 0,
          originalSaleId: st.saleReceiptNumber?.toString(),
        });
        setExchangeInValueTjs(itm.salePriceTjs || 0);
      }
    }
  }, [location.state]);

  // Available replacement devices in stock (filtered to seller's store if seller)
  const availableDevices = devices.filter(d => {
    if (d.status !== 'STORE_STOCK' && d.status !== 'IN_STOCK_AFTER_EXCHANGE') return false;
    if (currentUser?.role === 'SELLER' && d.locationId !== currentUser.storeId) return false;
    if (selectedOldDevice?.imei && d.imei === selectedOldDevice.imei) return false;
    if (deviceSearchQuery.trim()) {
      const q = deviceSearchQuery.toLowerCase();
      return (
        d.imei.toLowerCase().includes(q) ||
        (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
        (d.barcode && d.barcode.toLowerCase().includes(q)) ||
        d.brand.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.color.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Handle searching past sales for customer device
  const handleFindSoldImei = (code: string) => {
    const q = code.trim();
    const cleanCode = q.replace('#', '');
    for (const s of sales) {
      const isReceiptMatch = s.receiptNumber.toString() === cleanCode || s.id === q;
      const itm = s.items.find(i => i.imei === q || i.imei === cleanCode || (i.imei2 && (i.imei2 === q || i.imei2 === cleanCode)) || isReceiptMatch);

      if (itm) {
        // If searching by receipt or active item, use the current active item's updated sale price
        let currentItem = itm;
        let currentVal = itm.salePriceTjs;

        setSelectedOldDevice({
          brand: currentItem.brand,
          model: currentItem.model,
          storage: currentItem.storage,
          color: currentItem.color,
          imei: currentItem.imei,
          originalPriceTjs: currentVal,
          originalSaleId: s.id
        });
        setExchangeInValueTjs(currentVal);
        return;
      }

      // Check past exchange events if searching for an IMEI that was exchanged in previous event
      if (s.exchangeEvents && s.exchangeEvents.length > 0) {
        const matchingEvent = s.exchangeEvents.find(ev => ev.replacementImei === q || ev.returnedImei === q);
        if (matchingEvent) {
          const lastEvent = s.exchangeEvents[s.exchangeEvents.length - 1];
          const activeItem = s.items[0];
          setSelectedOldDevice({
            brand: activeItem?.brand || 'Apple',
            model: activeItem?.model || matchingEvent.replacementModel,
            storage: activeItem?.storage || '256 GB',
            color: activeItem?.color || 'Black',
            imei: activeItem?.imei || matchingEvent.replacementImei,
            originalPriceTjs: activeItem?.salePriceTjs || lastEvent.newPriceTjs,
            originalSaleId: s.id
          });
          setExchangeInValueTjs(activeItem?.salePriceTjs || lastEvent.newPriceTjs);
          return;
        }
      }
    }
    // Not found in sales history — do not fabricate a device; surface a clear error instead.
    setStatusMessage({ type: 'error', text: `Продажа по номеру чека/IMEI "${q}" не найдена. Проверьте номер и попробуйте снова.` });
  };

  const handleScanOldDevice = () => {
    openScanner((scannedCode) => {
      handleFindSoldImei(scannedCode);
    });
  };

  const handleSelectReplacement = (dev: Device) => {
    setReplacementDevice(dev);
    const rate = todayRate?.rate || 9.50;
    const defaultPrice = Math.round(dev.purchaseCostUsd * rate * 1.08);
    setNewPriceTjs(defaultPrice);
  };

  const handleScanReplacement = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const match = devices.find(d => 
        (d.imei === code || d.barcode === code) &&
        (d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE') &&
        (currentUser?.role !== 'SELLER' || d.locationId === currentUser.storeId)
      );
      if (match) {
        handleSelectReplacement(match);
      }
    });
  };

  // Difference calculation
  const differenceTjs = newPriceTjs - exchangeInValueTjs;
  const parsedGivenCash = parseFloat(givenCashTjs) || 0;
  const changeTjs = (differenceTjs > 0 && exchangePaymentMethod === 'CASH' && parsedGivenCash > 0)
    ? Math.max(0, parsedGivenCash - differenceTjs)
    : 0;
  const isShortfall = differenceTjs > 0 && exchangePaymentMethod === 'CASH' && givenCashTjs !== '' && parsedGivenCash < differenceTjs;

  const handleSubmitExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!selectedOldDevice) {
      setStatusMessage({ type: 'error', text: 'Укажите сдаваемое устройство' });
      return;
    }
    if (!replacementDevice) {
      setStatusMessage({ type: 'error', text: 'Выберите выдаваемое устройство со склада' });
      return;
    }
    if (newPriceTjs <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите корректную цену нового устройства' });
      return;
    }
    if (isShortfall) {
      setStatusMessage({
        type: 'error',
        text: `Недостаточно средств от клиента! Внесено ${parsedGivenCash.toLocaleString()} TJS из требуемых ${differenceTjs.toLocaleString()} TJS.`
      });
      return;
    }

    const res = await processExchange({
      originalSaleReceiptNumber: Number(selectedOldDevice.originalSaleId || receiptSearch),
      originalSaleId: selectedOldDevice.originalSaleId,
      returnedItem: {
        brand: selectedOldDevice.brand,
        model: selectedOldDevice.model,
        storage: selectedOldDevice.storage,
        color: selectedOldDevice.color,
        imei: selectedOldDevice.imei,
        exchangeInValueTjs
      },
      replacementDeviceId: replacementDevice.id,
      newPriceTjs,
      differenceTjs,
      paymentMethod: exchangePaymentMethod
    });

    if (res.success) {
      let settlementSummary = '';
      if (differenceTjs > 0) {
        settlementSummary = `Доплата от клиента: ${differenceTjs.toLocaleString()} TJS.`;
        if (exchangePaymentMethod === 'CASH' && parsedGivenCash > 0) {
          if (changeTjs > 0) {
            settlementSummary += ` Сдача клиенту: ${changeTjs.toLocaleString()} TJS.`;
          } else {
            settlementSummary += ` (Оплачено без сдачи).`;
          }
        }
      } else if (differenceTjs < 0) {
        settlementSummary = `Выдана сдача/возврат клиенту из кассы: ${Math.abs(differenceTjs).toLocaleString()} TJS.`;
      } else {
        settlementSummary = `Равный обмен (без доплаты и сдачи).`;
      }

      setStatusMessage({
        type: 'success',
        text: `Обмен успешно выполнен! ${settlementSummary} Телефон (IMEI ${selectedOldDevice.imei}) принят на склад, ${replacementDevice.model} списан.`
      });
      setSelectedOldDevice(null);
      setReplacementDevice(null);
      setReceiptSearch('');
      setGivenCashTjs('');
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка обмена' });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300">
      <form onSubmit={handleSubmitExchange} className="flex-1 flex flex-col overflow-hidden">
        {/* Main 2-column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-y-auto">
          {/* LEFT: Step 1 - Sдаваемое устройство (Incoming from customer) */}
          <div className="p-4 space-y-3.5 bg-[#0B0E14]">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-2.5">
              <div className="w-5 h-5 rounded bg-sky-500/20 text-emerald-400 border border-sky-500/40 flex items-center justify-center text-[10px] font-mono font-bold">
                1
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">СДАВАЕМОЕ УСТРОЙСТВО (КЛИЕНТ)</h3>
            </div>

            {/* Receipt / IMEI search bar */}
            {!selectedOldDevice ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400 font-mono">
                  Найдите проданное устройство по номеру чека или отсканируйте IMEI на корпусе:
                </p>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={receiptSearch ?? ''}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      placeholder="Номер чека или IMEI..."
                      className="w-full rounded bg-[#0F1219] border border-slate-800 pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFindSoldImei(receiptSearch)}
                    disabled={!receiptSearch.trim()}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-xs font-mono font-bold rounded text-white transition-colors"
                  >
                    НАЙТИ
                  </button>
                  <button
                    type="button"
                    onClick={handleScanOldDevice}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 rounded border border-slate-800 transition-colors"
                    title="Сканировать"
                  >
                    <Scan className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-3 relative font-mono">
                <button
                  type="button"
                  onClick={() => setSelectedOldDevice(null)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">ПРИНИМАЕМЫЙ АППАРАТ</span>
                  <h4 className="text-xs font-bold text-slate-100 mt-0.5">
                    {selectedOldDevice.brand} {selectedOldDevice.model}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {selectedOldDevice.storage} • {selectedOldDevice.color}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    IMEI: {selectedOldDevice.imei}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase text-sky-400 font-bold">
                      ОЦЕНОЧНАЯ СТОИМОСТЬ ЗАЧЕТА (TJS):
                    </label>
                    <span className="text-[10px] text-sky-400 font-mono">Редактируемое поле</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={exchangeInValueTjs !== 0 ? exchangeInValueTjs : ''}
                      onChange={(e) => setExchangeInValueTjs(parseFloat(e.target.value) || 0)}
                      placeholder="Введите оценочную стоимость..."
                      className="w-full rounded-lg bg-[#0B0E14] border-2 border-sky-500/60 hover:border-sky-400 focus:border-sky-400 px-3 py-2 text-sm font-mono font-bold text-sky-300 placeholder-slate-600 focus:outline-none transition-colors shadow-inner"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-sky-400 font-mono font-bold">TJS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">
                    Сумма, которая будет зачтена в счет нового телефона и станет себестоимостью принятого устройства.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Step 2 - Выдаваемое устройство (From stock) */}
          <div className="p-4 space-y-3.5 bg-[#0B0E14]">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-2.5">
              <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-mono font-bold">
                2
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">ВЫДАВАЕМОЕ УСТРОЙСТВО (СО СКЛАДА)</h3>
            </div>

            {replacementDevice ? (
              <div className="p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-3 relative font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setReplacementDevice(null);
                    setNewPriceTjs(0);
                  }}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">ВЫДАВАЕМЫЙ АППАРАТ</span>
                  <h4 className="text-xs font-bold text-slate-100 mt-0.5">
                    {replacementDevice.brand} {replacementDevice.model}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {replacementDevice.storage} • {replacementDevice.color}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    IMEI: {replacementDevice.imei}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase text-emerald-400 font-bold">
                      НОВАЯ ЦЕНА ПРОДАЖИ (TJS):
                    </label>
                    <span className="text-[10px] text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      Открыто для ввода
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={newPriceTjs !== 0 ? newPriceTjs : ''}
                      onChange={(e) => setNewPriceTjs(parseFloat(e.target.value) || 0)}
                      placeholder="Введите новую цену продажи..."
                      className="w-full rounded-lg bg-[#0B0E14] border-2 border-emerald-500/70 hover:border-emerald-400 focus:border-emerald-400 px-3 py-2 text-sm font-mono font-bold text-emerald-300 placeholder-slate-600 focus:outline-none transition-colors shadow-inner"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-emerald-400 font-mono font-bold">TJS</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">
                    Введите цену, по которой выдается новое устройство. Продавец может вручную изменить её при обмене.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={deviceSearchQuery ?? ''}
                      onChange={(e) => setDeviceSearchQuery(e.target.value)}
                      placeholder="Поиск по наличию / IMEI..."
                      className="w-full rounded bg-[#0F1219] border border-slate-800 pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleScanReplacement}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 rounded border border-slate-800 transition-colors"
                    title="Сканировать"
                  >
                    <Scan className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* List of in-stock devices */}
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60 rounded border border-slate-800 bg-[#0F1219]">
                  {availableDevices.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-xs font-mono">
                      Нет подходящих товаров в наличии
                    </div>
                  ) : (
                    availableDevices.slice(0, 8).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleSelectReplacement(d)}
                        className="w-full text-left p-2.5 hover:bg-slate-900 flex items-center justify-between text-xs transition-colors group"
                      >
                        <div>
                          <p className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">{d.brand} {d.model}</p>
                          <p className="text-[10px] text-slate-400">{d.storage} • {d.color}</p>
                          <p className="text-[9px] font-mono text-slate-500">IMEI: {d.imei}</p>
                        </div>
                        <span className="text-emerald-400 font-mono font-bold text-xs">ВЫБРАТЬ</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settlement & Difference Notification Banner */}
        {selectedOldDevice && replacementDevice && (
          <div className="p-4 bg-[#0F1219] border-t border-slate-800 space-y-3 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  РАСЧЕТ РАЗНИЦЫ И ОПОВЕЩЕНИЕ ОБМЕНА
                </h4>
              </div>
              <div className="text-xs flex items-center space-x-3">
                <span className="text-slate-400">Новый: <strong className="text-emerald-400 font-mono">{newPriceTjs.toLocaleString()} TJS</strong></span>
                <span className="text-slate-600">—</span>
                <span className="text-slate-400">Зачет: <strong className="text-emerald-400 font-mono">{exchangeInValueTjs.toLocaleString()} TJS</strong></span>
                <span className="text-slate-600">=</span>
                <strong className="text-xs">
                  {differenceTjs > 0 ? (
                    <span className="text-emerald-400">Разница: +{differenceTjs.toLocaleString()} TJS</span>
                  ) : differenceTjs < 0 ? (
                    <span className="text-amber-400">Разница: {differenceTjs.toLocaleString()} TJS</span>
                  ) : (
                    <span className="text-emerald-400">Разница: 0 TJS</span>
                  )}
                </strong>
              </div>
            </div>

            {/* Dynamic Alert Banner */}
            {differenceTjs > 0 ? (
              <div className="p-3.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-2.5">
                  <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                      ОПОВЕЩЕНИЕ: ТРЕБУЕТСЯ ДОПЛАТА ОТ КЛИЕНТА
                    </p>
                    <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                      Новый телефон дороже сдаваемого. Клиенту необходимо доплатить <strong className="text-emerald-400 font-mono">{differenceTjs.toLocaleString()} TJS</strong>.
                    </p>
                  </div>
                </div>

                {/* Input Cash Given & Change Calculation */}
                {exchangePaymentMethod === 'CASH' && (
                  <div className="flex items-center space-x-3 w-full sm:w-auto bg-[#0B0E14] p-2 rounded border border-slate-800">
                    <div>
                      <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">
                        ВНЕСЕНО КЛИЕНТОМ:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          placeholder={differenceTjs.toString()}
                          value={givenCashTjs}
                          onChange={(e) => setGivenCashTjs(e.target.value)}
                          className="w-28 rounded bg-[#0F1219] border border-slate-700 px-2 py-1 text-xs font-mono font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none"
                        />
                        <span className="absolute right-2 top-1 text-[9px] text-slate-500">TJS</span>
                      </div>
                    </div>

                    <div className="pl-2 border-l border-slate-800">
                      <span className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">
                        РАСЧЕТ СДАЧИ:
                      </span>
                      {isShortfall ? (
                        <span className="text-xs font-bold text-rose-400">
                          Не хватает {(differenceTjs - parsedGivenCash).toLocaleString()} TJS
                        </span>
                      ) : changeTjs > 0 ? (
                        <span className="text-xs font-bold text-emerald-400">
                          ВЫДАТЬ СДАЧУ: {changeTjs.toLocaleString()} TJS
                        </span>
                      ) : parsedGivenCash === differenceTjs ? (
                        <span className="text-xs font-bold text-emerald-400">
                          Оплачено без сдачи
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-slate-500">
                          Укажите сумму
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : differenceTjs < 0 ? (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2.5">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                    ОПОВЕЩЕНИЕ: ТРЕБУЕТСЯ ВЫДАТЬ СДАЧУ / ВОЗВРАТ КЛИЕНТУ
                  </p>
                  <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                    Сдаваемый телефон оценен дороже нового. Магазин должен выдать клиенту разницу в размере <strong className="text-amber-400 font-mono">{Math.abs(differenceTjs).toLocaleString()} TJS</strong> из кассы.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-start space-x-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                    ОПОВЕЩЕНИЕ: РАВНЫЙ ОБМЕН (1 к 1)
                  </p>
                  <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                    Стоимость сдаваемого и нового устройств полностью совпадает. Доплата и сдача не требуются.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Summary Bar: Surcharge / Difference calculation */}
        <div className="p-3.5 border-t border-slate-800 bg-[#0F1219] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 font-mono">
          <div className="space-y-1 text-xs">
            {statusMessage ? (
              <div className={`flex items-center space-x-1.5 ${
                statusMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{statusMessage.text}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-3 text-slate-300 text-xs flex-wrap">
                <span>Новый: <strong className="text-emerald-400 font-mono">{newPriceTjs} TJS</strong></span>
                <span className="text-slate-600">—</span>
                <span>Зачет: <strong className="text-emerald-400 font-mono">{exchangeInValueTjs} TJS</strong></span>
                <span className="text-slate-600">=</span>
                <span className="font-bold">
                  {differenceTjs > 0 ? (
                    <span className="text-emerald-400">Доплата клиента: +{differenceTjs.toLocaleString()} TJS</span>
                  ) : differenceTjs < 0 ? (
                    <span className="text-amber-400">Сдача / Возврат клиенту: {Math.abs(differenceTjs).toLocaleString()} TJS</span>
                  ) : (
                    <span className="text-emerald-400">Равный обмен (0 TJS)</span>
                  )}
                </span>
                {changeTjs > 0 && (
                  <span className="text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/20">
                    Сдача: {changeTjs.toLocaleString()} TJS
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {differenceTjs > 0 && (
              <div className="flex items-center space-x-1 bg-[#0B0E14] p-1 rounded border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setExchangePaymentMethod('CASH')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-colors ${
                    exchangePaymentMethod === 'CASH' ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Наличные
                </button>
                <button
                  type="button"
                  onClick={() => setExchangePaymentMethod('CARD')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-colors ${
                    exchangePaymentMethod === 'CARD' ? 'bg-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Карта
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedOldDevice || !replacementDevice}
              className="py-1.5 px-5 rounded bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs text-black shadow-[0_0_12px_rgba(16,185,129,0.5)] transition-colors flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>ПРОВЕСТИ ОБМЕН</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
