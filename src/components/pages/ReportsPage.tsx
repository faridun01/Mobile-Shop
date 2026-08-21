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
import { exportSalesReport, exportInventoryReport } from '../../utils/exportReports';

export const ReportsPage: React.FC = () => {
  const {
    currentUser,
    sales,
    devices,
    expenses,
    suppliers,
    stores,
    todayRate
  } = useApp();

  const [period, setPeriod] = useState<'TODAY' | 'MONTH' | 'ALL'>('MONTH');
  const [selectedStore, setSelectedStore] = useState<string>('all');

  const rate = todayRate?.rate || 9.50;

  // Filtered dataset & financial calculations
  const filteredData = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = new Date().toISOString().substring(0, 7);

    // 1. Sales filtering
    let periodSales = sales;
    if (period === 'TODAY') {
      periodSales = sales.filter(s => s.date.startsWith(todayStr));
    } else if (period === 'MONTH') {
      periodSales = sales.filter(s => s.date.startsWith(currentMonthStr));
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
    }

    if (selectedStore !== 'all') {
      periodExpenses = periodExpenses.filter(e => e.storeId === selectedStore);
    }

    // Revenue, COGS, Gross Profit in USD
    let revenueUsd = 0;
    let cogsUsd = 0;
    let unitsSold = 0;
    const modelCounts: Record<string, { count: number; revenueUsd: number; profitUsd: number }> = {};

    periodSales.forEach(sale => {
      revenueUsd += sale.totalUsd;

      sale.items.forEach(item => {
        unitsSold++;
        cogsUsd += item.costBasisUsd || 0;

        const modelKey = `${item.brand} ${item.model}`;
        if (!modelCounts[modelKey]) {
          modelCounts[modelKey] = { count: 0, revenueUsd: 0, profitUsd: 0 };
        }
        const itemProfit = item.priceUsd - (item.costBasisUsd || 0);
        modelCounts[modelKey].count++;
        modelCounts[modelKey].revenueUsd += item.priceUsd;
        modelCounts[modelKey].profitUsd += itemProfit;
      });
    });

    const grossProfitUsd = revenueUsd - cogsUsd;

    // Operating expenses converted to USD
    const expensesTjs = periodExpenses.reduce((acc, e) => acc + e.amountTjs, 0);
    const expensesUsd = +(expensesTjs / rate).toFixed(2);

    // Net Profit in USD
    const netProfitUsd = +(grossProfitUsd - expensesUsd).toFixed(2);

    // Balance Sheet Assets & Liabilities in USD (store-aware)
    const targetDevices = selectedStore === 'all' 
      ? devices 
      : devices.filter(d => d.locationId === selectedStore);

    const inStockDevices = targetDevices.filter(d => 
      d.status === 'STORE_STOCK' || d.status === 'MAIN_WAREHOUSE' || d.status === 'IN_STOCK_AFTER_EXCHANGE'
    );

    const inventoryAssetUsd = inStockDevices.reduce((acc, d) => acc + (d.costBasisUsd || 0), 0);
    const inventoryDevicesCount = inStockDevices.length;

    const targetStores = selectedStore === 'all'
      ? stores
      : stores.filter(s => s.id === selectedStore);

    const totalCashRegistersTjs = targetStores.reduce((acc, s) => acc + s.cashBalanceTjs, 0);
    const totalCashRegistersUsd = +(totalCashRegistersTjs / rate).toFixed(2);

    const totalSupplierDebtUsd = suppliers.reduce((acc, s) => acc + s.totalDebtUsd, 0);

    const totalAssetsUsd = +(inventoryAssetUsd + totalCashRegistersUsd).toFixed(2);
    const netBusinessValueUsd = +(totalAssetsUsd - totalSupplierDebtUsd).toFixed(2);
    const netBusinessValueTjs = Math.round(netBusinessValueUsd * rate);

    return {
      unitsSold,
      revenueUsd: +revenueUsd.toFixed(2),
      cogsUsd: +cogsUsd.toFixed(2),
      grossProfitUsd: +grossProfitUsd.toFixed(2),
      expensesUsd,
      netProfitUsd,
      inventoryAssetUsd,
      inventoryDevicesCount,
      totalSupplierDebtUsd,
      totalCashRegistersTjs,
      totalCashRegistersUsd,
      totalAssetsUsd,
      netBusinessValueUsd,
      netBusinessValueTjs,
      modelCounts: Object.entries(modelCounts).sort((a, b) => b[1].revenueUsd - a[1].revenueUsd)
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
            <span>ФИНАНСОВЫЙ ОТЧЕТ ($ USD)</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Расчет показателей в долларах США по курсу {rate}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Period selector */}
          <div className="flex bg-[#0B0E14] p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setPeriod('TODAY')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-colors bg-transparent ${
                period === 'TODAY' ? 'text-[#22c55e]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Сегодня
            </button>
            <button
              onClick={() => setPeriod('MONTH')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-colors bg-transparent ${
                period === 'MONTH' ? 'text-[#22c55e]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Месяц
            </button>
            <button
              onClick={() => setPeriod('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase transition-colors bg-transparent ${
                period === 'ALL' ? 'text-[#22c55e]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Все время
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

          {/* Quick Export Sales */}
          <button
            onClick={() => exportSalesReport(sales, rate)}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-colors shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ЭКСПОРТ ПРОДАЖ</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {/* KPI Cards Grid (4 columns) */}
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
            <p className="text-[10px] text-slate-500 font-mono">
              Продано: <strong className="text-emerald-400">{filteredData.unitsSold}</strong> шт.
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
            <p className="text-[10px] text-slate-500 font-mono">
              Закупка проданных устройств
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
            <p className="text-[10px] text-slate-500 font-mono">
              До операционных расходов
            </p>
          </div>

          {/* Card 4: Net Profit */}
          <div className="p-3 sm:p-4 rounded-lg bg-[#0F1219] border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase">
              <span>ЧИСТАЯ ПРИБЫЛЬ</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className={`text-base sm:text-lg font-bold font-mono ${
              filteredData.netProfitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              ${filteredData.netProfitUsd.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              Расходы: ${filteredData.expensesUsd.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Export Reports Action Section */}
        <div className="p-3.5 rounded-lg bg-[#0F1219] border border-slate-800 space-y-2.5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>ЭКСПОРТ ДАННЫХ И ЭЛЕКТРОННЫЕ ОТЧЕТЫ (CSV)</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Sales Report Download Card */}
            <div className="p-3 rounded bg-[#0B0E14] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Отчет по продажам</span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {sales.length} чеков
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Включает: Номер чека, дату, время, продавца, магазин, бренд, модель, IMEI, цену продажи, себестоимость, маржу, способ оплаты и статус.
              </p>
              <button
                onClick={() => exportSalesReport(sales, rate)}
                className="w-full py-2 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              >
                <Download className="w-4 h-4" />
                <span>СКАЧАТЬ ОТЧЕТ ПО ПРОДАЖАМ (CSV)</span>
              </button>
            </div>

            {/* Inventory Report Download Card */}
            <div className="p-3 rounded bg-[#0B0E14] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">Отчет по остаткам склада</span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {devices.length} устройств
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Включает: Бренд, модель, память, цвет, IMEI, серийный номер, штрихкод, локацию склада, статус, поставщика, себестоимость и «ИТОГО».
              </p>
              <button
                onClick={() => exportInventoryReport(devices, stores, rate)}
                className="w-full py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold text-xs flex items-center justify-center space-x-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>СКАЧАТЬ ОТЧЕТ ПО ОСТАТКАМ (CSV)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
