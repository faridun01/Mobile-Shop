import { decimal, moneyNumber, sumMoney, formatMoney } from '../../utils/money';
import React, { useState, useMemo, useRef } from 'react';
import { useAppFields } from '../../context/AppContext';
import { Device, PaymentMethod } from '../../types';
import { looksLikeDeviceCode, normalizeScanCode, resolveSaleScan, saleScanMessage } from '../../utils/scanLookup';
import {
  Smartphone,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Store as StoreIcon,
  Plus,
  FileCheck2,
  Clock,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { SearchBar } from '../ui/SearchBar';
import { formatRam, formatStorage, getPhoneColorHex } from '../../utils/phoneSpecs';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { soundEffects } from '../../utils/sound';
import { useUIStore } from '../../stores/useUIStore';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';
import { hasCurrentDailyRate } from '../../utils/dailyRatePrompt';
import { CustomerPaymentControls } from '../sale/CustomerPaymentControls';
import { SaleReceiptDialog } from '../sale/SaleReceiptDialog';
import { SaleVariantRow, retailPriceOf, type SaleVariant } from '../sale/SaleVariantRow';

interface CartItem {
  device: Device;
  salePriceTjs?: number;
}


export const SalePage: React.FC = () => {
  const { setStoreSwitchModalOpen, setDailyClosingModalOpen } = useUIStore();
  const {
    currentUser,
    devices,
    todayRate,
    selectedStoreId,
    stores,
    openScanner,
    createSale,
    isInitialLoading,
    sales,
  } = useAppFields('currentUser', 'devices', 'todayRate', 'selectedStoreId', 'stores', 'openScanner', 'createSale', 'isInitialLoading', 'sales');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  useUnfinishedWork(cart.length > 0, 'Незавершённая продажа');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashAmountInput, setCashAmountInput] = useState('');
  const [cardAmountInput, setCardAmountInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [downpaymentInput, setDownpaymentInput] = useState('0');
  const [downpaymentMethod, setDownpaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [customerSuggestions, setCustomerSuggestions] = useState<Array<{ id: string; name: string; phone?: string; totalDebtTjs: number }>>([]);
  const [paymentStatus, setPaymentStatus] = useState<StatusMessage | null>(null);

  const [completedReceiptNumber, setCompletedReceiptNumber] = useState<number | null>(null);
  const completedSale = useMemo(
    () => (completedReceiptNumber === null ? undefined : sales.find(s => s.receiptNumber === completedReceiptNumber)),
    [sales, completedReceiptNumber]
  );
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (selectedCustomerId) {
      setCustomerSuggestions([]);
      return;
    }
    const q = (customerPhoneInput.trim() || customerNameInput.trim());
    if (q.length < 2) {
      setCustomerSuggestions([]);
      return;
    }
    let cancelled = false;
    apiClient<{ items: any[] }>(`/customers?search=${encodeURIComponent(q)}&limit=5`)
      .then((res) => {
        if (!cancelled) setCustomerSuggestions(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setCustomerSuggestions([]);
      });
    return () => { cancelled = true; };
  }, [customerNameInput, customerPhoneInput, selectedCustomerId]);

  const isRealAdmin = currentUser?.role === 'ADMIN';
  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isStoreScoped = isSeller || isPartner;
  const isAdmin = currentUser?.role === 'ADMIN';
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');

  const selectableStores = useMemo(() => {
    return stores.filter(s => !s.isMainWarehouse);
  }, [stores]);

  // Store-bound users sell in their own store; the admin sells in the store picked in the top
  // bar (in central-cash mode no store is picked and the page asks for one).
  const effectiveStoreId = isStoreScoped
    ? currentUser?.storeId
    : (isCentralCashMode
        ? ''
        : (selectableStores.some(s => s.id === selectedStoreId) ? selectedStoreId : (selectableStores[0]?.id || '')));

  const activeStore = stores.find(s => s.id === effectiveStoreId);
  const activeStoreName = activeStore?.name || 'Магазин';
  const isCurrentStoreWarehouse = Boolean(activeStore?.isMainWarehouse);

  const availableDevices = useMemo(() => {
    return devices.filter(d => {
      const isAvailableStatus = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailableStatus) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
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
  }, [devices, effectiveStoreId, searchQuery, selectedBrand, cart]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    devices.forEach(d => {
      const isAvailableStatus = d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE';
      if (!isAvailableStatus) return false;
      if (effectiveStoreId && d.locationId !== effectiveStoreId) return false;
      if (d.brand?.trim()) set.add(d.brand.trim());
    });
    return [{ value: 'ALL', label: 'Все бренды' }, ...Array.from(set).sort().map(b => ({ value: b, label: b }))];
  }, [devices, effectiveStoreId]);

  const defaultPriceFor = retailPriceOf;

  const addDeviceToCart = (device: Device) => {
    soundEffects.playAddToCartSuccess();
    setCart(prev => [...prev, { device, salePriceTjs: defaultPriceFor(device) }]);
    setExpandedVariantKey(null);
  };

  const groupedVariants = useMemo(() => {
    const groups: Record<string, {
      variantKey: string;
      brand: string;
      model: string;
      ram?: string;
      storage: string;
      color: string;
      devices: Device[];
    }> = {};

    for (const dev of availableDevices) {
      const ramPart = dev.ram ? dev.ram.trim() : '';
      const key = `${dev.brand}_${dev.model}_${ramPart}_${dev.storage}_${dev.color}`;
      if (!groups[key]) {
        groups[key] = { variantKey: key, brand: dev.brand, model: dev.model, ram: dev.ram, storage: dev.storage, color: dev.color, devices: [] };
      }
      groups[key].devices.push(dev);
    }

    return Object.values(groups);
  }, [availableDevices]);

  const handleSelectVariant = (variant: SaleVariant) => {
    if (variant.devices.length === 1) {
      addDeviceToCart(variant.devices[0]);
    } else {
      setExpandedVariantKey(prev => (prev === variant.variantKey ? null : variant.variantKey));
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
      if (updated.length === 0) setIsCartOpen(false);
      return updated;
    });
  };

  /**
   * One answer for every scan: the camera scanner and a USB/Bluetooth scanner (which types the
   * code into search and presses Enter). A phone that can't be added says why instead of only
   * beeping, so a cashier in a noisy shop still knows what happened.
   */
  const handleDeviceCode = (rawCode: string, source: 'camera' | 'enter') => {
    const code = normalizeScanCode(rawCode);
    if (!code) return;
    const result = resolveSaleScan({
      devices,
      code,
      storeId: effectiveStoreId,
      cartDeviceIds: cart.map(ci => ci.device.id),
      storeName: (id) => stores.find(s => s.id === id)?.name,
    });

    if (result.kind === 'add') {
      addDeviceToCart(result.device);
      if (source === 'camera') {
        setPaymentStatus(null);
        setIsCartOpen(true);
      } else {
        // Keep the cursor in search so the next phone can be scanned straight away.
        setSearchQuery('');
        setPaymentStatus({ tone: 'success', text: `Добавлено в корзину: ${result.device.brand} ${result.device.model}` });
      }
      return;
    }
    // Enter on an ordinary text search ("iphone 15") just keeps filtering the catalog.
    if (source === 'enter' && result.kind === 'not-found' && !looksLikeDeviceCode(code)) return;
    soundEffects.playError();
    setPaymentStatus({ tone: result.kind === 'not-found' ? 'error' : 'warning', text: saleScanMessage(result) });
    if (source === 'camera') setSearchQuery(code);
  };

  const handleTriggerScanner = () => {
    openScanner((scannedCode) => handleDeviceCode(scannedCode, 'camera'));
  };

  const handleAddMore = () => {
    setIsCartOpen(false);
  };

  const totalTjs = sumMoney(cart.map(item => item.salePriceTjs && item.salePriceTjs > 0 ? item.salePriceTjs : 0));
  const hasEmptyPrice = cart.some(item => item.salePriceTjs === undefined || item.salePriceTjs <= 0);
  // A rate from an earlier day is not today's: the server refuses the sale until the admin sets it.
  const rateReady = hasCurrentDailyRate(todayRate);
  const totalUsd = todayRate ? moneyNumber(decimal(totalTjs).div(todayRate.rate)) : 0;
  // Without today's rate there is no honest USD figure, so none is shown (the sale itself
  // requires the rate on the server anyway).
  const usdLabel = rateReady ? `≈ $${formatMoney(totalUsd)}` : 'курс на сегодня не задан';

  const isItemBelowCost = (item: CartItem) => {
    if (!todayRate || item.salePriceTjs === undefined || isNaN(item.salePriceTjs)) return false;
    return decimal(item.salePriceTjs).lt(decimal(item.device.costBasisUsd).mul(todayRate.rate));
  };

  // Keep the payment amounts in step with the total when phones are added or prices change.
  // Customer and payment method stay as the cashier left them until the sale is done.
  React.useEffect(() => {
    if (paymentMethod === 'CASH') {
      setCashAmountInput(totalTjs > 0 ? totalTjs.toString() : '');
      setCardAmountInput('0');
    } else if (paymentMethod === 'CARD') {
      setCardAmountInput(totalTjs > 0 ? totalTjs.toString() : '');
      setCashAmountInput('0');
    } else if (paymentMethod === 'SPLIT') {
      const cash = parseFloat(cashAmountInput.replace(',', '.')) || 0;
      const card = parseFloat(cardAmountInput.replace(',', '.')) || 0;
      if (Math.abs(cash + card - totalTjs) > 0.01) {
        const half = Math.floor(totalTjs / 2);
        setCashAmountInput(half.toString());
        setCardAmountInput(moneyNumber(decimal(totalTjs).minus(half)).toString());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTjs, paymentMethod]);

  /** A fresh checkout after a completed sale or a cleared cart. */
  const resetCheckout = () => {
    setPaymentMethod('CASH');
    setCustomerNameInput('');
    setCustomerPhoneInput('');
    setSelectedCustomerId(null);
    setCustomerSuggestions([]);
    setDownpaymentInput('0');
    setDownpaymentMethod('CASH');
  };

  /** Back to search for the next USB/Bluetooth scanner read (not on touch screens: no keyboard pop-up). */
  const focusSearchForScanner = () => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
    setTimeout(() => searchInputRef.current?.focus(), 80);
  };

  const handleOpenCart = () => {
    if (cart.length === 0) return;
    setPaymentStatus(null);
    setIsCartOpen(true);
  };

  const handleFinishPayment = async () => {
    if (isSubmittingSale) return;
    setPaymentStatus(null);

    const invalidItem = cart.find(ci => ci.salePriceTjs === undefined || ci.salePriceTjs <= 0);
    if (invalidItem) {
      setPaymentStatus({ tone: 'error', text: `Укажите цену продажи для устройства: ${invalidItem.device.brand} ${invalidItem.device.model}` });
      return;
    }

    let cashVal = 0;
    let cardVal = 0;
    let debtVal = 0;

    if (paymentMethod === 'CASH') {
      cashVal = totalTjs;
    } else if (paymentMethod === 'CARD') {
      cardVal = totalTjs;
    } else if (paymentMethod === 'SPLIT') {
      cashVal = parseFloat(cashAmountInput) || 0;
      cardVal = parseFloat(cardAmountInput) || 0;
      if (Math.abs(cashVal + cardVal - totalTjs) > 0.01) {
        setPaymentStatus({ tone: 'error', text: `Сумма наличных (${formatMoney(cashVal)}) + банк (${formatMoney(cardVal)}) не равна итогу (${formatMoney(totalTjs)} TJS)` });
        return;
      }
    } else if (paymentMethod === 'DEBT') {
      if (!customerNameInput.trim() && !customerPhoneInput.trim()) {
        setPaymentStatus({ tone: 'error', text: 'Для продажи в долг обязательно укажите имя или номер телефона клиента' });
        return;
      }
      const downpayment = Math.min(totalTjs, Math.max(0, parseFloat(downpaymentInput) || 0));
      if (downpaymentMethod === 'CASH') {
        cashVal = downpayment;
      } else {
        cardVal = downpayment;
      }
      debtVal = Number(Math.max(0, totalTjs - downpayment).toFixed(2));
      if (debtVal <= 0) {
        setPaymentStatus({ tone: 'error', text: 'При полной оплате выберите способ «Наличные» или «Банк»' });
        return;
      }
    }

    if (isCurrentStoreWarehouse) {
      setPaymentStatus({ tone: 'error', text: 'Главный склад предназначен только для хранения телефонов. Продажи со склада запрещены.' });
      return;
    }

    setIsSubmittingSale(true);
    try {
      const res = await createSale({
        items: cart.map(ci => ({ device: ci.device, salePriceTjs: ci.salePriceTjs! })),
        paymentMethod,
        cashAmountTjs: cashVal,
        cardAmountTjs: cardVal,
        debtAmountTjs: debtVal,
        customerName: customerNameInput.trim() || undefined,
        customerPhone: customerPhoneInput.trim() || undefined,
        customerId: selectedCustomerId || undefined,
      });

      if (res.success && res.receiptNumber) {
        setCompletedReceiptNumber(res.receiptNumber);
        setIsCartOpen(false);
        setCart([]);
        resetCheckout();
      } else {
        setPaymentStatus({ tone: 'error', text: res.message || 'Ошибка оформления продажи' });
      }
    } finally {
      setIsSubmittingSale(false);
    }
  };

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted relative">
      <StatusBanner message={paymentStatus} onDismiss={() => setPaymentStatus(null)} />

      {!rateReady && !isCentralCashMode && (
        <div className="p-3 bg-warning/15 border-b border-warning/30 text-warning text-xs font-semibold flex items-center gap-2 shrink-0" role="alert">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Курс USD/TJS на сегодня не задан — продажа будет доступна после того, как администратор задаст курс.</span>
        </div>
      )}

      {isCurrentStoreWarehouse && (
        <div className="p-3 bg-warning/15 border-b border-warning/30 text-warning text-xs font-medium flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Главный склад предназначен исключительно для хранения телефонов. Продажи со склада запрещены. Выберите розничную точку продаж.</span>
        </div>
      )}

      {isCentralCashMode && (
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={StoreIcon}
            title="Выберите магазин"
            description="Продажа проводится в конкретном магазине. Выберите его — так же, как кнопкой «Продавать в магазине» в верхней панели."
            action={<Button leftIcon={StoreIcon} onClick={() => setStoreSwitchModalOpen(true)}>Выбрать магазин</Button>}
          />
        </div>
      )}

      {!isCentralCashMode && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Column: Product Search & Catalog */}
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            {/* Filter bar */}
            <div className="p-2 sm:p-2.5 border-b border-border bg-surface shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SearchBar
                    inputRef={searchInputRef}
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onScan={handleTriggerScanner}
                    onSubmit={(value) => handleDeviceCode(value, 'enter')}
                    placeholder="Поиск по IMEI или модели..."
                  />
                </div>
                {!isAdmin && (
                  <button
                    type="button"
                    onClick={() => setDailyClosingModalOpen(true, effectiveStoreId)}
                    className="h-11 px-3 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-accent transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                    title="Закрыть смену"
                  >
                    <FileCheck2 className="w-4 h-4 text-accent" />
                    <span className="hidden sm:inline">Закрыть смену</span>
                  </button>
                )}
              </div>

              {brands.length > 2 && (
                <div className="flex items-center justify-between gap-2 overflow-hidden pt-0.5">
                  <div className="flex-1 min-w-0">
                    <FilterPillGroup options={brands} value={selectedBrand} onChange={setSelectedBrand} scrollable />
                  </div>
                  <span className="text-[11px] text-fg-subtle tabular-nums font-medium shrink-0 hidden sm:inline">
                    В наличии: <strong className="text-fg-muted font-semibold">{availableDevices.length}</strong> шт.
                  </span>
                </div>
              )}
            </div>

            {/* Catalog list */}
            <div
              key={effectiveStoreId}
              className="animate-store-catalog flex-1 min-h-0 overflow-y-auto divide-y divide-border pb-4"
            >
              {isInitialLoading ? (
                <LoadingState label="Загрузка каталога…" />
              ) : groupedVariants.length === 0 ? (
                <EmptyState
                  icon={Smartphone}
                  title="Товары не найдены"
                  description={`В наличии нет устройств${searchQuery ? ' по вашему запросу' : ''}${isStoreScoped ? '' : ` (${activeStoreName})`}`}
                  action={
                    selectedBrand !== 'ALL' || searchQuery ? (
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => {
                          setSelectedBrand('ALL');
                          setSearchQuery('');
                        }}
                      >
                        Сбросить фильтры
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="px-3.5 py-1.5 bg-surface-raised/40 border-b border-border text-[11px] text-fg-subtle flex items-center justify-between sticky top-0 backdrop-blur-xs z-10">
                    <span className="font-semibold text-fg-muted">В наличии: <strong className="text-accent font-bold">{availableDevices.length}</strong> шт.</span>
                    {selectedBrand !== 'ALL' && (
                      <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                        {selectedBrand}
                      </span>
                    )}
                  </div>
                  {groupedVariants.map((variant) => (
                    <SaleVariantRow
                      key={variant.variantKey}
                      variant={variant}
                      expanded={expandedVariantKey === variant.variantKey}
                      showCosts={isRealAdmin}
                      onSelect={handleSelectVariant}
                      onAddDevice={addDeviceToCart}
                    />
                  ))}
              </>
            )}
          </div>

          {/* Floating Cart Bar on Mobile & Tablet (< 1024px) */}
          {cart.length > 0 && (
            <div className="lg:hidden shrink-0 px-3 pt-2 pb-7 md:pb-3 border-t border-border bg-bg">
              <div className="max-w-2xl mx-auto p-3 rounded-xl bg-surface border border-accent/40 flex items-center justify-between gap-2" role="region" aria-label="Корзина">
                <div className="flex items-center gap-3 min-w-0 pl-1">
                  <div className="w-9 h-9 rounded-lg bg-accent text-accent-fg flex items-center justify-center font-bold text-sm shrink-0">
                    {cart.length}
                  </div>
                  <div className="truncate">
                    <span className="text-sm font-bold text-accent block truncate">{formatMoney(totalTjs)} TJS</span>
                    <span className="text-xs text-fg-subtle block">{usdLabel}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsClearConfirmOpen(true)}
                    className="h-9 px-2.5 rounded-lg text-xs font-medium text-fg-subtle hover:text-danger transition-colors cursor-pointer"
                  >
                    Очистить
                  </button>
                  <Button onClick={handleOpenCart} leftIcon={ShoppingCart}>Оформить</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dedicated Desktop POS Terminal Checkout Sidebar (>= 1024px) */}
        <aside className="hidden lg:flex w-96 xl:w-[420px] shrink-0 border-l border-border bg-surface flex-col h-full overflow-hidden select-none">
          {/* Header: Текущий чек */}
          <div className="p-3 border-b border-border bg-surface flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs font-bold text-fg uppercase tracking-wide truncate">Текущий чек</h2>
                <p className="text-[10px] text-fg-subtle truncate flex items-center gap-1">
                  <StoreIcon className="w-3 h-3 text-accent shrink-0" />
                  <span>{activeStoreName}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isAdmin && (
                <button
                  type="button"
                  onClick={() => setDailyClosingModalOpen(true, effectiveStoreId)}
                  className="p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                  title="Закрыть смену"
                >
                  <FileCheck2 className="w-4 h-4" />
                </button>
              )}
              <span className="px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold font-mono text-xs">
                {cart.length} шт
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsClearConfirmOpen(true)}
                  className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                  title="Очистить чек"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Body: Empty State or Cart Items & Checkout */}
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-fg-subtle space-y-2.5">
              <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle/50 mb-1">
                <ShoppingCart className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-fg">Чек пуст</p>
              <p className="text-xs text-fg-subtle">
                Выберите товар или отсканируйте IMEI
              </p>
            </div>
          ) : (
            <>
              {/* Scrollable Cart Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-border/60">
                {cart.map((item, idx) => {
                  const belowCost = isItemBelowCost(item);
                  const priceMissing = item.salePriceTjs === undefined || item.salePriceTjs <= 0;

                  return (
                    <div key={`${item.device.id}-${idx}`} className="pt-2.5 first:pt-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-fg truncate">
                            {item.device.brand} {item.device.model}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            {item.device.storage && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-raised border border-border text-[10px] font-black font-mono text-fg shadow-2xs">
                                {formatStorage(item.device.storage)}
                              </span>
                            )}
                            {item.device.ram && (
                              <span className="px-1.5 py-0.2 rounded bg-surface-raised/80 border border-border/70 text-[10px] font-bold font-mono text-fg-subtle">
                                {formatRam(item.device.ram)}
                              </span>
                            )}
                            {item.device.color && (() => {
                              const colorHex = getPhoneColorHex(item.device.color);
                              return (
                                <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                                  {colorHex && <span className="w-2 h-2 rounded-full border border-black/20 shrink-0" style={{ backgroundColor: colorHex }} />}
                                  <span>{item.device.color}</span>
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-[10px] text-fg-subtle font-mono truncate mt-0.5">
                            IMEI: {item.device.imei}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(idx)}
                          className="p-1 rounded-md text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors shrink-0 cursor-pointer"
                          title="Удалить позицию"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Price Input */}
                      <div>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Цена в TJS..."
                            value={item.salePriceTjs !== undefined ? item.salePriceTjs : ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              handleUpdatePrice(idx, isNaN(val) ? undefined : val);
                            }}
                            className={`w-full h-8 rounded-lg px-2.5 pr-11 text-xs font-bold font-mono bg-bg focus:outline-none focus:ring-1 ${
                              priceMissing
                                ? 'border border-warning text-warning focus:border-warning focus:ring-warning'
                                : belowCost
                                  ? 'border border-danger text-danger focus:border-danger focus:ring-danger'
                                  : 'border border-border text-accent focus:border-accent focus:ring-accent'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-fg-subtle">
                            TJS
                          </span>
                        </div>
                        {priceMissing && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-warning font-medium">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> Укажите цену
                          </p>
                        )}
                        {belowCost && !priceMissing && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-danger font-medium">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> Ниже себестоимости
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Checkout Controls */}
              <div className="p-3 border-t border-border bg-surface-raised/40 space-y-2.5 shrink-0">
                <CustomerPaymentControls
                  paymentMethod={paymentMethod}
                  setPaymentMethod={setPaymentMethod}
                  totalTjs={totalTjs}
                  cashAmountInput={cashAmountInput}
                  setCashAmountInput={setCashAmountInput}
                  cardAmountInput={cardAmountInput}
                  setCardAmountInput={setCardAmountInput}
                  customerNameInput={customerNameInput}
                  setCustomerNameInput={setCustomerNameInput}
                  customerPhoneInput={customerPhoneInput}
                  setCustomerPhoneInput={setCustomerPhoneInput}
                  selectedCustomerId={selectedCustomerId}
                  setSelectedCustomerId={setSelectedCustomerId}
                  customerSuggestions={customerSuggestions}
                  setCustomerSuggestions={setCustomerSuggestions}
                  downpaymentInput={downpaymentInput}
                  setDownpaymentInput={setDownpaymentInput}
                  downpaymentMethod={downpaymentMethod}
                  setDownpaymentMethod={setDownpaymentMethod}
                />

                {/* Summary & Pay Action */}
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-fg-subtle block">Итого к оплате</span>
                    <span className="text-[11px] text-fg-subtle font-mono">{usdLabel}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base sm:text-lg font-black font-mono text-accent block">
                      {formatMoney(totalTjs)} TJS
                    </span>
                  </div>
                </div>

                <Button
                  size="lg"
                  fullWidth
                  leftIcon={paymentMethod === 'DEBT' ? Clock : CheckCircle2}
                  loading={isSubmittingSale}
                  disabled={!rateReady || hasEmptyPrice || totalTjs <= 0 || isSubmittingSale}
                  onClick={handleFinishPayment}
                  className={`h-11 text-xs sm:text-sm font-bold flex items-center justify-center cursor-pointer shadow-md ${
                    paymentMethod === 'DEBT' ? '!bg-amber-600 hover:!bg-amber-700 text-white' : ''
                  }`}
                >
                  {isSubmittingSale
                    ? 'Оформление…'
                    : hasEmptyPrice
                      ? 'Укажите цену'
                      : paymentMethod === 'DEBT'
                        ? `Оформить в долг (${formatMoney(Math.max(0, totalTjs - (parseFloat(downpaymentInput) || 0)))} TJS)`
                        : `Оплатить ${formatMoney(totalTjs)} TJS`}
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>
    )}

      <ConfirmDialog
        open={isClearConfirmOpen}
        title="Очистить корзину?"
        message={`Из корзины будут удалены все ${cart.length} товар(ов). Это действие нельзя отменить.`}
        confirmLabel="Очистить"
        onConfirm={() => {
          setCart([]);
          resetCheckout();
          setIsClearConfirmOpen(false);
        }}
        onCancel={() => setIsClearConfirmOpen(false)}
      />

      {/* Checkout */}
      <Dialog
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title={isStoreScoped ? 'Чек' : `Чек · ${activeStoreName}`}
        subtitle={`${formatMoney(totalTjs)} TJS · ${usdLabel}`}
        maxWidth="lg"
        footer={
          <div className="w-full grid grid-cols-2 gap-2">
            <div className="col-span-2 flex items-center justify-between pb-2 text-sm">
              <span className="text-fg-muted">К оплате</span>
              <strong className="text-lg tabular-nums text-accent">{formatMoney(totalTjs)} TJS</strong>
            </div>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={Plus}
              disabled={isSubmittingSale}
              onClick={handleAddMore}
              className="h-12 text-sm font-bold flex items-center justify-center"
            >
              Добавить ещё
            </Button>
            <Button
              size="lg"
              fullWidth
              leftIcon={paymentMethod === 'DEBT' ? Clock : CheckCircle2}
              loading={isSubmittingSale}
              disabled={!rateReady || hasEmptyPrice || totalTjs <= 0 || isSubmittingSale}
              onClick={handleFinishPayment}
              className={`h-12 text-sm font-bold flex items-center justify-center ${
                paymentMethod === 'DEBT' ? '!bg-amber-600 hover:!bg-amber-700 text-white' : ''
              }`}
            >
              {isSubmittingSale
                ? 'Оформление…'
                : hasEmptyPrice
                  ? 'Укажите цену'
                  : paymentMethod === 'DEBT'
                    ? `Оформить в долг (${formatMoney(Math.max(0, totalTjs - (parseFloat(downpaymentInput) || 0)))} TJS)`
                    : `Оплатить ${formatMoney(totalTjs)} TJS`}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 mb-4">
          {cart.map((item, idx) => {
            const belowCost = isItemBelowCost(item);
            const priceMissing = item.salePriceTjs === undefined || item.salePriceTjs <= 0;

            return (
              <div key={`${item.device.id}-${idx}`} className="p-3 rounded-lg border border-border bg-surface">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg-muted">{item.device.brand} {item.device.model}</p>
                    <p className="text-xs text-fg-subtle">
                      {item.device.ram ? `${item.device.ram} · ` : ''}{item.device.storage} · {item.device.color}
                    </p>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      IMEI: {item.device.imei}{item.device.imei2 ? ` / ${item.device.imei2}` : ''}
                    </p>
                  </div>
                  <IconButton icon={Trash2} tone="danger" size="sm" aria-label="Удалить из корзины" onClick={() => handleRemoveFromCart(idx)} />
                </div>

                <div className="mt-2.5">
                  <label className="block text-xs font-medium text-fg-muted mb-1">
                    Цена продажи (TJS) <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <input step="0.01"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      placeholder="Укажите цену продажи..."
                      value={item.salePriceTjs !== undefined ? item.salePriceTjs : ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        handleUpdatePrice(idx, isNaN(val) ? undefined : val);
                      }}
                      className={`w-full h-11 rounded-lg px-3 pr-14 text-sm font-semibold bg-bg focus:outline-none focus:ring-1 ${
                        priceMissing
                          ? 'border border-warning text-warning focus:border-warning focus:ring-warning'
                          : belowCost
                            ? 'border border-danger text-danger focus:border-danger focus:ring-danger'
                            : 'border border-border text-accent focus:border-accent focus:ring-accent'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-fg-subtle">TJS</span>
                  </div>

                  {priceMissing && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Обязательное поле
                    </p>
                  )}
                  {belowCost && !priceMissing && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-danger font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Цена ниже себестоимости
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-1">
          <CustomerPaymentControls
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            totalTjs={totalTjs}
            cashAmountInput={cashAmountInput}
            setCashAmountInput={setCashAmountInput}
            cardAmountInput={cardAmountInput}
            setCardAmountInput={setCardAmountInput}
            customerNameInput={customerNameInput}
            setCustomerNameInput={setCustomerNameInput}
            customerPhoneInput={customerPhoneInput}
            setCustomerPhoneInput={setCustomerPhoneInput}
            selectedCustomerId={selectedCustomerId}
            setSelectedCustomerId={setSelectedCustomerId}
            customerSuggestions={customerSuggestions}
            setCustomerSuggestions={setCustomerSuggestions}
            downpaymentInput={downpaymentInput}
            setDownpaymentInput={setDownpaymentInput}
            downpaymentMethod={downpaymentMethod}
            setDownpaymentMethod={setDownpaymentMethod}
          />
        </div>
      </Dialog>

      <SaleReceiptDialog
        receiptNumber={completedReceiptNumber}
        sale={completedSale}
        storeAddress={completedSale ? stores.find((st) => st.id === completedSale.storeId)?.address : undefined}
        showStoreName={!isStoreScoped}
        storeNameFallback={activeStoreName}
        sellerNameFallback={currentUser?.name}
        onClose={() => { setCompletedReceiptNumber(null); focusSearchForScanner(); }}
      />
    </div>
  );
};
