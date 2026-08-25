import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Sale } from '../../types';
import {
  Search,
  Scan,
  Calendar,
  X,
  ChevronRight,
  RefreshCw,
  Wrench,
  RotateCcw,
  Receipt,
  User as UserIcon,
  Store as StoreIcon,
  AlertCircle,
  Download
} from 'lucide-react';
import { exportSalesReport } from '../../utils/exportReports';

export const SalesHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    sales,
    stores,
    openScanner,
    setActivePage,
    processRefund
  } = useApp();

  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'>('SPECIFIC_MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const selectedSale = sales.find((s) => s.id === selectedSaleId) || null;

  // Refund dialog state
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [penaltyFeeTjs, setPenaltyFeeTjs] = useState<string>('0');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [refundError, setRefundError] = useState<string | null>(null);

  // Role permissions: Seller sees ONLY their own sales; Admin & Partner see all
  const filteredSales = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    return sales.filter((sale) => {
      // 1. Role Filter
      if (currentUser?.role === 'SELLER' && sale.sellerId !== currentUser.id) {
        return false;
      }

      // 2. Store Filter
      if (selectedStoreId !== 'ALL' && sale.storeId !== selectedStoreId) {
        return false;
      }

      // 3. Period Filter
      const saleDateStr = sale.date.split('T')[0];
      if (periodFilter === 'TODAY' && saleDateStr !== todayStr) {
        return false;
      }
      if (periodFilter === 'MONTH' && !saleDateStr.startsWith(currentMonthStr)) {
        return false;
      }
      if (periodFilter === 'SPECIFIC_MONTH' && !saleDateStr.startsWith(selectedMonth)) {
        return false;
      }

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesReceipt = sale.receiptNumber.toString().includes(q);
        const matchesSeller = sale.sellerName.toLowerCase().includes(q);
        const matchesStore = sale.storeName.toLowerCase().includes(q);
        const matchesCustomer = sale.customerName?.toLowerCase().includes(q);
        const matchesItem = sale.items.some(
          item =>
            item.brand.toLowerCase().includes(q) ||
            item.model.toLowerCase().includes(q) ||
            item.imei.toLowerCase().includes(q) ||
            (item.imei2 && item.imei2.toLowerCase().includes(q)) ||
            (item.barcode && item.barcode.toLowerCase().includes(q))
        );

        if (!matchesReceipt && !matchesSeller && !matchesStore && !matchesCustomer && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [sales, currentUser, selectedStoreId, selectedMonth, periodFilter, searchQuery]);

  // Scan handler to jump straight to sale
  const handleScanFinder = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const matched = sales.find(s =>
        s.receiptNumber.toString() === code ||
        s.items.some(i => i.imei === code || i.imei2 === code || i.barcode === code)
      );

      if (matched) {
        setSelectedSaleId(matched.id);
      } else {
        setSearchQuery(code);
      }
    });
  };

  const handleExecuteRefund = async () => {
    if (!selectedSale) return;
    if (!refundReason.trim()) {
      setRefundError('Укажите причину возврата');
      return;
    }

    const penaltyVal = Math.max(0, parseFloat(penaltyFeeTjs) || 0);
    const actualRefundVal = Math.max(0, selectedSale.totalTjs - penaltyVal);

    const res = await processRefund({
      saleId: selectedSale.id,
      reason: refundReason.trim(),
      refundAmountTjs: actualRefundVal,
      penaltyFeeTjs: penaltyVal,
      paymentMethod: refundMethod
    });

    if (res.success) {
      setIsRefundDialogOpen(false);
      setSelectedSaleId(null);
      setRefundReason('');
      setPenaltyFeeTjs('0');
    } else {
      setRefundError(res.message || 'Ошибка возврата');
    }
  };

  const canRefund = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300">
      {/* Top Filter Bar */}
      <div className="p-2.5 border-b border-slate-800 bg-[#0F1219] space-y-2 shrink-0">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Номер чека / IMEI / модель / продавец..."
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
            onClick={handleScanFinder}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 rounded text-xs font-mono font-bold text-emerald-400 border border-slate-800 hover:border-slate-700 transition-colors shrink-0"
            title="Сканировать чек или проданный IMEI"
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">СКАНЕР</span>
          </button>
        </div>

        {/* Period & Store Selector & Export */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setPeriodFilter('TODAY')}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
                periodFilter === 'TODAY'
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              СЕГОДНЯ
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedMonth(e.target.value);
                  setPeriodFilter('SPECIFIC_MONTH');
                }
              }}
              onClick={() => setPeriodFilter('SPECIFIC_MONTH')}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold transition-colors bg-[#0B0E14] focus:outline-none cursor-pointer ${
                periodFilter === 'SPECIFIC_MONTH'
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
              title="Выберите месяц"
            />
            <button
              type="button"
              onClick={() => setPeriodFilter('ALL')}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
                periodFilter === 'ALL'
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              ВСЕ ПРОДАЖИ
            </button>

            {/* Store Filter Dropdown */}
            {currentUser?.role !== 'SELLER' && (
              <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
                <StoreIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="bg-[#0B0E14] border border-slate-800 text-emerald-400 text-xs font-mono font-bold rounded px-2.5 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="ALL">★ ВСЕ МАГАЗИНЫ</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
            <button
              onClick={() => exportSalesReport(filteredSales)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 text-[10px] font-mono font-bold transition-colors shrink-0"
              title="Скачать отфильтрованные продажи в CSV"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">ЭКСПОРТ (CSV)</span>
            </button>
          )}
        </div>
      </div>

      {/* Sales Flat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 bg-[#0B0E14]">
        {filteredSales.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-mono">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-25" />
            <p className="text-xs uppercase tracking-wider">Продажи не найдены</p>
            <p className="text-[11px] text-slate-600 mt-1">Попробуйте изменить период или поисковый запрос</p>
          </div>
        ) : (
          filteredSales.map((sale) => {
            const timeStr = new Date(sale.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const dateStr = new Date(sale.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

            return (
              <button
                key={sale.id}
                onClick={() => setSelectedSaleId(sale.id)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800/30 active:bg-slate-800/50 flex items-center justify-between transition-colors group"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      #{sale.receiptNumber}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {dateStr} {timeStr}
                    </span>
                    {sale.status === 'EXCHANGED' && (
                      <span className="text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 rounded">
                        ОБМЕН
                      </span>
                    )}
                    {sale.status === 'REFUNDED' && (
                      <span className="text-[9px] font-mono font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1.5 rounded">
                        ВОЗВРАТ
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-bold text-slate-200 mt-0.5 truncate group-hover:text-emerald-400 transition-colors">
                    {sale.items.map(i => `${i.brand} ${i.model}`).join(', ')}
                  </p>

                  <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500 mt-0.5">
                    <span>{sale.storeName}</span>
                    <span>•</span>
                    <span>{sale.sellerName}</span>
                    {sale.customerName && (
                      <>
                        <span>•</span>
                        <span className="text-slate-400">{sale.customerName}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 flex items-center space-x-3">
                  <div>
                    <p className="text-xs font-mono font-bold text-slate-100">
                      {sale.totalTjs.toLocaleString()} TJS
                    </p>
                    <p className="text-[9px] font-mono uppercase text-slate-500">
                      {sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Смешанная'}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* MODAL: Sale Details */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-lg bg-[#0F1219] border border-slate-800 p-5 shadow-2xl text-slate-200 max-h-[90vh] flex flex-col font-mono">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 shrink-0">
              <div>
                <span className="text-[10px] uppercase text-slate-500">ИНФОРМАЦИЯ О ЧЕКЕ</span>
                <h3 className="text-base font-bold font-mono text-emerald-400">
                  ЧЕК #{selectedSale.receiptNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSaleId(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5 overflow-y-auto flex-1 pr-1">
              {/* Meta information formatted as list */}
              <div className="bg-[#0B0E14] p-3 rounded-lg border border-slate-800 space-y-1 font-mono text-xs">
                <div className="text-slate-200 font-semibold">
                  {new Date(selectedSale.date).toLocaleString('ru-RU')}
                </div>
                <div className="text-slate-300">
                  {selectedSale.storeName}
                </div>
                <div className="text-emerald-400 font-bold uppercase">
                  ОПЕРАТОР: {selectedSale.sellerName}
                </div>
                {selectedSale.customerName && (
                  <div className="text-slate-400 text-[11px] pt-1 border-t border-slate-800/80 mt-1">
                    КЛИЕНТ: {selectedSale.customerName}
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ТОВАРЫ В ЧЕКЕ</p>
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded bg-[#0B0E14]">
                  {selectedSale.items.map((item, i) => (
                    <div key={i} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-200">
                          {item.brand} {item.model}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {item.storage} • {item.color}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                          IMEI: {item.imei}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="text-xs font-bold text-slate-100">
                          {item.salePriceTjs.toLocaleString()} TJS
                        </p>
                        <p className="text-[10px] font-mono text-slate-500">
                          ≈ ${item.salePriceUsd}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exchange Events if any */}
              {selectedSale.exchangeEvents && selectedSale.exchangeEvents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">ИСТОРИЯ ОБМЕНОВ</p>
                  <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded space-y-2 text-xs">
                    {selectedSale.exchangeEvents.map((ev, i) => (
                      <div key={i} className="border-b border-emerald-500/20 pb-2 last:border-b-0 last:pb-0">
                        <p className="text-emerald-300 font-bold text-[11px]">Обмен от {new Date(ev.date).toLocaleDateString('ru-RU')}</p>
                        <p className="text-slate-400 text-[10px]">Сдан: {ev.returnedModel} (IMEI {ev.returnedImei}) за {ev.exchangeInValueTjs} TJS</p>
                        <p className="text-slate-400 text-[10px]">Выдан: {ev.replacementModel} (IMEI {ev.replacementImei}) за {ev.newPriceTjs} TJS</p>
                        <p className="text-emerald-400 text-[10px] font-mono font-bold mt-0.5">
                          Доплата: {ev.differenceTjs >= 0 ? `+${ev.differenceTjs} TJS` : `${ev.differenceTjs} TJS`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className="bg-[#0B0E14] p-3 rounded border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-[11px] uppercase">СПОСОБ ОПЛАТЫ:</span>
                  <span className="font-bold text-slate-200">
                    {selectedSale.paymentMethod === 'CASH' ? 'Наличные' : selectedSale.paymentMethod === 'CARD' ? 'Карта' : 'Смешанная'}
                  </span>
                </div>
                {selectedSale.cashAmountTjs > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-[10px] uppercase">НАЛИЧНЫМИ:</span>
                    <span className="font-mono text-slate-300">{selectedSale.cashAmountTjs.toLocaleString()} TJS</span>
                  </div>
                )}
                {selectedSale.cardAmountTjs > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-[10px] uppercase">КАРТОЙ:</span>
                    <span className="font-mono text-slate-300">{selectedSale.cardAmountTjs.toLocaleString()} TJS</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-800 text-xs font-bold">
                  <span className="text-slate-300 uppercase">ИТОГО:</span>
                  <span className="font-mono text-emerald-400 text-sm">{selectedSale.totalTjs.toLocaleString()} TJS</span>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
              <button
                onClick={() => {
                  const firstItem = selectedSale.items[0];
                  const saleReceiptNumber = selectedSale.receiptNumber;
                  const customerName = selectedSale.customerName;
                  setSelectedSaleId(null);
                  setActivePage('EXCHANGE');
                  navigate('/exchange', {
                    state: {
                      saleReceiptNumber,
                      item: firstItem,
                      customerName
                    }
                  });
                }}
                className="py-1.5 px-3 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-center space-x-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>ОБМЕН</span>
              </button>

              <button
                onClick={() => {
                  const firstItem = selectedSale.items[0];
                  const saleReceiptNumber = selectedSale.receiptNumber;
                  const customerName = selectedSale.customerName;
                  setSelectedSaleId(null);
                  setActivePage('REPAIR');
                  navigate('/repair', {
                    state: {
                      saleReceiptNumber,
                      item: firstItem,
                      customerName
                    }
                  });
                }}
                className="py-1.5 px-3 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>РЕМОНТ</span>
              </button>

              {canRefund && selectedSale.status !== 'REFUNDED' && (
                <button
                  onClick={() => {
                    setRefundError(null);
                    setRefundReason('');
                    setPenaltyFeeTjs('0');
                    setIsRefundDialogOpen(true);
                  }}
                  className="py-1.5 px-3 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center space-x-1.5 col-span-2 sm:col-span-1 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>ВОЗВРАТ</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: Refund confirmation */}
      {isRefundDialogOpen && selectedSale && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4 font-mono">
          <div className="w-full max-w-md rounded-lg bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl">
            <h3 className="text-xs font-bold text-rose-400 flex items-center space-x-1.5 mb-2 uppercase tracking-wider">
              <RotateCcw className="w-4 h-4" />
              <span>ВОЗВРАТ ПО ЧЕКУ #{selectedSale.receiptNumber}</span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-3 font-sans">
              Товары будут оприходованы на склад по своей исходной себестоимости закупки ($).
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1 font-bold">Причина возврата *:</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Брак / Отказ покупателя / Ошибка"
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-400 mb-1 font-bold items-center justify-between">
                  <span>Удержать штраф за возврат (TJS):</span>
                  <span className="text-[9px] text-amber-400 font-normal">100% В ЧИСТУЮ ПРИБЫЛЬ</span>
                </label>
                <div className="flex items-center space-x-1.5 mb-1.5">
                  <input
                    type="number"
                    min="0"
                    max={selectedSale.totalTjs}
                    value={penaltyFeeTjs}
                    onChange={(e) => setPenaltyFeeTjs(e.target.value)}
                    placeholder="0 TJS"
                    className="flex-1 rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs font-mono text-amber-400 font-bold focus:border-amber-500 focus:outline-none"
                  />
                  {[0, 5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPenaltyFeeTjs(Math.round((selectedSale.totalTjs * pct) / 100).toString())}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-mono font-bold text-slate-300 rounded transition-colors"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>

                {/* Calculation Summary Box */}
                <div className="p-2.5 rounded bg-[#0B0E14] border border-slate-800/80 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Сумма в чеке:</span>
                    <span className="font-mono text-slate-200">{selectedSale.totalTjs.toLocaleString()} TJS</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-300">Возврат покупателю:</span>
                    <span className="font-mono text-emerald-400">
                      {Math.max(0, selectedSale.totalTjs - (parseFloat(penaltyFeeTjs) || 0)).toLocaleString()} TJS
                    </span>
                  </div>
                  {(parseFloat(penaltyFeeTjs) || 0) > 0 && (
                    <div className="flex justify-between pt-1 border-t border-slate-800/80 font-bold">
                      <span className="text-amber-400">Штраф за возврат:</span>
                      <span className="font-mono text-amber-400">
                        +{(parseFloat(penaltyFeeTjs) || 0).toLocaleString()} TJS
                      </span>
                    </div>
                  )}
                  <p className="text-[9px] text-slate-500 pt-1 italic font-sans">
                    ★ Телефон возвращается в складской остаток по исходной себестоимости закупки.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1 font-bold">Способ возврата денег:</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 focus:border-rose-500 focus:outline-none cursor-pointer"
                >
                  <option value="CASH">Наличные из кассы</option>
                  <option value="CARD">Безналичный возврат</option>
                </select>
              </div>

              {refundError && (
                <p className="text-xs text-rose-400 flex items-center">
                  <AlertCircle className="w-3.5 h-3.5 mr-1 shrink-0" />
                  {refundError}
                </p>
              )}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => setIsRefundDialogOpen(false)}
                className="flex-1 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 transition-colors"
              >
                ОТМЕНА
              </button>
              <button
                onClick={handleExecuteRefund}
                className="flex-1 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-[0_0_10px_rgba(244,63,94,0.3)] transition-colors"
              >
                ПОДТВЕРДИТЬ ВОЗВРАТ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
