import { decimal, moneyNumber, formatMoney } from '../../utils/money';
import { deviceCodeLabel } from '../../utils/deviceCode';
import { formatPhoneColor } from '../../utils/phoneSpecs';
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { AccessoryStockItem, Device, Sale, SaleAccessoryLine, SaleItem } from '../../types';
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
  Headphones,
  Minus,
  Plus,
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { useBelowCostCheck } from '../../hooks/useBelowCostCheck';
import { preferredInsteadOf } from '../sale/sellGuidance';
import { findDeviceByCode } from '../../utils/scanLookup';
import { availableAt, useAccessoryStock } from '../../hooks/useAccessoryStock';
import { filterAccessories, findAccessoryByCode } from '../sale/AccessoryCart';
import { accessoryReturnPrice, accessoryUnitsLeft } from '../../utils/accessoryReturn';

/** What the customer hands back: a phone/tablet of a receipt, or units of one of its accessory lines. */
type Picked =
  | { kind: 'device'; sale: Sale; item: SaleItem }
  | { kind: 'accessory'; sale: Sale; line: SaleAccessoryLine; quantity: number };

/** What the customer takes instead: a phone/tablet in stock, or units of an accessory card. */
type Replacement =
  | { kind: 'device'; device: Device }
  | { kind: 'accessory'; product: AccessoryStockItem; quantity: number };

