import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import assert from './lib/decimal-assert';
import { D } from '../server/src/common/decimal';

// A phone sold yesterday, yesterday's shift closed, and today the customer exchanges it. The
// closed day must stay exactly as it was closed; the return of the old phone and the new sale are
// booked today: the register moves by the difference only, owners give back yesterday's profit
// and get the new receipt's, and an exchange is refused while today's shift is closed.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_exchange_${Date.now()}_${process.pid}`;
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
  const { ExchangesService } = await import('../server/src/modules/exchanges/exchanges.service');
  const { DailyClosingService } = await import('../server/src/modules/finance/daily-closing.service');
  const { registerLedgerBalance } = await import('../server/src/modules/finance/cash-balance');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  const { computeReportsSummary } = await import('../server/src/modules/reports/reports.service');
  const { getBusinessDateKey } = await import('../server/src/common/business-date');
  const storeId = 'store-siyoma';
  const userId = 'user-admin';
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayKey = getBusinessDateKey(yesterday);
  const todayKey = getBusinessDateKey();
  await setTodayRate(10, userId);
  await prisma.exchangeRate.upsert({
    where: { date: yesterdayKey }, update: { rate: D(10) }, create: { date: yesterdayKey, rate: D(10), createdByUserId: userId },
  });

  // Test stock is supplied on credit, so the capital audit can reconcile its cost as well.
  const supplier = await prisma.supplier.create({ data: { name: 'Поставщик для обменов' } });
  let serial = 0;
  const device = (costUsd: number) => prisma.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id: supplier.id }, data: { totalDebtUsd: { increment: D(costUsd) }, totalPurchasedUsd: { increment: D(costUsd) } } });
    return tx.device.create({ data: {
      imei: `99444444444${String(++serial).padStart(4, '0')}`, brand: 'Тест', model: `Обмен ${serial}`, storage: '128GB', color: 'Black',
      status: 'STORE_STOCK', storeId, supplierId: supplier.id, purchasePriceUsd: D(costUsd), costBasisUsd: D(costUsd),
    } });
  });

  // A cash sale moved to yesterday, with everything the shift, the register and reports read by date.
  const yesterdaySale = async (priceTjs: number, costUsd: number) => {
    const phone = await device(costUsd);
    const sale = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [{ deviceId: phone.id, salePriceTjs: D(priceTjs) }] });
    await prisma.sale.update({ where: { id: sale.id }, data: { createdAt: yesterday } });
    await prisma.financialTransaction.updateMany({ where: { sourceType: 'SALE', sourceId: sale.id }, data: { transactionDate: yesterday } });
    await prisma.ledgerEntry.updateMany({ where: { referenceId: sale.id }, data: { createdAt: yesterday } });
    await prisma.auditLog.updateMany({ where: { targetId: sale.id }, data: { createdAt: yesterday } });
    await prisma.deviceTimelineEvent.updateMany({ where: { deviceId: phone.id }, data: { date: yesterday } });
    return sale;
  };

  const snap = async () => {
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const account = await prisma.financialAccount.findUnique({ where: { storeId } });
    assert.equal(account?.balanceUsd ?? D(0), store.cashBalanceUsd, 'register = its ledger account');
    const ledger = await registerLedgerBalance(prisma, storeId);
    assert.equal(ledger.usd, store.cashBalanceUsd, 'register = sum of its ledger rows');
    const day = await DailyClosingService.getSummary(storeId, todayKey);
    const owners = await prisma.owner.findMany();
    const report = await computeReportsSummary({ startDate: todayKey, endDate: todayKey, storeId });
    return {
      cashUsd: D(store.cashBalanceUsd),
      ownersUsd: owners.reduce((sum, o) => sum.plus(o.totalAccruedProfitUsd), D(0)),
      day,
      revenueUsd: D(report.revenueUsd),
      profitUsd: D(report.profitUsd),
    };
  };
  type Snap = Awaited<ReturnType<typeof snap>>;
  const delta = (a: Snap, b: Snap) => ({
    cashUsd: b.cashUsd.minus(a.cashUsd).toString(),
    ownersUsd: b.ownersUsd.minus(a.ownersUsd).toString(),
    salesCashTjs: D(b.day.salesCashTjs).minus(a.day.salesCashTjs).toString(),
    salesCashUsd: D(b.day.salesCashUsd).minus(a.day.salesCashUsd).toString(),
    refundsCashTjs: D(b.day.refundsCashTjs).minus(a.day.refundsCashTjs).toString(),
    refundsCashUsd: D(b.day.refundsCashUsd).minus(a.day.refundsCashUsd).toString(),
    expectedCashTjs: D(b.day.expectedCashTjs).minus(a.day.expectedCashTjs).toString(),
    expectedCashUsd: D(b.day.expectedCashUsd).minus(a.day.expectedCashUsd).toString(),
    revenueUsd: b.revenueUsd.minus(a.revenueUsd).toString(),
    profitUsd: b.profitUsd.minus(a.profitUsd).toString(),
  });
  const exchange = async (from: { id: string; saleItems: { id: string }[] }, newPriceTjs: number, newCostUsd: number) => {
    const replacement = await device(newCostUsd);
    const result = await ExchangesService.process({
      saleId: from.id, saleItemId: from.saleItems[0].id, withheldTjs: D(0), replacementDeviceId: replacement.id,
      newPriceTjs: D(newPriceTjs), paymentMethod: 'CASH', processedByUserId: userId,
    });
    return { ...result, replacementId: replacement.id };
  };

  // Yesterday: three phones sold at 10 TJS/$, then the shift closed.
  const yesterdayBefore = await DailyClosingService.getSummary(storeId, yesterdayKey);
  const saleA = await yesterdaySale(5000, 400);
  const saleC = await yesterdaySale(5250, 400);
  const saleE = await yesterdaySale(5000, 400);
  const saleG = await yesterdaySale(5000, 400);
  const saleH = await yesterdaySale(5000, 400);
  const closedYesterday = await DailyClosingService.closeDay(userId, { storeId, businessDate: yesterdayKey });
  assert.equal(D(closedYesterday.expectedCashTjs).minus(yesterdayBefore.expectedCashTjs), 25250);
  assert.equal(D(closedYesterday.expectedCashUsd).minus(yesterdayBefore.expectedCashUsd), 2525);
  const yesterdayRow = await prisma.dailyCashClosing.findUniqueOrThrow({ where: { id: closedYesterday.id } });
  const yesterdayReport = await computeReportsSummary({ startDate: yesterdayKey, endDate: yesterdayKey, storeId });
  const yesterdayUntouched = async (label: string) => {
    assert.deepEqual(await prisma.dailyCashClosing.findUniqueOrThrow({ where: { id: closedYesterday.id } }), yesterdayRow, `${label}: yesterday's closing changed`);
    const summary = await DailyClosingService.getSummary(storeId, yesterdayKey);
    assert.equal(summary.alreadyClosed, true);
    assert.equal(summary.expectedCashTjs, yesterdayRow.expectedCashTjs.toString());
    const report = await computeReportsSummary({ startDate: yesterdayKey, endDate: yesterdayKey, storeId });
    assert.equal(report.revenueUsd, yesterdayReport.revenueUsd, `${label}: yesterday's revenue changed`);
    assert.equal(report.profitUsd, yesterdayReport.profitUsd, `${label}: yesterday's profit changed`);
  };
  console.log('PASS: yesterday\'s shift closed with five sales', JSON.stringify({ expectedCashTjs: yesterdayRow.expectedCashTjs, expectedCashUsd: yesterdayRow.expectedCashUsd }));

  // 1. Same rate, a dearer phone: 5000 TJS ($500, cost $400) for 6000 TJS ($600, cost $480).
  // The full 5000 TJS pays for the new receipt, the customer adds 1000 TJS.
  const before1 = await snap();
  const ex1 = await exchange(saleA, 6000, 480);
  const d1 = delta(before1, await snap());
  assert.deepEqual(d1, {
    cashUsd: '100', ownersUsd: '20',
    salesCashTjs: '1000', salesCashUsd: '100', refundsCashTjs: '0', refundsCashUsd: '0',
    expectedCashTjs: '1000', expectedCashUsd: '100',
    revenueUsd: '100', profitUsd: '20',
  });
  const oldA = await prisma.sale.findUniqueOrThrow({ where: { id: saleA.id }, include: { saleItems: true } });
  assert.equal(oldA.status, 'REFUNDED');
  assert.equal(getBusinessDateKey(oldA.createdAt), yesterdayKey);
  assert.equal(oldA.cashAmountTjs, 5000);
  assert.equal(oldA.saleItems[0].returnCreditTjs, 5000);
  const returnA = await prisma.saleReturn.findUniqueOrThrow({ where: { id: ex1.saleReturnId } });
  assert.equal(getBusinessDateKey(returnA.createdAt), todayKey);
  assert.equal(returnA.exchangeSaleId, ex1.sale.id);
  assert.equal(returnA.creditTjs, 5000);
  assert.equal(returnA.withheldTjs, 0);
  assert.equal(returnA.payoutTjs, 0);
  const newB = await prisma.sale.findUniqueOrThrow({ where: { id: ex1.sale.id } });
  assert.equal(newB.totalTjs, 6000);
  assert.equal(newB.exchangeTradeInCreditTjs, 5000);
  assert.equal(newB.cashAmountTjs, 1000);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: saleA.saleItems[0].deviceId } })).status, 'STORE_STOCK');
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: ex1.replacementId } })).status, 'SOLD');
  await yesterdayUntouched('dearer phone');
  console.log('PASS: dearer phone — 100% credit, register +1000 TJS today, owners −$100 +$120, yesterday untouched', JSON.stringify(d1));

  // What the receipts carry for the day-by-day breakdown: the admin gets the profit the exchange
  // took back (it reveals the cost); store staff get the money only.
  const { app } = await import('../server/src/app');
  const { AuthService } = await import('../server/src/auth/auth.service');
  const tokenFor = async (id: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return AuthService.createSession({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId }, user.password);
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const receipt = async (token: string, receiptNumber: number) => {
    const rows = await (await fetch(`http://127.0.0.1:${port}/api/sales?search=${receiptNumber}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    return (rows as { receiptNumber: number }[]).find((row) => row.receiptNumber === receiptNumber) as any;
  };
  const [adminToken, sellerToken] = await Promise.all([tokenFor(userId), tokenFor('user-ahmad')]);
  const adminNew = await receipt(adminToken, newB.receiptNumber);
  assert.equal(adminNew.exchangeReturn.reversedProfitUsd, 100);
  assert.equal(adminNew.exchangeReturn.bookedUsd, 500);
  assert.equal(adminNew.exchangeReturn.sale.receiptNumber, saleA.receiptNumber);
  assert.equal(getBusinessDateKey(new Date(adminNew.exchangeReturn.sale.createdAt)), yesterdayKey);
  assert.deepEqual(adminNew.exchangeReturn.items.map((i: { model: string }) => i.model), [saleA.saleItems[0].model]);
  assert.equal((await receipt(adminToken, saleA.receiptNumber)).returns[0].reversedProfitUsd, 100);
  const sellerNew = await receipt(sellerToken, newB.receiptNumber);
  assert.equal(sellerNew.exchangeReturn.reversedProfitUsd, undefined);
  assert.equal(sellerNew.exchangeReturn.creditTjs, 5000);
  assert.equal((await receipt(sellerToken, saleA.receiptNumber)).returns[0].reversedProfitUsd, undefined);
  console.log('PASS: receipts carry the exchange breakdown; the reversed profit is admin-only');

  // 2. The rate moved to 10.5 and the new phone is cheaper: 5250 TJS sold yesterday ($525, cost
  // $400) for 4200 TJS today ($400, cost $300). 1050 TJS goes back to the customer from today's
  // register; the $25 the rate move left over stays with the owners.
  await setTodayRate(10.5, userId);
  const before2 = await snap();
  const ex2 = await exchange(saleC, 4200, 300);
  const d2 = delta(before2, await snap());
  assert.deepEqual(d2, {
    cashUsd: '-100', ownersUsd: '0',
    salesCashTjs: '0', salesCashUsd: '0', refundsCashTjs: '1050', refundsCashUsd: '100',
    expectedCashTjs: '-1050', expectedCashUsd: '-100',
    revenueUsd: '-100', profitUsd: '0',
  });
  const returnC = await prisma.saleReturn.findUniqueOrThrow({ where: { id: ex2.saleReturnId } });
  assert.equal(returnC.creditTjs, 5250);
  assert.equal(returnC.creditUsd, 500);
  assert.equal(returnC.fxUsd, 25);
  assert.equal(returnC.payoutTjs, 1050);
  assert.equal(returnC.payoutUsd, 100);
  assert.equal(returnC.exchangeRate, 10.5);
  await yesterdayUntouched('cheaper phone at a new rate');
  console.log('PASS: cheaper phone at a new rate — change paid from today\'s register, rate result to owners, yesterday untouched', JSON.stringify(d2));

  // 2b. A plain return of yesterday's phone (no exchange), today at 10.5: 5000 TJS sold at 10
  // ($500, profit $100), 500 TJS withheld, 4500 TJS handed back from today's register. Today
  // takes back yesterday's profit and keeps the withheld part and the rate result.
  const { RefundService } = await import('../server/src/modules/sales/refund.service');
  const before2b = await snap();
  await ReturnsService.returnItems({ saleId: saleG.id, userId, reason: 'Передумал', payoutMethod: 'CASH',
    items: [{ saleItemId: saleG.saleItems[0].id, withheldTjs: D(500) }] });
  const d2b = delta(before2b, await snap());
  assert.deepEqual(d2b, {
    cashUsd: '-428.57', ownersUsd: '-28.57',
    salesCashTjs: '0', salesCashUsd: '0', refundsCashTjs: '4500', refundsCashUsd: '428.57',
    expectedCashTjs: '-4500', expectedCashUsd: '-428.57',
    // The return takes back only what was handed out (4500 TJS = $428.57); the 500 withheld stay revenue.
    revenueUsd: '-428.57', profitUsd: '-28.57',
  });
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: saleG.id } })).status, 'REFUNDED');
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: saleG.saleItems[0].deviceId } })).status, 'STORE_STOCK');
  await yesterdayUntouched('return of the phone sold yesterday');
  console.log('PASS: return of the phone sold yesterday — paid from the register today, yesterday untouched', JSON.stringify(d2b));

  // 2c. The same through «Возврат всего чека»: the same rule, whichever button is used.
  const before2c = await snap();
  await RefundService.refund({ saleId: saleH.id, refundedByUserId: userId, reason: 'Передумал', paymentMethod: 'CASH', refundAmountTjs: 4500, penaltyFeeTjs: 500 });
  const d2c = delta(before2c, await snap());
  assert.equal(d2c.expectedCashTjs, '-4500');
  assert.equal(d2c.refundsCashTjs, '4500');
  assert.equal(d2c.cashUsd, D(d2c.expectedCashUsd).toString(), 'register moves exactly by the shift of today');
  assert.equal(d2c.ownersUsd, d2c.profitUsd, 'owners move exactly by the report of today');
  assert.deepEqual(d2c, d2b, 'a full refund books exactly like a return of the same phone');
  await yesterdayUntouched('full refund of the receipt sold yesterday');
  console.log('PASS: full refund of the receipt sold yesterday books the same as a return', JSON.stringify(d2c));

  // 3. Today's shift closed: the exchange is refused and changes nothing. Once the admin reopens
  // the shift of today the same exchange goes through.
  const todayClosing = await DailyClosingService.closeDay(userId, { storeId });
  const before3 = await snap();
  const replacementF = await device(400);
  const attempt = () => ExchangesService.process({
    saleId: saleE.id, saleItemId: saleE.saleItems[0].id, withheldTjs: D(0), replacementDeviceId: replacementF.id,
    newPriceTjs: D(5000), paymentMethod: 'CASH', processedByUserId: userId,
  });
  await assert.rejects(attempt(), (error: Error & { statusCode?: number }) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /уже закрыта/);
    return true;
  });
  assert.deepEqual(delta(before3, await snap()), {
    cashUsd: '0', ownersUsd: '0', salesCashTjs: '0', salesCashUsd: '0', refundsCashTjs: '0', refundsCashUsd: '0',
    expectedCashTjs: '0', expectedCashUsd: '0', revenueUsd: '0', profitUsd: '0',
  });
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: saleE.id } })).status, 'COMPLETED');
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: saleE.saleItems[0].deviceId } })).status, 'SOLD');
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: replacementF.id } })).status, 'STORE_STOCK');
  assert.equal(await prisma.saleReturn.count({ where: { saleId: saleE.id } }), 0);
  await DailyClosingService.delete(todayClosing.id, userId);
  const ex3 = await attempt();
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: saleE.id } })).status, 'REFUNDED');
  assert.equal(ex3.payoutTjs, 0);
  await yesterdayUntouched('after reopening today');
  console.log('PASS: an exchange is refused while today\'s shift is closed and goes through once it is reopened');

  // 4. Annulling an exchange (from either of its receipts) annuls the whole chain: both phones are
  // back in stock, both days' money and profit are taken out, and the closed yesterday is
  // recalculated without the old sale.
  const { AnnulmentService } = await import('../server/src/modules/sales/annulment.service');
  const annulChain = async (clicked: string, chain: string[]) => {
    const before = await snap();
    const closingBefore = await prisma.dailyCashClosing.findUniqueOrThrow({ where: { id: closedYesterday.id } });
    const reportBefore = await computeReportsSummary({ startDate: yesterdayKey, endDate: yesterdayKey, storeId });
    const result = await AnnulmentService.annul(clicked, userId);
    assert.deepEqual([...result.receiptIds].sort(), [...chain].sort());
    for (const id of chain) {
      const row = await prisma.sale.findUniqueOrThrow({ where: { id }, include: { saleItems: true } });
      assert(row.annulledAt, `receipt ${row.receiptNumber} annulled`);
      for (const item of row.saleItems) assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: item.deviceId } })).status, 'STORE_STOCK');
    }
    const after = await prisma.dailyCashClosing.findUniqueOrThrow({ where: { id: closedYesterday.id } });
    assert.equal((await DailyClosingService.getSummary(storeId, yesterdayKey)).alreadyClosed, true);
    const reportAfter = await computeReportsSummary({ startDate: yesterdayKey, endDate: yesterdayKey, storeId });
    return {
      ...delta(before, await snap()),
      yesterdayExpectedTjs: D(after.expectedCashTjs).minus(closingBefore.expectedCashTjs).toString(),
      yesterdayExpectedUsd: D(after.expectedCashUsd).minus(closingBefore.expectedCashUsd).toString(),
      yesterdayProfitUsd: D(reportAfter.profitUsd).minus(reportBefore.profitUsd).toString(),
    };
  };
  // From the new receipt: Honor 5000 TJS yesterday ($500, profit $100) → 6000 TJS today (+1000 TJS, profit $120).
  const a1 = await annulChain(ex1.sale.id, [saleA.id, ex1.sale.id]);
  assert.deepEqual(a1, {
    cashUsd: '-600', ownersUsd: '-120',
    salesCashTjs: '-1000', salesCashUsd: '-100', refundsCashTjs: '0', refundsCashUsd: '0',
    expectedCashTjs: '-1000', expectedCashUsd: '-100',
    revenueUsd: '-100', profitUsd: '-20',
    yesterdayExpectedTjs: '-5000', yesterdayExpectedUsd: '-500', yesterdayProfitUsd: '-100',
  });
  console.log('PASS: annulling the exchange receipt annuls both receipts and recalculates the closed day', JSON.stringify(a1));
  // From the old receipt: 5250 TJS yesterday ($525, profit $125) → 4200 TJS today with 1050 TJS change back.
  const a2 = await annulChain(saleC.id, [saleC.id, ex2.sale.id]);
  assert.deepEqual(a2, {
    cashUsd: '-425', ownersUsd: '-125',
    salesCashTjs: '0', salesCashUsd: '0', refundsCashTjs: '-1050', refundsCashUsd: '-100',
    expectedCashTjs: '1050', expectedCashUsd: '100',
    revenueUsd: '100', profitUsd: '0',
    yesterdayExpectedTjs: '-5250', yesterdayExpectedUsd: '-525', yesterdayProfitUsd: '-125',
  });
  console.log('PASS: annulling the old receipt annuls its exchange too, the change paid back included', JSON.stringify(a2));

  // 5. Owner balances, customer debt and capital reconcile.
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  console.log('PASS: owner balances and capital reconcile after the exchanges');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
