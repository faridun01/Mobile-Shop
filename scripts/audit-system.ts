import { D, decimalMax, type MoneyInput } from '../server/src/common/decimal';
import 'dotenv/config';
import { prisma } from '../server/src/prisma/prisma.service';
import { getBusinessDateKey } from '../server/src/common/business-date';

const close = (left: MoneyInput, right: MoneyInput, tolerance = 0.02) => D(left).minus(right).abs().lte(tolerance);

async function main() {
  const [stores, devices, sales, suppliers, invoices, owners, transfers, expenses, ledger, todayRate, storeShares] = await Promise.all([
    prisma.store.findMany({ select: { id: true, isMainWarehouse: true, cashBalanceUsd: true, active: true } }),
    prisma.device.findMany({ select: { id: true, storeId: true, status: true } }),
    prisma.sale.findMany({
      include: {
        saleItems: { select: { deviceId: true, salePriceTjs: true, costBasisUsd: true, returnId: true } },
        exchangeEvents: { select: { id: true } },
        paymentAllocations: { select: { allocatedAmountTjs: true } },
      },
    }),
    prisma.supplier.findMany({ select: { id: true, totalPurchasedUsd: true, totalPaidUsd: true, totalDebtUsd: true } }),
    prisma.supplierInvoice.findMany({ select: { id: true, supplierId: true, totalAmountUsd: true, paidAmountUsd: true } }),
    prisma.owner.findMany({ select: { id: true, profitSharePercent: true } }),
    prisma.transferRequest.findMany({ where: { status: 'PENDING_APPROVAL' }, include: { items: { select: { deviceId: true } } } }),
    prisma.expense.findMany({ select: { id: true, amountTjs: true, amountUsd: true, exchangeRate: true } }),
    prisma.ledgerEntry.findMany({ select: { type: true, referenceId: true } }),
    // Today is the business day (BUSINESS_TIME_ZONE), not the UTC date.
    prisma.exchangeRate.findUnique({ where: { date: getBusinessDateKey() } }),
    prisma.storeProfitShare.findMany({ select: { storeId: true, sharePercent: true } }),
  ]);

  const storeById = new Map(stores.map((store) => [store.id, store]));
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const ledgerRefs = new Set(ledger.map((entry) => entry.referenceId).filter(Boolean));
  const issues: { code: string; ids: string[]; count: number }[] = [];
  const add = (code: string, ids: string[]) => { if (ids.length) issues.push({ code, count: ids.length, ids: ids.slice(0, 20) }); };

  add('NEGATIVE_STORE_CASH', stores.filter((store) => !store.isMainWarehouse && D(store.cashBalanceUsd).lt(-0.01)).map((store) => `${store.id}:${store.cashBalanceUsd.toFixed(2)}USD`));
  add('AVAILABLE_DEVICE_LOCATION_STATUS_MISMATCH', devices.filter((device) => {
    const store = storeById.get(device.storeId);
    return !store || (device.status === 'MAIN_WAREHOUSE' && !store.isMainWarehouse) ||
      ((device.status === 'STORE_STOCK' || device.status === 'IN_STOCK_AFTER_EXCHANGE') && store.isMainWarehouse);
  }).map((device) => device.id));

  add('SALE_PAYMENT_TOTAL_MISMATCH', sales.filter((sale) => {
    if (sale.status === 'REFUNDED') return false;
    const paidOrDebt = D(sale.cashAmountTjs)
      .plus(sale.cardAmountTjs)
      .plus(sale.debtAmountTjs ?? 0)
      .plus(sale.exchangeTradeInCreditTjs ?? 0)
      .plus((sale.paymentAllocations || []).reduce((sum, a) => D(sum).plus(a.allocatedAmountTjs), D(0)));
    return !close(paidOrDebt, sale.totalTjs);
  }).map((sale) => sale.id));
  add('COMPLETED_SALE_ITEM_TOTAL_MISMATCH', sales.filter((sale) => (sale.status === 'COMPLETED' || sale.status === 'EXCHANGED') && !close(sale.saleItems.reduce((sum, item) => D(sum).plus(item.salePriceTjs), D(0)), sale.totalTjs)).map((sale) => sale.id));
  // A whole-receipt refund hands back what the customer actually paid (cash, bank, exchange credit
  // and debt repayments) less the penalty; any unpaid debt is forgiven, not refunded. Receipts
  // emptied phone by phone (returns, exchanges) carry no refund amount and are left out.
  add('REFUND_TOTAL_MISMATCH', sales.filter((sale) => {
    if (sale.status !== 'REFUNDED' || sale.actualRefundAmountTjs === null) return false;
    const paid = D(sale.cashAmountTjs).plus(sale.cardAmountTjs).plus(sale.exchangeTradeInCreditTjs ?? 0)
      .plus((sale.paymentAllocations || []).reduce((sum, a) => D(sum).plus(a.allocatedAmountTjs), D(0)));
    return !close(D(sale.actualRefundAmountTjs).plus(sale.penaltyFeeTjs ?? 0), paid);
  }).map((sale) => sale.id));
  add('ACTIVE_SALE_DEVICE_NOT_SOLD', sales.filter((sale) => sale.status !== 'REFUNDED' && sale.saleItems.some((item) => !item.returnId && deviceById.get(item.deviceId)?.status !== 'SOLD')).map((sale) => sale.id));
  // A refunded phone is back in stock, unless it has since been sold again on another active receipt.
  const soldOnActiveSale = new Set(sales.filter((sale) => sale.status !== 'REFUNDED').flatMap((sale) => sale.saleItems.filter((item) => !item.returnId).map((item) => item.deviceId)));
  add('REFUNDED_CURRENT_DEVICE_NOT_RESTOCKED', sales.filter((sale) => sale.status === 'REFUNDED' && sale.saleItems.some((item) => {
    const status = deviceById.get(item.deviceId)?.status ?? '';
    return status === 'SOLD' ? !soldOnActiveSale.has(item.deviceId) : !['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE', 'MAIN_WAREHOUSE', 'TRANSFER_PENDING', 'IN_REPAIR'].includes(status);
  })).map((sale) => sale.id));
  add('SALE_WITHOUT_LEDGER', sales.filter((sale) => !ledgerRefs.has(sale.id)).map((sale) => sale.id));
  add('EXPENSE_WITHOUT_LEDGER', expenses.filter((expense) => !ledgerRefs.has(expense.id)).map((expense) => expense.id));
  add('INVALID_EXPENSE_RATE_CONVERSION', expenses.filter((expense) => D(expense.amountTjs).lte(0) || !expense.exchangeRate || !expense.amountUsd || !close(expense.amountUsd, D(expense.amountTjs).div(expense.exchangeRate))).map((expense) => expense.id));

  add('INVOICE_OVERPAID', invoices.filter((invoice) => D(invoice.paidAmountUsd).gt(D(invoice.totalAmountUsd).plus(0.01))).map((invoice) => invoice.id));
  add('SUPPLIER_AGGREGATE_MISMATCH', suppliers.filter((supplier) => {
    const own = invoices.filter((invoice) => invoice.supplierId === supplier.id);
    const purchased = own.reduce((sum, invoice) => D(sum).plus(invoice.totalAmountUsd), D(0));
    const debt = own.reduce((sum, invoice) => D(sum).plus(decimalMax(0, D(invoice.totalAmountUsd).minus(invoice.paidAmountUsd))), D(0));
    return !close(supplier.totalPurchasedUsd, purchased) || !close(supplier.totalDebtUsd, debt);
  }).map((supplier) => supplier.id));

  add('PENDING_TRANSFER_DEVICE_NOT_RESERVED', transfers.filter((transfer) => transfer.items.some((item) => deviceById.get(item.deviceId)?.status !== 'TRANSFER_PENDING')).map((transfer) => transfer.id));
  if (!owners.length) add('OWNER_RECORDS_MISSING', ['owners']);
  else if (storeShares.length) {
    // Partner shares are set per store; the admin always gets the rest, so they must stay under 100%.
    const byStore = new Map<string, ReturnType<typeof D>>();
    for (const sh of storeShares) byStore.set(sh.storeId, (byStore.get(sh.storeId) ?? D(0)).plus(sh.sharePercent));
    add('STORE_PARTNER_SHARES_NOT_UNDER_100', [...byStore].filter(([, total]) => total.gte(100) || total.lt(0)).map(([storeId, total]) => `${storeId}:${total.toFixed(2)}%`));
  } else if (!close(owners.reduce((sum, owner) => D(sum).plus(owner.profitSharePercent), D(0)), 100)) add('OWNER_SHARES_NOT_100', owners.map((owner) => owner.id));
  if (!todayRate || D(todayRate.rate).lte(0)) add('TODAY_EXCHANGE_RATE_MISSING', ['today']);

  const counts = {
    stores: stores.length,
    devices: devices.length,
    sales: sales.length,
    suppliers: suppliers.length,
    invoices: invoices.length,
    expenses: expenses.length,
    owners: owners.length,
    pendingTransfers: transfers.length,
    ledgerEntries: ledger.length,
  };
  console.log(JSON.stringify({ ok: issues.length === 0, checkedAt: new Date().toISOString(), counts, issues }, null, 2));
  if (issues.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
