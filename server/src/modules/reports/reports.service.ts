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
    // The breakdown uses the same store scope, so unrelated stores are not needed.
    prisma.sale.findMany({
      where: {
        status: { not: 'REFUNDED' },
        ...(storeFilter ? { storeId: storeFilter } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      select: {
        id: true, storeId: true, totalTjs: true, totalUsd: true, exchangeRate: true,
        saleItems: { select: {
          brand: true, model: true, salePriceUsd: true, salePriceTjs: true,
          costBasisUsd: true, purchaseCostUsd: true,
        } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({
      where: { cancelledAt: null, ...(dateRange ? { createdAt: dateRange } : {}), ...(storeFilter ? { storeId: storeFilter } : {}) },
      select: { storeId: true, amountTjs: true, amountUsd: true, exchangeRate: true },
    }),
    // Supplier bonuses aren't a high-growth table (one row per negotiated bonus, not per
    // transaction) so they're just fetched in full and filtered in memory, same as before.
    prisma.supplierBonus.findMany({ select: { bonusType: true, amountUsd: true, dateReceived: true, exchangeRate: true, status: true } }),
    // Refund penalties use the same scope as sales and the per-store breakdown.
    prisma.sale.findMany({
      where: {
        status: 'REFUNDED',
        ...(storeFilter ? { storeId: storeFilter } : {}),
        penaltyFeeUsd: { not: null },
        ...(dateRange ? { refundedAt: dateRange } : {}),
      },
      select: { storeId: true, penaltyFeeUsd: true, penaltyFeeTjs: true },
    }),
    prisma.supplier.aggregate({ _sum: { totalDebtUsd: true } }),
    prisma.supplier.findMany({ where: { totalDebtUsd: { gt: 0 } }, orderBy: { totalDebtUsd: 'desc' }, take: 8,
      select: { id: true, name: true, totalPurchasedUsd: true, totalPaidUsd: true, totalDebtUsd: true } }),
    prisma.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true, cashBalanceTjs: true } }),
    prisma.store.findMany({ where: { isMainWarehouse: false, ...(storeFilter ? { id: storeFilter } : {}) },
      select: { id: true, name: true, cashBalanceTjs: true } }),
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

// ---------------------------------------------------------------------------
// Finance module reports (Phase 2) — the first reports in this file built on
// FinancialTransaction/FinancialAccount instead of Sale/Expense/Store.cashBalanceTjs.
// ---------------------------------------------------------------------------

type PeriodInput = { period: ReportPeriod; month?: string };

/**
 * Signed TJS/USD movement a single account experienced within `dateRange` (undefined =
 * all time), from the account's own point of view: as the transaction's `accountId` its
 * sign follows `direction` (IN=+, OUT/NEUTRAL=-, since a NEUTRAL row today is always a
 * TRANSFER whose `accountId` side is the source); as the `destinationAccountId` of a
 * TRANSFER it's always a receipt (+). Used to walk a current cached balance backwards to
 * what it must have been at the start of the period, without storing daily snapshots.
 */
async function computeAccountPeriodMovement(accountId: string, dateRange?: { gte?: Date; lt?: Date }) {
  const [asSource, asDestination] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { accountId, ...(dateRange ? { transactionDate: dateRange } : {}) },
      select: { direction: true, balanceCurrency: true, amountTjs: true, amountUsd: true },
    }),
    prisma.financialTransaction.findMany({
      where: { destinationAccountId: accountId, ...(dateRange ? { transactionDate: dateRange } : {}) },
      select: { balanceCurrency: true, amountTjs: true, amountUsd: true },
    }),
  ]);

  let deltaTjs = 0;
  let deltaUsd = 0;
  for (const t of asSource) {
    const amount = t.balanceCurrency === 'TJS' ? t.amountTjs : t.amountUsd;
    const signed = t.direction === 'IN' ? amount : -amount;
    if (t.balanceCurrency === 'TJS') deltaTjs += signed;
    else deltaUsd += signed;
  }
  for (const t of asDestination) {
    const amount = t.balanceCurrency === 'TJS' ? t.amountTjs : t.amountUsd;
    if (t.balanceCurrency === 'TJS') deltaTjs += amount;
    else deltaUsd += amount;
  }
  return { deltaTjs, deltaUsd };
}