/** A small − / number / + control for whole units. */
const UnitStepper: React.FC<{ value: number; max: number; onChange: (value: number) => void; label: string }> = ({ value, max, onChange, label }) => {
  const set = (next: number) => onChange(Math.max(1, Math.min(max, Math.floor(next) || 1)));
  return (
    <div className="flex items-center rounded-lg border border-border bg-bg shrink-0">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= 1} className="h-9 w-8 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer" aria-label="Меньше">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="h-9 w-12 text-center text-sm font-bold font-mono bg-transparent focus:outline-none"
        aria-label={label}
      />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} className="h-9 w-8 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer" aria-label="Больше">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * An exchange is a return followed by a sale: the goods the customer brings back are returned on
 * their receipt (their price less the withheld amount becomes the customer's credit), and the new
 * goods are sold on a new receipt paid first with that credit. Either side is a phone/tablet or
 * accessory units. The customer pays the rest, or gets the change when the new goods are cheaper.
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
    todayRate,
    selectedStoreId: globalSelectedStoreId,
  } = useAppFields('currentUser', 'sales', 'fetchSalesRange', 'devices', 'processExchange', 'openScanner', 'stores', 'todayRate', 'selectedStoreId');

  const [receiptSearch, setReceiptSearch] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [receiptChoice, setReceiptChoice] = useState<Sale | null>(null);
  const [withheldInput, setWithheldInput] = useState('');

  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  /** A phone/tablet's price, or an accessory's price per unit. */
  const [newPriceTjs, setNewPriceTjs] = useState<number>(0);

  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [givenCashTjs, setGivenCashTjs] = useState<string>('');

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';
  // The exchange happens in the store the goods were sold at (the server enforces it too).
  const effectiveStoreId = picked?.sale.storeId
    || currentUser?.storeId
    || (globalSelectedStoreId && globalSelectedStoreId !== 'all' ? globalSelectedStoreId : '');
  const currentStoreName = stores.find(s => s.id === effectiveStoreId)?.name || currentUser?.storeName || 'Магазин';
  const isStoreScoped = currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER';

  const soldPriceTjs = !picked ? 0 : picked.kind === 'device' ? picked.item.salePriceTjs : accessoryReturnPrice(picked.line, picked.quantity);
  const withheldTjs = Math.max(0, parseFloat(withheldInput.replace(',', '.')) || 0);
  const withheldTooBig = withheldTjs > soldPriceTjs + 0.001;
  const creditTjs = moneyNumber(decimal(soldPriceTjs).minus(withheldTjs));
  const newTotalTjs = replacement?.kind === 'accessory'
    ? moneyNumber(decimal(newPriceTjs || 0).mul(replacement.quantity))
    : newPriceTjs;
  const differenceTjs = moneyNumber(decimal(newTotalTjs).minus(creditTjs));

  // Accessories on hand at the store (units held by a pending transfer excluded).
  const { items: accessoryStock } = useAccessoryStock(effectiveStoreId || undefined);
  const availableAccessories = useMemo(
    () => filterAccessories(accessoryStock, deviceSearchQuery).filter((a) => availableAt(a, effectiveStoreId || undefined) > 0),
    [accessoryStock, deviceSearchQuery, effectiveStoreId],
  );
  const maxOf = (product: AccessoryStockItem) => availableAt(product, effectiveStoreId || undefined);

  const availableDevices = useMemo(() => {
    const list = devices.filter(d => {
      if (d.status !== 'STORE_STOCK' && d.status !== 'IN_STOCK_AFTER_EXCHANGE') return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;
      if (picked?.kind === 'device' && d.id === picked.item.deviceId) return false;
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
  const replacementDevice = replacement?.kind === 'device' ? replacement.device : null;
  const preferredAlternative = useMemo(
    () => (replacementDevice ? preferredInsteadOf(replacementDevice, devices) : null),
    [devices, replacementDevice],
  );

  const belowCost = useBelowCostCheck(replacementDevice ? [{ deviceId: replacementDevice.id, priceTjs: newPriceTjs }] : []);
  // Accessories: the admin sees the unit price against the average unit cost of the store's batches.
  const accessoryBelowCost = (() => {
    if (replacement?.kind !== 'accessory' || !isAdmin || !todayRate || !newPriceTjs) return false;
    const here = replacement.product.stores.find((s) => s.storeId === effectiveStoreId);
    if (!here?.costUsd || here.quantity <= 0) return false;
    return decimal(newPriceTjs).lt(decimal(here.costUsd).div(here.quantity).mul(todayRate.rate));
  })();
  const replacementBelowCost = Boolean(replacementDevice && belowCost[replacementDevice.id]) || accessoryBelowCost;

  /** Why this receipt can't give back goods now, or null when it can. */
  const receiptBlocked = (sale: Sale): string | null => {
    if (sale.status === 'REFUNDED') return `Чек #${sale.receiptNumber} уже возвращён`;
    if ((sale.debtAmountTjs ?? 0) > 0) return `По чеку #${sale.receiptNumber} есть непогашенный долг — обмен возможен после оплаты долга`;
    if ((sale.exchangeEvents?.length ?? 0) > 0) return `По чеку #${sale.receiptNumber} был обмен старого образца — оформите возврат всего чека`;
    return null;
  };

  const choose = (next: Picked) => {
    const reason = receiptBlocked(next.sale)
      ?? (next.kind === 'device' && next.item.returnId ? `Этот телефон уже возвращён по чеку #${next.sale.receiptNumber}` : null)
      ?? (next.kind === 'accessory' && accessoryUnitsLeft(next.line) < 1 ? `${next.line.brand} ${next.line.name} уже возвращён по чеку #${next.sale.receiptNumber}` : null);
    if (reason) {
      setStatus({ tone: 'error', text: reason });
      return;
    }
    setPicked(next);
    setReceiptChoice(null);
    setWithheldInput('');
    // A replacement picked in another store is no longer valid.
    if (replacement?.kind === 'device' && replacement.device.locationId !== next.sale.storeId) {
      setReplacement(null);
      setNewPriceTjs(0);
    }
    const what = next.kind === 'device' ? `${next.item.brand} ${next.item.model}` : `${next.line.brand} ${next.line.name}`;
    setStatus({ tone: 'success', text: `${what} выбран из чека #${next.sale.receiptNumber}. Укажите удержание и выберите товар на замену.` });
  };

  /** Goods of a receipt that can still be handed back. */
  const openGoods = (sale: Sale): Picked[] => [
    ...sale.items.filter((i) => !i.returnId).map((item) => ({ kind: 'device' as const, sale, item })),
    ...(sale.accessoryItems || []).filter((l) => accessoryUnitsLeft(l) > 0).map((line) => ({ kind: 'accessory' as const, sale, line, quantity: 1 })),
  ];

  const searchSalesFor = (list: Sale[], q: string): boolean => {
    const code = q.replace(/\s+/g, '').toUpperCase();
    for (const sale of list) {
      if (sale.receiptNumber.toString() === q) {
        const open = openGoods(sale);
        if (open.length > 1) {
          setReceiptChoice(sale);
          setStatus({ tone: 'info', text: `В чеке #${sale.receiptNumber} несколько товаров — выберите, что сдаёт клиент` });
          return true;
        }
        if (open.length === 1) choose(open[0]);
        else setStatus({ tone: 'error', text: receiptBlocked(sale) ?? `По чеку #${sale.receiptNumber} всё уже возвращено` });
        return true;
      }
      const item = sale.items.find(i => i.imei.toLowerCase() === q || (i.imei2 && i.imei2.toLowerCase() === q));
      if (item && (!item.returnId || sale.items.every(i => i.returnId))) {
        choose({ kind: 'device', sale, item });
        return true;
      }
      // An accessory's barcode: one unit of its line on the receipt.
      const line = (sale.accessoryItems || []).find((l) => l.barcode.toUpperCase() === code && accessoryUnitsLeft(l) > 0);
      if (line) {
        choose({ kind: 'accessory', sale, line, quantity: 1 });
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
    setStatus({ tone: 'error', text: `Проданный товар по чеку / IMEI / SN / штрихкоду "${query}" не найден в истории продаж` });
  };

  useEffect(() => {
    if (!navigatedState?.saleReceiptNumber && !navigatedState?.saleId) return;
    const run = async () => {
      // Without a chosen phone (e.g. a receipt of accessories) the receipt opens its own choice.
      if (!navigatedState.item) {
        if (navigatedState.saleReceiptNumber) await handleFindSold(String(navigatedState.saleReceiptNumber));
        window.history.replaceState({}, document.title);
        return;
      }
      let sale = sales.find(s => s.id === navigatedState.saleId || s.receiptNumber === navigatedState.saleReceiptNumber);
      if (!sale && navigatedState.saleReceiptNumber) {
        const found = await fetchSalesRange({ search: String(navigatedState.saleReceiptNumber) }).catch(() => []);
        sale = found.find(s => s.receiptNumber === navigatedState.saleReceiptNumber);
      }
      const item = sale?.items.find(i => (navigatedState.item?.id && i.id === navigatedState.item.id) || i.imei === navigatedState.item?.imei);
      if (sale && item) choose({ kind: 'device', sale, item });
      window.history.replaceState({}, document.title);
    };
    void run();
    // Runs once for the receipt the user came from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigatedState]);

  const handleSelectDevice = (dev: Device) => {
    setReplacement({ kind: 'device', device: dev });
    setNewPriceTjs(dev.retailPriceTjs || 0);
  };

  const handleSelectAccessory = (product: AccessoryStockItem) => {
    setReplacement({ kind: 'accessory', product, quantity: 1 });
    // The same card at the price it was sold for; another card's price is entered by hand.
    const sameLine = picked?.kind === 'accessory' && picked.line.productId === product.id ? picked.line : null;
    setNewPriceTjs(sameLine ? sameLine.unitPriceTjs : 0);
  };

  const handleScanReplacement = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const dev = findDeviceByCode(availableDevices, code);
      if (dev) return handleSelectDevice(dev);
      const accessory = findAccessoryByCode(availableAccessories, code);
      if (accessory) return handleSelectAccessory(accessory);
      setDeviceSearchQuery(code);
    }, { allowModeSwitch: true });
  };

  const resetForm = () => {
    setPicked(null);
    setReplacement(null);
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
    if (!picked || !replacement) {
      setStatus({ tone: 'error', text: 'Выберите сдаваемый товар и товар на замену' });
      return;
    }
    if (picked.kind === 'device' && !picked.item.id) {
      setStatus({ tone: 'error', text: 'Обновите страницу и выберите чек заново' });
      return;
    }
    if (withheldTooBig) {
      setStatus({ tone: 'error', text: `Удержание не может быть больше цены в чеке (${formatMoney(soldPriceTjs)} TJS)` });
      return;
    }
    if (newPriceTjs <= 0) {
      setStatus({ tone: 'error', text: replacement.kind === 'accessory' ? 'Укажите цену за штуку' : 'Укажите цену нового товара' });
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
        ...(picked.kind === 'device'
          ? { saleItemId: picked.item.id }
          : { returnedAccessory: { lineId: picked.line.id, quantity: picked.quantity } }),
        withheldTjs,
        ...(replacement.kind === 'device'
          ? { replacementDeviceId: replacement.device.id, newPriceTjs }
          : { replacementAccessory: { productId: replacement.product.id, quantity: replacement.quantity, unitPriceTjs: newPriceTjs } }),
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
  const pickedTitle = !picked ? '' : picked.kind === 'device' ? `${picked.item.brand} ${picked.item.model}` : `${picked.line.brand} ${picked.line.name}`;
  const replacementTitle = !replacement ? '' : replacement.kind === 'device'
    ? `${replacement.device.brand} ${replacement.device.model}`
    : `${replacement.product.brand} ${replacement.product.name} × ${replacement.quantity}`;

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <form onSubmit={handleSubmitExchange} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-y-auto">
          {/* STEP 1: the goods the customer returns */}
          <div className="p-3 sm:p-4 space-y-3 bg-bg">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-[11px] font-bold shrink-0">1</div>
                <h3 className="text-xs sm:text-sm font-bold text-fg">Возврат товара</h3>
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
                      placeholder="Номер чека, IMEI / SN или штрихкод..."
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
                        onClick={() => choose({ kind: 'device', sale: receiptChoice, item })}
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
                    {(receiptChoice.accessoryItems || []).map((line) => {
                      const left = accessoryUnitsLeft(line);
                      return (
                        <button
                          key={line.id}
                          type="button"
                          disabled={left < 1}
                          onClick={() => choose({ kind: 'accessory', sale: receiptChoice, line, quantity: 1 })}
                          className="w-full text-left p-3 hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between text-xs transition-colors"
                        >
                          <div>
                            <p className="font-bold text-fg-muted flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5 text-accent" /> {line.brand} {line.name}</p>
                            <p className="text-[11px] text-fg-muted mt-0.5">{line.quantity} шт. × {money(line.unitPriceTjs)}{line.returnedQuantity > 0 ? ` • возвращено ${line.returnedQuantity}` : ''}</p>
                            <p className="text-[10px] text-fg-subtle mt-0.5">Штрихкод: {line.barcode}</p>
                          </div>
                          <span className="font-bold text-accent text-xs">{left < 1 ? 'Возвращён' : `можно ${left} шт.`}</span>
                        </button>
                      );
                    })}
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
                  <h4 className="text-sm font-bold text-fg-muted mt-0.5">{pickedTitle}</h4>
                  {picked.kind === 'device' ? (
                    <>
                      <p className="text-xs text-fg-muted mt-0.5">{picked.item.storage} • {formatPhoneColor(picked.item.color)}</p>
                      <p className="text-xs text-fg-subtle mt-1">{deviceCodeLabel(picked.item.category)}: {picked.item.imei}</p>
                    </>
                  ) : (
                    <p className="text-xs text-fg-subtle mt-1">
                      Штрихкод: <span className="font-mono">{picked.line.barcode}</span> · в чеке {picked.line.quantity} шт. × {money(picked.line.unitPriceTjs)}
                    </p>
                  )}
                  {(picked.kind === 'device' ? picked.item.isBelowCost : picked.line.isBelowCost) && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
                      <AlertTriangle className="w-3.5 h-3.5" /> Был продан ниже себестоимости
                    </p>
                  )}
                </div>

                {picked.kind === 'accessory' && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-fg-muted">Сдаёт, шт.:</span>
                    <UnitStepper
                      label="Сколько штук сдаёт клиент"
                      value={picked.quantity}
                      max={accessoryUnitsLeft(picked.line)}
                      onChange={(quantity) => setPicked({ ...picked, quantity })}
                    />
                    <span className="text-fg-subtle">из {accessoryUnitsLeft(picked.line)}</span>
                  </div>
                )}

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
                    {withheldTooBig && <p className="mt-1 text-[11px] text-danger">Удержание больше цены в чеке</p>}
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border/60">
                    <span className="font-semibold text-fg-muted">Зачёт клиенту</span>
                    <span className="font-mono font-bold text-accent">{money(Math.max(0, creditTjs))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: the new goods, sold on a new receipt */}
          <div className="p-3 sm:p-4 space-y-3 bg-bg">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-accent/15 text-accent border border-accent/30 flex items-center justify-center text-[11px] font-bold shrink-0">2</div>
                <h3 className="text-xs sm:text-sm font-bold text-fg">Продажа нового товара</h3>
                <span className="text-[11px] text-fg-subtle">(новый чек)</span>
              </div>
              {replacement && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">Выбрано</span>
              )}
            </div>

            {replacement ? (
              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-3 relative">
                <button
                  type="button"
                  onClick={() => { setReplacement(null); setNewPriceTjs(0); }}
                  className="absolute right-3.5 top-3.5 text-fg-subtle hover:text-fg-muted transition-colors cursor-pointer"
                  title="Отменить выбор"
                >
                  <X className="w-4 h-4" />
                </button>

                {replacement.kind === 'device' ? (
                  <div>
                    <span className="text-[10px] text-accent font-bold tracking-wider block">{replacement.device.category === 'TABLET' ? 'Новый планшет' : 'Новый телефон'}</span>
                    <h4 className="text-sm font-bold text-fg-muted mt-0.5">{replacement.device.brand} {replacement.device.model}</h4>
                    <p className="text-xs text-fg-muted mt-0.5">
                      {replacement.device.ram ? `${replacement.device.ram} • ` : ''}{replacement.device.storage} • {formatPhoneColor(replacement.device.color)}
                    </p>
                    <p className="text-xs text-fg-subtle mt-1">{deviceCodeLabel(replacement.device.category)}: {replacement.device.imei}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-accent font-bold tracking-wider block">Новый аксессуар</span>
                      <h4 className="text-sm font-bold text-fg-muted mt-0.5">{replacement.product.brand} {replacement.product.name}</h4>
                      <p className="text-xs text-fg-subtle mt-0.5">Штрихкод: <span className="font-mono">{replacement.product.barcode}</span> · в наличии {maxOf(replacement.product)} шт.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-fg-muted">Количество:</span>
                      <UnitStepper
                        label="Количество нового аксессуара"
                        value={replacement.quantity}
                        max={maxOf(replacement.product)}
                        onChange={(quantity) => setReplacement({ ...replacement, quantity })}
                      />
                    </div>
                  </div>
                )}

                {preferredAlternative && (
                  <div className="p-2.5 rounded-lg bg-info/10 border border-info/30 text-xs flex items-center justify-between gap-2">
                    <span className="text-fg-muted">Рекомендуется продать сначала такой же телефон IMEI <strong className="font-mono">{preferredAlternative.imei}</strong></span>
                    <button type="button" onClick={() => handleSelectDevice(preferredAlternative)} className="px-2.5 py-1 rounded-md bg-info text-white font-bold shrink-0 cursor-pointer">Заменить</button>
                  </div>
                )}

                <div className="pt-2.5 border-t border-border space-y-1.5">
                  <label className="block text-xs font-bold text-accent">{replacement.kind === 'accessory' ? 'Цена за штуку (TJS):' : 'Цена продажи (TJS):'}</label>
                  <div className="relative">
                    <input
                      step="0.01"
                      type="number"
                      min="0"
                      value={newPriceTjs !== 0 ? newPriceTjs : ''}
                      onChange={(e) => setNewPriceTjs(parseFloat(e.target.value) || 0)}
                      placeholder={replacement.kind === 'accessory' ? 'Цена за штуку...' : 'Цена продажи...'}
                      className={`w-full rounded-xl bg-surface-raised border-2 px-3.5 py-2 text-sm font-bold focus:outline-none transition-colors ${replacementBelowCost ? 'border-danger text-danger' : 'border-accent/60 hover:border-accent focus:border-accent text-accent'}`}
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs text-accent font-bold">TJS</span>
                  </div>
                  {replacement.kind === 'accessory' && newPriceTjs > 0 && (
                    <p className="text-[11px] text-fg-subtle font-mono">{replacement.quantity} × {money(newPriceTjs)} = <strong className="text-fg">{money(newTotalTjs)}</strong></p>
                  )}
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
                      placeholder="IMEI / SN, модель, штрихкод или название аксессуара..."
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

                <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-surface">
                  {availableDevices.length === 0 && availableAccessories.length === 0 ? (
                    <div className="py-5 px-4 text-center text-xs text-fg-subtle flex flex-col items-center justify-center gap-1.5 bg-surface-raised/30">
                      <Smartphone className="w-5 h-5 text-fg-subtle/50" />
                      <span>Нет подходящих товаров в наличии{isStoreScoped ? '' : ` (${currentStoreName})`}</span>
                    </div>
                  ) : (
                    <>
                      {availableDevices.slice(0, 8).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleSelectDevice(d)}
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
                      ))}
                      {availableAccessories.slice(0, 8).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => handleSelectAccessory(a)}
                          className="w-full text-left p-3 hover:bg-surface-raised flex items-center justify-between text-xs transition-colors group cursor-pointer"
                        >
                          <div>
                            <p className="font-bold text-fg-muted group-hover:text-accent transition-colors flex items-center gap-1.5">
                              <Headphones className="w-3.5 h-3.5 text-accent" /> {a.brand} {a.name}
                            </p>
                            <p className="text-[11px] text-fg-muted mt-0.5">{[a.category, a.model].filter(Boolean).join(' • ')}</p>
                            <p className="text-[10px] text-fg-subtle mt-0.5">Штрихкод: {a.barcode}</p>
                          </div>
                          <span className="font-bold text-accent text-xs">{maxOf(a)} шт.</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settlement: the return, the new receipt, and what is paid or handed back */}
        {picked && replacement && (
          <div className="p-4 bg-surface border-t border-border space-y-3 shrink-0">
            <div className="flex items-center gap-2">
              <Banknote className="w-4.5 h-4.5 text-accent" />
              <h4 className="text-xs md:text-sm font-bold text-fg-muted">Расчёт обмена</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-raised border border-border space-y-0.5">
                <p className="font-bold text-fg">1. Возврат по чеку #{picked.sale.receiptNumber}</p>
                <p className="text-fg-muted">{pickedTitle}{picked.kind === 'accessory' ? ` × ${picked.quantity}` : ''}: {money(soldPriceTjs)} − удержание {money(withheldTjs)} = <strong className="text-accent">зачёт {money(Math.max(0, creditTjs))}</strong></p>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-raised border border-border space-y-0.5">
                <p className="font-bold text-fg">2. Новый чек</p>
                <p className="text-fg-muted">{replacementTitle} — <strong className="text-accent">{money(newTotalTjs)}</strong></p>
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
                    <p className="text-xs text-fg-muted mt-0.5">Новый товар дешевле зачёта. Выдайте клиенту: <strong className="text-warning">{money(Math.abs(differenceTjs))}</strong>.</p>
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
              <p className="text-xs font-semibold text-fg">Зачёт полностью покрывает новый товар — доплаты нет.</p>
            )}
          </div>
        )}

        <div className="p-2.5 sm:p-3.5 bg-surface border-t border-border flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between shrink-0">
          <div className="text-xs font-medium text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1"><span className="text-fg-subtle">Зачёт:</span><strong className="text-accent font-semibold">{money(picked ? Math.max(0, creditTjs) : 0)}</strong></span>
            <span className="text-fg-subtle">·</span>
            <span className="inline-flex items-center gap-1"><span className="text-fg-subtle">Новый:</span><strong className="text-accent font-semibold">{money(newTotalTjs)}</strong></span>
            <span className="text-fg-subtle">·</span>
            <span className={`font-bold ${differenceTjs > 0 ? 'text-accent' : differenceTjs < 0 ? 'text-warning' : 'text-fg'}`}>
              {differenceTjs > 0 ? `Доплата: ${money(differenceTjs)}` : differenceTjs < 0 ? `Сдача: ${money(Math.abs(differenceTjs))}` : 'Без доплаты'}
            </span>
          </div>

          <button
            type="submit"
            disabled={!picked || !replacement || withheldTooBig || newPriceTjs <= 0 || isSubmitting || cashShort}
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
