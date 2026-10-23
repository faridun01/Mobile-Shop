import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import assert from './lib/decimal-assert';
import { D } from '../server/src/common/decimal';

// Admin corrections of a sale, a return, a full refund and an exchange. The main check: an
// operation made and then corrected leaves the register (USD and somoni), every owner's profit,
// customer debt and the day's shift exactly as if it had been made correctly in the first place.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_edit_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
let disconnect: (() => Promise<void>) | undefined;
let server: import('node:http').Server | undefined;
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
try {
  for (const args of [
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'],
  ]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnect = () => prisma.$disconnect();
  const { SalesService } = await import('../server/src/modules/sales/sales.service');
  const { ReturnsService } = await import('../server/src/modules/sales/returns.service');
  const { RefundService } = await import('../server/src/modules/sales/refund.service');
  const { CancellationService } = await import('../server/src/modules/sales/cancellation.service');
  const { AnnulmentService } = await import('../server/src/modules/sales/annulment.service');
  const { ExchangesService } = await import('../server/src/modules/exchanges/exchanges.service');
  const { SaleEditService } = await import('../server/src/modules/sales/edit.service');
  const { DailyClosingService } = await import('../server/src/modules/finance/daily-closing.service');
  const { CashCollectionService, checkStoreShiftStatus } = await import('../server/src/modules/finance/cash-collection.service');
  const { registerLedgerBalance } = await import('../server/src/modules/finance/cash-balance');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  const { computeReportsSummary } = await import('../server/src/modules/reports/reports.service');
  const { activeRefundLogs } = await import('../server/src/modules/sales/cancellation-audit');
  const { calculateRecognizedProfit } = await import('../server/src/modules/sales/profit');
  const storeId = 'store-siyoma';
  const userId = 'user-admin';
  await setTodayRate(9.3, userId);

  // Test stock is supplied on credit, so the capital audit can reconcile its cost as well.
  const supplier = await prisma.supplier.create({ data: { name: 'Поставщик для исправлений' } });
  let serial = 0;
  const device = () => prisma.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id: supplier.id }, data: { totalDebtUsd: { increment: D(750) }, totalPurchasedUsd: { increment: D(750) } } });
    return tx.device.create({ data: {
      imei: `99333333333${String(++serial).padStart(4, '0')}`, brand: 'Тест', model: 'Правка', storage: '128GB', color: 'Black',
      status: 'STORE_STOCK', storeId, supplierId: supplier.id, purchasePriceUsd: D(750), costBasisUsd: D(750),
    } });
  });
  const product = await prisma.accessoryProduct.create({ data: { barcode: 'EDIT-TEST', brand: 'Тест', name: 'Чехол', category: 'Чехлы' } });
  await prisma.accessoryBatch.create({ data: { productId: product.id, storeId, quantityReceived: 10, quantityRemaining: 10, unitCostUsd: D(10), receivedAt: new Date(Date.now() - 5000) } });
  await prisma.supplier.update({ where: { id: supplier.id }, data: { totalDebtUsd: { increment: D(100) }, totalPurchasedUsd: { increment: D(100) } } });
  const customer = await prisma.customer.create({ data: { name: 'Клиент для исправлений', phone: '+992900000777' } });

  type Method = 'CASH' | 'CARD' | 'SPLIT' | 'DEBT';
  const sale = async (price: number, method: Method = 'CASH', extra: { cash?: number; card?: number } = {}) => {
    const phone = await device();
    return SalesService.executeSale({
      storeId, userId, paymentMethod: method, items: [{ deviceId: phone.id, salePriceTjs: D(price) }],
      ...(extra.cash !== undefined ? { cashAmountTjs: D(extra.cash) } : {}), ...(extra.card !== undefined ? { cardAmountTjs: D(extra.card) } : {}),
      ...(method === 'DEBT' ? { customerId: customer.id } : {}),
    });
  };

  // The register (checked against its ledger account and its ledger rows), owners, debt and today's shift.
  const snap = async () => {
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const account = await prisma.financialAccount.findUnique({ where: { storeId } });
    assert.equal(account?.balanceUsd ?? D(0), store.cashBalanceUsd, 'register = its ledger account');
    const ledger = await registerLedgerBalance(prisma, storeId);
    assert.equal(ledger.usd, store.cashBalanceUsd, 'register = sum of its ledger rows');
    const day = await DailyClosingService.getSummary(storeId);
    const owners = await prisma.owner.findMany({ orderBy: { id: 'asc' } });
    const debt = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    return {
      cashUsd: D(store.cashBalanceUsd), cashTjs: D(ledger.tjs), debtTjs: D(debt.totalDebtTjs),
      day: [day.salesCashTjs, day.salesCardTjs, day.salesCashUsd, day.salesCardUsd, day.refundsCashTjs, day.refundsCardTjs, day.refundsCashUsd, day.expectedCashTjs, day.expectedCashUsd].map((v) => D(v)),
      owners: owners.map((o) => [o.id, D(o.totalAccruedProfitUsd), D(o.availableProfitUsd)] as const),
    };
  };
  type Snap = Awaited<ReturnType<typeof snap>>;
  const diff = (a: Snap, b: Snap) => ({
    cashUsd: b.cashUsd.minus(a.cashUsd).toString(), cashTjs: b.cashTjs.minus(a.cashTjs).toString(), debtTjs: b.debtTjs.minus(a.debtTjs).toString(),
    day: b.day.map((v, i) => v.minus(a.day[i]).toString()),
    owners: b.owners.map(([id, accrued, available], i) => [id, accrued.minus(a.owners[i][1]).toString(), available.minus(a.owners[i][2]).toString()]),
  });
  const profitOf = async (id: string) => calculateRecognizedProfit(activeRefundLogs(await prisma.auditLog.findMany({ where: { targetId: id } })), 0);
  /** Made wrong then corrected == made right. */
  const same = async (label: string, wrongThenEdit: () => Promise<unknown>, right: () => Promise<unknown>) => {
    const a0 = await snap();
    await wrongThenEdit();
    const edited = diff(a0, await snap());
    const b0 = await snap();
    await right();
    const direct = diff(b0, await snap());
    assert.deepEqual(edited, direct, `${label}: corrected ≠ made correctly`);
    console.log(`PASS: ${label}`, JSON.stringify({ cashUsd: edited.cashUsd, cashTjs: edited.cashTjs }));
  };

  // 1. A cash sale re-priced — at the sale's own rate even after today's rate changed.
  let cashSaleId = '';
  await same('cash sale price corrected at its own rate', async () => {
    const wrong = await sale(10550);
    cashSaleId = wrong.id;
    await setTodayRate(10, userId);
    await SaleEditService.editSale(wrong.id, { items: [{ saleItemId: wrong.saleItems[0].id, salePriceTjs: 9000 }] }, userId);
    await setTodayRate(9.3, userId);
  }, () => sale(9000));
  const corrected = await prisma.sale.findUniqueOrThrow({ where: { id: cashSaleId }, include: { saleItems: true } });
  assert.equal(corrected.totalUsd, 967.74);
  assert.equal(corrected.exchangeRate, 9.3);
  assert.equal(await profitOf(cashSaleId), D(967.74).minus(750));

  // 2. A split payment: the new prices and the new cash/card split.
  await same('split sale corrected with its cash/card split', async () => {
    const wrong = await sale(10550, 'SPLIT', { cash: 5000, card: 5550 });
    await SaleEditService.editSale(wrong.id, { items: [{ saleItemId: wrong.saleItems[0].id, salePriceTjs: 9000 }], cashAmountTjs: 4000, cardAmountTjs: 5000 }, userId);
  }, () => sale(9000, 'SPLIT', { cash: 4000, card: 5000 }));

  // 3. A debt sale: the price and the first payment; the customer's debt follows.
  await same('debt sale corrected with its first payment and customer debt', async () => {
    const wrong = await sale(10550, 'DEBT', { cash: 2000 });
    await SaleEditService.editSale(wrong.id, { items: [{ saleItemId: wrong.saleItems[0].id, salePriceTjs: 9000 }], cashAmountTjs: 1000, cardAmountTjs: 0 }, userId);
  }, () => sale(9000, 'DEBT', { cash: 1000 }));
  const debtSales = await prisma.sale.aggregate({ where: { customerId: customer.id, annulledAt: null }, _sum: { debtAmountTjs: true } });
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).totalDebtTjs, debtSales._sum.debtAmountTjs);

  // 4. Accessory units at a corrected unit price.
  await same('accessory unit price corrected', async () => {
    const wrong = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [], accessories: [{ productId: product.id, quantity: 2, unitPriceTjs: D(500) }] });
    await SaleEditService.editSale(wrong.id, { accessories: [{ lineId: wrong.accessoryItems[0].id, unitPriceTjs: 400 }] }, userId);
  }, () => SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [], accessories: [{ productId: product.id, quantity: 2, unitPriceTjs: D(400) }] }));

  // 5. A return of a phone: the withheld amount and with it the payout — at the return's own rate.
  const returnSaleA = await sale(10550);
  const returnSaleB = await sale(10550);
  await same('return withheld amount corrected at the return rate', async () => {
    const ret = await ReturnsService.returnItems({ saleId: returnSaleA.id, userId, reason: 'Брак', payoutMethod: 'CASH', items: [{ saleItemId: returnSaleA.saleItems[0].id, withheldTjs: D(7480) }] });
    await setTodayRate(10, userId);
    await SaleEditService.editReturn(returnSaleA.id, ret.saleReturnId, { items: [{ saleItemId: returnSaleA.saleItems[0].id, withheldTjs: 1000 }] }, userId);
    await setTodayRate(9.3, userId);
  }, () => ReturnsService.returnItems({ saleId: returnSaleB.id, userId, reason: 'Брак', payoutMethod: 'CASH', items: [{ saleItemId: returnSaleB.saleItems[0].id, withheldTjs: D(1000) }] }));
  assert.equal(await profitOf(returnSaleA.id), await profitOf(returnSaleB.id));

  // 6. A whole-receipt refund: its penalty and with it the amount handed back (to a card).
  const refundSaleA = await sale(12000);
  const refundSaleB = await sale(12000);
  await same('full refund penalty corrected', async () => {
    await RefundService.refund({ saleId: refundSaleA.id, refundedByUserId: userId, reason: 'Передумал', paymentMethod: 'CARD', refundAmountTjs: 9000, penaltyFeeTjs: 3000 });
    await SaleEditService.editRefund(refundSaleA.id, 500, userId);
  }, () => RefundService.refund({ saleId: refundSaleB.id, refundedByUserId: userId, reason: 'Передумал', paymentMethod: 'CARD', refundAmountTjs: 11500, penaltyFeeTjs: 500 }));

  // 7. An exchange: the withheld amount of the returned phone and the new phone's price.
  const exchange = async (from: { id: string; saleItems: { id: string }[] }, price: number, withheld: number) => {
    const replacement = await device();
    const result = await ExchangesService.process({
      saleId: from.id, saleItemId: from.saleItems[0].id, withheldTjs: D(withheld), replacementDeviceId: replacement.id,
      newPriceTjs: D(price), paymentMethod: 'CASH', processedByUserId: userId,
    });
    return result.sale;
  };
  const exSaleA = await sale(10550);
  const exSaleB = await sale(10550);
  await same('exchange with a surcharge corrected (withheld and new price)', async () => {
    const newSale = await exchange(exSaleA, 12000, 500);
    await SaleEditService.editExchange(newSale.id, { items: [{ saleItemId: newSale.saleItems[0].id, salePriceTjs: 11000 }], returnWithheldTjs: 1000 }, userId);
  }, () => exchange(exSaleB, 11000, 1000));
  const exSaleC = await sale(10550);
  const exSaleD = await sale(10550);
  await same('exchange corrected into one where the customer gets change back', async () => {
    const newSale = await exchange(exSaleC, 12000, 500);
    await SaleEditService.editExchange(newSale.id, { items: [{ saleItemId: newSale.saleItems[0].id, salePriceTjs: 8000 }], returnItems: [{ saleItemId: exSaleC.saleItems[0].id, withheldTjs: 500 }] }, userId);
  }, () => exchange(exSaleD, 8000, 500));

  // 8. An edited receipt goes on like any other: refunded, the refund cancelled, then annulled —
  // everything comes back to before it was made.
  const beforeLife = await snap();
  const life = await sale(10550);
  await SaleEditService.editSale(life.id, { items: [{ saleItemId: life.saleItems[0].id, salePriceTjs: 9500 }] }, userId);
  await RefundService.refund({ saleId: life.id, refundedByUserId: userId, reason: 'Проверка', paymentMethod: 'CASH', refundAmountTjs: 9000, penaltyFeeTjs: 500 });
  await CancellationService.cancelReturn(life.id, undefined, userId, 'Ошибка возврата');
  await AnnulmentService.annul(life.id, userId);
  const afterLife = diff(beforeLife, await snap());
  assert.equal(afterLife.cashUsd, '0');
  assert.equal(afterLife.cashTjs, '0');
  assert(afterLife.owners.every(([, accrued, available]) => accrued === '0' && available === '0'), JSON.stringify(afterLife.owners));
  console.log('PASS: an edited receipt is refunded, its refund cancelled and annulled back to zero');

  // 9. Guards: only a receipt nothing happened to after it, the right document, admin only.
  await assert.rejects(SaleEditService.editSale(returnSaleA.id, { items: [{ saleItemId: returnSaleA.saleItems[0].id, salePriceTjs: 1 }] }, userId), /возвращён/);
  const twoPhones = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [
    { deviceId: (await device()).id, salePriceTjs: D(5000) }, { deviceId: (await device()).id, salePriceTjs: D(6000) },
  ] });
  await ReturnsService.returnItems({ saleId: twoPhones.id, userId, reason: 'Один телефон', payoutMethod: 'CASH', items: [{ saleItemId: twoPhones.saleItems[0].id, withheldTjs: D(0) }] });
  await assert.rejects(SaleEditService.editSale(twoPhones.id, { items: [{ saleItemId: twoPhones.saleItems[1].id, salePriceTjs: 5500 }] }, userId), /возвраты/);
  const exchangeReceipt = await prisma.sale.findFirstOrThrow({ where: { exchangeReturn: { saleId: exSaleB.id } } });
  await assert.rejects(SaleEditService.editSale(exchangeReceipt.id, {}, userId), /чек обмена/);
  const exchangeReturn = await prisma.saleReturn.findFirstOrThrow({ where: { saleId: exSaleB.id } });
  await assert.rejects(SaleEditService.editReturn(exSaleB.id, exchangeReturn.id, {}, userId), /обмен/);
  await assert.rejects(SaleEditService.editSale(cashSaleId, { items: [{ saleItemId: corrected.saleItems[0].id, salePriceTjs: 0 }] }, userId), /больше нуля/);
  const debtGuard = await sale(5000, 'DEBT', { cash: 1000 });
  await assert.rejects(SaleEditService.editSale(debtGuard.id, { cashAmountTjs: 5000 }, userId), /долга/);
  console.log('PASS: edits refuse receipts with later operations, the wrong document and invalid amounts');

  const { app } = await import('../server/src/app');
  const { AuthService } = await import('../server/src/auth/auth.service');
  const tokenFor = async (id: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return AuthService.createSession({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId }, user.password);
  };
  const [adminToken, sellerToken, partnerToken] = await Promise.all([tokenFor(userId), tokenFor('user-ahmad'), tokenFor('user-partner')]);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const apiSale = await sale(10550);
  const apiEdit = (token: string, key: string) => fetch(`http://127.0.0.1:${port}/api/sales/${apiSale.id}/edit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: 'SALE', items: [{ saleItemId: apiSale.saleItems[0].id, salePriceTjs: 10000 }] }),
  });
  assert.equal((await apiEdit(sellerToken, 'edit-seller')).status, 403);
  assert.equal((await apiEdit(partnerToken, 'edit-partner')).status, 403);
  const beforeApi = await snap();
  assert.equal((await apiEdit(adminToken, 'edit-admin')).status, 200);
  const once = diff(beforeApi, await snap());
  assert.equal((await apiEdit(adminToken, 'edit-admin')).status, 200);
  assert.deepEqual(diff(beforeApi, await snap()), once);
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: apiSale.id } })).totalTjs, 10000);
  console.log('PASS: only the admin can edit through the API, and a retried edit applies once');

  // 10. A closed shift is recalculated by an edit (keeping its counted difference); after a
  // collection the day is frozen and edits are refused. Before collecting, the register equals its days.
  const shiftSale = await sale(10550);
  const closing = await DailyClosingService.closeDay(userId, { storeId, actualCashTjs: D((await DailyClosingService.getSummary(storeId)).expectedCashTjs).plus(100) });
  await SaleEditService.editSale(shiftSale.id, { items: [{ saleItemId: shiftSale.saleItems[0].id, salePriceTjs: 10000 }] }, userId);
  const refreshed = await prisma.dailyCashClosing.findUniqueOrThrow({ where: { id: closing.id } });
  const recomputed = await DailyClosingService.getSummary(storeId, closing.businessDate, prisma, D(closing.exchangeRate!), true, closing.shortageExpenseId);
  assert.equal(refreshed.expectedCashTjs, D(recomputed.expectedCashTjs));
  assert.equal(refreshed.expectedCashUsd, D(recomputed.expectedCashUsd));
  assert.equal(D(refreshed.expectedCashTjs).minus(closing.expectedCashTjs), -550);
  assert.equal(refreshed.differenceTjs, 100);
  assert.equal(D(refreshed.actualCashTjs).minus(refreshed.expectedCashTjs), 100);
  for (const date of (await checkStoreShiftStatus(prisma, storeId, null)).unclosedDates) {
    await DailyClosingService.closeDay(userId, { storeId, businessDate: date });
  }
  const breakdown = await CashCollectionService.getUncollectedBreakdown(storeId);
  assert.equal(breakdown.summary.otherUsd, '0');
  assert.equal(breakdown.summary.daysTotalUsd, breakdown.summary.currentCashUsd);
  const register = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  await CashCollectionService.collect({ storeId, expectedCashUsd: register.cashBalanceUsd, actorUserId: userId });
  await assert.rejects(SaleEditService.editSale(shiftSale.id, { items: [{ saleItemId: shiftSale.saleItems[0].id, salePriceTjs: 9000 }] }, userId), /инкассированы/);
  console.log('PASS: an edit recalculates a closed shift; the register equals its days before collection; collected days are frozen');

  // 11. Reports, owner balances, customer debt and capital all agree after every correction.
  const finalReport = await computeReportsSummary({ period: 'ALL', storeId, includeEvents: true });
  const ownersProfit = (await prisma.owner.findMany()).reduce((sum, row) => sum.plus(row.totalAccruedProfitUsd), D(0));
  assert.equal(finalReport.profitUsd, ownersProfit);
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  console.log('PASS: reports, owner balances, customer debt and capital reconcile after all corrections');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
