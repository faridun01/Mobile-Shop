import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { formatMoney } from '../../utils/money';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { SaleItem } from '../../types';
import {
  ChevronRight,
  RefreshCw,
  Wrench,
  RotateCcw,
  Receipt,
  ArrowLeft,
  Store,
  Building2,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import { CustomSelect, CustomSelectOption } from '../ui/CustomSelect';
import { formatRam, formatStorage, getPhoneColorHex, formatPhoneColor } from '../../utils/phoneSpecs';
import { SearchBar } from '../ui/SearchBar';
import { DateRangePicker } from '../ui/DateRangePicker';
import { cn } from '../../utils/cn';
import { Select } from '../ui/Input';
import { ImeiBadge } from '../common/CopyImeiButton';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

import { currentBusinessMonth, getBusinessDateKey, monthBounds } from '../../utils/businessDate';
import { summarizeSales } from '../../utils/salesSummary';
import { computeSaleProfit, computeSaleItemProfit } from '../../utils/saleProfit';
import { looksLikeDeviceCode, normalizeScanCode } from '../../utils/scanLookup';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';

type DialogView = 'details' | 'refund' | 'pick-exchange' | 'pick-repair';

export const SalesHistoryPage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const navigate = useNavigate();
  const {
    currentUser,
    sales,
    fetchSalesRange,
    stores,
    devices,
    openScanner,
    setActivePage,
    processRefund,
    isInitialLoading,
    selectedStoreId: globalSelectedStoreId,
    todayRate,
  } = useAppFields(
    'currentUser',
    'sales',
    'fetchSalesRange',
    'stores',
    'devices',
    'openScanner',
    'setActivePage',
    'processRefund',
    'isInitialLoading',
    'selectedStoreId',
    'todayRate'
  );

  const todayStr = getBusinessDateKey();
  const thisMonthStr = currentBusinessMonth();
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'CUSTOM' | 'MONTH'>('TODAY');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedStartDate, setSelectedStartDate] = useState<string>(todayStr);
  const [selectedEndDate, setSelectedEndDate] = useState<string>(todayStr);
  const resetToToday = () => {
    setSelectedMonth('');
    setSelectedStartDate(todayStr);
    setSelectedEndDate(todayStr);
    setPeriodFilter('TODAY');
  };
  const resetToCurrentMonth = () => {
    const { start, end } = monthBounds(thisMonthStr);
    setSelectedMonth(thisMonthStr);
    setSelectedStartDate(start);
    setSelectedEndDate(end);
    setPeriodFilter('MONTH');
  };

  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);

  const storeFilterOptions = useMemo<CustomSelectOption[]>(() => [
    { value: 'ALL', label: 'Все магазины', icon: <Building2 className="w-3.5 h-3.5 text-accent shrink-0" /> },
    ...retailStores.map((s) => ({
      value: s.id,
      label: formatStoreName(s.name),
      icon: <Store className="w-3.5 h-3.5 text-accent shrink-0" />,
      badge: 'Магазин',
    })),
  ], [retailStores]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [dialogView, setDialogView] = useState<DialogView>('details');
  const selectedSale = sales.find((s) => s.id === selectedSaleId) || null;

  const [refundReason, setRefundReason] = useState('');
  const [penaltyFeeTjs, setPenaltyFeeTjs] = useState<string>('0');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  const isSeller = currentUser?.role === 'SELLER';
  const isPartner = currentUser?.role === 'PARTNER';
  const isStoreScoped = isSeller || isPartner;
  const isAdmin = currentUser?.role === 'ADMIN';
  // Admin inside a store sees only that store; Central Cash shows every store.
  const storeCtx = useStoreContext();

  // If store-scoped (seller/partner): bound to their own store.
  // If admin: defaults to whichever retail store is currently selected globally,
  // or 'ALL' if in Central Cash mode (selectedStoreId === 'all' or empty).
  // Changing this filter is purely local to SalesHistoryPage and does NOT switch the global store.
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>(() => {
    if (isStoreScoped) return currentUser?.storeId || '';
    if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
      return globalSelectedStoreId;
    }
    return 'ALL';
  });

  useEffect(() => {
    if (!isStoreScoped) {
      if (globalSelectedStoreId && globalSelectedStoreId !== 'all') {
        setSelectedStoreFilter(globalSelectedStoreId);
      } else {
        setSelectedStoreFilter('ALL');
      }
    } else {
      setSelectedStoreFilter(currentUser?.storeId || '');
    }
  }, [globalSelectedStoreId, isStoreScoped, currentUser?.storeId]);

  const effectiveFetchStoreId = isStoreScoped
    ? (currentUser?.storeId || undefined)
    : (selectedStoreFilter === 'ALL' ? undefined : selectedStoreFilter);

  // The period's own load state: without it a slow network showed «Продажи не найдены» while
  // the period was still loading, and a failed load only reached the console.
  const [periodLoad, setPeriodLoad] = useState<'loading' | 'done' | 'error'>('loading');
  const [periodLoadAttempt, setPeriodLoadAttempt] = useState(0);

  // Fetch sales for the selected period & store filter (or all stores if selectedStoreFilter === 'ALL')
  useEffect(() => {
    if (isStoreScoped && !effectiveFetchStoreId) { setPeriodLoad('done'); return; }
    let cancelled = false;
    setPeriodLoad('loading');
    fetchSalesRange({
      period: periodFilter === 'TODAY' ? 'TODAY' : (periodFilter === 'MONTH' && selectedMonth ? 'SPECIFIC_MONTH' : undefined),
      month: periodFilter === 'MONTH' ? selectedMonth : undefined,
      startDate: periodFilter === 'CUSTOM' && selectedStartDate ? selectedStartDate : undefined,
      endDate: periodFilter === 'CUSTOM' && selectedEndDate ? selectedEndDate : undefined,
      storeId: effectiveFetchStoreId,
    })
      .then(() => { if (!cancelled) setPeriodLoad('done'); })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load sales for period', e);
        setPeriodLoad('error');
      });
    return () => { cancelled = true; };
  }, [periodFilter, selectedStartDate, selectedEndDate, selectedMonth, effectiveFetchStoreId, fetchSalesRange, dataRefreshRevision, isStoreScoped, periodLoadAttempt]);

  const filteredSales = useMemo(() => {
    if (isStoreScoped && !currentUser?.storeId) return [];
    const todayStr = getBusinessDateKey();

    return sales.filter((sale) => {
      if (currentUser?.role === 'SELLER' && sale.sellerId !== currentUser.id) return false;
      if (isStoreScoped && currentUser?.storeId && sale.storeId !== currentUser.storeId) return false;
      if (!isStoreScoped && selectedStoreFilter !== 'ALL' && sale.storeId !== selectedStoreFilter) return false;

      const saleDateStr = getBusinessDateKey(new Date(sale.date));
      if (periodFilter === 'TODAY' && saleDateStr !== todayStr) return false;
      if (periodFilter === 'MONTH' && selectedMonth && !saleDateStr.startsWith(selectedMonth)) return false;
      if (periodFilter === 'CUSTOM') {
        if (selectedStartDate) {
          const start = selectedStartDate;
          const end = selectedEndDate || selectedStartDate;
          const minDate = start < end ? start : end;
          const maxDate = start < end ? end : start;
          if (saleDateStr < minDate || saleDateStr > maxDate) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          sale.receiptNumber.toString().includes(q) ||
          sale.sellerName.toLowerCase().includes(q) ||
          sale.storeName.toLowerCase().includes(q) ||
          sale.customerName?.toLowerCase().includes(q) ||
          sale.items.some(
            item =>
              item.brand.toLowerCase().includes(q) ||
              item.model.toLowerCase().includes(q) ||
              item.imei.toLowerCase().includes(q) ||
              (item.imei2 && item.imei2.toLowerCase().includes(q))
          );
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, currentUser, isSeller, selectedStoreFilter, periodFilter, selectedStartDate, selectedEndDate, selectedMonth, searchQuery]);

  const periodSummary = useMemo(() => summarizeSales(filteredSales), [filteredSales]);

  const periodProfitSummary = useMemo(() => {
    if (!isAdmin) return { profitUsd: 0, profitTjs: 0, costUsd: 0 };
    let totalProfitUsd = 0;
    let totalProfitTjs = 0;
    let totalCostUsd = 0;
    const fallbackRate = Number(todayRate?.rate) || 0;
    for (const sale of filteredSales) {
      const res = computeSaleProfit(sale, fallbackRate);
      totalProfitUsd += res.profitUsd;
      totalProfitTjs += res.profitTjs;
      totalCostUsd += res.costUsd;
    }
    return {
      profitUsd: Math.round(totalProfitUsd * 100) / 100,
      profitTjs: Math.round(totalProfitTjs),
      costUsd: Math.round(totalCostUsd * 100) / 100,
    };
  }, [filteredSales, isAdmin, todayRate?.rate]);

  const findByReceiptOrImei = (list: typeof sales, code: string) =>
    list.find(s => s.receiptNumber.toString() === code || s.items.some(i => i.imei === code || i.imei2 === code));

  /** Camera scan or Enter (USB/Bluetooth scanner): opens the receipt by number or IMEI. */
  const openSaleByCode = async (rawCode: string, source: 'camera' | 'enter') => {
      const code = normalizeScanCode(rawCode);
      if (!code) return;
      // Enter on a text search ("Ахмад", "iPhone") keeps filtering the list.
      if (source === 'enter' && !/^\d+$/.test(code)) return;
      const matched = findByReceiptOrImei(sales, code);
      if (matched) {
        setSelectedSaleId(matched.id);
        setDialogView('details');
        return;
      }

      // Not in the locally-loaded window — an older receipt still resolves via a
      // targeted server search before falling back to plain text search.
      try {
        const found = await fetchSalesRange({ search: code });
        const serverMatch = findByReceiptOrImei(found, code);
        if (serverMatch) {
          setSelectedSaleId(serverMatch.id);
          setDialogView('details');
          return;
        }
      } catch {
        // fall through
      }

      setSearchQuery(code);
      if (source === 'camera' || looksLikeDeviceCode(code)) {
        setStatus({ tone: 'error', text: `Чек или IMEI «${code}» не найден` });
      }
  };

  const handleScanFinder = () => {
    openScanner((scannedCode) => { void openSaleByCode(scannedCode, 'camera'); });
  };

  const openSale = (id: string) => {
    setSelectedSaleId(id);
    setDialogView('details');
    setStatus(null);
  };

  const closeDialog = () => {
    setSelectedSaleId(null);
  };

  const navigateWithItem = (page: 'EXCHANGE' | 'REPAIR', item: SaleItem) => {
    if (!selectedSale) return;
    const saleReceiptNumber = selectedSale.receiptNumber;
    const customerName = selectedSale.customerName;
    const saleId = selectedSale.id;
    const saleStoreId = selectedSale.storeId;
    const saleStoreName = selectedSale.storeName;
    const saleDate = selectedSale.date;
    setSelectedSaleId(null);
    setActivePage(page);
    navigate(page === 'EXCHANGE' ? '/exchange' : '/repair', {
      state: { saleReceiptNumber, item, customerName, saleId, saleStoreId, saleStoreName, saleDate }
    });
  };

  const handlePickAction = (page: 'EXCHANGE' | 'REPAIR') => {
    if (!selectedSale) return;
    if (selectedSale.items.length === 1) {
      navigateWithItem(page, selectedSale.items[0]);
    } else {
      setDialogView(page === 'EXCHANGE' ? 'pick-exchange' : 'pick-repair');
    }
  };

  // What the customer actually paid (an unpaid debt is written off, not returned) and the penalty.
  const refundCollectedTjs = selectedSale ? Math.max(0, selectedSale.totalTjs - (selectedSale.debtAmountTjs ?? 0)) : 0;
  const penaltyVal = Math.max(0, parseFloat(penaltyFeeTjs.replace(',', '.')) || 0);
  const penaltyError = penaltyVal > refundCollectedTjs + 0.001
    ? `Штраф не может быть больше оплаченной суммы (${formatMoney(refundCollectedTjs)} TJS)`
    : null;

  const handleExecuteRefund = async () => {
    if (!selectedSale || isSubmittingRefund || penaltyError) return;
    if (!refundReason.trim()) {
      setStatus({ tone: 'error', text: 'Укажите причину возврата' });
      return;
    }

    const actualRefundVal = Math.max(0, refundCollectedTjs - penaltyVal);

    setIsSubmittingRefund(true);
    try {
      const res = await processRefund({
        saleId: selectedSale.id,
        reason: refundReason.trim(),
        refundAmountTjs: actualRefundVal,
        penaltyFeeTjs: penaltyVal,
        paymentMethod: refundMethod
      });

      if (res.success) {
        setSelectedSaleId(null);
        setRefundReason('');
        setPenaltyFeeTjs('0');
        setStatus({ tone: 'success', text: `Возврат по чеку #${selectedSale.receiptNumber} оформлен` });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка возврата' });
      }
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const canRefund = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="p-2 sm:p-2.5 border-b border-border bg-surface space-y-1.5 shrink-0">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onScan={handleScanFinder}
          onSubmit={(value) => { void openSaleByCode(value, 'enter'); }}
          placeholder="Чек, IMEI, модель, продавец..."
        />

        <div className="flex items-center justify-between gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {/* Сегодня */}
            <button
              type="button"
              onClick={() => {
                setSelectedStartDate(todayStr);
                setSelectedEndDate(todayStr);
                setSelectedMonth('');
                setPeriodFilter('TODAY');
              }}
              className={cn(
                'h-8 px-2.5 rounded-xl border text-xs font-semibold shrink-0 transition-all select-none shadow-xs cursor-pointer',
                periodFilter === 'TODAY'
                  ? 'border-accent/50 bg-accent/10 text-accent font-bold hover:bg-accent/15'
                  : 'border-border/80 bg-surface text-fg-muted hover:text-fg hover:border-accent/40'
              )}
            >
              Сегодня
            </button>

            {/* Календарь: текущий месяц по умолчанию + выбор дня или диапазона */}
            <DateRangePicker
              startDate={periodFilter === 'CUSTOM' ? selectedStartDate : ''}
              endDate={periodFilter === 'CUSTOM' ? selectedEndDate : ''}
              selectedMonth={periodFilter === 'MONTH' ? selectedMonth : undefined}
              currentMonthStr={thisMonthStr}
              isToday={periodFilter === 'TODAY'}
              isActive={periodFilter === 'MONTH' || periodFilter === 'CUSTOM'}
              onChange={(start, end, monthStr) => {
                if (monthStr) {
                  setSelectedMonth(monthStr);
                  setSelectedStartDate(start);
                  setSelectedEndDate(end);
                  setPeriodFilter('MONTH');
                } else if (start === todayStr && end === todayStr) {
                  setSelectedMonth('');
                  setSelectedStartDate(start);
                  setSelectedEndDate(end);
                  setPeriodFilter('TODAY');
                } else {
                  setSelectedMonth('');
                  setSelectedStartDate(start);
                  setSelectedEndDate(end);
                  setPeriodFilter('CUSTOM');
                }
              }}
              className="shrink-0"
            />

            {(searchQuery || periodFilter !== 'TODAY' || (selectedStoreFilter !== 'ALL' && !isStoreScoped && storeCtx.mode === 'CENTRAL')) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  resetToToday();
                  if (!isStoreScoped) setSelectedStoreFilter('ALL');
                }}
                className="h-8 px-2.5 text-fg-subtle hover:text-danger hover:bg-danger/10 border border-border/70 hover:border-danger/25 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Сбросить все фильтры"
              >
                <X className="w-3.5 h-3.5 text-danger/80" />
                <span className="text-[11px] font-semibold">Сброс</span>
              </button>
            )}
          </div>

          {isAdmin && storeCtx.mode === 'CENTRAL' ? (
            <CustomSelect
              value={selectedStoreFilter}
              onChange={setSelectedStoreFilter}
              options={storeFilterOptions}
              size="sm"
              align="right"
              className="shrink-0"
              title="Фильтр по точке продаж"
            />
          ) : null}
        </div>

        {filteredSales.length > 0 ? (
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle overflow-x-auto pb-0.5 scrollbar-none" aria-label="Итоги за период">
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-fg-muted font-medium shrink-0">
              Чеков: <strong className="text-fg font-semibold">{periodSummary.receipts}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-bold shrink-0">
              {formatMoney(periodSummary.totalTjs)} TJS
            </span>
            {isAdmin && (
              <span className={cn(
                "px-2 py-0.5 rounded-md border font-bold shrink-0 font-mono flex items-center gap-1.5",
                periodProfitSummary.profitUsd >= 0
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "bg-danger/15 border-danger/30 text-danger"
              )}>
                <span className="text-[10px] text-fg-subtle font-sans font-semibold">Прибыль:</span>
                <span>{periodProfitSummary.profitUsd >= 0 ? '+' : ''}${periodProfitSummary.profitUsd.toLocaleString()}</span>
                <span className="opacity-80 font-normal text-[10px]">(~{formatMoney(periodProfitSummary.profitTjs)} TJS)</span>
              </span>
            )}
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border shrink-0">
              Нал: <strong className="text-fg-muted font-medium">{formatMoney(periodSummary.cashTjs)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border shrink-0">
              Банк: <strong className="text-fg-muted font-medium">{formatMoney(periodSummary.cardTjs)}</strong>
            </span>
            {periodSummary.refunded > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-danger/10 border border-danger/20 text-danger font-medium shrink-0">
                Возвратов: <strong>{periodSummary.refunded}</strong>
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {isSeller && !currentUser?.storeId ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-4 shadow-sm">
              <Store className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-fg mb-1">Магазин не привязан</h3>
            <p className="text-xs text-fg-muted leading-relaxed">
              Ваш аккаунт не привязан к торговой точке
            </p>
          </div>
        ) : isInitialLoading || (periodLoad === 'loading' && filteredSales.length === 0) ? (
          <LoadingState label="Загрузка продаж…" />
        ) : periodLoad === 'error' && filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Не удалось загрузить продажи"
            description="Проверьте подключение к интернету и повторите. Показанный список мог быть неполным."
            action={<Button onClick={() => setPeriodLoadAttempt((n) => n + 1)}>Повторить</Button>}
          />
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Продажи не найдены"
            description={
              searchQuery
                ? `По запросу «${searchQuery}» ничего не найдено`
                : periodFilter === 'TODAY'
                ? 'За сегодня еще нет оформленных продаж'
                : `За ${selectedMonth ? selectedMonth : 'выбранный период'} продаж нет`
            }
            action={
              searchQuery ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="!h-9 !px-3 text-xs"
                  onClick={() => setSearchQuery('')}
                >
                  Сбросить поиск
                </Button>
              ) : periodFilter === 'TODAY' ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="!h-9 !px-3 text-xs"
                  onClick={resetToCurrentMonth}
                >
                  Показать продажи за месяц
                </Button>
              ) : (periodFilter === 'CUSTOM' || selectedMonth !== thisMonthStr) ? (
                <Button
                  variant="secondary"
                  size="md"
                  className="!h-9 !px-3 text-xs"
                  onClick={resetToCurrentMonth}
                >
                  Сбросить фильтр дат
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface text-[10px] font-bold text-fg-subtle border-b border-border sticky top-0 z-10 uppercase tracking-wider select-none">
                  <tr>
                    <th className="py-1.5 px-2.5">Чек</th>
                    <th className="py-1.5 px-2.5">Дата и время</th>
                    <th className="py-1.5 px-2.5">Товары</th>
                    {!isStoreScoped && <th className="py-1.5 px-2.5">Точка продаж</th>}
                    <th className="py-1.5 px-2.5">Продавец</th>
                    <th className="py-1.5 px-2.5">Покупатель</th>
                    <th className="py-1.5 px-2.5">Оплата</th>
                    <th className="py-1.5 px-2.5 text-right">Сумма</th>
                    {isAdmin && <th className="py-1.5 px-2.5 text-right">Прибыль</th>}
                    <th className="py-1.5 px-2.5 text-center">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSales.map((sale) => {
                    const timeStr = new Date(sale.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = new Date(sale.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
                    return (
                      <tr
                        key={sale.id}
                        onClick={() => openSale(sale.id)}
                        className="hover:bg-surface-raised/70 active:bg-surface-raised transition-colors cursor-pointer"
                      >
                        <td className="py-1.5 px-2.5 whitespace-nowrap font-bold text-accent font-mono text-xs">
                          #{sale.receiptNumber}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap text-fg-subtle text-[11px] font-mono">
                          {dateStr} {timeStr}
                        </td>
                        <td className="py-1.5 px-2.5 font-medium text-fg max-w-xs truncate text-xs" title={sale.items.map(i => `${i.brand} ${i.model}`).join(', ')}>
                          {sale.items.map(i => `${i.brand} ${i.model}`).join(', ')}
                        </td>
                        {!isStoreScoped && (
                          <td className="py-1.5 px-2.5 whitespace-nowrap text-fg-muted">
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <Store className="w-3 h-3 text-accent shrink-0" />
                              <span>{formatStoreName(sale.storeName)}</span>
                            </span>
                          </td>
                        )}
                        <td className="py-1.5 px-2.5 whitespace-nowrap text-fg-muted text-[11px]">
                          {sale.sellerName}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap text-fg-subtle text-[11px]">
                          {sale.customerName || <span className="opacity-40">—</span>}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap text-[11px]">
                          <span className={sale.paymentMethod === 'DEBT' && (sale.debtAmountTjs ?? 0) > 0 ? 'text-danger font-semibold' : 'text-fg-subtle'}>
                            {sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Банк' : sale.paymentMethod === 'DEBT' ? ((sale.debtAmountTjs ?? 0) > 0 ? `В долг (${formatMoney(sale.debtAmountTjs ?? 0)} TJS)` : 'В долг (погашено)') : 'Смешанная'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap font-mono">
                          {sale.status === 'REFUNDED' ? (
                            <div>
                              <span className="line-through text-fg-subtle text-[11px] block">{formatMoney(sale.totalTjs)} TJS</span>
                              <span className="text-danger font-bold text-xs block">Возврат: {formatMoney(sale.actualRefundAmountTjs ?? sale.totalTjs)} TJS</span>
                            </div>
                          ) : (
                            <span className="font-bold text-fg text-xs">{formatMoney(sale.totalTjs)} TJS</span>
                          )}
                        </td>
                        {isAdmin && (() => {
                          const profit = computeSaleProfit(sale, Number(todayRate?.rate) || 0);
                          return (
                            <td className="py-1.5 px-2.5 text-right whitespace-nowrap font-mono">
                              {sale.status === 'REFUNDED' ? (
                                profit.profitUsd > 0 ? (
                                  <div>
                                    <span className="text-emerald-400 font-bold text-xs block">
                                      +${profit.profitUsd}
                                    </span>
                                    <span className="text-[10px] text-warning block">
                                      штраф {formatMoney(profit.profitTjs)} TJS
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-fg-subtle text-[11px]">$0 (возврат)</span>
                                )
                              ) : (
                                <div>
                                  <span className={cn(
                                    "text-xs font-bold block",
                                    profit.profitUsd >= 0 ? "text-emerald-400" : "text-danger"
                                  )}>
                                    {profit.profitUsd >= 0 ? '+' : ''}${profit.profitUsd.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-fg-subtle block">
                                    ~{profit.profitTjs >= 0 ? '+' : ''}{formatMoney(profit.profitTjs)} TJS
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })()}
                        <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                          {sale.status === 'EXCHANGED' && <Badge tone="accent">Обмен</Badge>}
                          {sale.status === 'REFUNDED' && <Badge tone="danger">Возврат</Badge>}
                          {sale.status === 'COMPLETED' && <Badge tone="neutral">Оплачен</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px) - Beautiful & Compact 2-Line Feed */}
            <div className="md:hidden divide-y divide-border/60">
              {filteredSales.map((sale) => {
                const timeStr = new Date(sale.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const dateStr = new Date(sale.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

                return (
                  <button
                    key={sale.id}
                    onClick={() => openSale(sale.id)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-raised/60 active:bg-surface-raised transition-colors cursor-pointer flex flex-col gap-1 group select-none"
                  >
                    {/* Row 1: Receipt# + Badges + Device Name (Left) | Price + Chevron (Right) */}
                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="font-mono text-[10.5px] font-bold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.2 rounded shrink-0">
                          #{sale.receiptNumber}
                        </span>
                        {sale.status === 'EXCHANGED' && (
                          <Badge tone="accent" className="!text-[10px] !px-1.5 !py-0 shrink-0">Обмен</Badge>
                        )}
                        {sale.status === 'REFUNDED' && (
                          <Badge tone="danger" className="!text-[10px] !px-1.5 !py-0 shrink-0">Возврат</Badge>
                        )}
                        <span className="text-xs font-bold text-fg truncate group-hover:text-accent transition-colors">
                          {sale.items.map(i => `${i.brand} ${i.model}`).join(', ')}
                        </span>
                        {sale.items.length > 1 && (
                          <span className="text-[10px] font-bold text-fg-subtle bg-surface-raised border border-border px-1 py-0.2 rounded shrink-0">
                            +{sale.items.length - 1}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 text-right">
                        {sale.status === 'REFUNDED' ? (
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] line-through text-fg-subtle font-mono">{formatMoney(sale.totalTjs)}</span>
                            <span className="text-xs font-extrabold text-danger font-mono">{formatMoney(sale.actualRefundAmountTjs ?? sale.totalTjs)} TJS</span>
                          </div>
                        ) : (
                          <span className="text-xs font-extrabold text-fg font-mono tracking-tight">
                            {formatMoney(sale.totalTjs)} <span className="text-[10px] text-fg-subtle font-sans font-semibold">TJS</span>
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-fg-subtle shrink-0 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>

                    {/* Row 2: Metadata (Date · Store · Seller · Customer) | Profit + Payment Method Badges */}
                    <div className="flex items-center justify-between gap-2 w-full min-w-0 text-[10.5px]">
                      <div className="flex items-center gap-1 text-fg-subtle min-w-0 flex-1 truncate">
                        <span className="font-mono shrink-0">{dateStr} {timeStr}</span>
                        {!isStoreScoped && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="truncate">{formatStoreName(sale.storeName)}</span>
                          </>
                        )}
                        <span className="opacity-40">·</span>
                        <span className="shrink-0">{sale.sellerName}</span>
                        {sale.customerName && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="truncate">{sale.customerName}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && (() => {
                          const profit = computeSaleProfit(sale, Number(todayRate?.rate) || 0);
                          if (sale.status === 'REFUNDED') {
                            return profit.profitUsd > 0 ? (
                              <span className="text-[10px] font-bold font-mono text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.2 rounded">
                                штраф +${profit.profitUsd % 1 === 0 ? profit.profitUsd.toFixed(0) : profit.profitUsd.toFixed(2)}
                              </span>
                            ) : null;
                          }
                          const isPos = profit.profitUsd >= 0;
                          const valStr = Math.abs(profit.profitUsd) % 1 === 0
                            ? Math.abs(profit.profitUsd).toFixed(0)
                            : Math.abs(profit.profitUsd).toFixed(2);
                          return (
                            <span className={cn(
                              "text-[10px] font-bold font-mono px-1.5 py-0.2 rounded border",
                              isPos
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                : "text-danger bg-danger/10 border-danger/20"
                            )}>
                              {isPos ? '+' : '-'}${valStr}
                            </span>
                          );
                        })()}

                        <span className={cn(
                          "text-[10px] px-1.5 py-0.2 rounded font-medium border shrink-0",
                          sale.paymentMethod === 'CASH'
                            ? "bg-surface-raised border-border text-fg-subtle"
                            : sale.paymentMethod === 'CARD'
                            ? "bg-info/10 border-info/20 text-info"
                            : sale.paymentMethod === 'DEBT'
                            ? (sale.debtAmountTjs ?? 0) > 0
                              ? "bg-danger/10 border-danger/20 text-danger font-semibold"
                              : "bg-surface-raised border-border text-fg-subtle"
                            : "bg-highlight/10 border-highlight/20 text-highlight"
                        )}>
                          {sale.paymentMethod === 'CASH'
                            ? 'Наличные'
                            : sale.paymentMethod === 'CARD'
                            ? 'Банк'
                            : sale.paymentMethod === 'DEBT'
                            ? (sale.debtAmountTjs ?? 0) > 0
                              ? `В долг (${formatMoney(sale.debtAmountTjs ?? 0)} TJS)`
                              : 'В долг (погашено)'
                            : 'Смешанная'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog
        open={!!selectedSale}
        onClose={closeDialog}
        title={selectedSale ? `Чек #${selectedSale.receiptNumber}` : ''}
        subtitle={selectedSale ? new Date(selectedSale.date).toLocaleString('ru-RU') : undefined}
        maxWidth="lg"
        footer={
          !selectedSale ? undefined : dialogView === 'details' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
              <Button variant="secondary" leftIcon={RefreshCw} onClick={() => handlePickAction('EXCHANGE')}>Обмен</Button>
              <Button variant="secondary" leftIcon={Wrench} onClick={() => handlePickAction('REPAIR')}>Ремонт</Button>
              {canRefund && selectedSale.status !== 'REFUNDED' && (
                <Button
                  variant="danger"
                  leftIcon={RotateCcw}
                  className="col-span-2 sm:col-span-1"
                  onClick={() => {
                    setStatus(null);
                    setRefundReason('');
                    setPenaltyFeeTjs('0');
                    setDialogView('refund');
                  }}
                >
                  Возврат
                </Button>
              )}
            </div>
          ) : dialogView === 'refund' ? (
            <>
              <Button variant="secondary" fullWidth disabled={isSubmittingRefund} onClick={() => setDialogView('details')}>Отмена</Button>
              <Button variant="danger" fullWidth loading={isSubmittingRefund} disabled={Boolean(penaltyError)} onClick={handleExecuteRefund}>Подтвердить возврат</Button>
            </>
          ) : (
            <Button variant="secondary" fullWidth leftIcon={ArrowLeft} onClick={() => setDialogView('details')}>Назад</Button>
          )
        }
      >
        {!selectedSale ? null : dialogView === 'details' ? (
          <div className="space-y-3.5">
            <div className="bg-surface p-3.5 rounded-xl border border-border space-y-2 text-sm shadow-2xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {!isStoreScoped && (
                  <span className="inline-flex items-center gap-1.5 font-bold text-fg text-xs">
                    <Store className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span>{formatStoreName(selectedSale.storeName)}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/25 text-accent text-xs font-bold">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>Оператор: {selectedSale.sellerName}</span>
                </span>
              </div>
              {selectedSale.customerName && (
                <div className="text-fg-subtle text-xs pt-1.5 border-t border-border/60 flex items-center gap-1.5">
                  <span className="font-semibold text-fg-muted">Клиент:</span>
                  <span>{selectedSale.customerName}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Товары в чеке</p>
              <div className="divide-y divide-border border border-border rounded-xl bg-surface overflow-hidden shadow-2xs">
                {selectedSale.items.map((item, i) => {
                  const ram = item.ram || devices?.find(d => d.id === item.deviceId || d.imei === item.imei)?.ram;
                  const formattedRam = formatRam(ram);
                  const formattedStorage = formatStorage(item.storage);
                  const colorHex = getPhoneColorHex(item.color);

                  return (
                    <div key={i} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-surface-raised/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-surface-raised border border-border/80 flex items-center justify-center shrink-0 text-accent shadow-2xs">
                          <Smartphone className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-fg truncate">
                            {item.brand} {item.model}
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            {formattedStorage && (
                              <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-xs font-black font-mono text-fg shadow-2xs shrink-0">
                                {formattedStorage}
                              </span>
                            )}

                            {formattedRam && (
                              <span className="px-1.5 py-0.5 rounded-md bg-surface-raised/80 border border-border/70 text-[10px] font-bold font-mono text-fg-subtle shrink-0">
                                {formattedRam}
                              </span>
                            )}

                            {item.color && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised/60 border border-border/60 text-[11px] font-medium text-fg-muted shrink-0">
                                {colorHex && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                                    style={{ backgroundColor: colorHex }}
                                  />
                                )}
                                <span>{formatPhoneColor(item.color)}</span>
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5">
                            <ImeiBadge imei={item.imei} imei2={item.imei2} />
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm sm:text-base font-extrabold text-fg font-mono leading-tight">
                          {formatMoney(item.salePriceTjs)} TJS
                        </p>
                        <p className="text-[11px] text-fg-subtle font-mono mt-0.5 font-medium">
                          ≈ ${formatMoney(item.salePriceUsd)}
                        </p>

                        {isAdmin && (() => {
                          const itemProfit = computeSaleItemProfit(item, selectedSale.exchangeRate || Number(todayRate?.rate) || 0);
                          return (
                            <div className="mt-1.5 pt-1 border-t border-border/60 text-right">
                              <div className="text-[10px] text-fg-subtle flex items-center justify-end gap-1">
                                <span>Закупка:</span>
                                <span className="font-mono text-fg-muted font-medium">${itemProfit.costUsd}</span>
                              </div>
                              <div className={cn(
                                "text-xs font-bold font-mono mt-0.5",
                                itemProfit.profitUsd >= 0 ? "text-emerald-400" : "text-danger"
                              )}>
                                <span>{itemProfit.profitUsd >= 0 ? '+' : ''}${itemProfit.profitUsd.toFixed(2)}</span>
                                <span className="text-[10px] font-normal opacity-80 ml-1">
                                  ({itemProfit.marginPercent >= 0 ? `+${itemProfit.marginPercent}` : itemProfit.marginPercent}%)
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedSale.exchangeEvents && selectedSale.exchangeEvents.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-accent tracking-wide">История обменов</p>
                <div className="p-3 bg-accent/10 border border-accent/30 rounded-xl space-y-2 text-sm shadow-2xs">
                  {selectedSale.exchangeEvents.map((ev, i) => (
                    <div key={i} className="border-b border-accent/20 pb-2 last:border-b-0 last:pb-0">
                      <p className="text-accent font-semibold text-xs">Обмен от {new Date(ev.date).toLocaleDateString('ru-RU')}</p>
                      <p className="text-fg-subtle text-xs">Сдан: {ev.returnedModel} (IMEI {ev.returnedImei}) за {formatMoney(ev.exchangeInValueTjs)} TJS</p>
                      <p className="text-fg-subtle text-xs">Выдан: {ev.replacementModel} (IMEI {ev.replacementImei}) за {formatMoney(ev.newPriceTjs)} TJS</p>
                      <p className="text-accent text-xs font-semibold mt-0.5">
                        Доплата: {ev.differenceTjs >= 0 ? `+${formatMoney(ev.differenceTjs)} TJS` : `${formatMoney(ev.differenceTjs)} TJS`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-surface p-3.5 rounded-xl border border-border space-y-2 text-sm shadow-2xs">
              {(() => {
                const cashPaid = selectedSale.cashAmountTjs || 0;
                const cardPaid = selectedSale.cardAmountTjs || 0;
                const tradeInPaid = selectedSale.exchangeTradeInCreditTjs || 0;
                const initialPaidAtSale = cashPaid + cardPaid + tradeInPaid;
                const currentDebt = selectedSale.debtAmountTjs ?? 0;
                const initialDebt = Math.max(0, Math.round((selectedSale.totalTjs - initialPaidAtSale) * 100) / 100);
                const repaidLater = Math.max(0, Math.round((initialDebt - currentDebt) * 100) / 100);
                const totalPaidSoFar = initialPaidAtSale + repaidLater;
                const hasDebtHistory = initialDebt > 0 || currentDebt > 0 || selectedSale.paymentMethod === 'DEBT';

                return (
                  <>
                    <div className="flex justify-between items-center pb-1.5 border-b border-border/60">
                      <span className="text-fg-subtle text-xs font-semibold">Способ оплаты</span>
                      <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-xs font-bold text-fg">
                        {selectedSale.paymentMethod === 'CASH'
                          ? 'Наличные'
                          : selectedSale.paymentMethod === 'CARD'
                          ? 'Банк'
                          : selectedSale.paymentMethod === 'DEBT'
                          ? initialPaidAtSale > 0
                            ? 'Частично в долг'
                            : 'В долг'
                          : 'Смешанная'}
                      </span>
                    </div>

                    {cashPaid > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-fg-subtle">
                          {hasDebtHistory ? 'Наличными при покупке' : 'Наличными'}
                        </span>
                        <span className="text-fg font-mono font-bold">{formatMoney(cashPaid)} TJS</span>
                      </div>
                    )}

                    {cardPaid > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-fg-subtle">
                          {hasDebtHistory ? 'Банк при покупке' : 'Банк'}
                        </span>
                        <span className="text-fg font-mono font-bold">{formatMoney(cardPaid)} TJS</span>
                      </div>
                    )}

                    {tradeInPaid > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-fg-subtle">Зачёт Trade-In</span>
                        <span className="text-fg font-mono font-bold">{formatMoney(tradeInPaid)} TJS</span>
                      </div>
                    )}

                    {repaidLater > 0 && (
                      <div className="flex justify-between text-xs pt-1 border-t border-border/60">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Погашено по долгу позже
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                          +{formatMoney(repaidLater)} TJS
                        </span>
                      </div>
                    )}

                    {hasDebtHistory && (initialPaidAtSale > 0 || repaidLater > 0) && (
                      <div className="flex justify-between text-xs text-fg-subtle">
                        <span>Всего фактически оплачено</span>
                        <span className="font-mono font-semibold text-fg">{formatMoney(totalPaidSoFar)} TJS</span>
                      </div>
                    )}

                    {currentDebt > 0 ? (
                      <div className="flex justify-between text-xs pt-1 border-t border-border/60">
                        <span className="text-danger font-semibold">Остаток долга</span>
                        <span className="text-danger font-mono font-bold">{formatMoney(currentDebt)} TJS</span>
                      </div>
                    ) : hasDebtHistory && initialDebt > 0 ? (
                      <div className="flex justify-between text-xs pt-1 border-t border-border/60">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Долг полностью погашен</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">0.00 TJS</span>
                      </div>
                    ) : null}
                  </>
                );
              })()}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Итого</span>
                <span className="text-base sm:text-lg font-black font-mono text-accent">
                  {formatMoney(selectedSale.totalTjs)} TJS
                </span>
              </div>

              {isAdmin && (() => {
                const saleProfit = computeSaleProfit(selectedSale, Number(todayRate?.rate) || 0);
                return (
                  <div className="flex justify-between items-center pt-2.5 mt-2 border-t border-border/80 bg-surface-raised/70 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-2xs" />
                        Чистая прибыль
                      </span>
                      <span className="text-[10px] text-fg-subtle">
                        Себестоимость: ${saleProfit.costUsd.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      {selectedSale.status === 'REFUNDED' ? (
                        saleProfit.profitUsd > 0 ? (
                          <div>
                            <span className="text-base sm:text-lg font-black font-mono text-emerald-400 block leading-tight">
                              +${saleProfit.profitUsd}
                            </span>
                            <span className="text-[11px] text-warning font-mono block">
                              штраф {formatMoney(saleProfit.profitTjs)} TJS
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-fg-subtle font-mono block">$0 (возврат)</span>
                        )
                      ) : (
                        <div>
                          <span className={cn(
                            "text-base sm:text-lg font-black font-mono block leading-tight",
                            saleProfit.profitUsd >= 0 ? "text-emerald-400" : "text-danger"
                          )}>
                            {saleProfit.profitUsd >= 0 ? '+' : ''}${saleProfit.profitUsd.toFixed(2)}
                          </span>
                          <span className="text-[11px] text-fg-subtle font-mono block">
                            ≈ {saleProfit.profitTjs >= 0 ? '+' : ''}{formatMoney(saleProfit.profitTjs)} TJS
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {selectedSale.status === 'REFUNDED' && (
              <div className="bg-danger/10 border border-danger/30 p-3 rounded-lg space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-danger tracking-wide">
                  Возврат {selectedSale.refundedAt ? `от ${new Date(selectedSale.refundedAt).toLocaleString('ru-RU')}` : ''}
                </p>
                {selectedSale.refundReason && (
                  <p className="text-xs text-fg-subtle">Причина: {selectedSale.refundReason}</p>
                )}
                {(selectedSale.penaltyFeeTjs ?? 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-fg-subtle ">Штраф удержан</span>
                    <span className="text-warning font-semibold">{formatMoney(selectedSale.penaltyFeeTjs ?? 0)} TJS</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-danger/20 font-semibold">
                  <span className="text-fg-muted text-xs">Возвращено клиенту</span>
                  <span className="text-danger text-base">
                    {formatMoney(selectedSale.actualRefundAmountTjs ?? selectedSale.totalTjs)} TJS
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : dialogView === 'refund' ? (
          <div className="space-y-3.5">
            <p className="text-xs text-fg-subtle">Товары будут оприходованы на склад по исходной себестоимости закупки ($).</p>

            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">Причина возврата <span className="text-danger">*</span></label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Причина возврата..."
                className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger"
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium text-fg-muted mb-1">
                <span>Удержать штраф за возврат (TJS)</span>
                <span className="text-warning font-normal">100% в чистую прибыль</span>
              </label>
              <div className="mb-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={penaltyFeeTjs}
                  onChange={(e) => setPenaltyFeeTjs(e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(penaltyError)}
                  className={`w-full h-11 rounded-lg bg-bg border px-3 text-sm font-semibold text-warning focus:outline-none focus:ring-1 ${penaltyError ? 'border-danger focus:border-danger focus:ring-danger' : 'border-border focus:border-warning focus:ring-warning'}`}
                />
                {penaltyError && <p className="mt-1 text-xs text-danger" role="alert">{penaltyError}</p>}
              </div>

              <div className="p-3 rounded-lg bg-surface border border-border space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Сумма в чеке</span>
                  <span className="text-fg-muted">{formatMoney(selectedSale.totalTjs)} TJS</span>
                </div>
                {(selectedSale.debtAmountTjs ?? 0) > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Непогашенный долг (будет списан)</span>
                    <span>{formatMoney(selectedSale.debtAmountTjs ?? 0)} TJS</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span className="text-fg-muted">Возврат покупателю</span>
                  <span className="text-accent">{formatMoney(Math.max(0, refundCollectedTjs - penaltyVal))} TJS</span>
                </div>
                {penaltyVal > 0 && (
                  <div className="flex justify-between pt-1 border-t border-border font-semibold">
                    <span className="text-warning">Штраф за возврат</span>
                    <span className="text-warning">+{formatMoney(penaltyVal)} TJS</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1">Способ возврата денег</label>
              <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as 'CASH' | 'CARD')} className="w-full">
                <option value="CASH">Наличные из кассы</option>
                <option value="CARD">Банк</option>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-fg-subtle mb-1">
              В чеке несколько товаров — выберите, какой из них {dialogView === 'pick-exchange' ? 'обменять' : 'принять в ремонт'}.
            </p>
            {selectedSale.items.map((item, i) => (
              <button
                key={i}
                onClick={() => navigateWithItem(dialogView === 'pick-exchange' ? 'EXCHANGE' : 'REPAIR', item)}
                className="w-full p-3 rounded-lg border border-border bg-surface active:bg-surface-raised text-left flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg-muted">{item.brand} {item.model}</p>
                  <p className="text-xs text-fg-subtle">{item.ram ? `${item.ram} · ` : ''}{item.storage} · {formatPhoneColor(item.color)} · IMEI: {item.imei}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
};
