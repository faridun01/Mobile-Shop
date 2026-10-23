import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import assert from './lib/decimal-assert';
import { D } from '../server/src/common/decimal';

// Profit of a phone sold yesterday and exchanged today is counted once. The old phone's profit
// stays on yesterday and is taken back today; the new phone's profit is booked today. Over both
// days the report, its events, the store card, the model table and the owners all show only the
// profit the business actually kept: the phones still sold, plus what was withheld.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_exprofit_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
let disconnect: (() => Promise<void>) | undefined;
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
  const { ExchangesService } = await import('../server/src/modules/exchanges/exchanges.service');
  const { DailyClosingService } = await import('../server/src/modules/finance/daily-closing.service');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  const { computeReportsSummary } = await import('../server/src/modules/reports/reports.service');
  const { getBusinessDateKey } = await import('../server/src/common/business-date');
  const storeId = 'store-siyoma';
  const userId = 'user-admin';
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayKey = getBusinessDateKey(yesterday);
  const todayKey = getBusinessDateKey();
  await setTodayRate(10, userId);
  await prisma.exchangeRate.upsert({ where: { date: yesterdayKey }, update: { rate: D(10) }, create: { date: yesterdayKey, rate: D(10), createdByUserId: userId } });
  const supplier = await prisma.supplier.create({ data: { name: 'Поставщик отчёта' } });
  let serial = 0;
  const device = (model: string, costUsd: number) => prisma.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id: supplier.id }, data: { totalDebtUsd: { increment: D(costUsd) }, totalPurchasedUsd: { increment: D(costUsd) } } });
    return tx.device.create({ data: {
      imei: `35940000000${String(++serial).padStart(4, '0')}`, brand: 'Тест', model, storage: '256GB', color: 'Black',
      status: 'STORE_STOCK', storeId, supplierId: supplier.id, purchasePriceUsd: D(costUsd), costBasisUsd: D(costUsd),
    } });
  });
  const yesterdaySale = async (model: string, priceTjs: number, costUsd: number) => {
    const phone = await device(model, costUsd);
    const sale = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [{ deviceId: phone.id, salePriceTjs: D(priceTjs) }] });
    await prisma.sale.update({ where: { id: sale.id }, data: { createdAt: yesterday } });
    await prisma.financialTransaction.updateMany({ where: { sourceType: 'SALE', sourceId: sale.id }, data: { transactionDate: yesterday } });
    await prisma.ledgerEntry.updateMany({ where: { referenceId: sale.id }, data: { createdAt: yesterday } });
    await prisma.auditLog.updateMany({ where: { targetId: sale.id }, data: { createdAt: yesterday } });
    return sale;
  };
  const exchange = async (from: { id: string; saleItems: { id: string }[] }, model: string, priceTjs: number, costUsd: number, withheldTjs = 0) => {
    const replacement = await device(model, costUsd);
    return (await ExchangesService.process({
      saleId: from.id, saleItemId: from.saleItems[0].id, withheldTjs: D(withheldTjs), replacementDeviceId: replacement.id,
      newPriceTjs: D(priceTjs), paymentMethod: 'CASH', processedByUserId: userId,
    })).sale;
  };
  const report = (startDate: string, endDate: string) => computeReportsSummary({ startDate, endDate, storeId, includeEvents: true });
  const ownersAccrued = async () => (await prisma.owner.findMany()).reduce((sum, o) => sum.plus(o.totalAccruedProfitUsd), D(0));
  const owners0 = await ownersAccrued();

  // Yesterday (rate 10): Honor 5000 TJS ($500, cost $400 → +$100), Redmi 3000 TJS ($300, cost $250 → +$50),
  // Galaxy 5000 TJS ($500, cost $400 → +$100). Shift closed.
  const honor = await yesterdaySale('Honor X8d', 5000, 400);
  const redmi = await yesterdaySale('Redmi 14', 3000, 250);
  const galaxy = await yesterdaySale('Galaxy A35', 5000, 400);
  await DailyClosingService.closeDay(userId, { storeId, businessDate: yesterdayKey });
  const y0 = await report(yesterdayKey, yesterdayKey);
  assert.equal(y0.profitUsd, 250);
  assert.equal(await ownersAccrued(), owners0.plus(250));

  // Today: 1) Honor → Poco 6000 TJS ($600, cost $480 → +$120).
  //        2) Redmi → Redmi C 3000 TJS (cost $260), 300 TJS withheld ($30): the new phone +$40, withheld +$30.
  //        3) The Poco exchanged again today → Samsung 6500 TJS ($650, cost $500 → +$150).
  const poco = await exchange(honor, 'Poco M8', 6000, 480);
  await exchange(redmi, 'Redmi 14C', 3000, 260, 300);
  await exchange(poco, 'Samsung A55', 6500, 500);
  // 4) A cheaper phone: Galaxy (5000 TJS) → Tecno 4000 TJS ($400, cost $300 → +$100); 1000 TJS change back.
  const shiftBefore = await DailyClosingService.getSummary(storeId, todayKey);
  const tecno = await exchange(galaxy, 'Tecno Camon', 4000, 300);
  const shiftAfter = await DailyClosingService.getSummary(storeId, todayKey);
  assert.equal(D(shiftAfter.refundsCashTjs).minus(shiftBefore.refundsCashTjs), 1000, 'the change leaves the register today');
  assert.equal(D(shiftAfter.expectedCashTjs).minus(shiftBefore.expectedCashTjs), -1000);
  assert.equal(D(shiftAfter.expectedCashUsd).minus(shiftBefore.expectedCashUsd), -100);

  // Yesterday is unchanged: its sales keep their profit.
  const y = await report(yesterdayKey, yesterdayKey);
  assert.equal(y.profitUsd, 250, 'yesterday keeps its +$250');
  assert.equal(y.revenueUsd, 1300);

  // Today: Honor −100, Poco +120, Poco −120, Samsung +150; Redmi −50, Redmi C +40, withheld +30;
  // Galaxy −100, Tecno +100 → +70.
  const t = await report(todayKey, todayKey);
  assert.equal(t.profitUsd, 70, 'today: what changed today, nothing twice');
  // The cheaper exchange alone: the Galaxy's $100 taken back, the Tecno's $100 booked; revenue −$100 (the change).
  const cheaper = t.events!.filter((e) => e.receiptNumber === galaxy.receiptNumber || e.receiptNumber === tecno.receiptNumber);
  assert.deepEqual(cheaper.map((e) => [e.kind, D(e.profitUsd).toNumber(), D(e.amountUsd).toNumber()]), [['REFUND', -100, -500], ['SALE', 100, 400]]);
  // Both halves name the other receipt, so the export labels them as one exchange.
  assert.deepEqual(cheaper.map((e) => [e.receiptNumber, e.exchangeReceiptNumber]), [[galaxy.receiptNumber, tecno.receiptNumber], [tecno.receiptNumber, galaxy.receiptNumber]]);
  // The Redmi returned with 300 TJS withheld takes back only the 2700 TJS credited ($270); its row's profit
  // holds the $30 withheld: −$50 booked + $30 = −$20.
  const redmiBack = t.events!.find((e) => e.kind === 'REFUND' && e.receiptNumber === redmi.receiptNumber)!;
  assert.deepEqual([D(redmiBack.amountTjs).toNumber(), D(redmiBack.amountUsd).toNumber(), D(redmiBack.profitUsd).toNumber(), D(redmiBack.penaltyTjs).toNumber()], [-2700, -270, -20, 300]);
  const todayEvents = t.events!.map((e) => `${e.kind} #${e.receiptNumber} ${e.profitUsd}`);
  console.log('today events:', todayEvents.join(' | '));

  // Both days: only the phones still sold (Samsung +$150, Redmi C +$40, Tecno +$100) and the $30 withheld.
  const both = await report(yesterdayKey, todayKey);
  assert.equal(both.profitUsd, 320, 'both days: +150 Samsung +40 Redmi C +100 Tecno +30 withheld');
  assert.equal(both.profitUsd, D(y.profitUsd).plus(t.profitUsd), 'the two days add up to the period');
  assert.equal(both.events!.reduce((s, e) => s.plus(e.profitUsd), D(0)), 320, 'the events behind the report add up to it (withheld included)');
  const card = both.storeBreakdown.find((s: { storeId: string }) => s.storeId === storeId)!;
  assert.equal(card.profitUsd, 320, 'the store card shows the same profit');
  assert.equal(both.unitsSold, 3, 'three phones are still sold: Samsung, Redmi C and Tecno');
  const models = Object.fromEntries(both.modelCounts.map((m: { name: string; count: number; profitUsd: unknown }) => [m.name, [m.count, D(m.profitUsd as number).toNumber()]]));
  assert.deepEqual(models, { 'Тест Samsung A55': [1, 150], 'Тест Tecno Camon': [1, 100], 'Тест Redmi 14C': [1, 40] }, 'returned phones are not in the model table');
  assert.equal(both.periodRefundPenaltiesUsd, 30);

  // Owners got exactly the same: +$250 yesterday, +$70 today.
  assert.equal(await ownersAccrued(), owners0.plus(320), 'owners accrued = report');
  console.log(JSON.stringify({ yesterday: y.profitUsd, today: t.profitUsd, bothDays: both.profitUsd, owners: (await ownersAccrued()).minus(owners0) }));
  console.log('PASS: an exchange of yesterday\'s phone counts profit once — report, events, store card, models and owners agree');

  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  console.log('PASS: owner balances and capital reconcile');
} finally {
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
