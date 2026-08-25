import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Device, PaymentMethod } from '../../types';
import {
  Search,
  Scan,
  Smartphone,
  Trash2,
  AlertTriangle,
  CreditCard,
  Banknote,
  Split,
  CheckCircle2,
  Printer,
  ChevronRight,
  X,
  ShoppingCart,
  Store as StoreIcon,
  Plus
} from 'lucide-react';
import { formatDeviceIdentifiers, formatTjs, formatUsd } from '../../utils/formatters';

interface CartItem {
  device: Device;
  salePriceTjs?: number;
}

export const SalePage: React.FC = () => {
  const {
    currentUser,
    devices,
    todayRate,
    selectedStoreId,
    setSelectedStoreId,
    stores,
    openScanner,
    createSale
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeImeiSelector, setActiveImeiSelector] = useState<{
    variantKey: string;
    variantName: string;
    devices: Device[];
  } | null>(null);

  // Payment state inside Cart Modal
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashAmountInput, setCashAmountInput] = useState('');
  const [cardAmountInput, setCardAmountInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Success receipt modal state
  const [completedReceiptNumber, setCompletedReceiptNumber] = useState<number | null>(null);

  // Retail stores only (exclude main warehouse from selling points)
  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  // Determine active selling store
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';
  const effectiveStoreId = currentUser?.role === 'SELLER'
    ? currentUser.storeId
    : (retailStores.some(s => s.id === selectedStoreId)
        ? selectedStoreId
        : (retailStores[0]?.id || ''));

  const activeStoreName = stores.find(s => s.id === effectiveStoreId)?.name || 'Магазин';

  // Available devices in the chosen store
  const availableDevices = useMemo(() => {
    return devices.filter(d => {
      const isAvailableStatus = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE' || (isAdmin && d.status === 'MAIN_WAREHOUSE');
      if (!isAvailableStatus) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = 
          d.imei.toLowerCase().includes(q) ||
          (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
          (d.barcode && d.barcode.toLowerCase().includes(q)) ||
          (d.serialNumber && d.serialNumber.toLowerCase().includes(q)) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q) ||
          d.storage.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (selectedBrand !== 'ALL' && d.brand !== selectedBrand) return false;
      if (cart.some(ci => ci.device.id === d.id)) return false;

      return true;
    });
  }, [devices, effectiveStoreId, searchQuery, selectedBrand, cart, isAdmin]);

  // Brands list
  const brands = useMemo(() => {
    const set = new Set<string>();
    devices.forEach(d => set.add(d.brand));
    return ['ALL', ...Array.from(set)];
  }, [devices]);

  const addDeviceToCart = (device: Device) => {
    // Price starts EMPTY by default as requested
    setCart(prev => [...prev, { device, salePriceTjs: undefined }]);
    setActiveImeiSelector(null);
  };

  // Group devices by model + storage + color
  const groupedVariants = useMemo(() => {
    const groups: Record<string, {
      variantKey: string;
      brand: string;
      model: string;
      storage: string;
      color: string;
      devices: Device[];
    }> = {};

    for (const dev of availableDevices) {
      const key = `${dev.brand}_${dev.model}_${dev.storage}_${dev.color}`;
      if (!groups[key]) {
        groups[key] = {
          variantKey: key,
          brand: dev.brand,
          model: dev.model,
          storage: dev.storage,
          color: dev.color,
          devices: []
        };
      }
      groups[key].devices.push(dev);
    }

    return Object.values(groups);
  }, [availableDevices]);

  const handleSelectVariant = (variant: typeof groupedVariants[0]) => {
    if (variant.devices.length === 1) {
      addDeviceToCart(variant.devices[0]);
    } else {
      setActiveImeiSelector({
        variantKey: variant.variantKey,
        variantName: `${variant.brand} ${variant.model} (${variant.storage} / ${variant.color})`,
        devices: variant.devices
      });
    }
  };

  const handleUpdatePrice = (index: number, newPrice?: number) => {
    setCart(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        salePriceTjs: newPrice !== undefined && !isNaN(newPrice) && newPrice > 0 ? newPrice : undefined
      };
      return next;
    });
  };

  const handleRemoveFromCart = (index: number) => {
    setCart(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setIsCartOpen(false);
      }
      return updated;
    });
  };

  const handleTriggerScanner = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const exactDev = devices.find(d => 
        (d.imei === code || d.imei2 === code || d.barcode === code || d.serialNumber === code) &&
        (d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE') &&
        (!effectiveStoreId || d.locationId === effectiveStoreId) &&
        !cart.some(ci => ci.device.id === d.id)
      );

      if (exactDev) {
        addDeviceToCart(exactDev);
      } else {
        setSearchQuery(code);
      }
    });
  };

  const totalTjs = cart.reduce((acc, item) => acc + (item.salePriceTjs && item.salePriceTjs > 0 ? item.salePriceTjs : 0), 0);
  const hasEmptyPrice = cart.some(item => item.salePriceTjs === undefined || item.salePriceTjs <= 0);
  const totalUsd = todayRate ? +(totalTjs / todayRate.rate).toFixed(2) : 0;
  const rate = todayRate?.rate || 9.50;

  const isItemBelowCost = (item: CartItem) => {
    if (item.salePriceTjs === undefined || isNaN(item.salePriceTjs)) return false;
    const costTjs = item.device.costBasisUsd * rate;
    return item.salePriceTjs < costTjs;
  };

  const handleOpenCart = () => {
    if (cart.length === 0) return;
    setPaymentMethod('CASH');
    setCashAmountInput(totalTjs > 0 ? totalTjs.toString() : '');
    setCardAmountInput('0');
    setPaymentError(null);
    setIsCartOpen(true);
  };

  const handleFinishPayment = async () => {
    setPaymentError(null);

    const invalidItem = cart.find(ci => ci.salePriceTjs === undefined || ci.salePriceTjs <= 0);
    if (invalidItem) {
      setPaymentError(`Укажите цену продажи для устройства: ${invalidItem.device.brand} ${invalidItem.device.model}`);
      return;
    }

    let cashVal = 0;
    let cardVal = 0;

    if (paymentMethod === 'CASH') {
      cashVal = totalTjs;
    } else if (paymentMethod === 'CARD') {
      cardVal = totalTjs;
    } else if (paymentMethod === 'SPLIT') {
      cashVal = parseFloat(cashAmountInput) || 0;
      cardVal = parseFloat(cardAmountInput) || 0;
      if (Math.abs(cashVal + cardVal - totalTjs) > 0.01) {
        setPaymentError(`Сумма наличных (${cashVal}) + карты (${cardVal}) не равна итогу (${totalTjs} TJS)`);
        return;
      }
    }

    const res = await createSale({
      items: cart.map(ci => ({ device: ci.device, salePriceTjs: ci.salePriceTjs! })),
      paymentMethod,
      cashAmountTjs: cashVal,
      cardAmountTjs: cardVal,
      customerName: customerNameInput.trim() || undefined
    });

    if (res.success && res.receiptNumber) {
      setCompletedReceiptNumber(res.receiptNumber);
      setIsCartOpen(false);
      setCart([]);
      setCustomerNameInput('');
    } else {
      setPaymentError(res.message || 'Ошибка оформления продажи');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300 relative">
      {/* Top Filter & Store Selector Bar */}
      <div className="p-2.5 border-b border-slate-800 bg-[#0B0E14] space-y-2 shrink-0">
        {/* Store selector for Admin/Partner */}
        {isAdmin && (
          <div className="flex items-center justify-between bg-[#0B0E14] px-2.5 py-1.5 rounded border border-slate-800 text-xs font-mono">
            <span className="flex items-center text-slate-400">
              <StoreIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Точка продажи:
            </span>
            <select
              value={effectiveStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="bg-[#0B0E14] border border-slate-700 text-emerald-400 font-bold px-2 py-0.5 rounded focus:outline-none focus:border-emerald-500 text-xs"
            >
              {retailStores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Search & Scan */}
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
            onClick={handleTriggerScanner}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0B0E14] hover:bg-slate-800 active:bg-slate-700 rounded text-xs font-mono font-bold text-emerald-400 border border-slate-800 hover:border-slate-700 transition-colors shrink-0"
            title="Сканировать IMEI или штрихкод"
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">СКАНЕР</span>
          </button>
        </div>

        {/* Brand Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 text-xs scrollbar-none">
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBrand(b)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${
                selectedBrand === b
                  ? 'text-[#22c55e] font-bold border border-[#22c55e]/50'
                  : 'text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {b === 'ALL' ? 'Все бренды' : b}
            </button>
          ))}
        </div>
      </div>

      {/* Product Catalog List */}
      <div className={`flex-1 overflow-y-auto divide-y divide-slate-800/50 bg-[#0B0E14] ${cart.length > 0 ? 'pb-32 md:pb-24' : 'pb-16 md:pb-4'}`}>
        {groupedVariants.length === 0 ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center text-slate-400 font-mono space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
              <Smartphone className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-200">ТОВАРЫ НЕ НАЙДЕНЫ</p>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                В наличии нет устройств по текущим фильтрам ({activeStoreName})
              </p>
            </div>
            {selectedBrand !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedBrand('ALL')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all"
              >
                Сбросить фильтр бренда
              </button>
            )}
          </div>
        ) : (
          groupedVariants.map((variant) => (
            <button
              key={variant.variantKey}
              onClick={() => handleSelectVariant(variant)}
              className="w-full text-left px-3.5 py-3 hover:bg-slate-800/30 active:bg-slate-800/50 flex items-center justify-between transition-colors group"
            >
              <div className="min-w-0 pr-3">
                <p className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors truncate">
                  {variant.brand} {variant.model}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {variant.storage} • {variant.color}
                </p>
              </div>

              <div className="text-right shrink-0 flex items-center space-x-2">
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400">
                  {variant.devices.length} шт.
                </span>
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-400 group-hover:text-white transition-colors">
                  <Plus className="w-4 h-4" />
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* BOTTOM FLOATING ACTION BAR: Appears when items are in cart */}
      {cart.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-3 right-3 md:left-64 md:right-4 z-40 max-w-2xl mx-auto">
          <div className="p-3 rounded-2xl bg-[#0F131D] border border-emerald-500/40 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-3 min-w-0 pl-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {cart.length}
              </div>
              <div className="truncate">
                <span className="text-xs sm:text-sm font-bold font-mono text-emerald-400 block truncate">
                  {totalTjs.toLocaleString()} TJS
                </span>
                <span className="text-[10px] font-mono text-slate-400 block">
                  ≈ ${totalUsd} USD
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => setCart([])}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-slate-400 hover:text-rose-400 transition-colors"
                title="Очистить корзину"
              >
                Очистить
              </button>
              <button
                onClick={handleOpenCart}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>ОФОРМИТЬ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMEI Selector for Multi-unit variants */}
      {activeImeiSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 font-mono">
          <div className="w-full max-w-md rounded-xl bg-[#0F1219] border border-slate-800 p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-100 flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>ВЫБЕРИТЕ IMEIУСТРОЙСТВА</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{activeImeiSelector.variantName}</p>
              </div>
              <button
                onClick={() => setActiveImeiSelector(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {activeImeiSelector.devices.map((dev) => (
                <button
                  key={dev.id}
                  onClick={() => addDeviceToCart(dev)}
                  className="w-full p-2.5 text-left rounded-lg bg-[#0B0E14] hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/40 flex items-center justify-between group transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                      IMEI: {dev.imei}{dev.imei2 ? ` / ${dev.imei2}` : ''}
                      {dev.barcode ? <span className="text-[10px] text-amber-400 font-normal block">EAN: {dev.barcode}</span> : null}
                    </p>
                    {dev.serialNumber && (
                      <p className="text-[10px] text-slate-400 mt-0.5">S/N: {dev.serialNumber}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-bold px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 uppercase shrink-0 transition-colors">
                    ВЫБРАТЬ
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Full Cart & Payment Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-[#0F1219] border border-slate-800 p-4 sm:p-5 shadow-2xl text-slate-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 shrink-0">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400">КАССОВЫЙ ЧЕК // {activeStoreName}</span>
                <h3 className="text-base font-bold font-mono text-emerald-400">
                  {totalTjs.toLocaleString()} TJS <span className="text-xs text-slate-400 font-normal">(≈ ${totalUsd})</span>
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Cart Items */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3 divide-y divide-slate-800/60">
              {cart.map((item, idx) => {
                const belowCost = isItemBelowCost(item);

                return (
                  <div key={`${item.device.id}-${idx}`} className="pt-2 first:pt-0 bg-[#0B0E14] p-2.5 rounded border border-slate-800/80">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-bold text-slate-200">
                          {item.device.brand} {item.device.model}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {item.device.storage} • {item.device.color}
                        </p>
                        <p className="text-[9px] font-mono text-slate-500 mt-0.5">
                          IMEI: {item.device.imei}{item.device.imei2 ? ` / ${item.device.imei2}` : ''}
                          {item.device.barcode ? ` • EAN: ${item.device.barcode}` : ''}
                        </p>
                      </div>

                      <button
                        onClick={() => handleRemoveFromCart(idx)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-2">
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                        Цена продажи (TJS): <span className="text-amber-400 font-bold">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          placeholder="Укажите цену продажи..."
                          value={item.salePriceTjs !== undefined ? item.salePriceTjs : ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            handleUpdatePrice(idx, isNaN(val) ? undefined : val);
                          }}
                          className={`w-full rounded bg-[#0F1219] px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none ${
                            item.salePriceTjs === undefined || item.salePriceTjs <= 0
                              ? 'border border-amber-500/80 text-amber-300 placeholder-slate-500'
                              : belowCost
                                ? 'border border-rose-500 text-rose-300'
                                : 'border border-slate-700 text-emerald-400 focus:border-emerald-500'
                          }`}
                        />
                        <span className="absolute right-2.5 top-1.5 text-[10px] font-mono font-bold text-slate-500">TJS</span>
                      </div>

                      {(item.salePriceTjs === undefined || item.salePriceTjs <= 0) && (
                        <p className="mt-1 flex items-center text-[10px] font-mono text-amber-400 font-medium">
                          <AlertTriangle className="w-3 h-3 mr-1 shrink-0" />
                          <span>Обязательное поле: укажите цену продажи</span>
                        </p>
                      )}

                      {belowCost && item.salePriceTjs !== undefined && item.salePriceTjs > 0 && (
                        <p className="mt-1 flex items-center text-[10px] font-mono text-rose-400">
                          <AlertTriangle className="w-3 h-3 mr-1 shrink-0" />
                          <span>⚠ Цена продажи ниже себестоимости</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Payment Section */}
            <div className="shrink-0 space-y-3 pt-2 border-t border-slate-800">
              {/* Optional customer name */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5">
                  Покупатель / Телефон (опционально):
                </label>
                <input
                  type="text"
                  value={customerNameInput ?? ''}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  placeholder="Имя или номер телефона"
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-3 gap-2 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('CASH');
                    setCashAmountInput(totalTjs.toString());
                    setCardAmountInput('0');
                  }}
                  className={`py-2 px-1 rounded border flex flex-col items-center justify-center space-y-1 transition-colors ${
                    paymentMethod === 'CASH'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                      : 'bg-[#0B0E14] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span className="text-[10px] uppercase">НАЛИЧНЫЕ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('CARD');
                    setCardAmountInput(totalTjs.toString());
                    setCashAmountInput('0');
                  }}
                  className={`py-2 px-1 rounded border flex flex-col items-center justify-center space-y-1 transition-colors ${
                    paymentMethod === 'CARD'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                      : 'bg-[#0B0E14] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-[10px] uppercase">КАРТА / POS</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('SPLIT');
                    const half = Math.floor(totalTjs / 2);
                    setCashAmountInput(half.toString());
                    setCardAmountInput((totalTjs - half).toString());
                  }}
                  className={`py-2 px-1 rounded border flex flex-col items-center justify-center space-y-1 transition-colors ${
                    paymentMethod === 'SPLIT'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                      : 'bg-[#0B0E14] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Split className="w-4 h-4" />
                  <span className="text-[10px] uppercase">РАЗДЕЛИТЬ</span>
                </button>
              </div>

              {paymentMethod === 'SPLIT' && (
                <div className="space-y-1.5 bg-[#0B0E14] p-2 rounded border border-slate-800 font-mono text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">НАЛИЧНЫЕ:</span>
                      <input
                        type="number"
                        value={cashAmountInput ?? ''}
                        onChange={(e) => setCashAmountInput(e.target.value)}
                        className="w-full rounded bg-[#0F1219] border border-slate-700 px-2 py-1 text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">КАРТА:</span>
                      <input
                        type="number"
                        value={cardAmountInput ?? ''}
                        onChange={(e) => setCardAmountInput(e.target.value)}
                        className="w-full rounded bg-[#0F1219] border border-slate-700 px-2 py-1 text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {paymentError && (
                <div className="p-2 rounded bg-rose-950/30 border border-rose-900/50 text-xs font-mono text-rose-400 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <button
                onClick={handleFinishPayment}
                disabled={hasEmptyPrice || totalTjs <= 0}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono font-bold uppercase tracking-wider text-white shadow-[0_0_12px_rgba(16,185,129,0.5)] transition-colors flex items-center justify-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {hasEmptyPrice ? 'УКАЖИТЕ ЦЕНУ ПРОДАЖИ' : `ЗАВЕРШИТЬ ПРОДАЖУ (${totalTjs.toLocaleString()} TJS)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Sale Completed Receipt */}
      {completedReceiptNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-lg bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-2.5">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold font-mono uppercase text-white">ПРОДАЖА ЗАВЕРШЕНА</h3>
            <p className="text-xs font-mono text-emerald-400 mt-0.5">ЧЕК #{completedReceiptNumber}</p>

            {/* Receipt Header list */}
            <div className="my-3 p-3 bg-[#0B0E14] rounded-lg border border-slate-800 text-left font-mono space-y-1 text-xs">
              <div className="text-slate-200 font-semibold">
                {new Date().toLocaleString('ru-RU')}
              </div>
              <div className="text-slate-300">
                {activeStoreName}
              </div>
              <div className="text-emerald-400 font-bold uppercase">
                ОПЕРАТОР: {currentUser?.name || 'Администратор'}
              </div>
            </div>

            <p className="text-[11px] font-mono text-slate-400 mt-1">
              Устройства списаны со склада {activeStoreName}
            </p>

            <div className="mt-5 font-mono">
              <button
                onClick={() => setCompletedReceiptNumber(null)}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-xs font-bold uppercase text-slate-950 transition-colors shadow-[0_0_12px_rgba(16,185,129,0.4)]"
              >
                НОВЫЙ ЧЕК
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
