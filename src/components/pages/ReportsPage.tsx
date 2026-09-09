import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapExpense, mapSale, buildNameLookup } from '../../api/mappers';
import { Expense, Sale } from '../../types';
import {
  Smartphone,
  ArrowDownRight,
  Download,
  Store as StoreIcon,
  Receipt,
  TrendingUp,
  Wallet,
  PiggyBank
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { StatCard } from '../ui/StatCard';
import {
  exportComprehensiveReport,
  buildSalesReportTable,
  type ComprehensiveReportSummary,
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
  // Which store's "Отчет по продажам" preview/download modal is open — 'all' for the
  // combined report across every store, a store id for a single one, null when closed.
  const [salesReportStoreId, setSalesReportStoreId] = useState<string | null>(null);

  const rate = todayRate?.rate || 9.50;
  const isSeller = currentUser?.role === 'SELLER';
  const namesLookup = useMemo(() => buildNameLookup(users), [users]);

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
  const [reportDownloading, setReportDownloading] = useState(false);

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
    ])
      .then(([summaryData, rawSales, rawExpenses]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setExportSales(rawSales.map((s) => mapSale(s, namesLookup)));
        setExportExpenses(rawExpenses.map((expense) => mapExpense(expense, namesLookup)));
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setExportSales([]);
        setExportExpenses([]);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => { cancelled = true; };
  }, [isSeller, period, selectedMonth, selectedStore, namesLookup]);

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
    return buildSalesReportTable(
      salesByStore.get(salesReportStoreId) ?? [],
      rate,
      salesReportStoreId === 'all' ? (summary?.periodCashBonusesUsd ?? 0) : 0,
    );
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

  const downloadFinancialReport = async () => {
    if (!salesReportStoreId || !summary || reportDownloading) return;

    const reportStoreId = salesReportStoreId;
    const reportSales = salesByStore.get(reportStoreId) ?? [];
    const reportExpenses = reportStoreId === 'all'
      ? exportExpenses
      : exportExpenses.filter((expense) => expense.storeId === reportStoreId);

    let reportSummary: ComprehensiveReportSummary;
    if (reportStoreId === 'all') {
      reportSummary = {
        periodLabel,
        storeName: salesReportStoreName,
        exchangeRate: rate,
        unitsSold: filteredData.unitsSold,
        revenueTjs: filteredData.revenueTjs,
        revenueUsd: filteredData.revenueUsd,
        cogsTjs: filteredData.cogsTjs,
        cogsUsd: filteredData.cogsUsd,
        grossProfitTjs: filteredData.grossProfitTjs,
        grossProfitUsd: filteredData.grossProfitUsd,
        refundPenaltiesTjs: filteredData.periodRefundPenaltiesTjs,
        refundPenaltiesUsd: filteredData.periodRefundPenaltiesUsd,
        profitTjs: filteredData.profitTjs,
        profitUsd: filteredData.profitUsd,
        cashBonusesTjs: filteredData.periodCashBonusesTjs,
        cashBonusesUsd: filteredData.periodCashBonusesUsd,
        expensesTjs: filteredData.expensesTjs,
        expensesUsd: filteredData.expensesUsd,
        netProfitTjs: filteredData.netProfitTjs,
        netProfitUsd: filteredData.netProfitUsd,
      };
    } else {
      const breakdown = filteredData.storeBreakdown.find((item) => item.storeId === reportStoreId);
      const expensesTjs = reportExpenses.reduce((total, expense) => total + (expense.amountTjs || 0), 0);
      const expensesUsd = reportExpenses.reduce(
        (total, expense) => total + (expense.amountUsd ?? ((expense.amountTjs || 0) / (expense.exchangeRate || rate))),
        0,
      );
      const revenueTjs = breakdown?.revenueTjs ?? 0;
      const revenueUsd = breakdown?.revenueUsd ?? 0;
      const cogsTjs = breakdown?.cogsTjs ?? 0;
      const cogsUsd = breakdown?.cogsUsd ?? 0;
      const grossProfitTjs = revenueTjs - cogsTjs;
      const grossProfitUsd = revenueUsd - cogsUsd;
      const profitTjs = breakdown?.profitTjs ?? grossProfitTjs;
      const profitUsd = breakdown?.profitUsd ?? grossProfitUsd;

      reportSummary = {
        periodLabel,
        storeName: salesReportStoreName,
        exchangeRate: rate,
        unitsSold: breakdown?.unitsSold ?? 0,
        revenueTjs,
        revenueUsd,
        cogsTjs,
        cogsUsd,
        grossProfitTjs,
        grossProfitUsd,
        refundPenaltiesTjs: profitTjs - grossProfitTjs,
        refundPenaltiesUsd: profitUsd - grossProfitUsd,
        profitTjs,
        profitUsd,
        cashBonusesTjs: 0,
        cashBonusesUsd: 0,
        expensesTjs: +expensesTjs.toFixed(2),
        expensesUsd: +expensesUsd.toFixed(2),
        netProfitTjs: +(profitTjs - expensesTjs).toFixed(2),
        netProfitUsd: +(profitUsd - expensesUsd).toFixed(2),
      };
    }

    setReportDownloading(true);
    try {
      await exportComprehensiveReport({
        sales: reportSales,
        expenses: reportExpenses,
        summary: reportSummary,
        generatedBy: currentUser?.name,
      });
    } catch (error) {
      console.error('Failed to create financial report', error);
      window.alert('Не удалось сформировать Excel-отчёт. Попробуйте ещё раз.');
    } finally {
      setReportDownloading(false);
    }
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
            <MonthPicker
              value={selectedMonth}
              onChange={(v) => {
                setSelectedMonth(v);
                setPeriod('SPECIFIC_MONTH');
              }}
              className="px-2 py-1 rounded-lg border border-accent text-accent text-xs font-bold bg-surface-raised focus:outline-none"
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

        {/* KPI SUMMARY: revenue / profit / expenses / net profit for the current
            period+store filter — all four straight from filteredData, so they always
            agree with the per-store cards and tables below (same source of truth). */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <StatCard
            label="Выручка"
            value={`${filteredData.revenueTjs.toLocaleString()} TJS`}
            subvalue={`≈ $${filteredData.revenueUsd.toLocaleString()}`}
            icon={Receipt}
            tone="neutral"
          />
          <StatCard
            label="Прибыль (с учетом возвратов)"
            value={`${filteredData.profitUsd >= 0 ? '+' : ''}$${filteredData.profitUsd.toLocaleString()}`}
            icon={TrendingUp}
            tone={filteredData.profitUsd >= 0 ? 'accent' : 'danger'}
          />
          <StatCard
            label="Общий расход"
            value={`$${filteredData.expensesUsd.toLocaleString()}`}
            icon={Wallet}
            tone="danger"
          />
          <StatCard
            label="Чистая прибыль"
            value={`${filteredData.netProfitUsd >= 0 ? '+' : ''}$${filteredData.netProfitUsd.toLocaleString()}`}
            subvalue="После вычета расходов"
            icon={PiggyBank}
            tone={filteredData.netProfitUsd >= 0 ? 'accent' : 'danger'}
          />
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

      </div>

      <ReportPreviewModal
        open={salesReportStoreId !== null}
        onClose={() => setSalesReportStoreId(null)}
        title={`Финансовый отчёт — ${salesReportStoreName}`}
        subtitle={`${periodLabel} • Excel: продажи, расходы и итого`}
        table={salesReportTable}
        onDownload={() => void downloadFinancialReport()}
        downloadLabel="Скачать Excel"
        downloading={reportDownloading}
        canDownload={!!summary}
      />
    </div>
  );
};
