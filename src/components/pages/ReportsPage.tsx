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
  Store as StoreIcon,
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
  /** "Прибыль (с учетом возвратов)" — recognized profit plus retained refund penalties; the
   *  one profit figure the summary card, per-store cards, and netProfitUsd/Tjs all share. */
  profitUsd: number;
  profitTjs: number;
  expensesTjs: number;
  expensesUsd: number;
  periodRefundPenaltiesUsd: number;
  periodRefundPenaltiesTjs: number;
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

  const [period, setPeriod] = useState<Period>('SPECIFIC_MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  // Defaults to whichever store is currently ACTIVE on the POS Terminal page — not just
  // the raw global selection. SalePage falls back to its first selectable store when an
  // admin hasn't touched its dropdown yet (see SalePage's own effectiveStoreId), without
  // ever writing that fallback back into shared context — so mirror the exact same
  // fallback here, otherwise this would show "все магазины" while POS Terminal is quietly
  // operating on a specific store the admin never explicitly chose.
  const [selectedStore, setSelectedStore] = useState<string>(() => {
    if (currentUser?.role === 'SELLER' && currentUser.storeId) return currentUser.storeId;
    const retail = stores.filter((s) => !s.isMainWarehouse);
    if (retail.some((s) => s.id === globalSelectedStoreId)) return globalSelectedStoreId;
    return retail[0]?.id || 'all';
  });
  const [previewReport, setPreviewReport] = useState<null | 'inventory' | 'expenses' | 'repairs'>(null);
  // Which store's "Отчет по продажам" preview/download modal is open — 'all' for the
  // combined report across every store, a store id for a single one, null when closed.
  const [salesReportStoreId, setSalesReportStoreId] = useState<string | null>(null);

  const rate = todayRate?.rate || 9.50;
  const isSeller = currentUser?.role === 'SELLER';
  const namesLookup = useMemo(() => buildNameLookup(users), [users]);

  const selectedStoreName = selectedStore === 'all' ? 'все магазины' : (stores.find(s => s.id === selectedStore)?.name || selectedStore);
  const periodLabel = period === 'TODAY' ? 'сегодня' : period === 'MONTH' ? 'текущий месяц' : period === 'SPECIFIC_MONTH' ? selectedMonth : 'весь период';
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse), [stores]);

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
  }, [isSeller, period, selectedMonth, selectedStore, namesLookup]);

  // Inventory is a point-in-time snapshot (no created-date period makes sense for
  // "what's on the shelf right now"), so only the store filter applies — this one still
  // comes from the already-loaded device catalog, no extra fetch needed.
  const exportDevices = useMemo(() => {
    if (selectedStore === 'all') return devices;
    return devices.filter(d => d.locationId === selectedStore);
  }, [devices, selectedStore]);

  const previewTable = useMemo(() => {
    if (previewReport === 'inventory') return buildInventoryReportTable(exportDevices, stores, rate);
    if (previewReport === 'expenses') return buildExpensesReportTable(exportExpenses, rate);
    if (previewReport === 'repairs') return buildRepairsReportTable(exportRepairs, rate);
    return null;
  }, [previewReport, exportDevices, exportExpenses, exportRepairs, stores, rate]);

  const previewMeta: Record<'inventory' | 'expenses' | 'repairs', { title: string; download: () => void }> = {
    inventory: { title: 'Остатки склада', download: () => exportInventoryReport(exportDevices, stores, rate) },
    expenses: { title: 'Отчет по расходам', download: () => exportExpensesReport(exportExpenses, rate) },
    repairs: { title: 'Журнал ремонтов', download: () => exportRepairsReport(exportRepairs, rate) },
  };

  // Per-store "Отчет по продажам": each store gets its own totals and its own
  // preview/download, instead of one combined report that mixes every branch together.
  const salesByStore = useMemo(() => {
    const map = new Map<string, Sale[]>();
    map.set('all', exportSales);
    for (const store of retailStores) {
      map.set(store.id, exportSales.filter((s) => s.storeId === store.id));
    }
    return map;
  }, [exportSales, retailStores]);

  const salesReportTable = useMemo(() => {
    if (!salesReportStoreId) return null;
    // periodCashBonusesUsd isn't store-scoped on the backend (supplier bonuses aren't tied
    // to a retail store), so it's the same figure regardless of which store's report this is —
    // safe to reuse from filteredData even when salesReportStoreId differs from selectedStore.
    return buildSalesReportTable(salesByStore.get(salesReportStoreId) ?? [], rate, summary?.periodCashBonusesUsd ?? 0);
  }, [salesReportStoreId, salesByStore, rate, summary?.periodCashBonusesUsd]);

  const salesReportStoreName = salesReportStoreId === 'all'
    ? 'Все магазины'
    : (retailStores.find((s) => s.id === salesReportStoreId)?.name || '');

  const filteredData: ReportsSummary = summary ?? {
    unitsSold: 0, revenueUsd: 0, revenueTjs: 0, cogsUsd: 0, cogsTjs: 0,
    grossProfitUsd: 0, grossProfitTjs: 0, grossMarginPercent: 0,
    profitUsd: 0, profitTjs: 0,
    expensesTjs: 0, expensesUsd: 0,
    periodRefundPenaltiesUsd: 0, periodRefundPenaltiesTjs: 0,
    netProfitUsd: 0, netProfitTjs: 0,
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
        <p className="font-bold text-fg-muted">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Финансовые отчеты доступны только руководству</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      {/* Top Filter Bar */}
      <div className="p-3 border-b border-border bg-surface flex flex-col lg:flex-row lg:items-center justify-end gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Period selector — just the month; picking one shows every report for it. */}
          <div className="flex items-center space-x-1.5">
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
              className="px-2 py-1 rounded-lg border border-accent text-accent text-xs font-bold bg-surface-raised focus:outline-none"
              title="Выберите месяц — отчеты покажут все операции за него"
            />
          </div>

          {/* Store selector */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:outline-none focus:border-accent"
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

        {/* OVERALL ANALYSIS: styled exactly like the "Отчет по продажам" cards below it —
            same card shell, same header/stat layout — instead of a separate, bigger design.
            Revenue/profit/expenses/net-profit here all come from the same server-computed
            summary (filteredData) as the per-store cards below (filteredData.storeBreakdown),
            so the numbers on this card and on those cards never disagree with each other. */}
        <div className="p-2.5 rounded-xl bg-surface border border-border space-y-2 flex flex-col max-w-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-fg-muted text-xs flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3 text-accent" />
              ОБЩИЙ АНАЛИЗ · {selectedStoreName}
            </span>
            <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
              {(salesByStore.get(selectedStore) ?? []).length} чеков
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <p className="text-fg-subtle text-[9px] uppercase">Выручка</p>
              <p className="font-bold text-fg-muted text-xs">{filteredData.revenueTjs.toLocaleString()} TJS</p>
            </div>

            <div>
              <p className="text-fg-subtle text-[9px] uppercase">Прибыль (с учетом возвратов)</p>
              <p className={`font-bold text-xs ${filteredData.profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                {filteredData.profitUsd >= 0 ? '+' : ''}${filteredData.profitUsd.toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-fg-subtle text-[9px] uppercase">Расход</p>
              <p className="font-bold text-danger text-xs">${filteredData.expensesUsd.toLocaleString()}</p>
            </div>

            <div>
              <p className="text-fg-subtle text-[9px] uppercase">Чистая прибыль</p>
              <p className={`font-bold text-xs ${filteredData.netProfitUsd >= 0 ? 'text-warning' : 'text-danger'}`}>
                ${filteredData.netProfitUsd.toLocaleString()}
              </p>
            </div>

            {/* Only nonzero component of netProfit not already visible above (Прибыль already
                folds in refund penalties) — shown so Прибыль − Расход + Бонусы = Чистая прибыль
                actually reconciles on screen instead of netProfit silently including money the
                card never mentions. */}
            {filteredData.periodCashBonusesUsd !== 0 && (
              <div className="col-span-2">
                <p className="text-fg-subtle text-[9px] uppercase">Бонусы поставщиков (наличными)</p>
                <p className="font-bold text-accent text-xs">
                  +${filteredData.periodCashBonusesUsd.toLocaleString()}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setSalesReportStoreId(selectedStore)}
            className="w-full py-1.5 px-2.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-bold text-[11px] flex items-center justify-center space-x-1.5 transition-colors mt-auto"
          >
            <Download className="w-3 h-3" />
            <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
          </button>
        </div>

        {/* SALES REPORT PER STORE: replaces the old multi-metric card dashboard — just the
            report that matters (revenue, profit, receipt count) plus a download button,
            one panel per store and one for every store combined. */}
        <div>
          <h4 className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Receipt className="w-3.5 h-3.5 text-accent" />
            <span>ОТЧЕТ ПО ПРОДАЖАМ</span>
            <span className="text-[9px] font-normal normal-case text-fg-subtle">({periodLabel})</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {[...(selectedStore === 'all' ? [{ id: 'all', name: 'Все магазины' }] : []), ...retailStores].map((store) => {
              const storeSales = salesByStore.get(store.id) ?? [];
              // Same recognized-profit figures as the summary card above (filteredData.storeBreakdown),
              // instead of a second, independent per-item calculation that could disagree with it.
              const breakdown = filteredData.storeBreakdown.find((b) => b.storeId === store.id);
              const revenueTjs = store.id === 'all' ? filteredData.revenueTjs : (breakdown?.revenueTjs ?? 0);
              const profitUsd = store.id === 'all' ? filteredData.profitUsd : (breakdown?.profitUsd ?? 0);
              return (
                <div key={store.id} className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-fg-muted text-sm flex items-center gap-1.5">
                      <StoreIcon className="w-3.5 h-3.5 text-accent" />
                      {store.name}
                    </span>
                    <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                      {storeSales.length} чеков
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-fg-subtle text-[10px] uppercase">Выручка</p>
                      <p className="font-bold text-fg-muted text-sm">{Number(revenueTjs).toLocaleString()} TJS</p>
                    </div>
                    <div>
                      <p className="text-fg-subtle text-[10px] uppercase">Прибыль (с учетом возвратов)</p>
                      <p className={`font-bold text-sm ${profitUsd >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {profitUsd >= 0 ? '+' : ''}${profitUsd.toLocaleString()}
                      </p>
                    </div>
                    {/* Supplier bonuses are tied to the supplier/main warehouse, not a specific
                        retail store — shown only on the combined "Все магазины" card so it
                        never looks like one branch personally received the bonus. */}
                    {store.id === 'all' && filteredData.periodCashBonusesUsd !== 0 && (
                      <div className="col-span-2">
                        <p className="text-fg-subtle text-[10px] uppercase">Бонусы поставщиков (наличными)</p>
                        <p className="font-bold text-accent text-sm">
                          +${filteredData.periodCashBonusesUsd.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSalesReportStoreId(store.id)}
                    className="w-full py-2 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
                  </button>
                </div>
              );
            })}
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
                      <td className="py-2 px-3 font-bold text-fg-muted">{s.name}</td>
                      <td className="py-2 px-3 text-right text-fg-subtle">${s.totalPurchasedUsd.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-fg-muted">${s.totalPaidUsd.toLocaleString()}</td>
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
                        <td className="py-2 px-3 font-bold text-fg-muted">{m.name}</td>
                        <td className="py-2 px-3 text-center text-fg-muted font-bold">{m.count}</td>
                        <td className="py-2 px-3 text-right text-fg-muted">${m.revenueUsd.toFixed(2)}</td>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Inventory Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg-muted text-xs">Остатки склада</span>
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
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg-muted border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
              </button>
            </div>

            {/* Expenses Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg-muted text-xs">Отчет по расходам</span>
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
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg-muted border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ПРОСМОТР И СКАЧИВАНИЕ</span>
              </button>
            </div>

            {/* Repairs Report Download Card */}
            <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg-muted text-xs">Журнал ремонтов</span>
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
                className="w-full py-2 px-3 rounded-lg bg-surface hover:bg-surface-raised text-fg-muted border border-border font-bold text-xs flex items-center justify-center space-x-2 transition-colors mt-2"
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

      <ReportPreviewModal
        open={salesReportStoreId !== null}
        onClose={() => setSalesReportStoreId(null)}
        title={`Отчет по продажам — ${salesReportStoreName}`}
        subtitle={periodLabel}
        table={salesReportTable}
        onDownload={() => salesReportStoreId && exportSalesReport(salesByStore.get(salesReportStoreId) ?? [], rate, filteredData.periodCashBonusesUsd)}
      />
    </div>
  );
};
