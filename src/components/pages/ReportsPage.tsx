import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapSale, mapExpense, mapRepair, buildNameLookup } from '../../api/mappers';
import { Sale, Expense, RepairTicket } from '../../types';
import {
  BarChart3,
  Smartphone,
  ArrowDownRight,
  Download,
  FileSpreadsheet,
  Package,
  Wallet,
  Store as StoreIcon,
  Gift,
  Receipt
} from 'lucide-react';
import {
  exportSalesReport, exportInventoryReport, exportExpensesReport, exportRepairsReport,
  buildSalesReportTable, buildInventoryReportTable, buildExpensesReportTable, buildRepairsReportTable
} from '../../utils/exportReports';
import { ReportPreviewModal } from '../common/ReportPreviewModal';

type Period = 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL';

interface ReportsSummary {
  unitsSold: number;
  revenueUsd: number;
  revenueTjs: number;
  cogsUsd: number;
  cogsTjs: number;
  grossProfitUsd: number;
  grossProfitTjs: number;
  grossMarginPercent: number;
  expensesTjs: number;
  expensesUsd: number;
  netProfitUsd: number;
  netProfitTjs: number;
  periodCashBonusesUsd: number;
  periodCashBonusesTjs: number;
  giftDeviceUnitsSold: number;
  giftDeviceProfitUsd: number;
  giftDeviceProfitTjs: number;
  periodFreeDeviceBonusesReceived: number;
  freeDeviceBonusesInStock: number;
  totalSupplierDebtUsd: number;
  totalSupplierDebtTjs: number;
  mainWarehouseStockCount: number;
  mainWarehouseStockCostUsd: number;
  mainWarehouseStockCostTjs: number;
  mainWarehouseCashUsd: number;
  mainWarehouseCashTjs: number;
  topSuppliersByDebt: { id: string; name: string; totalPurchasedUsd: number; totalPaidUsd: number; totalDebtUsd: number }[];
  storeBreakdown: {
    storeId: string; storeName: string; revenueUsd: number; revenueTjs: number; cogsUsd: number; cogsTjs: number;
    profitUsd: number; profitTjs: number; unitsSold: number; salesCount: number; cashTjs: number;
    stockCount: number; stockCostUsd: number; stockCostTjs: number;
  }[];
  modelCounts: { name: string; count: number; revenueUsd: number; cogsUsd: number; profitUsd: number }[];
}

