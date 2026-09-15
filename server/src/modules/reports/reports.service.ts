import { prisma } from '../../prisma/prisma.service';
import { getRateForDate } from '../exchange-rate/exchange-rate.service';
import { calculateRecognizedProfit } from '../sales/profit';
import { roundMoney } from '../../common/money';

import { dateRangeForPeriod, type ReportPeriod } from '../../common/business-date';
export { dateRangeForPeriod, type ReportPeriod } from '../../common/business-date';

export interface ReportsSummaryInput {
  period: ReportPeriod;
  month?: string; // 'YYYY-MM', required for SPECIFIC_MONTH
  storeId?: string; // retail store id, or 'all'/undefined for every store
}

const IN_STOCK_STATUSES = ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] as const;

function dateWithinRange(iso: string | Date | null | undefined, range?: { gte: Date; lt: Date }): boolean {
  if (!range) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.gte.getTime() && t < range.lt.getTime();
}

function groupByStore<T extends { storeId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.storeId);
    if (group) group.push(row);
    else groups.set(row.storeId, [row]);
  }
  return groups;
}

export async function computeReportsSummary(input: ReportsSummaryInput) {
  const dateRange = dateRangeForPeriod(input.period, input.month);
  const storeFilter = input.storeId && input.storeId !== 'all' ? input.storeId : undefined;

  // First wave: every query here is independent of the others, so they go to the DB
  // together instead of one round-trip at a time — each of these used to be a separate
  // sequential `await`, and that latency only compounds as the dataset (and DB round-trip
  // time) grows.
  const [
    rateRow,
    periodSalesAllStores,
    periodExpensesAllStores,
    allBonuses,
    refundedSalesAllStores,
    supplierDebtAgg,
    topSuppliersByDebt,
    mainWarehouseStore,
    retailStores,
  ] = await Promise.all([
    getRateForDate(new Date()),
    // Sales for the period, across ALL retail stores (per-store breakdown always shows every
    // store regardless of the store filter) — the date range is the only thing that needs to
    // scale with history, so it's the only filter applied at the DB level here.
    prisma.sale.findMany({
      where: {
        status: { not: 'REFUNDED' },
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: { saleItems: true },
      orderBy: { createdAt: 'desc' },
    }),
    // Expenses for the period — same pattern: date-scoped at the DB, store-scoped in memory
    // (a much smaller set by then) since only the top-level total needs the store filter.
    prisma.expense.findMany({ where: dateRange ? { createdAt: dateRange } : undefined }),
    // Supplier bonuses aren't a high-growth table (one row per negotiated bonus, not per
    // transaction) so they're just fetched in full and filtered in memory, same as before.
    prisma.supplierBonus.findMany({ select: { bonusType: true, amountUsd: true, dateReceived: true, exchangeRate: true, status: true } }),
    // Fetched across all stores (not just storeFilter) so the per-store breakdown below can
    // fold each store's own penalties into its "Прибыль" the same way the overall total does —
    // otherwise a refund's retained penalty would only ever show up in the all-stores figure.
    prisma.sale.findMany({
      where: {
        status: 'REFUNDED',
        penaltyFeeUsd: { not: null },
        ...(dateRange ? { refundedAt: dateRange } : {}),
      },
      select: { storeId: true, penaltyFeeUsd: true, penaltyFeeTjs: true },
    }),
    prisma.supplier.aggregate({ _sum: { totalDebtUsd: true } }),
    prisma.supplier.findMany({ where: { totalDebtUsd: { gt: 0 } }, orderBy: { totalDebtUsd: 'desc' }, take: 8 }),
    prisma.store.findFirst({ where: { isMainWarehouse: true } }),
    prisma.store.findMany({ where: { isMainWarehouse: false, ...(storeFilter ? { id: storeFilter } : {}) } }),
  ]);
  const rate = rateRow || 9.5;

  // Second wave: each of these depends on an id from wave one (sale ids / store ids), so it
  // has to wait — but the three of them are still independent of each other.
  const saleIds = periodSalesAllStores.map((s) => s.id);
  const [profitLogs, mainWarehouseStock, retailStock] = await Promise.all([
    saleIds.length
      ? prisma.auditLog.findMany({
          where: { targetId: { in: saleIds }, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'] } },
          select: { targetId: true, action: true, financialDetails: true },
        })
      : Promise.resolve([]),
    mainWarehouseStore
      ? prisma.device.findMany({ where: { storeId: mainWarehouseStore.id, status: 'MAIN_WAREHOUSE' }, select: { costBasisUsd: true, purchasePriceUsd: true } })
      : Promise.resolve([]),
    // Only the current in-stock devices at retail stores are needed for the per-store cards —
    // this is what actually bounds the query as devices pile up over the years, since every
    // SOLD device that ever existed would otherwise come along for the ride.
    prisma.device.findMany({
      where: { storeId: { in: retailStores.map((s) => s.id) }, status: { in: [...IN_STOCK_STATUSES] } },
      select: { storeId: true, costBasisUsd: true, purchasePriceUsd: true },
    }),
  ]);
  const profitsBySale = new Map<string, typeof profitLogs>();
  for (const log of profitLogs) {
    if (log.targetId) profitsBySale.set(log.targetId, [...(profitsBySale.get(log.targetId) ?? []), log]);
  }
  const recognizedProfitById = new Map<string, number>();
  for (const sale of periodSalesAllStores) {
    const fallbackCost = sale.saleItems.reduce((sum, item) => sum + item.costBasisUsd, 0);
    recognizedProfitById.set(sale.id, calculateRecognizedProfit(profitsBySale.get(sale.id) ?? [], sale.totalUsd - fallbackCost));
  }

  const periodSales = storeFilter ? periodSalesAllStores.filter((s) => s.storeId === storeFilter) : periodSalesAllStores;
  const periodExpenses = storeFilter ? periodExpensesAllStores.filter((e) => e.storeId === storeFilter) : periodExpensesAllStores;

  let revenueUsd = 0;
  let cogsUsd = 0;
  let historicalRevenueTjs = 0;
  let historicalCogsTjs = 0;
  let unitsSold = 0;
  const modelCounts: Record<string, { count: number; revenueUsd: number; cogsUsd: number; profitUsd: number }> = {};
  let giftDeviceUnitsSold = 0;
  let giftDeviceProfitUsd = 0;
  let giftDeviceProfitTjs = 0;

  periodSales.forEach((sale) => {
    const saleRate = sale.exchangeRate || rate;
    const saleRevenueUsd = sale.totalUsd || +(sale.totalTjs / saleRate).toFixed(2);
    revenueUsd += saleRevenueUsd;
    historicalRevenueTjs += sale.totalTjs;

    const saleProfitUsd = recognizedProfitById.get(sale.id) ?? 0;
    cogsUsd += saleRevenueUsd - saleProfitUsd;
    historicalCogsTjs += (saleRevenueUsd - saleProfitUsd) * saleRate;

    sale.saleItems.forEach((item) => {
      unitsSold++;
      const itemCostUsd = item.costBasisUsd ?? item.purchaseCostUsd ?? 0;
      const itemPriceUsd = item.salePriceUsd || +(item.salePriceTjs / saleRate).toFixed(2);
      const itemProfitUsd = +(itemPriceUsd - itemCostUsd).toFixed(2);

      const modelKey = `${item.brand} ${item.model}`.trim();
      if (!modelCounts[modelKey]) modelCounts[modelKey] = { count: 0, revenueUsd: 0, cogsUsd: 0, profitUsd: 0 };
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
  const revenueTjs = roundMoney(historicalRevenueTjs);
  const cogsTjs = roundMoney(historicalCogsTjs);
  const grossProfitTjs = revenueTjs - cogsTjs;
  const grossMarginPercent = revenueUsd > 0 ? +((grossProfitUsd / revenueUsd) * 100).toFixed(1) : 0;

  const expensesTjs = periodExpenses.reduce((acc, e) => acc + (e.amountTjs || 0), 0);
  const expensesUsd = +periodExpenses.reduce((acc, e) => acc + (e.amountUsd ?? ((e.amountTjs || 0) / (e.exchangeRate || rate))), 0).toFixed(2);

  const periodCashBonuses = allBonuses.filter((b) => !storeFilter && b.bonusType === 'CASH_DISCOUNT' && b.amountUsd && dateWithinRange(b.dateReceived, dateRange));
  const periodCashBonusesUsd = periodCashBonuses.reduce((acc, b) => acc + (b.amountUsd || 0), 0);
  const periodCashBonusesTjs = periodCashBonuses.reduce((acc, b) => acc + (b.amountUsd || 0) * b.exchangeRate, 0);

  const periodFreeDeviceBonusesReceived = allBonuses.filter((b) => b.bonusType === 'FREE_DEVICES' && dateWithinRange(b.dateReceived, dateRange)).length;
  const freeDeviceBonusesInStock = allBonuses.filter((b) => b.bonusType === 'FREE_DEVICES' && b.status !== 'SOLD').length;

  const refundedSales = storeFilter ? refundedSalesAllStores.filter((s) => s.storeId === storeFilter) : refundedSalesAllStores;
  const periodRefundPenaltiesUsd = refundedSales.reduce((acc, s) => acc + (s.penaltyFeeUsd || 0), 0);
  const periodRefundPenaltiesTjs = refundedSales.reduce((acc, s) => acc + (s.penaltyFeeTjs || 0), 0);
  const refundPenaltiesByStore = new Map<string, { usd: number; tjs: number }>();
  for (const s of refundedSalesAllStores) {
    if (!s.storeId) continue;
    const prev = refundPenaltiesByStore.get(s.storeId) || { usd: 0, tjs: 0 };
    refundPenaltiesByStore.set(s.storeId, { usd: prev.usd + (s.penaltyFeeUsd || 0), tjs: prev.tjs + (s.penaltyFeeTjs || 0) });
  }

  const netProfitUsd = +(grossProfitUsd - expensesUsd + periodCashBonusesUsd + periodRefundPenaltiesUsd).toFixed(2);
  const netProfitTjs = roundMoney(grossProfitTjs - expensesTjs + periodCashBonusesTjs + periodRefundPenaltiesTjs);

  const totalSupplierDebtUsd = Number(supplierDebtAgg._sum.totalDebtUsd ?? 0);
  const totalSupplierDebtTjs = roundMoney(totalSupplierDebtUsd * rate);

  const mainWarehouseStockCostUsd = +mainWarehouseStock.reduce((sum, d) => sum + (d.costBasisUsd ?? d.purchasePriceUsd ?? 0), 0).toFixed(2);
  const mainWarehouseStockCostTjs = roundMoney(mainWarehouseStockCostUsd * rate);
  const mainWarehouseCashTjs = mainWarehouseStore?.cashBalanceTjs || 0;
  const mainWarehouseCashUsd = +(mainWarehouseCashTjs / rate).toFixed(2);

  const salesByStore = groupByStore(periodSalesAllStores);
  const stockByStore = groupByStore(retailStock);
  const storeBreakdown = retailStores
    .map((store) => {
      const storeSales = (salesByStore.get(store.id) ?? []);
      let storeRevenueUsd = 0;
      let storeRevenueTjs = 0;
      let storeCogsUsd = 0;
      let storeCogsTjs = 0;
      let storeProfitUsd = 0;
      let storeProfitTjs = 0;
      let storeUnits = 0;
      storeSales.forEach((sale) => {
        const saleRate = sale.exchangeRate || rate;
        const saleRevenueUsd = sale.totalUsd || +(sale.totalTjs / saleRate).toFixed(2);
        const saleProfitUsd = recognizedProfitById.get(sale.id) ?? 0;
        const saleCogsUsd = saleRevenueUsd - saleProfitUsd;
        storeRevenueUsd += saleRevenueUsd;
        storeRevenueTjs += sale.totalTjs;
        storeCogsUsd += saleCogsUsd;
        storeCogsTjs += saleCogsUsd * saleRate;
        storeProfitUsd += saleProfitUsd;
        storeProfitTjs += sale.totalTjs - saleCogsUsd * saleRate;
        storeUnits += sale.saleItems.length;
      });
      const stock = (stockByStore.get(store.id) ?? []);
      const stockCostUsd = stock.reduce((sum, d) => sum + (d.costBasisUsd ?? d.purchasePriceUsd ?? 0), 0);
      // Same "с учетом возвратов" treatment as the overall totals: a refund's original
      // margin is gone, but the withheld penalty is real retained profit and counts here.
      const storePenalty = refundPenaltiesByStore.get(store.id) || { usd: 0, tjs: 0 };
      return {
        storeId: store.id,
        storeName: store.name,
        revenueUsd: +storeRevenueUsd.toFixed(2),
        revenueTjs: roundMoney(storeRevenueTjs),
        cogsUsd: +storeCogsUsd.toFixed(2),
        cogsTjs: roundMoney(storeCogsTjs),
        profitUsd: +(storeProfitUsd + storePenalty.usd).toFixed(2),
        profitTjs: roundMoney(storeProfitTjs + storePenalty.tjs),
        unitsSold: storeUnits,
        salesCount: storeSales.length,
        cashTjs: store.cashBalanceTjs,
        stockCount: stock.length,
        stockCostUsd: +stockCostUsd.toFixed(2),
        stockCostTjs: roundMoney(stockCostUsd * rate),
      };
    })
    .sort((a, b) => b.revenueUsd - a.revenueUsd);

  const sortedModelList = Object.entries(modelCounts)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.profitUsd - a.profitUsd || b.revenueUsd - a.revenueUsd);

  return {
    unitsSold,
    // Lets the frontend show "X чеков" per store/overall straight from this summary,
    // instead of fetching the full sales list (only actually needed for the Excel export).
    salesCount: periodSales.length,
    revenueUsd: +revenueUsd.toFixed(2),
    revenueTjs,
    cogsUsd: +cogsUsd.toFixed(2),
    cogsTjs,
    grossProfitUsd: +grossProfitUsd.toFixed(2),
    grossProfitTjs,
    grossMarginPercent,
    // "Прибыль (с учетом возвратов)" — the single recognized-profit figure the summary card,
    // the per-store cards (storeBreakdown.profitUsd/Tjs below) and netProfitUsd/Tjs all build
    // on, so they can no longer disagree the way the old client-side per-item calc did.
    profitUsd: +(grossProfitUsd + periodRefundPenaltiesUsd).toFixed(2),
    profitTjs: roundMoney(grossProfitTjs + periodRefundPenaltiesTjs),
    expensesTjs,
    expensesUsd,
    periodRefundPenaltiesUsd: roundMoney(periodRefundPenaltiesUsd),
    periodRefundPenaltiesTjs: roundMoney(periodRefundPenaltiesTjs),
    netProfitUsd,
    netProfitTjs,
    periodCashBonusesUsd: roundMoney(periodCashBonusesUsd),
    periodCashBonusesTjs: roundMoney(periodCashBonusesTjs),
    giftDeviceUnitsSold,
    giftDeviceProfitUsd: +giftDeviceProfitUsd.toFixed(2),
    giftDeviceProfitTjs: roundMoney(giftDeviceProfitTjs),
    periodFreeDeviceBonusesReceived,
    freeDeviceBonusesInStock,
    totalSupplierDebtUsd: +totalSupplierDebtUsd.toFixed(2),
    totalSupplierDebtTjs,
    mainWarehouseStockCount: mainWarehouseStock.length,
    mainWarehouseStockCostUsd,
    mainWarehouseStockCostTjs,
    mainWarehouseCashUsd,
    mainWarehouseCashTjs,
    topSuppliersByDebt: topSuppliersByDebt.map((s) => ({
      id: s.id,
      name: s.name,
      totalPurchasedUsd: s.totalPurchasedUsd,
      totalPaidUsd: s.totalPaidUsd,
      totalDebtUsd: s.totalDebtUsd,
    })),
    storeBreakdown,
    modelCounts: sortedModelList,
  };
}
