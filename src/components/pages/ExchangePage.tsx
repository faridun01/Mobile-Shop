import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Device, PaymentMethod } from '../../types';
import {
  Search,
  Scan,
  AlertCircle,
  X,
  Banknote,
  RotateCcw
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

export const ExchangePage: React.FC = () => {
  const {
    currentUser,
    sales,
    devices,
    processExchange,
    openScanner,
    stores
  } = useApp();

  const [receiptSearch, setReceiptSearch] = useState('');
  const [selectedOldDevice, setSelectedOldDevice] = useState<Device | null>(null);

  const [exchangeInValueTjs, setExchangeInValueTjs] = useState<number>(0);

  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [replacementDevice, setReplacementDevice] = useState<Device | null>(null);

  const [newPriceTjs, setNewPriceTjs] = useState<number>(0);

  const [exchangePaymentMethod, setExchangePaymentMethod] = useState<PaymentMethod>('CASH');
  const [givenCashTjs, setGivenCashTjs] = useState<string>('');

  const [status, setStatus] = useState<StatusMessage | null>(null);

  const effectiveStoreId = currentUser?.storeId || '';
  const currentStoreName = stores.find(s => s.id === effectiveStoreId)?.name || currentUser?.storeName || 'Магазин';

  const availableDevices = useMemo(() => {
    return devices.filter(d => {
      const isAvailable = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailable) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;

      if (deviceSearchQuery.trim()) {
        const q = deviceSearchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [devices, effectiveStoreId, deviceSearchQuery]);

  const handleFindSoldImei = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    for (const sale of sales) {
      if (sale.receiptNumber.toString() === q) {
        const item = sale.items[0];
        if (item) {
          const matchedDev = devices.find(d => d.imei === item.imei || d.id === item.deviceId);
          const oldDev: Device = matchedDev || {
            id: item.deviceId || `old-${Date.now()}`,
            imei: item.imei,
            imei2: item.imei2,
            brand: item.brand,
            model: item.model,
            color: item.color,
            storage: item.storage,
            costBasisUsd: 100,
            purchaseCostUsd: 100,
            retailPriceTjs: item.salePriceTjs || 1000,
            status: 'SOLD',
            locationId: sale.storeId,
            locationName: sale.storeName,
            supplierId: 'sup-tradein',
            createdAt: sale.date,
            timeline: [],
          };
          setSelectedOldDevice(oldDev);
          setExchangeInValueTjs(item.salePriceTjs ? Math.round(item.salePriceTjs * 0.7) : 0);
          setStatus({ tone: 'success', text: `Найдено проданное устройство по чеку #${sale.receiptNumber}` });
          return;
        }
      }

      for (const item of sale.items) {
        if (
          item.imei.toLowerCase() === q ||
          (item.imei2 && item.imei2.toLowerCase() === q)
        ) {
          const matchedDev = devices.find(d => d.imei === item.imei || d.id === item.deviceId);
          const oldDev: Device = matchedDev || {
            id: item.deviceId || `old-${Date.now()}`,
            imei: item.imei,
            imei2: item.imei2,
            brand: item.brand,
            model: item.model,
            color: item.color,
            storage: item.storage,
            costBasisUsd: 100,
            purchaseCostUsd: 100,
            retailPriceTjs: item.salePriceTjs || 1000,
            status: 'SOLD',
            locationId: sale.storeId,
            locationName: sale.storeName,
            supplierId: 'sup-tradein',
            createdAt: sale.date,
            timeline: [],
          };
          setSelectedOldDevice(oldDev);
          setExchangeInValueTjs(item.salePriceTjs ? Math.round(item.salePriceTjs * 0.7) : 0);
          setStatus({ tone: 'success', text: `Устройство ${item.brand} ${item.model} найдено в истории продаж` });
          return;
        }
      }
    }

    const devMatch = devices.find(d =>
      d.imei.toLowerCase() === q ||
      (d.imei2 && d.imei2.toLowerCase() === q)
    );

    if (devMatch) {
      setSelectedOldDevice(devMatch);
      setExchangeInValueTjs(devMatch.retailPriceTjs ? Math.round(devMatch.retailPriceTjs * 0.7) : 0);
      setStatus({ tone: 'success', text: `Устройство ${devMatch.brand} ${devMatch.model} найдено на складе` });
      return;
    }

    setStatus({ tone: 'error', text: `Устройство или чек "${query}" не найдено в системе` });
  };

  const handleScanOldDevice = () => {
    openScanner((scannedCode) => {
      handleFindSoldImei(scannedCode);
    });
  };

  const handleScanReplacement = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const dev = availableDevices.find(d =>
        d.imei === code || d.imei2 === code
      );
      if (dev) {
        handleSelectReplacement(dev);
      } else {
        setDeviceSearchQuery(code);
      }
    });
  };

  const handleSelectReplacement = (dev: Device) => {
    setReplacementDevice(dev);
    setNewPriceTjs(dev.retailPriceTjs || 0);
  };

  const differenceTjs = useMemo(() => {
    return newPriceTjs - exchangeInValueTjs;
  }, [newPriceTjs, exchangeInValueTjs]);

  const handleSubmitExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOldDevice || !replacementDevice) {
      setStatus({ tone: 'error', text: 'Для проведения обмена выберите сдаваемое и выдаваемое устройство' });
      return;
    }

    if (exchangeInValueTjs <= 0) {
      setStatus({ tone: 'error', text: 'Залоговая оценочная стоимость сдаваемого аппарата должна быть больше 0' });
      return;
    }

    if (newPriceTjs <= 0) {
      setStatus({ tone: 'error', text: 'Укажите новую цену продажи выдаваемого устройства' });
      return;
    }

    const res = await processExchange({
      returnedImei: selectedOldDevice.imei,
      returnedItem: {
        brand: selectedOldDevice.brand,
        model: selectedOldDevice.model,
        storage: selectedOldDevice.storage,
        color: selectedOldDevice.color,
        imei: selectedOldDevice.imei,
        exchangeInValueTjs,
      },
      exchangeInValueTjs,
      replacementDeviceId: replacementDevice.id,
      newPriceTjs,
      differenceTjs,
      paymentMethod: differenceTjs !== 0 ? exchangePaymentMethod : undefined,
    });

    if (res.success) {
      setStatus({ tone: 'success', text: `Обмен Trade-In успешно проведен!` });
      setSelectedOldDevice(null);
      setReplacementDevice(null);
      setReceiptSearch('');
      setDeviceSearchQuery('');
      setExchangeInValueTjs(0);
      setNewPriceTjs(0);
      setGivenCashTjs('');
    } else {
      setStatus({ tone: 'error', text: res.message || 'Ошибка проведения обмена' });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <form onSubmit={handleSubmitExchange} className="flex-1 flex flex-col overflow-hidden">
        {/* Main 2-column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-y-auto">
          {/* LEFT: Step 1 - Сдаваемое устройство (Incoming from customer) */}
          <div className="p-4 space-y-4 bg-bg">
            <div className="flex items-center space-x-2.5 border-b border-border pb-3">
              <div className="w-6 h-6 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </div>
              <h3 className="text-xs md:text-sm font-bold uppercase tracking-wide text-fg">СДАВАЕМОЕ УСТРОЙСТВО (КЛИЕНТ)</h3>
            </div>

            {/* Receipt / IMEI search bar */}
            {!selectedOldDevice ? (
              <div className="space-y-3">
                <p className="text-xs text-fg-muted">
                  Найдите проданное устройство по номеру чека или отсканируйте IMEI на корпусе:
                </p>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
                    <input
                      type="text"
                      value={receiptSearch ?? ''}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      placeholder="Номер чека или IMEI..."
                      className="w-full rounded-xl bg-surface border border-border pl-9 pr-3 py-2 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFindSoldImei(receiptSearch)}
                    disabled={!receiptSearch.trim()}
                    className="px-4 py-2 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-xl text-accent-fg transition-colors"
                  >
                    НАЙТИ
                  </button>
                  <button
                    type="button"
                    onClick={handleScanOldDevice}
                    className="px-3 py-2 bg-surface-raised hover:bg-surface text-accent rounded-xl border border-border transition-colors"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 relative">
                <button
                  type="button"
                  onClick={() => setSelectedOldDevice(null)}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg transition-colors"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[10px] text-accent uppercase font-bold tracking-wider block">ПРИНИМАЕМЫЙ АППАРАТ</span>
                  <h4 className="text-sm font-bold text-fg mt-0.5">
                    {selectedOldDevice.brand} {selectedOldDevice.model}
                  </h4>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {selectedOldDevice.storage} • {selectedOldDevice.color}
                  </p>
                  <p className="text-xs text-fg-subtle mt-1">
                    IMEI: {selectedOldDevice.imei}
                  </p>
                </div>

                <div className="pt-3 border-t border-border space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-accent mb-1">
                      ОЦЕНОЧНАЯ ЗАЧЕТНАЯ СТОИМОСТЬ (TJS):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={exchangeInValueTjs !== 0 ? exchangeInValueTjs : ''}
                        onChange={(e) => setExchangeInValueTjs(parseFloat(e.target.value) || 0)}
                        placeholder="Зачетная сумма в сомони..."
                        className="w-full rounded-xl bg-surface-raised border-2 border-accent/60 hover:border-accent focus:border-accent px-3.5 py-2 text-sm font-bold text-accent focus:outline-none transition-colors"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs text-accent font-bold">TJS</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Step 2 - Выдаваемое устройство со склада */}
          <div className="p-4 space-y-4 bg-bg">
            <div className="flex items-center space-x-2.5 border-b border-border pb-3">
              <div className="w-6 h-6 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </div>
              <h3 className="text-xs md:text-sm font-bold uppercase tracking-wide text-fg">ВЫДАВАЕМОЕ УСТРОЙСТВО (СО СКЛАДА)</h3>
            </div>

            {replacementDevice ? (
              <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 relative">
                <button
                  type="button"
                  onClick={() => {
                    setReplacementDevice(null);
                    setNewPriceTjs(0);
                  }}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg transition-colors"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[10px] text-accent uppercase font-bold tracking-wider block">ВЫДАВАЕМЫЙ АППАРАТ</span>
                  <h4 className="text-sm font-bold text-fg mt-0.5">
                    {replacementDevice.brand} {replacementDevice.model}
                  </h4>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {replacementDevice.storage} • {replacementDevice.color}
                  </p>
                  <p className="text-xs text-fg-subtle mt-1">
                    IMEI: {replacementDevice.imei}
                  </p>
                </div>

                <div className="pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase text-accent">
                      ЦЕНА ПРОДАЖИ (TJS):
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={newPriceTjs !== 0 ? newPriceTjs : ''}
                      onChange={(e) => setNewPriceTjs(parseFloat(e.target.value) || 0)}
                      placeholder="Цена продажи..."
                      className="w-full rounded-xl bg-surface-raised border-2 border-accent/60 hover:border-accent focus:border-accent px-3.5 py-2 text-sm font-bold text-accent focus:outline-none transition-colors"
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs text-accent font-bold">TJS</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
                    <input
                      type="text"
                      value={deviceSearchQuery ?? ''}
                      onChange={(e) => setDeviceSearchQuery(e.target.value)}
                      placeholder="Поиск по наличию / IMEI..."
                      className="w-full rounded-xl bg-surface border border-border pl-9 pr-3 py-2 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleScanReplacement}
                    className="px-3 py-2 bg-surface-raised hover:bg-surface text-accent rounded-xl border border-border transition-colors"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>

                {/* List of in-stock devices */}
                <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-surface">
                  {availableDevices.length === 0 ? (
                    <div className="p-4 text-center text-fg-muted text-xs">
                      Нет подходящих товаров в наличии ({currentStoreName})
                    </div>
                  ) : (
                    availableDevices.slice(0, 8).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleSelectReplacement(d)}
                        className="w-full text-left p-3 hover:bg-surface-raised flex items-center justify-between text-xs transition-colors group"
                      >
                        <div>
                          <p className="font-bold text-fg group-hover:text-accent transition-colors">{d.brand} {d.model}</p>
                          <p className="text-[11px] text-fg-muted mt-0.5">{d.storage} • {d.color}</p>
                          <p className="text-[10px] text-fg-subtle mt-0.5">IMEI: {d.imei}</p>
                        </div>
                        <span className="font-bold text-accent text-xs">
                          {(d.retailPriceTjs || 0).toLocaleString()} TJS
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settlement & Difference Banner */}
        {selectedOldDevice && replacementDevice && (
          <div className="p-4 bg-surface border-t border-border space-y-3 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Banknote className="w-4.5 h-4.5 text-accent" />
                <h4 className="text-xs md:text-sm font-bold uppercase text-fg">
                  РАСЧЕТ РАЗНИЦЫ ОБМЕНА
                </h4>
              </div>
              <div className="text-xs flex items-center space-x-3">
                <span className="text-fg-muted">Новый: <strong className="text-accent">{newPriceTjs.toLocaleString()} TJS</strong></span>
                <span className="text-fg-subtle">—</span>
                <span className="text-fg-muted">Зачет: <strong className="text-accent">{exchangeInValueTjs.toLocaleString()} TJS</strong></span>
                <span className="text-fg-subtle">=</span>
                <strong className="text-xs">
                  {differenceTjs > 0 ? (
                    <span className="text-accent font-bold">Разница: +{differenceTjs.toLocaleString()} TJS</span>
                  ) : differenceTjs < 0 ? (
                    <span className="text-warning font-bold">Разница: {differenceTjs.toLocaleString()} TJS</span>
                  ) : (
                    <span className="text-accent font-bold">Разница: 0 TJS</span>
                  )}
                </strong>
              </div>
            </div>

            {/* Dynamic Alert Banner */}
            {differenceTjs > 0 ? (
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-2.5">
                  <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-accent uppercase tracking-wide">
                      ТРЕБУЕТСЯ ДОПЛАТА ОТ КЛИЕНТА
                    </p>
                    <p className="text-xs text-fg-muted mt-0.5">
                      Клиенту необходимо доплатить <strong className="text-accent">{differenceTjs.toLocaleString()} TJS</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  {/* Payment method for the customer's top-up */}
                  <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-border shrink-0">
                    {(['CASH', 'CARD'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setExchangePaymentMethod(method)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                          exchangePaymentMethod === method ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {method === 'CASH' ? 'Наличные' : 'Карта'}
                      </button>
                    ))}
                  </div>

                  {/* Input Cash Given — change calculator for the cashier */}
                  {exchangePaymentMethod === 'CASH' && (
                    <div className="flex items-center space-x-3 bg-surface-raised p-2 rounded-xl border border-border">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-fg-subtle mb-0.5">
                          ВНЕСЕНО КЛИЕНТОМ:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            placeholder={differenceTjs.toString()}
                            value={givenCashTjs}
                            onChange={(e) => setGivenCashTjs(e.target.value)}
                            className="w-28 rounded-lg bg-surface border border-border px-2 py-1 text-xs font-bold text-accent focus:border-accent focus:outline-none"
                          />
                          <span className="absolute right-2 top-1 text-[10px] text-fg-subtle">TJS</span>
                        </div>
                      </div>
                      {givenCashTjs && (parseFloat(givenCashTjs) || 0) > differenceTjs && (
                        <div>
                          <span className="block text-[10px] uppercase font-bold text-fg-subtle mb-0.5">СДАЧА:</span>
                          <span className="text-xs font-bold text-warning">
                            {((parseFloat(givenCashTjs) || 0) - differenceTjs).toLocaleString()} TJS
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : differenceTjs < 0 ? (
              <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/30 flex items-center space-x-2.5">
                <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                <div>
                  <p className="text-xs font-bold text-warning uppercase tracking-wide">
                    ВОЗВРАТ РАЗНИЦЫ КЛИЕНТУ
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5">
                    Сдаваемое устройство дороже. Выплатите клиенту из кассы: <strong className="text-warning">{Math.abs(differenceTjs).toLocaleString()} TJS</strong>.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Action Bottom Bar */}
        <div className="p-3.5 bg-surface border-t border-border flex items-center justify-between shrink-0">
          <div className="text-xs font-medium text-fg-muted flex items-center space-x-2">
            <span>Новый: <strong className="text-accent">{newPriceTjs} TJS</strong></span>
            <span>·</span>
            <span>Зачет: <strong className="text-accent">{exchangeInValueTjs} TJS</strong></span>
            <span>·</span>
            <span className="font-bold text-fg">
              {differenceTjs > 0 ? `Доплата: +${differenceTjs} TJS` : differenceTjs < 0 ? `Возврат: ${differenceTjs} TJS` : 'Равный обмен'}
            </span>
          </div>

          <button
            type="submit"
            disabled={!selectedOldDevice || !replacementDevice || exchangeInValueTjs <= 0 || newPriceTjs <= 0}
            className="px-5 py-2.5 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-xl text-accent-fg uppercase tracking-wider flex items-center space-x-2 transition-all shadow-xs"
          >
            <RotateCcw className="w-4 h-4" />
            <span>ПРОВЕСТИ ОБМЕН</span>
          </button>
        </div>
      </form>
    </div>
  );
};
