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
    todayRate,
    resetAllCashBalances
  } = useApp();

  const [period, setPeriod] = useState<'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

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
      revenueUsd += sale.totalUsd || 0;

      sale.items.forEach(item => {
        unitsSold++;
        const itemCostUsd = item.costBasisUsd || item.purchaseCostUsd || 0;
        const itemPriceUsd = item.salePriceUsd || +(item.salePriceTjs / rate).toFixed(2);
        const itemProfitUsd = +(itemPriceUsd - itemCostUsd).toFixed(2);

        cogsUsd += itemCostUsd;

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

    // Repair income (issued repairs in period)
    let periodRepairs = repairs.filter(r => r.status === 'ISSUED');
    if (period === 'TODAY') {
      periodRepairs = periodRepairs.filter(r => r.createdAt.startsWith(todayStr) || (r.updatedAt && r.updatedAt.startsWith(todayStr)));
    } else if (period === 'MONTH') {
      periodRepairs = periodRepairs.filter(r => r.createdAt.startsWith(currentMonthStr) || (r.updatedAt && r.updatedAt.startsWith(currentMonthStr)));
    } else if (period === 'SPECIFIC_MONTH') {
      periodRepairs = periodRepairs.filter(r => r.createdAt.startsWith(selectedMonth) || (r.updatedAt && r.updatedAt.startsWith(selectedMonth)));
    }
    const repairIncomeTjs = periodRepairs.reduce((acc, r) => acc + (r.repairCostTjs || r.estimatedCostTjs || 0), 0);
    const repairIncomeUsd = +(repairIncomeTjs / rate).toFixed(2);

    const grossProfitUsd = +(revenueUsd - cogsUsd).toFixed(2);
    const totalRevenueUsd = +(revenueUsd + repairIncomeUsd).toFixed(2);
    const revenueTjs = Math.round(totalRevenueUsd * rate);
    const cogsTjs = Math.round(cogsUsd * rate);
    const grossProfitTjs = Math.round(grossProfitUsd * rate);
    const grossMarginPercent = revenueUsd > 0 ? +((grossProfitUsd / revenueUsd) * 100).toFixed(1) : 0;

    // Operating expenses converted to USD
    const expensesTjs = periodExpenses.reduce((acc, e) => acc + (e.amountTjs || 0), 0);
    const expensesUsd = +(expensesTjs / rate).toFixed(2);

    // Cash supplier bonuses in period count 100% towards Net Profit
    const periodCashBonusesUsd = (supplierBonuses || [])
      .filter(b => {
        if (b.bonusType !== 'CASH_DISCOUNT' || !b.amountUsd) return false;
        const bDate = b.dateReceived || b.date;
        if (!bDate) return true;
        if (period === 'TODAY') return bDate === todayStr;
        if (period === 'MONTH') return bDate.startsWith(currentMonthStr);
        return true;
      })
      .reduce((acc, b) => acc + (b.amountUsd || 0), 0);

    // Net Profit in USD & TJS (Includes sales profit + repair income - expenses + 100% cash supplier bonuses)
    const netProfitUsd = +(grossProfitUsd + repairIncomeUsd - expensesUsd + periodCashBonusesUsd).toFixed(2);
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
  }, [sales, expenses, devices, suppliers, stores, period, selectedStore, rate]);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        <p className="font-bold">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Финансовые отчеты доступны только руководству</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300 font-mono">
      {/* Top Filter Bar */}
      <div className="p-3 border-b border-slate-800 bg-[#0F1219] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0">
        <div>
          <h3 className="text-xs font-bold text-slate-100 flex items-center space-x-1.5 uppercase">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>ФИНАНСОВЫЙ И БАЛАНСОВЫЙ ОТЧЕТ ($ USD / TJS)</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Расчет показателей в долларах США по курсу {rate} TJS / USD
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Period selector */}
          <div className="flex items-center space-x-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setPeriod('TODAY')}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
                period === 'TODAY'
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              СЕГОДНЯ
            </button>
            <button
              type="button"
              onClick={() => setPeriod('MONTH')}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
                period === 'MONTH'
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              ЭТОТ МЕСЯЦ
            </button>
            <div className="flex items-center space-x-1 pl-1 border-l border-slate-800">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase hidden md:inline">ВЫБОР МЕСЯЦА:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedMonth(e.target.value);
                    setPeriod('SPECIFIC_MONTH');
                  }
                }}
                className={`px-2 py-0.5 rounded border text-xs font-mono font-bold transition-colors bg-[#0B0E14] focus:outline-none ${
                  period === 'SPECIFIC_MONTH'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
                title="Выберите любой конкретный месяц для отчета"
              />
            </div>
            <button
              type="button"
              onClick={() => setPeriod('ALL')}
              className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-colors bg-transparent ${
                period === 'ALL'
                  ? 'border-[#22c55e] text-[#22c55e]'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              ВСЕ ВРЕМЯ
            </button>
          </div>

          {/* Store selector */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="rounded bg-[#0B0E14] border border-slate-800 px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">ВСЕ ФИЛИАЛЫ</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
            ))}
          </select>

          {/* Reset Cash Balances */}
          <button
            onClick={() => {
              resetAllCashBalances();
              setStatusMsg('Остатки наличных во всех кассах обнулены (0 TJS)');
              setTimeout(() => setStatusMsg(null), 4000);
            }}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-400 hover:text-amber-300 font-bold text-xs transition-colors"
            title="Обнулить отрицательный или неактуальный остаток наличных во всех кассах"
          >
            <span>🧹 ОБНУЛИТЬ КАССЫ</span>
          </button>

          {/* Quick Export Sales */}
          <button
            onClick={() => exportSalesReport(sales, rate)}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)]"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ЭКСПОРТ (CSV)</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="mx-3 mt-2 p-2.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center justify-between shrink-0">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {/* KPI SECTION 1: PROFIT & LOSS (P&L) */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>ОТЧЕТ О ПРИБЫЛЯХ И УБЫТКАХ (P&L)</span>
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Revenue */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                <span>ВЫРУЧКА (ОБОРОТ)</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-100 font-mono">
                ${filteredData.revenueUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.revenueTjs.toLocaleString()} TJS | <strong className="text-emerald-400">{filteredData.unitsSold}</strong> шт.
              </p>
            </div>

            {/* Card 2: COGS */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                <span>СЕБЕСТОИМОСТЬ (COGS)</span>
                <Package className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-300 font-mono">
                ${filteredData.cogsUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.cogsTjs.toLocaleString()} TJS (закупка)
              </p>
            </div>

            {/* Card 3: Gross Profit */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                <span>ВАЛОВАЯ МАРЖА</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
                ${filteredData.grossProfitUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.grossProfitTjs.toLocaleString()} TJS | Маржа: <strong className="text-emerald-400">{filteredData.grossMarginPercent}%</strong>
              </p>
            </div>

            {/* Card 4: Net Profit */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
                <span>ЧИСТАЯ ПРИБЫЛЬ</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className={`text-base sm:text-lg font-bold font-mono ${
                filteredData.netProfitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                ${filteredData.netProfitUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.netProfitTjs.toLocaleString()} TJS (расходы: {filteredData.expensesTjs.toLocaleString()} TJS)
              </p>
            </div>
          </div>
        </div>

        {/* KPI SECTION 2: BALANCE SHEET & NET WORTH */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Landmark className="w-3.5 h-3.5 text-emerald-400" />
            <span>БАЛАНС АКТИВОВ И КАПИТАЛИЗАЦИИ БИЗНЕСА</span>
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Asset 1: Stock Inventory */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                <span>ТОВАРЫ НА СКЛАДЕ</span>
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
                ${filteredData.inventoryAssetUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.inventoryAssetTjs.toLocaleString()} TJS | <strong className="text-slate-200">{filteredData.inventoryDevicesCount}</strong> шт.
              </p>
            </div>

            {/* Asset 2: Cash Registers */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                <span>ОСТАТОК В КАССАХ</span>
                <StoreIcon className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-100 font-mono">
                {filteredData.totalCashRegistersTjs.toLocaleString()} TJS
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ ${filteredData.totalCashRegistersUsd.toLocaleString()}
              </p>
            </div>

            {/* Liability 3: Supplier Debts */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
                <span>ДОЛГ ПОСТАВЩИКАМ</span>
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-rose-400 font-mono">
                ${filteredData.totalSupplierDebtUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.totalSupplierDebtTjs.toLocaleString()} TJS (долги)
              </p>
            </div>

            {/* Net Worth 4: Business Value */}
            <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-emerald-500/40 space-y-1">
              <div className="flex items-center justify-between text-emerald-400 text-[10px] uppercase font-bold">
                <span>ЧИСТАЯ СТОИМОСТЬ БИЗНЕСА</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
                ${filteredData.netBusinessValueUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                ≈ {filteredData.netBusinessValueTjs.toLocaleString()} TJS (Активы − Обязательства)
              </p>
            </div>
          </div>
        </div>

        {/* TOP SELLING MODELS TABLE */}
        {filteredData.modelCounts.length > 0 && (
          <div className="p-3.5 rounded-lg bg-[#0F1219] border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>РЕЙТИНГ ПРОДАЖ И МАРЖИНАЛЬНОСТЬ МОДЕЛЕЙ</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                Топ-{Math.min(10, filteredData.modelCounts.length)} по марже
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Модель</th>
                    <th className="py-2 px-3 text-center">Продано (шт)</th>
                    <th className="py-2 px-3 text-right">Выручка ($)</th>
                    <th className="py-2 px-3 text-right">Себестоимость ($)</th>
                    <th className="py-2 px-3 text-right">Валовая прибыль ($)</th>
                    <th className="py-2 px-3 text-right">Рентабельность (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredData.modelCounts.slice(0, 10).map((m, idx) => {
                    const marginPct = m.revenueUsd > 0 ? ((m.profitUsd / m.revenueUsd) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={m.name} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 text-slate-500 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold text-slate-200">{m.name}</td>
                        <td className="py-2 px-3 text-center text-slate-300 font-bold">{m.count}</td>
                        <td className="py-2 px-3 text-right text-slate-200">${m.revenueUsd.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-slate-400">${m.cogsUsd.toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-bold ${m.profitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {m.profitUsd >= 0 ? '+' : ''}${m.profitUsd.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400">
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
        <div className="p-3.5 rounded-lg bg-[#0F1219] border border-slate-800 space-y-2.5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>ЭКСПОРТ ДАННЫХ И ЭЛЕКТРОННЫЕ ОТЧЕТЫ (CSV / EXCEL)</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sales Report Download Card */}
            <div className="p-3 rounded bg-[#0B0E14] border border-slate-800 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">Отчет по продажам</span>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {sales.length} чеков
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  Номер чека, дата, кассир, магазин, товар, IMEI 1/2, цена, себестоимость, прибыль и статус.
                </p>
              </div>
              <button
                onClick={() => exportSalesReport(sales, rate)}
                className="w-full py-2 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center space-x-2 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)] mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>СКАЧАТЬ ПРОДАЖИ (CSV)</span>
              </button>
            </div>

            {/* Inventory Report Download Card */}
            <div className="p-3 rounded bg-[#0B0E14] border border-slate-800 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">Остатки склада</span>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {devices.length} устройств
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  Бренд, модель, память, цвет, IMEI 1/2, штрихкод, локация склада, статус и себестоимость.
                </p>
              </div>
              <button
                onClick={() => exportInventoryReport(devices, stores, rate)}
                className="w-full py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>СКАЧАТЬ СКЛАД (CSV)</span>
              </button>
            </div>

            {/* Expenses Report Download Card */}
            <div className="p-3 rounded bg-[#0B0E14] border border-slate-800 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">Отчет по расходам</span>
                  <span className="text-[10px] text-rose-400 font-mono bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                    {expenses.length} записей
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  Дата, категория, сумма в TJS и USD, филиал, касса списания, комментарий и ответственный.
                </p>
              </div>
              <button
                onClick={() => exportExpensesReport(expenses, rate)}
                className="w-full py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>СКАЧАТЬ РАСХОДЫ (CSV)</span>
              </button>
            </div>

            {/* Repairs Report Download Card */}
            <div className="p-3 rounded bg-[#0B0E14] border border-slate-800 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">Журнал ремонтов</span>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {repairs.length} заказов
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  Квитанция, дата, клиент, модель, IMEI, поломка, статус и финальная стоимость ремонта.
                </p>
              </div>
              <button
                onClick={() => exportRepairsReport(repairs)}
                className="w-full py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
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
