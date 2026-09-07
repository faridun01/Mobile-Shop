import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BarChart3,
  Smartphone,
  ArrowDownRight,
  Download,
  FileSpreadsheet,
  Package,
  Wallet,
  Store as StoreIcon,
  Gift
} from 'lucide-react';
import {
  exportSalesReport, exportInventoryReport, exportExpensesReport, exportRepairsReport,
  buildSalesReportTable, buildInventoryReportTable, buildExpensesReportTable, buildRepairsReportTable
} from '../../utils/exportReports';
import { getBusinessDateKey } from '../../utils/businessDate';
import { ReportPreviewModal } from '../common/ReportPreviewModal';

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
    selectedStoreId: globalSelectedStoreId
  } = useApp();

  const [period, setPeriod] = useState<'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'>('TODAY');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  // Defaults to whichever store is currently active on the POS Terminal page —
  // an admin picking a store there should see that same store here without
  // re-picking it; they can still switch it locally afterward.
  const [selectedStore, setSelectedStore] = useState<string>(globalSelectedStoreId || 'all');
  const [previewReport, setPreviewReport] = useState<null | 'sales' | 'inventory' | 'expenses' | 'repairs'>(null);

  const rate = todayRate?.rate || 9.50;

  const selectedStoreName = selectedStore === 'all' ? 'все магазины' : (stores.find(s => s.id === selectedStore)?.name || selectedStore);
  const periodLabel = period === 'TODAY' ? 'сегодня' : period === 'MONTH' ? 'текущий месяц' : period === 'SPECIFIC_MONTH' ? selectedMonth : 'весь период';

  // Datasets actually going into the exports/preview — mirror the on-screen period
  // and store filters (unlike the raw sales/devices/expenses/repairs arrays, which
  // previously fed the downloads unfiltered regardless of what was selected above).
  const exportSales = useMemo(() => {
    const todayStr = getBusinessDateKey();
    const currentMonthStr = todayStr.substring(0, 7);
    let result = sales;
    if (period === 'TODAY') result = result.filter(s => s.date.startsWith(todayStr));
    else if (period === 'MONTH') result = result.filter(s => s.date.startsWith(currentMonthStr));
    else if (period === 'SPECIFIC_MONTH') result = result.filter(s => s.date.startsWith(selectedMonth));
    if (selectedStore !== 'all') result = result.filter(s => s.storeId === selectedStore);
    return result;
  }, [sales, period, selectedMonth, selectedStore]);

  const exportExpenses = useMemo(() => {
    const todayStr = getBusinessDateKey();
    const currentMonthStr = todayStr.substring(0, 7);
    let result = expenses;
    if (period === 'TODAY') result = result.filter(e => e.date.startsWith(todayStr));
    else if (period === 'MONTH') result = result.filter(e => e.date.startsWith(currentMonthStr));
    else if (period === 'SPECIFIC_MONTH') result = result.filter(e => e.date.startsWith(selectedMonth));
    if (selectedStore !== 'all') result = result.filter(e => e.storeId === selectedStore);
    return result;
  }, [expenses, period, selectedMonth, selectedStore]);

  // Inventory is a point-in-time snapshot (no created-date period makes sense for
  // "what's on the shelf right now"), so only the store filter applies.
  const exportDevices = useMemo(() => {
    if (selectedStore === 'all') return devices;
    return devices.filter(d => d.locationId === selectedStore);
  }, [devices, selectedStore]);

  const exportRepairs = useMemo(() => {
    const todayStr = getBusinessDateKey();
    const currentMonthStr = todayStr.substring(0, 7);
    let result = repairs;
    if (period === 'TODAY') result = result.filter(r => (r.createdAt || '').startsWith(todayStr));
    else if (period === 'MONTH') result = result.filter(r => (r.createdAt || '').startsWith(currentMonthStr));
    else if (period === 'SPECIFIC_MONTH') result = result.filter(r => (r.createdAt || '').startsWith(selectedMonth));
    if (selectedStore !== 'all') result = result.filter(r => r.storeId === selectedStore);
    return result;
  }, [repairs, period, selectedMonth, selectedStore]);

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

  // Filtered dataset & financial calculations
  const filteredData = useMemo(() => {
    const todayStr = getBusinessDateKey();
    const currentMonthStr = todayStr.substring(0, 7);

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
    let historicalRevenueTjs = 0;
    let historicalCogsTjs = 0;
    let unitsSold = 0;
    const modelCounts: Record<string, { count: number; revenueUsd: number; cogsUsd: number; profitUsd: number }> = {};

    // Gift devices from supplier bonuses always carry a $0 cost basis, so any sold item
    // with no cost basis is, by construction, a bonus phone realizing 100% profit.
    let giftDeviceUnitsSold = 0;
    let giftDeviceProfitUsd = 0;
    let giftDeviceProfitTjs = 0;

    periodSales.forEach(sale => {
      const saleRate = sale.exchangeRate || rate;
      const saleRevenueUsd = sale.totalUsd || +(sale.totalTjs / saleRate).toFixed(2);
      revenueUsd += saleRevenueUsd;
      historicalRevenueTjs += sale.totalTjs;

      // The server persists recognized profit because an exchanged sale cannot be
      // reconstructed from only the current SaleItem: the returned phone is back in
      // inventory and the replacement has a different cost basis.
      const fallbackCostUsd = sale.items.reduce((sum, item) => sum + (item.costBasisUsd || item.purchaseCostUsd || 0), 0);
      const saleProfitUsd = sale.recognizedProfitUsd ?? (saleRevenueUsd - fallbackCostUsd);
      cogsUsd += saleRevenueUsd - saleProfitUsd;
      historicalCogsTjs += (saleRevenueUsd - saleProfitUsd) * saleRate;

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

        if (!itemCostUsd) {
          giftDeviceUnitsSold += 1;
          giftDeviceProfitUsd += itemPriceUsd;
          giftDeviceProfitTjs += item.salePriceTjs || itemPriceUsd * saleRate;
        }
      });
    });

    const grossProfitUsd = +(revenueUsd - cogsUsd).toFixed(2);
    const totalRevenueUsd = +revenueUsd.toFixed(2);
    const revenueTjs = Math.round(historicalRevenueTjs);
    const cogsTjs = Math.round(historicalCogsTjs);
    const grossProfitTjs = revenueTjs - cogsTjs;
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
        if (period === 'TODAY') return bDate.startsWith(todayStr);
        if (period === 'MONTH') return bDate.startsWith(currentMonthStr);
        if (period === 'SPECIFIC_MONTH') return bDate.startsWith(selectedMonth);
        return true;
      })
      .reduce((acc, b) => acc + (b.amountUsd || 0), 0);
    const periodCashBonusesTjs = (supplierBonuses || [])
      .filter(b => {
        if (b.bonusType !== 'CASH_DISCOUNT' || !b.amountUsd) return false;
        const bDate = b.dateReceived || b.date;
        if (!bDate) return true;
        if (period === 'TODAY') return bDate.startsWith(todayStr);
        if (period === 'MONTH') return bDate.startsWith(currentMonthStr);
        if (period === 'SPECIFIC_MONTH') return bDate.startsWith(selectedMonth);
        return true;
      })
      .reduce((acc, b) => acc + (b.amountUsd || 0) * b.exchangeRate, 0);

    // Free-device (gift phone) bonuses received in the period — their profit only
    // materializes once sold (tracked above via giftDeviceProfitUsd), this just counts
    // how many arrived so the two figures can be shown side by side.
    const periodFreeDeviceBonusesReceived = (supplierBonuses || [])
      .filter(b => {
        if (b.bonusType !== 'FREE_DEVICES') return false;
        const bDate = b.dateReceived || b.date;
        if (!bDate) return true;
        if (period === 'TODAY') return bDate.startsWith(todayStr);
        if (period === 'MONTH') return bDate.startsWith(currentMonthStr);
        if (period === 'SPECIFIC_MONTH') return bDate.startsWith(selectedMonth);
        return true;
      }).length;
    const freeDeviceBonusesInStock = (supplierBonuses || [])
      .filter(b => b.bonusType === 'FREE_DEVICES' && b.status !== 'SOLD').length;

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
    const periodRefundPenaltiesTjs = (sales || [])
      .filter(s => {
        if (s.status !== 'REFUNDED' || !s.penaltyFeeTjs) return false;
        if (selectedStore !== 'all' && s.storeId !== selectedStore) return false;
        const rDate = (s.refundedAt || s.date || '').split('T')[0];
        if (period === 'TODAY') return rDate === todayStr;
        if (period === 'MONTH') return rDate.startsWith(currentMonthStr);
        if (period === 'SPECIFIC_MONTH') return rDate.startsWith(selectedMonth);
        return true;
      })
      .reduce((acc, s) => acc + (s.penaltyFeeTjs || 0), 0);

    // Net Profit in USD & TJS (sales gross profit - all expenses, including repair
    // parts/labor which is already inside expensesUsd - + 100% cash supplier bonuses
    // + 100% refund penalties).
    const netProfitUsd = +(grossProfitUsd - expensesUsd + periodCashBonusesUsd + periodRefundPenaltiesUsd).toFixed(2);
    const netProfitTjs = Math.round(grossProfitTjs - expensesTjs + periodCashBonusesTjs + periodRefundPenaltiesTjs);

    const totalSupplierDebtUsd = suppliers.reduce((acc, s) => acc + s.totalDebtUsd, 0);
    const totalSupplierDebtTjs = Math.round(totalSupplierDebtUsd * rate);

    // Главный склад owns purchasing/supplier relations — this account is split out
    // from retail store cash so the two-tier model (warehouse funds purchases &
    // pays suppliers, stores just sell) is visible at a glance instead of blended
    // into one "total cash" number.
    const mainWarehouseStore = stores.find(s => s.isMainWarehouse);
    const mainWarehouseStock = devices.filter(device =>
      device.locationId === mainWarehouseStore?.id &&
      device.status === 'MAIN_WAREHOUSE'
    );
    const mainWarehouseStockCostUsd = +mainWarehouseStock
      .reduce((sum, device) => sum + (device.costBasisUsd || device.purchaseCostUsd || 0), 0)
      .toFixed(2);
    const mainWarehouseStockCostTjs = Math.round(mainWarehouseStockCostUsd * rate);
    const mainWarehouseCashTjs = mainWarehouseStore?.cashBalanceTjs || 0;
    const mainWarehouseCashUsd = +(mainWarehouseCashTjs / rate).toFixed(2);
    const retailStoresList = stores.filter(s => !s.isMainWarehouse);

    const topSuppliersByDebt = [...suppliers]
      .filter(s => s.totalDebtUsd > 0)
      .sort((a, b) => b.totalDebtUsd - a.totalDebtUsd)
      .slice(0, 8);

    // Per-store P&L breakdown, always for ALL retail stores regardless of the store
    // filter dropdown — so nothing needs flipping through one store at a time to see
    // where the money actually came from this period.
    let periodSalesAllStores = sales.filter(s => s.status !== 'REFUNDED');
    if (period === 'TODAY') periodSalesAllStores = periodSalesAllStores.filter(s => s.date.startsWith(todayStr));
    else if (period === 'MONTH') periodSalesAllStores = periodSalesAllStores.filter(s => s.date.startsWith(currentMonthStr));
    else if (period === 'SPECIFIC_MONTH') periodSalesAllStores = periodSalesAllStores.filter(s => s.date.startsWith(selectedMonth));

    const storeBreakdown = retailStoresList
      .filter(store => selectedStore === 'all' || store.id === selectedStore)
      .map(store => {
      const storeSales = periodSalesAllStores.filter(s => s.storeId === store.id);
      let storeRevenueUsd = 0;
      let storeRevenueTjs = 0;
      let storeCogsUsd = 0;
      let storeCogsTjs = 0;
      let storeProfitUsd = 0;
      let storeProfitTjs = 0;
      let storeUnits = 0;
      storeSales.forEach(sale => {
        const saleRate = sale.exchangeRate || rate;
        const saleRevenueUsd = sale.totalUsd || +(sale.totalTjs / saleRate).toFixed(2);
        const fallbackCostUsd = sale.items.reduce((sum, item) => sum + (item.costBasisUsd || item.purchaseCostUsd || 0), 0);
        const saleProfitUsd = sale.recognizedProfitUsd ?? (saleRevenueUsd - fallbackCostUsd);
        const saleCogsUsd = saleRevenueUsd - saleProfitUsd;
        storeRevenueUsd += saleRevenueUsd;
        storeRevenueTjs += sale.totalTjs;
        storeCogsUsd += saleCogsUsd;
        storeCogsTjs += saleCogsUsd * saleRate;
        storeProfitUsd += saleProfitUsd;
        storeProfitTjs += sale.totalTjs - saleCogsUsd * saleRate;
        storeUnits += sale.items.length;
      });
      const stock = devices.filter(device =>
        device.locationId === store.id &&
        (device.status === 'STORE_STOCK' || device.status === 'IN_STOCK_AFTER_EXCHANGE')
      );
      const stockCostUsd = stock.reduce((sum, device) => sum + (device.costBasisUsd || device.purchaseCostUsd || 0), 0);
      return {
        storeId: store.id,
        storeName: store.name,
        revenueUsd: +storeRevenueUsd.toFixed(2),
        revenueTjs: Math.round(storeRevenueTjs),
        cogsUsd: +storeCogsUsd.toFixed(2),
        cogsTjs: Math.round(storeCogsTjs),
        profitUsd: +storeProfitUsd.toFixed(2),
        profitTjs: Math.round(storeProfitTjs),
        unitsSold: storeUnits,
        salesCount: storeSales.length,
        cashTjs: store.cashBalanceTjs,
        stockCount: stock.length,
        stockCostUsd: +stockCostUsd.toFixed(2),
        stockCostTjs: Math.round(stockCostUsd * rate),
      };
    }).sort((a, b) => b.revenueUsd - a.revenueUsd);

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
      periodCashBonusesUsd: +periodCashBonusesUsd.toFixed(2),
      periodCashBonusesTjs: Math.round(periodCashBonusesTjs),
      giftDeviceUnitsSold,
      giftDeviceProfitUsd: +giftDeviceProfitUsd.toFixed(2),
      giftDeviceProfitTjs: Math.round(giftDeviceProfitTjs),
      periodFreeDeviceBonusesReceived,
      freeDeviceBonusesInStock,
      totalSupplierDebtUsd: +totalSupplierDebtUsd.toFixed(2),
      totalSupplierDebtTjs,
      mainWarehouseStockCount: mainWarehouseStock.length,
      mainWarehouseStockCostUsd,
      mainWarehouseStockCostTjs,
      mainWarehouseCashUsd,
      mainWarehouseCashTjs,
      topSuppliersByDebt,
      storeBreakdown,
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

          {/* Quick Export Sales — opens the same preview as the card below, scoped to the filters above */}
          <button
            onClick={() => setPreviewReport('sales')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-bold text-xs transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ЭКСПОРТ (CSV)</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">

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
                {filteredData.mainWarehouseCashTjs.toLocaleString()} TJS
              </p>
              <p className="text-[10px] text-fg-subtle">
                ≈ ${filteredData.mainWarehouseCashUsd.toLocaleString()}
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
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
                  <span>КАССА МАГАЗИНА</span>
                  <Wallet className="w-3.5 h-3.5 text-accent" />
                </div>
                <p className="text-base sm:text-lg font-bold text-fg">
                  {store.cashTjs.toLocaleString()} TJS
                </p>
                <p className="text-[10px] text-fg-subtle">
                  ≈ ${(store.cashTjs / rate).toFixed(2)}
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
