import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BarChart3,
  DollarSign,
  Smartphone,
  Store as StoreIcon,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Package,
  Landmark
} from 'lucide-react';
import { exportSalesReport, exportInventoryReport, exportExpensesReport, exportRepairsReport } from '../../utils/exportReports';

export const ReportsPage: React.FC = () => {
  const {
    currentUser,
    sales,
    devices,
    expenses,
    repairs,
    suppliers,
    stores,
    supplierBonuses,
    todayRate
  } = useApp();

  const [period, setPeriod] = useState<'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [selectedStore, setSelectedStore] = useState<string>('all');

  const rate = todayRate?.rate || 9.50;

  // Filtered dataset & financial calculations
  const filteredData = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = new Date().toISOString().substring(0, 7);

    // 1. Sales filtering (exclude refunded sales)
    let periodSales = sales.filter(s => s.status !== 'REFUNDED');
    if (period === 'TODAY') {
      periodSales = periodSales.filter(s => s.date.startsWith(todayStr));
    } else if (period === 'MONTH') {
      periodSales = periodSales.filter(s => s.date.startsWith(currentMonthStr));
    } else if (period === 'SPECIFIC_MONTH') {
      periodSales = periodSales.filter(s => s.date.startsWith(selectedMonth));
    }

    if (selectedStore !== 'all') {
      periodSales = periodSales.filter(s => s.storeId === selectedStore);
    }

    // 2. Expenses filtering
    let periodExpenses = expenses;
    if (period === 'TODAY') {
      periodExpenses = expenses.filter(e => e.date.startsWith(todayStr));
    } else if (period === 'MONTH') {
      periodExpenses = expenses.filter(e => e.date.startsWith(currentMonthStr));
    } else if (period === 'SPECIFIC_MONTH') {
      periodExpenses = expenses.filter(e => e.date.startsWith(selectedMonth));
    }

    if (selectedStore !== 'all') {
      periodExpenses = periodExpenses.filter(e => e.storeId === selectedStore);
    }

    // Revenue, COGS, Gross Profit in USD
    let revenueUsd = 0;
    let cogsUsd = 0;
    let unitsSold = 0;
    const modelCounts: Record<string, { count: number; revenueUsd: number; cogsUsd: number; profitUsd: number }> = {};

    periodSales.forEach(sale => {
      const saleRate = sale.exchangeRate || rate;
      const saleRevenueUsd = sale.totalUsd || +(sale.totalTjs / saleRate).toFixed(2);
      revenueUsd += saleRevenueUsd;

      // The server persists recognized profit because an exchanged sale cannot be
      // reconstructed from only the current SaleItem: the returned phone is back in
      // inventory and the replacement has a different cost basis.
      const fallbackCostUsd = sale.items.reduce((sum, item) => sum + (item.costBasisUsd || item.purchaseCostUsd || 0), 0);
      const saleProfitUsd = sale.recognizedProfitUsd ?? (saleRevenueUsd - fallbackCostUsd);
      cogsUsd += saleRevenueUsd - saleProfitUsd;

      sale.items.forEach(item => {
        unitsSold++;
        const itemCostUsd = item.costBasisUsd || item.purchaseCostUsd || 0;
        const itemPriceUsd = item.salePriceUsd || +(item.salePriceTjs / saleRate).toFixed(2);
        const itemProfitUsd = +(itemPriceUsd - itemCostUsd).toFixed(2);

        const modelKey = `${item.brand} ${item.model}`.trim();
        if (!modelCounts[modelKey]) {
          modelCounts[modelKey] = { count: 0, revenueUsd: 0, cogsUsd: 0, profitUsd: 0 };
        }
        modelCounts[modelKey].count += 1;
        modelCounts[modelKey].revenueUsd += itemPriceUsd;
        modelCounts[modelKey].cogsUsd += itemCostUsd;
        modelCounts[modelKey].profitUsd += itemProfitUsd;
      });
    });

    const grossProfitUsd = +(revenueUsd - cogsUsd).toFixed(2);
    const totalRevenueUsd = +revenueUsd.toFixed(2);
    const revenueTjs = Math.round(totalRevenueUsd * rate);
    const cogsTjs = Math.round(cogsUsd * rate);
    const grossProfitTjs = Math.round(grossProfitUsd * rate);
    const grossMarginPercent = revenueUsd > 0 ? +((grossProfitUsd / revenueUsd) * 100).toFixed(1) : 0;

    // Operating expenses converted to USD
    const expensesTjs = periodExpenses.reduce((acc, e) => acc + (e.amountTjs || 0), 0);
    const expensesUsd = +periodExpenses.reduce((acc, e) => acc + (e.amountUsd ?? ((e.amountTjs || 0) / (e.exchangeRate || rate))), 0).toFixed(2);

    // Cash supplier bonuses in period count 100% towards Net Profit
    const periodCashBonusesUsd = (supplierBonuses || [])
      .filter(b => {
        if (b.bonusType !== 'CASH_DISCOUNT' || !b.amountUsd) return false;
        const bDate = b.dateReceived || b.date;
        if (!bDate) return true;
        if (period === 'TODAY') return bDate === todayStr;
        if (period === 'MONTH') return bDate.startsWith(currentMonthStr);
        if (period === 'SPECIFIC_MONTH') return bDate.startsWith(selectedMonth);
        return true;
      })
      .reduce((acc, b) => acc + (b.amountUsd || 0), 0);

    // Refund penalties in period count 100% towards Net Profit
    const periodRefundPenaltiesUsd = (sales || [])
      .filter(s => {
        if (s.status !== 'REFUNDED' || !s.penaltyFeeUsd) return false;
        if (selectedStore !== 'all' && s.storeId !== selectedStore) return false;
        const rDate = (s.refundedAt || s.date || '').split('T')[0];
        if (period === 'TODAY') return rDate === todayStr;
        if (period === 'MONTH') return rDate.startsWith(currentMonthStr);
        if (period === 'SPECIFIC_MONTH') return rDate.startsWith(selectedMonth);
        return true;
      })
      .reduce((acc, s) => acc + (s.penaltyFeeUsd || 0), 0);

    // Net Profit in USD & TJS (sales gross profit - all expenses, including repair
    // parts/labor which is already inside expensesUsd - + 100% cash supplier bonuses
    // + 100% refund penalties).
    const netProfitUsd = +(grossProfitUsd - expensesUsd + periodCashBonusesUsd + periodRefundPenaltiesUsd).toFixed(2);
    const netProfitTjs = Math.round(netProfitUsd * rate);

    // Balance Sheet Assets & Liabilities in USD (store-aware)
    const targetDevices = selectedStore === 'all' 
      ? devices 
      : devices.filter(d => d.locationId === selectedStore);

    const inStockDevices = targetDevices.filter(d => 
      d.status === 'STORE_STOCK' || d.status === 'MAIN_WAREHOUSE' || d.status === 'IN_STOCK_AFTER_EXCHANGE'
    );

    const inventoryAssetUsd = inStockDevices.reduce((acc, d) => acc + (d.costBasisUsd || d.purchaseCostUsd || 0), 0);
    const inventoryAssetTjs = Math.round(inventoryAssetUsd * rate);
    const inventoryDevicesCount = inStockDevices.length;

    const targetStores = selectedStore === 'all'
      ? stores
      : stores.filter(s => s.id === selectedStore);

    const totalCashRegistersTjs = targetStores.reduce((acc, s) => acc + s.cashBalanceTjs, 0);
    const totalCashRegistersUsd = +(totalCashRegistersTjs / rate).toFixed(2);

    const totalSupplierDebtUsd = suppliers.reduce((acc, s) => acc + s.totalDebtUsd, 0);
    const totalSupplierDebtTjs = Math.round(totalSupplierDebtUsd * rate);

    const totalAssetsUsd = +(inventoryAssetUsd + totalCashRegistersUsd).toFixed(2);
    const totalAssetsTjs = Math.round(totalAssetsUsd * rate);
    const netBusinessValueUsd = +(totalAssetsUsd - totalSupplierDebtUsd).toFixed(2);
    const netBusinessValueTjs = Math.round(netBusinessValueUsd * rate);

    const sortedModelList = Object.entries(modelCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.profitUsd - a.profitUsd || b.revenueUsd - a.revenueUsd);

    return {
      unitsSold,
      revenueUsd: +revenueUsd.toFixed(2),
      revenueTjs,
      cogsUsd: +cogsUsd.toFixed(2),
      cogsTjs,
      grossProfitUsd: +grossProfitUsd.toFixed(2),
      grossProfitTjs,
      grossMarginPercent,
      expensesTjs,
      expensesUsd,
      netProfitUsd,
      netProfitTjs,
      inventoryAssetUsd: +inventoryAssetUsd.toFixed(2),
      inventoryAssetTjs,
      inventoryDevicesCount,
      totalSupplierDebtUsd: +totalSupplierDebtUsd.toFixed(2),
      totalSupplierDebtTjs,
      totalCashRegistersTjs,
      totalCashRegistersUsd,
      totalAssetsUsd,
      totalAssetsTjs,
      netBusinessValueUsd,
      netBusinessValueTjs,
      modelCounts: sortedModelList
    };
  }, [sales, expenses, devices, suppliers, stores, supplierBonuses, period, selectedMonth, selectedStore, rate]);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-fg-subtle text-xs">
        <p className="font-bold text-fg">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Финансовые отчеты доступны только руководству</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      {/* Top Filter Bar */}
      <div className="p-3 border-b border-border bg-surface flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h3 className="text-xs font-bold text-fg flex items-center space-x-1.5 uppercase">
            <BarChart3 className="w-4 h-4 text-accent" />
            <span>ФИНАНСОВЫЙ И БАЛАНСОВЫЙ ОТЧЕТ</span>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Period selector */}
          <div className="flex items-center space-x-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setPeriod('TODAY')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${
                period === 'TODAY'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
              }`}
            >
              СЕГОДНЯ
            </button>
            <button
              type="button"
              onClick={() => setPeriod('MONTH')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${
                period === 'MONTH'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
              }`}
            >
              ЭТОТ МЕСЯЦ
            </button>
            <div className="flex items-center space-x-1 pl-1 border-l border-border">
              <span className="text-[10px] text-fg-subtle font-bold uppercase hidden md:inline">ВЫБОР МЕСЯЦА:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedMonth(e.target.value);
                    setPeriod('SPECIFIC_MONTH');
                  }
                }}
                className={`px-2 py-1 rounded-lg border text-xs font-bold transition-colors bg-surface-raised focus:outline-none ${
                  period === 'SPECIFIC_MONTH'
                    ? 'border-accent text-accent'
                    : 'border-border text-fg-muted'
                }`}
                title="Выберите любой конкретный месяц для отчета"
              />
            </div>
            <button
              type="button"
              onClick={() => setPeriod('ALL')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${
                period === 'ALL'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
              }`}
            >
              ВСЕ ВРЕМЯ
            </button>
          </div>

          {/* Store selector */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:border-accent"
          >
            <option value="all">ВСЕ ФИЛИАЛЫ</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
            ))}
          </select>

          {/* Quick Export Sales */}
          <button
            onClick={() => exportSalesReport(sales, rate)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ЭКСПОРТ (CSV)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {/* KPI SECTION 1: PROFIT & LOSS (P&L) */}
        <div>
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-accent" />
            <span>ОТЧЕТ О ПРИБЫЛЯХ И УБЫТКАХ (P&L)</span>
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Revenue */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ВЫРУЧКА (ОБОРОТ)</span>
                <DollarSign className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg">
                ${filteredData.revenueUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.revenueTjs.toLocaleString()} TJS | <strong className="text-accent">{filteredData.unitsSold}</strong> шт.
              </p>
            </div>

            {/* Card 2: COGS */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>СЕБЕСТОИМОСТЬ (COGS)</span>
                <Package className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg-muted">
                ${filteredData.cogsUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.cogsTjs.toLocaleString()} TJS (закупка)
              </p>
            </div>

            {/* Card 3: Gross Profit */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ВАЛОВАЯ МАРЖА</span>
                <TrendingUp className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-accent">
                ${filteredData.grossProfitUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.grossProfitTjs.toLocaleString()} TJS | Маржа: <strong className="text-accent">{filteredData.grossMarginPercent}%</strong>
              </p>
            </div>

            {/* Card 4: Net Profit */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase font-bold">
                <span>ЧИСТАЯ ПРИБЫЛЬ</span>
                <DollarSign className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className={`text-base sm:text-lg font-bold ${
                filteredData.netProfitUsd >= 0 ? 'text-accent' : 'text-danger'
              }`}>
                ${filteredData.netProfitUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.netProfitTjs.toLocaleString()} TJS (расходы: {filteredData.expensesTjs.toLocaleString()} TJS)
              </p>
            </div>
          </div>
        </div>

        {/* KPI SECTION 2: BALANCE SHEET & NET WORTH */}
        <div>
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Landmark className="w-3.5 h-3.5 text-accent" />
            <span>БАЛАНС АКТИВОВ И КАПИТАЛИЗАЦИИ БИЗНЕСА</span>
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Asset 1: Stock Inventory */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ТОВАРЫ НА СКЛАДЕ</span>
                <Smartphone className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-accent">
                ${filteredData.inventoryAssetUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.inventoryAssetTjs.toLocaleString()} TJS | <strong className="text-fg">{filteredData.inventoryDevicesCount}</strong> шт.
              </p>
            </div>

            {/* Asset 2: Cash Registers */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ОСТАТОК В КАССАХ</span>
                <StoreIcon className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg">
                {filteredData.totalCashRegistersTjs.toLocaleString()} TJS
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ ${filteredData.totalCashRegistersUsd.toLocaleString()}
              </p>
            </div>

            {/* Liability 3: Supplier Debts */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ДОЛГ ПОСТАВЩИКАМ</span>
                <ArrowDownRight className="w-3.5 h-3.5 text-danger" />
              </div>
              <p className="text-base sm:text-lg font-bold text-danger">
                ${filteredData.totalSupplierDebtUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.totalSupplierDebtTjs.toLocaleString()} TJS (долги)
              </p>
            </div>

            {/* Net Worth 4: Business Value */}
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-accent/40 space-y-1">
              <div className="flex items-center justify-between text-accent text-[10px] uppercase font-bold">
                <span>ЧИСТАЯ СТОИМОСТЬ БИЗНЕСА</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-accent">
                ${filteredData.netBusinessValueUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.netBusinessValueTjs.toLocaleString()} TJS (Активы − Обязательства)
              </p>
            </div>
          </div>
        </div>

        {/* TOP SELLING MODELS TABLE */}
        {filteredData.modelCounts.length > 0 && (
          <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center space-x-1.5">
                <Smartphone className="w-3.5 h-3.5 text-accent" />
                <span>РЕЙТИНГ ПРОДАЖ И МАРЖИНАЛЬНОСТЬ МОДЕЛЕЙ</span>
              </h4>
              <span className="text-[10px] text-fg-subtle">
                Топ-{Math.min(10, filteredData.modelCounts.length)} по марже
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] text-fg-subtle uppercase">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Модель</th>
                    <th className="py-2 px-3 text-center">Продано (шт)</th>
                    <th className="py-2 px-3 text-right">Выручка ($)</th>
                    <th className="py-2 px-3 text-right">Себестоимость ($)</th>
                    <th className="py-2 px-3 text-right">Валовая прибыль ($)</th>
                    <th className="py-2 px-3 text-right">Рентабельность (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredData.modelCounts.slice(0, 10).map((m, idx) => {
                    const marginPct = m.revenueUsd > 0 ? ((m.profitUsd / m.revenueUsd) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={m.name} className="hover:bg-surface-raised transition-colors">
                        <td className="py-2 px-3 text-fg-subtle font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold text-fg">{m.name}</td>
                        <td className="py-2 px-3 text-center text-fg-muted font-bold">{m.count}</td>
                        <td className="py-2 px-3 text-right text-fg">${m.revenueUsd.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-fg-subtle">${m.cogsUsd.toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${m.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                          {m.profitUsd >= 0 ? '+' : ''}${m.profitUsd.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-accent">
                          {marginPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Export Reports Action Section */}
        <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center space-x-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
            <span>ЭКСПОРТ ДАННЫХ И ЭЛЕКТРОННЫЕ ОТЧЕТЫ (CSV / EXCEL)</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sales Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Отчет по продажам</span>
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                    {sales.length} чеков
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Номер чека, дата, кассир, магазин, товар, IMEI 1/2, цена, себестоимость, прибыль и статус.
                </p>
              </div>
              <button
                onClick={() => exportSalesReport(sales, rate)}
                className="w-full py-2 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs flex items-center justify-center space-x-2 transition-colors shadow-xs mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>СКАЧАТЬ ПРОДАЖИ (CSV)</span>
              </button>
            </div>

            {/* Inventory Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Остатки склада</span>
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                    {devices.length} устройств
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Бренд, модель, память, цвет, IMEI 1/2, штрихкод, локация склада, статус и себестоимость.
                </p>
              </div>
              <button
                onClick={() => exportInventoryReport(devices, stores, rate)}
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>СКАЧАТЬ СКЛАД (CSV)</span>
              </button>
            </div>

            {/* Expenses Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Отчет по расходам</span>
                  <span className="text-[10px] text-danger bg-danger/10 px-1.5 py-0.5 rounded-md border border-danger/20">
                    {expenses.length} записей
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Дата, категория, сумма в TJS и USD, филиал, касса списания, комментарий и ответственный.
                </p>
              </div>
              <button
                onClick={() => exportExpensesReport(expenses, rate)}
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>СКАЧАТЬ РАСХОДЫ (CSV)</span>
              </button>
            </div>

            {/* Repairs Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Журнал ремонтов</span>
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                    {repairs.length} заказов
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Квитанция, дата, клиент, модель, IMEI, поломка, статус и финальная стоимость ремонта.
                </p>
              </div>
              <button
                onClick={() => exportRepairsReport(repairs)}
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-4 h-4" />
                <span>СКАЧАТЬ РЕМОНТЫ (CSV)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
