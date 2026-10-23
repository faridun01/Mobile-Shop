import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { D } from '../server/src/common/decimal';
import { splitClosingAmounts } from '../src/utils/dailyClosing';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname));
const schema = `refund_share_test_shift_fix_${Date.now()}_${process.pid}`;
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
  const { ReturnsService } = await import('../server/src/modules/sales/returns.service');
  const { RefundService } = await import('../server/src/modules/sales/refund.service');
  const { CancellationService } = await import('../server/src/modules/sales/cancellation.service');
  const { AnnulmentService } = await import('../server/src/modules/sales/annulment.service');
  const { DailyClosingService } = await import('../server/src/modules/finance/daily-closing.service');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  const { getBusinessDateKey } = await import('../server/src/common/business-date');
  const storeId = 'store-siyoma';
  const userId = 'user-admin';
  await setTodayRate(9.3, userId);
  // Receipts below are moved to earlier days, which (as in real use) had their own rate set.
  for (const daysAgo of [1, 2]) {
    const date = getBusinessDateKey(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));
    await prisma.exchangeRate.upsert({ where: { date }, update: { rate: D(9.3) }, create: { date, rate: D(9.3), createdByUserId: userId } });
  }
  let serial = 0;
  const sale = async (paymentMethod: 'CASH' | 'CARD') => {
    const device = await prisma.device.create({ data: {
      imei: `99222222222${String(++serial).padStart(4, '0')}`, brand: 'Тест', model: 'Смена', storage: '128GB', color: 'Black',
      status: 'STORE_STOCK', storeId, purchasePriceUsd: D(750), costBasisUsd: D(750),
    } });
    return SalesService.executeSale({ storeId, userId, paymentMethod, items: [{ deviceId: device.id, salePriceTjs: D(10550) }] });
  };
  const cardSale = await sale('CARD');
  await ReturnsService.returnItems({ saleId: cardSale.id, userId, reason: 'Проверка смены', payoutMethod: 'CARD',
    items: [{ saleItemId: cardSale.saleItems[0].id, withheldTjs: D(7480) }] });
  const summary = await DailyClosingService.getSummary(storeId);
  assert.equal(summary.expectedCashTjs, '7480');
  assert.equal(summary.expectedCashUsd, '804.3');
  const closing = await DailyClosingService.closeDay(userId, { storeId });
  const split = splitClosingAmounts(JSON.parse(JSON.stringify(closing)));
  assert.equal(split.cashTjs, 0);
  assert.equal(split.cashUsd, 0);
  assert.equal(split.bankTjs, 7480);
  assert.equal(split.bankUsd, 804.3);
  const displayedCash = D(split.cashTjs);
  await prisma.dailyCashClosing.update({ where: { id: closing.id }, data: { refundsCardTjs: null, refundsCardUsd: null } });
  const legacyFields = await DailyClosingService.list({ storeId });
  assert.equal(splitClosingAmounts(JSON.parse(JSON.stringify(legacyFields[0]))).bankTjs, 7480);
  assert.equal((await DailyClosingService.getSummary(storeId)).refundsCardTjs, '3070');
  console.log(JSON.stringify({ case: 'card-return', totalTjs: summary.expectedCashTjs, totalUsd: summary.expectedCashUsd,
    listedCashTjs: displayedCash.toString(), listedBankTjs: split.bankTjs, correctCashTjs: '0', correctBankTjs: '7480' }));
  await AnnulmentService.annul(cardSale.id, userId);
  const stale = await DailyClosingService.getSummary(storeId);
  assert.equal(stale.expectedCashTjs, '0');
  assert.equal(stale.closing!.actualCashTjs.toString(), '0');
  assert.equal(stale.refundsCardTjs, '0');
  assert.equal((await DailyClosingService.list({ storeId }))[0].actualCashTjs.toString(), '0');
  await DailyClosingService.delete(closing.id, userId);
  const recomputed = await DailyClosingService.getSummary(storeId);
  assert.equal(recomputed.expectedCashTjs, '0');
  console.log(JSON.stringify({ case: 'annul-after-closing', savedTjs: stale.expectedCashTjs, recomputedTjs: recomputed.expectedCashTjs }));

  const repeated = await sale('CASH');
  await RefundService.refund({ saleId: repeated.id, refundedByUserId: userId, reason: 'Первый возврат', paymentMethod: 'CASH', refundAmountTjs: 3070, penaltyFeeTjs: 7480 });
  await CancellationService.cancelReturn(repeated.id, undefined, userId, 'Исправление');
  await RefundService.refund({ saleId: repeated.id, refundedByUserId: userId, reason: 'Повторный возврат', paymentMethod: 'CASH', refundAmountTjs: 7480, penaltyFeeTjs: 3070 });
  const duplicate = await DailyClosingService.getSummary(storeId);
  assert.equal(duplicate.refundsCashUsd, '804.3');
  assert.equal(duplicate.expectedCashTjs, '3070');
  assert.equal(duplicate.expectedCashUsd, '330.11');
  console.log(JSON.stringify({ case: 'refund-cancel-refund', refundTjs: duplicate.refundsCashTjs, refundUsd: duplicate.refundsCashUsd,
    correctRefundUsd: '804.30', totalTjs: duplicate.expectedCashTjs, totalUsd: duplicate.expectedCashUsd, correctTotalUsd: '330.11' }));

  await AnnulmentService.annul(repeated.id, userId);
  for (const payoutMethod of ['CARD', 'CASH'] as const) {
    const full = await sale(payoutMethod === 'CARD' ? 'CASH' : 'CARD');
    await RefundService.refund({ saleId: full.id, refundedByUserId: userId, reason: 'Способ выдачи', paymentMethod: payoutMethod, refundAmountTjs: 3070, penaltyFeeTjs: 7480 });
    const fullSummary = await DailyClosingService.getSummary(storeId);
    assert.equal(fullSummary.refundsCardTjs, payoutMethod === 'CARD' ? '3070' : '0');
    assert.equal(fullSummary.refundsCardUsd, payoutMethod === 'CARD' ? '330.11' : '0');
    await AnnulmentService.annul(full.id, userId);
  }
  console.log('PASS: full refund uses the payout method, independently of how the receipt was paid');

  const untouched = await sale('CASH');
  const removed = await sale('CARD');
  await ReturnsService.returnItems({ saleId: removed.id, userId, reason: 'Возврат на карту', payoutMethod: 'CARD',
    items: [{ saleItemId: removed.saleItems[0].id, withheldTjs: D(7480) }] });
  const sharedDay = await DailyClosingService.closeDay(userId, { storeId });
  assert.equal(sharedDay.expectedCashTjs.toString(), '18030');
  await AnnulmentService.annul(removed.id, userId);
  const sharedAfter = await DailyClosingService.getSummary(storeId);
  assert.equal(sharedAfter.alreadyClosed, true);
  assert.equal(sharedAfter.expectedCashTjs, '10550');
  assert.equal(sharedAfter.closing!.actualCashTjs.toString(), '10550');
  assert.equal(splitClosingAmounts(JSON.parse(JSON.stringify(sharedAfter.closing))).cashTjs, 10550);
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: untouched.id } })).annulledAt, null);
  await AnnulmentService.annul(untouched.id, userId);
  await DailyClosingService.delete(sharedDay.id, userId);
  console.log('PASS: refreshing a closed day preserves unrelated receipts and its closed status');

  // The discrepancy is already a real booked expense/income. Removing a mistaken receipt
  // must update the day's flows without booking that discrepancy for a second time.
  for (const difference of [-100, 100]) {
    const countedSale = await sale('CASH');
    const counted = await DailyClosingService.closeDay(userId, { storeId, actualCashTjs: D(10550).plus(difference) });
    const cashBefore = D((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).cashBalanceUsd);
    const accruedBefore = (await prisma.owner.findMany()).reduce((sum, owner) => sum.plus(owner.totalAccruedProfitUsd), D(0));
    await AnnulmentService.annul(countedSale.id, userId);
    const updated = await DailyClosingService.getSummary(storeId);
    assert.equal(updated.expectedCashTjs, '0');
    assert.equal(updated.closing!.actualCashTjs.toString(), String(difference));
    assert.equal(updated.closing!.differenceTjs.toString(), String(difference));
    assert.equal(cashBefore.minus((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).cashBalanceUsd).toString(), '1134.41');
    const accruedAfter = (await prisma.owner.findMany()).reduce((sum, owner) => sum.plus(owner.totalAccruedProfitUsd), D(0));
    assert.equal(accruedBefore.minus(accruedAfter).toString(), '384.41');
    await DailyClosingService.delete(counted.id, userId);
  }
  console.log('PASS: annulment refreshes closed shifts while retaining exactly one booked shortage/surplus');
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const old = await sale('CASH');
  await prisma.sale.update({ where: { id: old.id }, data: { createdAt: yesterday } });
  await prisma.financialTransaction.updateMany({ where: { sourceType: 'SALE', sourceId: old.id }, data: { transactionDate: yesterday } });
  await ReturnsService.returnItems({ saleId: old.id, userId, reason: 'Возврат вчерашней продажи', payoutMethod: 'CASH',
    items: [{ saleItemId: old.saleItems[0].id, withheldTjs: D(7480) }] });
  const today = await DailyClosingService.getSummary(storeId, getBusinessDateKey());
  assert.equal(today.expectedCashTjs, '-3070');
  console.log(JSON.stringify({ case: 'yesterday-sale-today-return', totalTjs: today.expectedCashTjs, totalUsd: today.expectedCashUsd, note: 'today contains only the payout; the sale belongs to yesterday' }));
  const previousClosing = await DailyClosingService.closeDay(userId, { storeId, businessDate: getBusinessDateKey(yesterday) });
  const todayClosing = await DailyClosingService.closeDay(userId, { storeId });
  await AnnulmentService.annul(old.id, userId);
  for (const row of [previousClosing, todayClosing]) {
    const updated = await DailyClosingService.getSummary(storeId, row.businessDate);
    assert.equal(updated.alreadyClosed, true);
    assert.equal(updated.expectedCashTjs, '0');
    assert.equal(updated.expectedCashUsd, '0');
    assert.equal(updated.closing!.actualCashTjs.toString(), '0');
  }
  console.log('PASS: a sale yesterday and refund today refresh both saved shifts atomically when annulled');

  // A refund paid on an earlier, closed day and cancelled today: the earlier day keeps its payout,
  // today's shift counts the money the customer brought back.
  await DailyClosingService.delete(todayClosing.id, userId);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const earlier = await sale('CASH');
  await ReturnsService.returnItems({ saleId: earlier.id, userId, reason: 'Возврат позавчера', payoutMethod: 'CASH',
    items: [{ saleItemId: earlier.saleItems[0].id, withheldTjs: D(7480) }] });
  await prisma.sale.update({ where: { id: earlier.id }, data: { createdAt: twoDaysAgo } });
  await prisma.saleReturn.updateMany({ where: { saleId: earlier.id }, data: { createdAt: twoDaysAgo } });
  await prisma.financialTransaction.updateMany({ where: { sourceType: 'SALE', sourceId: earlier.id }, data: { transactionDate: twoDaysAgo } });
  await prisma.deviceTimelineEvent.updateMany({ where: { deviceId: earlier.saleItems[0].deviceId }, data: { date: twoDaysAgo } });
  const earlierDay = await DailyClosingService.closeDay(userId, { storeId, businessDate: getBusinessDateKey(twoDaysAgo) });
  assert.equal(earlierDay.expectedCashTjs.toString(), '7480');
  const earlierReturn = await prisma.saleReturn.findFirstOrThrow({ where: { saleId: earlier.id } });
  await CancellationService.cancelReturn(earlier.id, earlierReturn.id, userId, 'Клиент передумал');
  const cancelDay = await DailyClosingService.getSummary(storeId);
  assert.equal(cancelDay.refundsCashTjs, '-3070');
  assert.equal(cancelDay.expectedCashTjs, '3070');
  assert.equal(cancelDay.expectedCashUsd, '330.11');
  assert.equal((await DailyClosingService.getSummary(storeId, getBusinessDateKey(twoDaysAgo))).expectedCashTjs, '7480');
  console.log('PASS: a refund cancelled on a later day is counted on the day the money came back');

  // Cancelling a card sale gives the money back to the card: the shift's bank figure nets to 0.
  const cardCancelled = await sale('CARD');
  await CancellationService.cancelSale(cardCancelled.id, userId, 'Ошибка кассира');
  const cardDay = await DailyClosingService.getSummary(storeId);
  assert.equal(cardDay.salesCardTjs, '10550');
  assert.equal(cardDay.refundsCardTjs, '10550');
  assert.equal(cardDay.expectedCashTjs, '3070');
  const cardSplit = splitClosingAmounts(JSON.parse(JSON.stringify({ ...cardDay, actualCashTjs: cardDay.expectedCashTjs, actualCashUsd: cardDay.expectedCashUsd })));
  assert.equal(cardSplit.bankTjs, 0);
  assert.equal(cardSplit.cashTjs, 3070);
  console.log('PASS: a cancelled card sale is refunded to the card');

  // Once a collection took a receipt's money to Central Cash, annulling it is refused.
  const { CashCollectionService, checkStoreShiftStatus } = await import('../server/src/modules/finance/cash-collection.service');
  for (const date of (await checkStoreShiftStatus(prisma, storeId, null)).unclosedDates) {
    await DailyClosingService.closeDay(userId, { storeId, businessDate: date });
  }
  const register = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const breakdown = await CashCollectionService.getUncollectedBreakdown(storeId);
  assert.equal(breakdown.summary.otherUsd, '0');
  await CashCollectionService.collect({ storeId, expectedCashUsd: register.cashBalanceUsd, actorUserId: userId });
  await assert.rejects(AnnulmentService.annul(earlier.id, userId), /уже инкассированы/);
  console.log('PASS: the register matches its closed days before collection, and a collected receipt cannot be annulled');
} finally {
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
