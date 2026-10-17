import { decimal, moneyNumber, formatMoney } from '../../utils/money';
import { deviceCodeLabel } from '../../utils/deviceCode';
import { formatPhoneColor } from '../../utils/phoneSpecs';
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { Device, Sale, SaleItem } from '../../types';
import {
  Search,
  Scan,
  AlertCircle,
  AlertTriangle,
  X,
  Banknote,
  RotateCcw,
  Loader2,
  Smartphone,
  Star,
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useBelowCostCheck } from '../../hooks/useBelowCostCheck';
import { preferredInsteadOf } from '../sale/sellGuidance';
import { findDeviceByCode } from '../../utils/scanLookup';

/** The phone handed back: its line on the receipt it was sold on. */
interface PickedItem {
  sale: Sale;
  item: SaleItem;
}

/**
 * An exchange is a return followed by a sale: the phone the customer brings back is returned on
 * its receipt (its price less the withheld amount becomes the customer's credit), and the new
 * phone is sold on a new receipt paid first with that credit. The customer pays the rest, or
 * gets the change when the new phone is cheaper.
 */
export const ExchangePage: React.FC = () => {
  const location = useLocation();
  const navigatedState = location.state as {
    saleReceiptNumber?: number;
    item?: SaleItem;
    saleId?: string;
  } | null;

  const {
    currentUser,
    sales,
    fetchSalesRange,
    devices,
    processExchange,
    openScanner,
    stores,
    selectedStoreId: globalSelectedStoreId,
  } = useAppFields('currentUser', 'sales', 'fetchSalesRange', 'devices', 'processExchange', 'openScanner', 'stores', 'selectedStoreId');

  const [receiptSearch, setReceiptSearch] = useState('');
  const [picked, setPicked] = useState<PickedItem | null>(null);
  const [receiptChoice, setReceiptChoice] = useState<Sale | null>(null);
  const [withheldInput, setWithheldInput] = useState('');

  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [replacementDevice, setReplacementDevice] = useState<Device | null>(null);
  const [newPriceTjs, setNewPriceTjs] = useState<number>(0);

  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [givenCashTjs, setGivenCashTjs] = useState<string>('');

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The exchange happens in the store the phone was sold at (the server enforces it too).
  const effectiveStoreId = picked?.sale.storeId
    || currentUser?.storeId
    || (globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : '');
  const currentStoreName = stores.find(s => s.id === effectiveStoreId)?.name || currentUser?.storeName || 'Магазин';
  const isStoreScoped = currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER';

  const soldPriceTjs = picked?.item.salePriceTjs ?? 0;
  const withheldTjs = Math.max(0, parseFloat(withheldInput.replace(',', '.')) || 0);
  const withheldTooBig = withheldTjs > soldPriceTjs + 0.001;
  const creditTjs = moneyNumber(decimal(soldPriceTjs).minus(withheldTjs));
  const differenceTjs = moneyNumber(decimal(newPriceTjs).minus(creditTjs));

  const availableDevices = useMemo(() => {
    const list = devices.filter(d => {
      if (d.status !== 'STORE_STOCK' && d.status !== 'IN_STOCK_AFTER_EXCHANGE') return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;
      if (picked && d.id === picked.item.deviceId) return false;
      if (deviceSearchQuery.trim()) {
        const q = deviceSearchQuery.toLowerCase().trim();
        return d.imei.toLowerCase().includes(q)
          || Boolean(d.imei2 && d.imei2.toLowerCase().includes(q))
          || d.brand.toLowerCase().includes(q)
          || d.model.toLowerCase().includes(q)
          || d.color.toLowerCase().includes(q);
      }
      return true;
    });
    // The phones recommended to sell first come first.
    return list.sort((a, b) => Number(Boolean(b.preferredToSell)) - Number(Boolean(a.preferredToSell)));
  }, [devices, effectiveStoreId, deviceSearchQuery, picked]);

  // A dearer identical phone in the same store should be sold first.
  const preferredAlternative = useMemo(
    () => (replacementDevice ? preferredInsteadOf(replacementDevice, devices) : null),
    [devices, replacementDevice],
  );

  const belowCost = useBelowCostCheck(replacementDevice ? [{ deviceId: replacementDevice.id, priceTjs: newPriceTjs }] : []);
  const replacementBelowCost = Boolean(replacementDevice && belowCost[replacementDevice.id]);

  /** Why this receipt line can't be exchanged, or null when it can. */
  const blockedReason = (sale: Sale, item: SaleItem): string | null => {
    if (sale.status === 'REFUNDED') return `Чек #${sale.receiptNumber} уже возвращён`;
    if (item.returnId) return `Этот телефон уже возвращён по чеку #${sale.receiptNumber}`;
    if ((sale.debtAmountTjs ?? 0) > 0) return `По чеку #${sale.receiptNumber} есть непогашенный долг — обмен возможен после оплаты долга`;
    if ((sale.exchangeEvents?.length ?? 0) > 0) return `По чеку #${sale.receiptNumber} был обмен старого образца — оформите возврат всего чека`;
    return null;
  };

  const pick = (sale: Sale, item: SaleItem) => {
    const reason = blockedReason(sale, item);
    if (reason) {
      setStatus({ tone: 'error', text: reason });
      return;
    }
    setPicked({ sale, item });
    setReceiptChoice(null);
    setWithheldInput('');
    // A replacement picked from another store is no longer valid.
    if (replacementDevice && replacementDevice.locationId !== sale.storeId) {
      setReplacementDevice(null);
      setNewPriceTjs(0);
    }
    setStatus({ tone: 'success', text: `Телефон ${item.brand} ${item.model} выбран из чека #${sale.receiptNumber}. Укажите удержание и выберите новый телефон.` });
  };

  useEffect(() => {
    if (!navigatedState?.item) return;
    const run = async () => {
      let sale = sales.find(s => s.id === navigatedState.saleId || s.receiptNumber === navigatedState.saleReceiptNumber);
      if (!sale && navigatedState.saleReceiptNumber) {
        const found = await fetchSalesRange({ search: String(navigatedState.saleReceiptNumber) }).catch(() => []);
        sale = found.find(s => s.receiptNumber === navigatedState.saleReceiptNumber);
      }
      const item = sale?.items.find(i => (navigatedState.item?.id && i.id === navigatedState.item.id) || i.imei === navigatedState.item?.imei);
      if (sale && item) pick(sale, item);
      window.history.replaceState({}, document.title);
    };
    void run();
    // Runs once for the receipt the user came from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigatedState]);

  const searchSalesFor = (list: Sale[], q: string): boolean => {
    for (const sale of list) {
      if (sale.receiptNumber.toString() === q) {
        // Exchange swaps a phone or tablet; a receipt of accessories only is returned instead.
        if (sale.items.length === 0) {
          setStatus({ tone: 'error', text: `В чеке #${sale.receiptNumber} только аксессуары — обмен доступен для телефонов и планшетов. Аксессуары оформите возвратом в истории продаж` });
          return true;
        }
        const open = sale.items.filter(i => !i.returnId);
        if (open.length > 1) {
          setReceiptChoice(sale);
          setStatus({ tone: 'info', text: `В чеке #${sale.receiptNumber} несколько телефонов — выберите нужный` });
          return true;
        }
        pick(sale, open[0] ?? sale.items[0]);
        return true;
      }
      const item = sale.items.find(i => i.imei.toLowerCase() === q || (i.imei2 && i.imei2.toLowerCase() === q));
      if (item && (!item.returnId || sale.items.every(i => i.returnId))) {
        pick(sale, item);
        return true;
      }
    }
    return false;
  };

  // Recent sales are loaded; an older receipt is found through a server search.
  const handleFindSold = async (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    setReceiptChoice(null);
    if (searchSalesFor(sales, q)) return;
    try {
      const found = await fetchSalesRange({ search: query.trim() });
      if (searchSalesFor(found, q)) return;
    } catch {
      // fall through to the not-found message
    }
    setStatus({ tone: 'error', text: `Проданный телефон по чеку/IMEI "${query}" не найден в истории продаж` });
  };

  const handleSelectReplacement = (dev: Device) => {
    setReplacementDevice(dev);
    setNewPriceTjs(dev.retailPriceTjs || 0);
  };

  const handleScanReplacement = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const dev = findDeviceByCode(availableDevices, code);
      if (dev) handleSelectReplacement(dev);
      else setDeviceSearchQuery(code);
    }, { allowModeSwitch: true });
  };

  const resetForm = () => {
    setPicked(null);
    setReplacementDevice(null);
    setReceiptSearch('');
    setDeviceSearchQuery('');
    setReceiptChoice(null);
    setWithheldInput('');
    setNewPriceTjs(0);
    setGivenCashTjs('');
    setPaymentMethod('CASH');
  };

  const cashShort = differenceTjs > 0 && paymentMethod === 'CASH' && (parseFloat(givenCashTjs) || 0) < differenceTjs;

  const handleSubmitExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!picked || !replacementDevice) {
      setStatus({ tone: 'error', text: 'Выберите сдаваемый телефон и телефон на замену' });
      return;
    }
    if (!picked.item.id) {
      setStatus({ tone: 'error', text: 'Обновите страницу и выберите чек заново' });
      return;
    }
    if (withheldTooBig) {
      setStatus({ tone: 'error', text: `Удержание не может быть больше цены телефона в чеке (${formatMoney(soldPriceTjs)} TJS)` });
      return;
    }
    if (newPriceTjs <= 0) {
      setStatus({ tone: 'error', text: 'Укажите цену нового телефона' });
      return;
    }
    // A cash top-up goes through only once the cashier confirms the money was received.
    if (cashShort) {
      setStatus({ tone: 'error', text: `Подтвердите оплату: клиент должен доплатить ${formatMoney(differenceTjs)} TJS наличными` });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await processExchange({
        saleId: picked.sale.id,
        saleItemId: picked.item.id,
        withheldTjs,
        replacementDeviceId: replacementDevice.id,
        newPriceTjs,
        paymentMethod,
      });
      if (res.success) {
        const change = res.payoutTjs && res.payoutTjs > 0 ? ` Клиенту выдано ${formatMoney(res.payoutTjs)} TJS.` : '';
        setStatus({ tone: 'success', text: `Обмен проведён: возврат по чеку #${picked.sale.receiptNumber}, новый чек #${res.newReceiptNumber ?? ''}.${change}` });
        resetForm();
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка проведения обмена' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const money = (v: number) => `${formatMoney(v)} TJS`;

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <form onSubmit={handleSubmitExchange} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-y-auto">
          {/* STEP 1: the phone the customer returns */}
          <div className="p-3 sm:p-4 space-y-3 bg-bg">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-[11px] font-bold shrink-0">1</div>
                <h3 className="text-xs sm:text-sm font-bold text-fg">Возврат телефона</h3>
                <span className="text-[11px] text-fg-subtle">(клиент сдаёт)</span>
              </div>
              {picked && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">Выбрано</span>
              )}
            </div>

            {!picked ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
                    <input
                      type="text"
                      value={receiptSearch}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleFindSold(receiptSearch); } }}
                      placeholder="Номер чека или IMEI..."
                      className="w-full h-10 rounded-xl bg-surface border border-border pl-9 pr-3 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFindSold(receiptSearch)}
                    disabled={!receiptSearch.trim()}
                    className="h-10 px-3.5 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-xl text-accent-fg transition-colors shrink-0 cursor-pointer"
                  >
                    Найти
                  </button>
                  <button
                    type="button"
                    onClick={() => openScanner((code) => { void handleFindSold(code); }, { allowModeSwitch: true })}
                    className="h-10 w-10 flex items-center justify-center bg-surface-raised hover:bg-surface text-accent rounded-xl border border-border transition-colors shrink-0 cursor-pointer"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>

                {receiptChoice && (
                  <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
                    {receiptChoice.items.map((item, idx) => (
                      <button
                        key={`${item.id || item.imei}-${idx}`}
                        type="button"
                        disabled={Boolean(item.returnId)}
                        onClick={() => pick(receiptChoice, item)}
                        className="w-full text-left p-3 hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <p className="font-bold text-fg-muted">{item.brand} {item.model}</p>
                          <p className="text-[11px] text-fg-muted mt-0.5">{item.storage} • {formatPhoneColor(item.color)}</p>
                          <p className="text-[10px] text-fg-subtle mt-0.5">{deviceCodeLabel(item.category)}: {item.imei}</p>
                        </div>
                        <span className="font-bold text-accent text-xs">{item.returnId ? 'Возвращён' : money(item.salePriceTjs)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 relative">
                <button
                  type="button"
                  onClick={() => { setPicked(null); setWithheldInput(''); }}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg-muted transition-colors"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[10px] text-accent font-bold tracking-wider block">Чек #{picked.sale.receiptNumber}</span>
                  <h4 className="text-sm font-bold text-fg-muted mt-0.5">{picked.item.brand} {picked.item.model}</h4>
                  <p className="text-xs text-fg-muted mt-0.5">{picked.item.storage} • {formatPhoneColor(picked.item.color)}</p>
                  <p className="text-xs text-fg-subtle mt-1">{deviceCodeLabel(picked.item.category)}: {picked.item.imei}</p>
                  {picked.item.isBelowCost && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
                      <AlertTriangle className="w-3.5 h-3.5" /> Этот телефон был продан ниже себестоимости
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-border space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-fg-subtle">Цена в чеке</span><span className="font-mono font-bold text-fg">{money(soldPriceTjs)}</span></div>
                  <div>
                    <label className="block text-xs font-bold text-warning mb-1">Удержание (TJS)</label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={withheldInput}
                        onChange={(e) => setWithheldInput(e.target.value)}
                        placeholder="0"
                        className={`w-full rounded-xl bg-surface-raised border-2 px-3.5 py-2 text-sm font-bold focus:outline-none transition-colors ${withheldTooBig ? 'border-danger text-danger' : 'border-warning/60 hover:border-warning focus:border-warning text-warning'}`}
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs text-warning font-bold">TJS</span>
                    </div>
                    {withheldTooBig && <p className="mt-1 text-[11px] text-danger">Удержание больше цены телефона в чеке</p>}
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border/60">
                    <span className="font-semibold text-fg-muted">Зачёт клиенту</span>
                    <span className="font-mono font-bold text-accent">{money(Math.max(0, creditTjs))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: the new phone, sold on a new receipt */}
          <div className="p-3 sm:p-4 space-y-3 bg-bg">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-[11px] font-bold shrink-0">2</div>
                <h3 className="text-xs sm:text-sm font-bold text-fg">Продажа нового телефона</h3>
                <span className="text-[11px] text-fg-subtle">(новый чек)</span>
              </div>
              {replacementDevice && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">Выбрано</span>
              )}
            </div>

            {replacementDevice ? (
              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-3 relative">
                <button
                  type="button"
                  onClick={() => { setReplacementDevice(null); setNewPriceTjs(0); }}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg-muted transition-colors cursor-pointer"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <span className="text-[10px] text-accent font-bold tracking-wider block">Новый телефон</span>
                  <h4 className="text-sm font-bold text-fg-muted mt-0.5">{replacementDevice.brand} {replacementDevice.model}</h4>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {replacementDevice.ram ? `${replacementDevice.ram} • ` : ''}{replacementDevice.storage} • {formatPhoneColor(replacementDevice.color)}
                  </p>
                  <p className="text-xs text-fg-subtle mt-1">{deviceCodeLabel(replacementDevice.category)}: {replacementDevice.imei}</p>
                </div>

                {preferredAlternative && (
                  <div className="p-2.5 rounded-lg bg-info/10 border border-info/30 text-xs flex items-center justify-between gap-2">
                    <span className="text-fg-muted">Рекомендуется продать сначала такой же телефон IMEI <strong className="font-mono">{preferredAlternative.imei}</strong></span>
                    <button type="button" onClick={() => handleSelectReplacement(preferredAlternative)} className="px-2.5 py-1 rounded-md bg-info text-white font-bold shrink-0 cursor-pointer">Заменить</button>
                  </div>
                )}

                <div className="pt-2.5 border-t border-border space-y-1.5">
                  <label className="block text-xs font-bold text-accent">Цена продажи (TJS):</label>
                  <div className="relative">
                    <input
                      step="0.01"
                      type="number"
                      min="0"
                      value={newPriceTjs !== 0 ? newPriceTjs : ''}
                      onChange={(e) => setNewPriceTjs(parseFloat(e.target.value) || 0)}
                      placeholder="Цена продажи..."
                      className={`w-full rounded-xl bg-surface-raised border-2 px-3.5 py-2 text-sm font-bold focus:outline-none transition-colors ${replacementBelowCost ? 'border-danger text-danger' : 'border-accent/60 hover:border-accent focus:border-accent text-accent'}`}
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs text-accent font-bold">TJS</span>
                  </div>
                  {replacementBelowCost && (
                    <p className="flex items-center gap-1 text-xs font-semibold text-danger">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Цена ниже себестоимости
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
                    <input
                      type="text"
                      value={deviceSearchQuery}
                      onChange={(e) => setDeviceSearchQuery(e.target.value)}
                      placeholder="Поиск по IMEI или модели..."
                      className="w-full h-10 rounded-xl bg-surface border border-border pl-9 pr-3 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleScanReplacement}
                    className="h-10 w-10 flex items-center justify-center bg-surface-raised hover:bg-surface text-accent rounded-xl border border-border transition-colors shrink-0 cursor-pointer"
                    title="Сканировать"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-surface">
                  {availableDevices.length === 0 ? (
                    <div className="py-5 px-4 text-center text-xs text-fg-subtle flex flex-col items-center justify-center gap-1.5 bg-surface-raised/30">
                      <Smartphone className="w-5 h-5 text-fg-subtle/50" />
                      <span>Нет подходящих товаров в наличии{isStoreScoped ? '' : ` (${currentStoreName})`}</span>
                    </div>
                  ) : (
                    availableDevices.slice(0, 8).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleSelectReplacement(d)}
                        className="w-full text-left p-3 hover:bg-surface-raised flex items-center justify-between text-xs transition-colors group cursor-pointer"
                      >
                        <div>
                          <p className="font-bold text-fg-muted group-hover:text-accent transition-colors flex items-center gap-1.5">
                            {d.brand} {d.model}
                            {d.preferredToSell && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-info bg-info/10 border border-info/30 px-1.5 rounded">
                                <Star className="w-3 h-3" /> продать первым
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-fg-muted mt-0.5">{d.ram ? `${d.ram} • ` : ''}{d.storage} • {formatPhoneColor(d.color)}</p>
                          <p className="text-[10px] text-fg-subtle mt-0.5">{deviceCodeLabel(d.category)}: {d.imei}</p>
                        </div>
                        <span className="font-bold text-accent text-xs">{money(d.retailPriceTjs || 0)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settlement: the return, the new receipt, and what is paid or handed back */}
        {picked && replacementDevice && (
          <div className="p-4 bg-surface border-t border-border space-y-3 shrink-0">
            <div className="flex items-center gap-2">
              <Banknote className="w-4.5 h-4.5 text-accent" />
              <h4 className="text-xs md:text-sm font-bold text-fg-muted">Расчёт обмена</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-raised border border-border space-y-0.5">
                <p className="font-bold text-fg">1. Возврат по чеку #{picked.sale.receiptNumber}</p>
                <p className="text-fg-muted">{money(soldPriceTjs)} − удержание {money(withheldTjs)} = <strong className="text-accent">зачёт {money(Math.max(0, creditTjs))}</strong></p>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-raised border border-border space-y-0.5">
                <p className="font-bold text-fg">2. Новый чек</p>
                <p className="text-fg-muted">{replacementDevice.brand} {replacementDevice.model} — <strong className="text-accent">{money(newPriceTjs)}</strong></p>
              </div>
            </div>

            {differenceTjs > 0 ? (
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-2.5">
                  <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-accent tracking-wide">Доплата клиента</p>
                    <p className="text-xs text-fg-muted mt-0.5">Клиент доплачивает <strong className="text-accent">{money(differenceTjs)}</strong>.</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-border shrink-0">
                    {(['CASH', 'CARD'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${paymentMethod === method ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'}`}
                      >
                        {method === 'CASH' ? 'Наличные' : 'Банк'}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === 'CASH' && (
                    <div className="flex items-center space-x-3 bg-surface-raised p-2 rounded-xl border border-border">
                      <div>
                        <label className="block text-[10px] font-bold text-fg-subtle mb-0.5">Внесено клиентом:</label>
                        <div className="relative">
                          <input
                            step="0.01"
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
                          <span className="block text-[10px] font-bold text-fg-subtle mb-0.5">Сдача:</span>
                          <span className="text-xs font-bold text-warning">{money(moneyNumber(decimal(parseFloat(givenCashTjs) || 0).minus(differenceTjs)))}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : differenceTjs < 0 ? (
              <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-warning tracking-wide">Сдача клиенту</p>
                    <p className="text-xs text-fg-muted mt-0.5">Новый телефон дешевле зачёта. Выдайте клиенту: <strong className="text-warning">{money(Math.abs(differenceTjs))}</strong>.</p>
                  </div>
                </div>
                <div className="flex items-center bg-surface-raised p-1 rounded-xl border border-border shrink-0">
                  {(['CASH', 'CARD'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${paymentMethod === method ? 'bg-warning text-white' : 'text-fg-muted hover:text-fg'}`}
                    >
                      {method === 'CASH' ? 'Наличными' : 'На карту'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs font-semibold text-fg">Зачёт полностью покрывает новый телефон — доплаты нет.</p>
            )}
          </div>
        )}

        <div className="p-2.5 sm:p-3.5 bg-surface border-t border-border flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between shrink-0">
          <div className="text-xs font-medium text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1"><span className="text-fg-subtle">Зачёт:</span><strong className="text-accent font-semibold">{money(picked ? Math.max(0, creditTjs) : 0)}</strong></span>
            <span className="text-fg-subtle">·</span>
            <span className="inline-flex items-center gap-1"><span className="text-fg-subtle">Новый:</span><strong className="text-accent font-semibold">{money(newPriceTjs)}</strong></span>
            <span className="text-fg-subtle">·</span>
            <span className={`font-bold ${differenceTjs > 0 ? 'text-accent' : differenceTjs < 0 ? 'text-warning' : 'text-fg'}`}>
              {differenceTjs > 0 ? `Доплата: ${money(differenceTjs)}` : differenceTjs < 0 ? `Сдача: ${money(Math.abs(differenceTjs))}` : 'Без доплаты'}
            </span>
          </div>

          <button
            type="submit"
            disabled={!picked || !replacementDevice || withheldTooBig || newPriceTjs <= 0 || isSubmitting || cashShort}
            className="h-10 px-4 bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 text-xs font-bold rounded-xl text-accent-fg tracking-wide flex items-center justify-center space-x-2 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            <span>{isSubmitting ? 'Проведение…' : 'Оформить возврат и новый чек'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