export const ReportsPage: React.FC = () => {
  const {
    currentUser,
    devices,
    stores,
    users,
    todayRate,
    selectedStoreId: globalSelectedStoreId
  } = useApp();

  const [period, setPeriod] = useState<Period>('TODAY');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should see that same store here without
  // re-picking it; they can still switch it locally afterward.
  const [selectedStore, setSelectedStore] = useState<string>(globalSelectedStoreId || 'all');
  const [previewReport, setPreviewReport] = useState<null | 'sales' | 'inventory' | 'expenses' | 'repairs'>(null);

  const rate = todayRate?.rate || 9.50;
  const isSeller = currentUser?.role === 'SELLER';
  const namesLookup = useMemo(() => buildNameLookup(users), [users]);

  const selectedStoreName = selectedStore === 'all' ? 'все магазины' : (stores.find(s => s.id === selectedStore)?.name || selectedStore);
  const periodLabel = period === 'TODAY' ? 'сегодня' : period === 'MONTH' ? 'текущий месяц' : period === 'SPECIFIC_MONTH' ? selectedMonth : 'весь период';

  // Everything below used to be derived client-side from the FULL sales/expenses/repairs
  // history fetched on every login — as that history grows over months/years this only got
  // slower. Now the period/store filtering happens on the server (see /api/reports/summary
  // and the matching query params on /api/sales, /api/expenses, /api/repairs), so what
  // actually crosses the network and gets processed here scales with the selected period,
  // not with the business's entire lifetime.
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [exportSales, setExportSales] = useState<Sale[]>([]);
  const [exportExpenses, setExportExpenses] = useState<Expense[]>([]);
  const [exportRepairs, setExportRepairs] = useState<RepairTicket[]>([]);

  useEffect(() => {
    if (isSeller) return;
    let cancelled = false;
    setSummaryLoading(true);

    const params = new URLSearchParams({ period });
    if (period === 'SPECIFIC_MONTH') params.set('month', selectedMonth);
    if (selectedStore !== 'all') params.set('storeId', selectedStore);
    const query = params.toString();

    Promise.all([
      apiClient<ReportsSummary>(`/reports/summary?${query}`),
      apiClient<any[]>(`/sales?${query}`),
      apiClient<any[]>(`/expenses?${query}`),
      apiClient<any[]>(`/repairs?${query}`),
    ])
      .then(([summaryData, rawSales, rawExpenses, rawRepairs]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setExportSales(rawSales.map((s) => mapSale(s, namesLookup)));
        setExportExpenses(rawExpenses.map((e) => mapExpense(e, namesLookup)));
        setExportRepairs(rawRepairs.map((r) => mapRepair(r, namesLookup)));
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setExportSales([]);
        setExportExpenses([]);
        setExportRepairs([]);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => { cancelled = true; };
  }, [isSeller, period, selectedMonth, selectedStore, namesLookup, devices]);

  // Inventory is a point-in-time snapshot (no created-date period makes sense for
  // "what's on the shelf right now"), so only the store filter applies — this one still
  // comes from the already-loaded device catalog, no extra fetch needed.
  const exportDevices = useMemo(() => {
    if (selectedStore === 'all') return devices;
    return devices.filter(d => d.locationId === selectedStore);
  }, [devices, selectedStore]);

  const previewTable = useMemo(() => {
    if (previewReport === 'sales') return buildSalesReportTable(exportSales, rate);
    if (previewReport === 'inventory') return buildInventoryReportTable(exportDevices, stores, rate);
    if (previewReport === 'expenses') return buildExpensesReportTable(exportExpenses, rate);
    if (previewReport === 'repairs') return buildRepairsReportTable(exportRepairs);
    return null;
  }, [previewReport, exportSales, exportDevices, exportExpenses, exportRepairs, stores, rate]);

  const previewMeta: Record<'sales' | 'inventory' | 'expenses' | 'repairs', { title: string; download: () => void }> = {
    sales: { title: 'Отчет по продажам', download: () => exportSalesReport(exportSales, rate) },
    inventory: { title: 'Остатки склада', download: () => exportInventoryReport(exportDevices, stores, rate) },
    expenses: { title: 'Отчет по расходам', download: () => exportExpensesReport(exportExpenses, rate) },
    repairs: { title: 'Журнал ремонтов', download: () => exportRepairsReport(exportRepairs) },
  };

  const filteredData: ReportsSummary = summary ?? {
    unitsSold: 0, revenueUsd: 0, revenueTjs: 0, cogsUsd: 0, cogsTjs: 0,
    grossProfitUsd: 0, grossProfitTjs: 0, grossMarginPercent: 0,
    expensesTjs: 0, expensesUsd: 0, netProfitUsd: 0, netProfitTjs: 0,
    periodCashBonusesUsd: 0, periodCashBonusesTjs: 0,
    giftDeviceUnitsSold: 0, giftDeviceProfitUsd: 0, giftDeviceProfitTjs: 0,
    periodFreeDeviceBonusesReceived: 0, freeDeviceBonusesInStock: 0,
    totalSupplierDebtUsd: 0, totalSupplierDebtTjs: 0,
    mainWarehouseStockCount: 0, mainWarehouseStockCostUsd: 0, mainWarehouseStockCostTjs: 0,
    mainWarehouseCashUsd: 0, mainWarehouseCashTjs: 0,
    topSuppliersByDebt: [], storeBreakdown: [], modelCounts: [],
  };

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
          </div>

          {/* Store selector */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:border-accent"
          >
            <option value="all">ВСЕ МАГАЗИНЫ</option>
            {stores.filter(s => !s.isMainWarehouse).map(s => (
              <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 transition-opacity ${summaryLoading ? 'opacity-60' : ''}`}>

        {/* MAIN WAREHOUSE: stock storage, cash register and supplier obligations */}
        <div>
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Package className="w-3.5 h-3.5 text-accent" />
            <span>ГЛАВНЫЙ СКЛАД</span>
            <span className="text-[9px] font-normal normal-case text-fg-subtle">(хранение товара, касса и обязательства перед поставщиками)</span>
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ТОВАРОВ НА ГЛАВНОМ СКЛАДЕ</span>
                <Smartphone className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-accent">
                {filteredData.mainWarehouseStockCount.toLocaleString()} шт.
              </p>
              <p className="text-[10px] text-fg-subtle">
                Доступно и хранится на главном складе
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ОБЩАЯ СЕБЕСТОИМОСТЬ ТОВАРА</span>
                <Package className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg">
                ${filteredData.mainWarehouseStockCostUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.mainWarehouseStockCostTjs.toLocaleString()} TJS
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>КАССА ГЛАВНОГО СКЛАДА</span>
                <Wallet className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg">
                ${filteredData.mainWarehouseCashUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.mainWarehouseCashTjs.toLocaleString()} TJS
              </p>
            </div>

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
          </div>
        </div>

        {/* RETAIL STORES: same card layout as the main warehouse, one per store */}
        {filteredData.storeBreakdown.map(store => (
          <div key={store.storeId}>
            <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <StoreIcon className="w-3.5 h-3.5 text-accent" />
              <span>{store.storeName}</span>
              <span className="text-[9px] font-normal normal-case text-fg-subtle">(остатки, касса и прибыль за выбранный период)</span>
            </h4>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
                <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                  <span>ТОВАРОВ В МАГАЗИНЕ</span>
                  <Smartphone className="w-3.5 h-3.5 text-accent" />
                </div>
                <p className="text-base sm:text-lg font-bold text-accent">
                  {store.stockCount.toLocaleString()} шт.
                </p>
                <p className="text-[10px] text-fg-subtle">
                  Доступно и хранится в магазине
                </p>
              </div>

              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
                <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                  <span>СЕБЕСТОИМОСТЬ ТОВАРА</span>
                  <Package className="w-3.5 h-3.5 text-fg-subtle" />
                </div>
                <p className="text-base sm:text-lg font-bold text-fg">
                  ${store.stockCostUsd.toLocaleString()}
                </p>
                <p className="text-[10px] text-fg-subtle">
                  ≈ {store.stockCostTjs.toLocaleString()} TJS
                </p>
              </div>

              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
                <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                  <span>СЕБЕСТОИМОСТЬ ПРОДАЖИ</span>
                  <Receipt className="w-3.5 h-3.5 text-fg-subtle" />
                </div>
                <p className="text-base sm:text-lg font-bold text-fg">
                  ${store.cogsUsd.toLocaleString()}
                </p>
                <p className="text-[10px] text-fg-subtle">
                  ≈ {store.cogsTjs.toLocaleString()} TJS · за период
                </p>
              </div>

              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
                <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                  <span>КАССА МАГАЗИНА</span>
                  <Wallet className="w-3.5 h-3.5 text-accent" />
                </div>
                <p className="text-base sm:text-lg font-bold text-fg">
                  ${(store.cashTjs / rate).toFixed(2)}
                </p>
                <p className="text-[10px] text-fg-subtle">
                  ≈ {store.cashTjs.toLocaleString()} TJS
                </p>
              </div>

              <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
                <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                  <span>ПРИБЫЛЬ ЗА ПЕРИОД</span>
                  <BarChart3 className="w-3.5 h-3.5 text-accent" />
                </div>
                <p className={`text-base sm:text-lg font-bold ${store.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                  ${store.profitUsd.toLocaleString()}
                </p>
                <p className="text-[10px] text-fg-subtle">
                  ≈ {store.profitTjs.toLocaleString()} TJS ({store.salesCount} чеков)
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* SUPPLIER BONUSES: cash bonuses count 100% toward net profit; gift phones
            carry $0 cost basis, so their profit only shows once actually sold. */}
        <div>
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Gift className="w-3.5 h-3.5 text-accent" />
            <span>БОНУСЫ ОТ ПОСТАВЩИКОВ</span>
            <span className="text-[9px] font-normal normal-case text-fg-subtle">(денежные — сразу в прибыль; телефоны — 100% прибыль после продажи)</span>
          </h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ДЕНЕЖНЫЕ БОНУСЫ</span>
                <BarChart3 className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-accent">
                ${filteredData.periodCashBonusesUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.periodCashBonusesTjs.toLocaleString()} TJS · уже в чистой прибыли
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ПОЛУЧЕНО ТЕЛЕФОНОВ</span>
                <Gift className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg">
                {filteredData.periodFreeDeviceBonusesReceived.toLocaleString()} шт.
              </p>
              <p className="text-[10px] text-fg-subtle">
                Бонусных устройств за период
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ПРОДАНО (100% ПРИБЫЛЬ)</span>
                <Smartphone className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-base sm:text-lg font-bold text-accent">
                ${filteredData.giftDeviceProfitUsd.toLocaleString()}
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ {filteredData.giftDeviceProfitTjs.toLocaleString()} TJS ({filteredData.giftDeviceUnitsSold} шт.)
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle text-[10px] uppercase">
                <span>ЕЩЕ В НАЛИЧИИ</span>
                <Package className="w-3.5 h-3.5 text-fg-subtle" />
              </div>
              <p className="text-base sm:text-lg font-bold text-fg">
                {filteredData.freeDeviceBonusesInStock.toLocaleString()} шт.
              </p>
              <p className="text-[10px] text-fg-subtle">
                Ожидают продажи (не за период)
              </p>
            </div>
          </div>
        </div>

        {/* TOP SUPPLIERS BY DEBT */}
        {filteredData.topSuppliersByDebt.length > 0 && (
          <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
            <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider flex items-center space-x-1.5">
              <ArrowDownRight className="w-3.5 h-3.5 text-danger" />
              <span>ПОСТАВЩИКИ С НАИБОЛЬШИМ ДОЛГОМ</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] text-fg-subtle uppercase">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Поставщик</th>
                    <th className="py-2 px-3 text-right">Закуплено всего ($)</th>
                    <th className="py-2 px-3 text-right">Оплачено ($)</th>
                    <th className="py-2 px-3 text-right">Долг ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredData.topSuppliersByDebt.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-surface-raised transition-colors">
                      <td className="py-2 px-3 text-fg-subtle font-bold">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-fg">{s.name}</td>
                      <td className="py-2 px-3 text-right text-fg-subtle">${s.totalPurchasedUsd.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-fg">${s.totalPaidUsd.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-bold text-danger">${s.totalDebtUsd.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
          <p className="text-[10px] text-fg-subtle">
            Отчеты ниже учитывают выбранный период и магазин ({periodLabel} · {selectedStoreName}). Нажмите на карточку, чтобы посмотреть данные перед скачиванием.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sales Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Отчет по продажам</span>
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                    {exportSales.length} чеков
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Номер чека, дата, кассир, магазин, товар, IMEI 1/2, цена, себестоимость, прибыль и статус.
                </p>
              </div>
              <button
                onClick={() => setPreviewReport('sales')}
                className="w-full py-2 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs flex items-center justify-center space-x-2 transition-colors shadow-xs mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
              </button>
            </div>

            {/* Inventory Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Остатки склада</span>
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                    {exportDevices.length} устройств
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Бренд, модель, память, цвет, IMEI 1/2, штрихкод, локация склада, статус и себестоимость.
                </p>
              </div>
              <button
                onClick={() => setPreviewReport('inventory')}
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
              </button>
            </div>

            {/* Expenses Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Отчет по расходам</span>
                  <span className="text-[10px] text-danger bg-danger/10 px-1.5 py-0.5 rounded-md border border-danger/20">
                    {exportExpenses.length} записей
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Дата, категория, сумма в TJS и USD, филиал, касса списания, комментарий и ответственный.
                </p>
              </div>
              <button
                onClick={() => setPreviewReport('expenses')}
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
              </button>
            </div>

            {/* Repairs Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg text-xs">Журнал ремонтов</span>
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                    {exportRepairs.length} заказов
                  </span>
                </div>
                <p className="text-[11px] text-fg-subtle">
                  Квитанция, дата, клиент, модель, IMEI, поломка, статус и финальная стоимость ремонта.
                </p>
              </div>
              <button
                onClick={() => setPreviewReport('repairs')}
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-4 h-4" />
                <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReportPreviewModal
        open={previewReport !== null}
        onClose={() => setPreviewReport(null)}
        title={previewReport ? previewMeta[previewReport].title : ''}
        subtitle={`${periodLabel} · ${selectedStoreName}`}
        table={previewTable}
        onDownload={() => previewReport && previewMeta[previewReport].download()}
      />
    </div>
  );
};