/** Resolves which FinancialAccount rows a report should cover for a given store filter. */
async function resolveReportAccounts(storeId?: string) {
  if (storeId && storeId !== 'all') {
    const account = await prisma.financialAccount.findUnique({ where: { storeId } });
    return account ? [account] : [];
  }
  return prisma.financialAccount.findMany({ where: { active: true } });
}

async function computeCategoryBreakdown(accountIds: string[], dateRange?: { gte: Date; lt: Date }) {
  if (accountIds.length === 0) return { income: [], expense: [], incomeTotalTjs: 0, incomeTotalUsd: 0, expenseTotalTjs: 0, expenseTotalUsd: 0 };

  // A reversal subtracts from its original category/direction, rather than
  // inventing an expense for cancelled income (or income for cancelled expense).
  const [groups, categories] = await Promise.all([
    prisma.financialTransaction.groupBy({
      by: ['categoryId', 'direction', 'reversedTransactionId'],
      where: { accountId: { in: accountIds }, direction: { in: ['IN', 'OUT'] }, ...(dateRange ? { transactionDate: dateRange } : {}) },
      _sum: { amountTjs: true, amountUsd: true },
    }),
    prisma.financialCategory.findMany({ select: { id: true, name: true } }),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // groupBy's `_sum` bypasses the decimal-extension's per-field result mapping (that only
  // covers normal record shapes), so these come back as raw Prisma.Decimal instances —
  // Number(...) converts via Decimal's string valueOf, same effect as .toNumber().
  const toRow = (g: { categoryId: string | null; _sum: { amountTjs: unknown; amountUsd: unknown } }) => ({
    categoryId: g.categoryId,
    categoryName: g.categoryId ? categoryName.get(g.categoryId) ?? 'Без категории' : 'Без категории',
    amountTjs: roundMoney(Number(g._sum.amountTjs) || 0),
    amountUsd: roundMoney(Number(g._sum.amountUsd) || 0),
  });

  const incomeMap = new Map<string | null, ReturnType<typeof toRow>>();
  const expenseMap = new Map<string | null, ReturnType<typeof toRow>>();
  for (const group of groups) {
    const reversal = Boolean(group.reversedTransactionId);
    const isIncome = reversal ? group.direction === 'OUT' : group.direction === 'IN';
    const map = isIncome ? incomeMap : expenseMap;
    const row = toRow(group);
    const previous = map.get(row.categoryId);
    const sign = reversal ? -1 : 1;
    map.set(row.categoryId, { ...row,
      amountTjs: roundMoney((previous?.amountTjs ?? 0) + sign * row.amountTjs),
      amountUsd: roundMoney((previous?.amountUsd ?? 0) + sign * row.amountUsd),
    });
  }
  const income = [...incomeMap.values()].filter(r => r.amountTjs !== 0 || r.amountUsd !== 0).sort((a, b) => b.amountTjs - a.amountTjs);
  const expense = [...expenseMap.values()].filter(r => r.amountTjs !== 0 || r.amountUsd !== 0).sort((a, b) => b.amountTjs - a.amountTjs);
  return {
    income,
    expense,
    incomeTotalTjs: roundMoney(income.reduce((s, r) => s + r.amountTjs, 0)),
    incomeTotalUsd: roundMoney(income.reduce((s, r) => s + r.amountUsd, 0)),
    expenseTotalTjs: roundMoney(expense.reduce((s, r) => s + r.amountTjs, 0)),
    expenseTotalUsd: roundMoney(expense.reduce((s, r) => s + r.amountUsd, 0)),
  };
}

export interface CashFlowReportInput extends PeriodInput {
  storeId?: string;
}

export async function computeCashFlowReport(input: CashFlowReportInput) {
  const dateRange = dateRangeForPeriod(input.period, input.month);
  const accounts = await resolveReportAccounts(input.storeId);

  const movements = await Promise.all(accounts.map((a) => computeAccountPeriodMovement(a.id, dateRange)));
  const laterMovements = await Promise.all(accounts.map((a) => dateRange
    ? computeAccountPeriodMovement(a.id, { gte: dateRange.lt })
    : Promise.resolve({ deltaTjs: 0, deltaUsd: 0 })));
  let openingBalanceTjs = 0;
  let openingBalanceUsd = 0;
  let closingBalanceTjs = 0;
  let closingBalanceUsd = 0;
  accounts.forEach((account, i) => {
    const closingTjs = account.balanceTjs - laterMovements[i].deltaTjs;
    const closingUsd = account.balanceUsd - laterMovements[i].deltaUsd;
    closingBalanceTjs += closingTjs;
    closingBalanceUsd += closingUsd;
    openingBalanceTjs += closingTjs - movements[i].deltaTjs;
    openingBalanceUsd += closingUsd - movements[i].deltaUsd;
  });

  const breakdown = await computeCategoryBreakdown(accounts.map((a) => a.id), dateRange);

  return {
    openingBalanceTjs: roundMoney(openingBalanceTjs),
    openingBalanceUsd: roundMoney(openingBalanceUsd),
    closingBalanceTjs: roundMoney(closingBalanceTjs),
    closingBalanceUsd: roundMoney(closingBalanceUsd),
    income: breakdown.income,
    expense: breakdown.expense,
    incomeTotalTjs: breakdown.incomeTotalTjs,
    incomeTotalUsd: breakdown.incomeTotalUsd,
    expenseTotalTjs: breakdown.expenseTotalTjs,
    expenseTotalUsd: breakdown.expenseTotalUsd,
  };
}

export interface AccountStatementInput extends PeriodInput {
  accountId: string;
}

export async function computeAccountStatement(input: AccountStatementInput) {
  const account = await prisma.financialAccount.findUnique({ where: { id: input.accountId } });
  if (!account) throw new Error('Счёт не найден');

  const dateRange = dateRangeForPeriod(input.period, input.month);
  const movement = await computeAccountPeriodMovement(account.id, dateRange);
  const later = dateRange ? await computeAccountPeriodMovement(account.id, { gte: dateRange.lt }) : { deltaTjs: 0, deltaUsd: 0 };
  const openingBalanceTjs = roundMoney(account.balanceTjs - later.deltaTjs - movement.deltaTjs);
  const openingBalanceUsd = roundMoney(account.balanceUsd - later.deltaUsd - movement.deltaUsd);

  const transactions = await prisma.financialTransaction.findMany({
    where: {
      OR: [{ accountId: account.id }, { destinationAccountId: account.id }],
      ...(dateRange ? { transactionDate: dateRange } : {}),
    },
    orderBy: [{ transactionDate: 'asc' }, { transactionNumber: 'asc' }],
    include: { category: { select: { name: true } }, account: { select: { name: true } }, destinationAccount: { select: { name: true } } },
  });

  let runningTjs = openingBalanceTjs;
  let runningUsd = openingBalanceUsd;
  const rows = transactions.map((t) => {
    const isSource = t.accountId === account.id;
    const amount = t.balanceCurrency === 'TJS' ? t.amountTjs : t.amountUsd;
    const signed = isSource ? (t.direction === 'IN' ? amount : -amount) : amount;
    if (t.balanceCurrency === 'TJS') runningTjs = roundMoney(runningTjs + signed);
    else runningUsd = roundMoney(runningUsd + signed);
    return {
      id: t.id,
      transactionNumber: t.transactionNumber,
      transactionDate: t.transactionDate,
      type: t.type,
      description: t.description,
      categoryName: t.category?.name ?? null,
      counterpartyName: t.counterpartyName,
      balanceCurrency: t.balanceCurrency,
      signedAmount: roundMoney(signed),
      runningBalanceTjs: runningTjs,
      runningBalanceUsd: runningUsd,
    };
  });

  return {
    account: { id: account.id, name: account.name, type: account.type },
    openingBalanceTjs,
    openingBalanceUsd,
    closingBalanceTjs: runningTjs,
    closingBalanceUsd: runningUsd,
    rows,
  };
}

export interface IncomeExpenseReportInput extends PeriodInput {
  storeId?: string;
}

export async function computeIncomeExpenseReport(input: IncomeExpenseReportInput) {
  const dateRange = dateRangeForPeriod(input.period, input.month);
  const accounts = await resolveReportAccounts(input.storeId);
  return computeCategoryBreakdown(accounts.map((a) => a.id), dateRange);
}
