import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import assert from './lib/decimal-assert';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_cancel_${Date.now()}_${process.pid}`;
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
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  const { OwnersService } = await import('../server/src/modules/owners/owners.service');
  const { computeReportsSummary } = await import('../server/src/modules/reports/reports.service');
  const { activeRefundLogs } = await import('../server/src/modules/sales/cancellation-audit');
  const { calculateRecognizedProfit } = await import('../server/src/modules/sales/profit');
  const storeId = 'store-siyoma';
  const userId = 'user-admin';
  // Test stock is supplied on credit, so the capital audit can reconcile its cost as well.
  const supplier = await prisma.supplier.create({ data: { name: 'Поставщик тестового товара' } });
  let serial = 0;
  const device = () => prisma.$transaction(async (tx) => {
    await tx.supplier.update({ where: { id: supplier.id }, data: { totalDebtUsd: { increment: D(750) }, totalPurchasedUsd: { increment: D(750) } } });
    return tx.device.create({ data: {
      imei: `99111111111${String(++serial).padStart(4, '0')}`, brand: 'Тест', model: 'Отмена', storage: '128GB', color: 'Black',
      status: 'STORE_STOCK', storeId, supplierId: supplier.id, purchasePriceUsd: D(750), costBasisUsd: D(750),
    } });
  });
  const sale = async (price = 10550) => {
    const phone = await device();
    const receipt = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [{ deviceId: phone.id, salePriceTjs: D(price) }] });
    return { phone, receipt };
  };
  const cash = async () => {
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const account = await prisma.financialAccount.findUnique({ where: { storeId } });
    if (account) assert.equal(account.balanceUsd, store.cashBalanceUsd);
    return D(store.cashBalanceUsd);
  };
  const owners = async () => (await prisma.owner.findMany({ orderBy: { id: 'asc' } })).map((row) => ({
    id: row.id, accrued: D(row.totalAccruedProfitUsd).toString(), available: D(row.availableProfitUsd).toString(),
  }));
  const profit = async (id: string) => calculateRecognizedProfit(activeRefundLogs(await prisma.auditLog.findMany({ where: { targetId: id } })), 0);
  await setTodayRate(9.3, userId);
  const first = await sale();
  const initialCash = await cash();
  const initialOwners = await owners();
  const initialProfit = await profit(first.receipt.id);
  const returned = await ReturnsService.returnItems({ saleId: first.receipt.id, userId, reason: 'Ошибка удержания', payoutMethod: 'CASH',
    items: [{ saleItemId: first.receipt.saleItems[0].id, withheldTjs: D(7480) }] });
  assert.equal(returned.payoutTjs, 3070);
  const afterReturn = await cash();
  await setTodayRate(10.2, userId);
  await OwnersService.updateProfitShares([{ ownerId: 'owner-admin', sharePercent: 60 }, { ownerId: 'owner-partner', sharePercent: 40 }], userId);
  await CancellationService.cancelReturn(first.receipt.id, returned.saleReturnId, userId, 'Исправление');
  assert.equal(await cash(), initialCash);
  assert.deepEqual(await owners(), initialOwners);
  assert.equal(await profit(first.receipt.id), initialProfit);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: first.phone.id } })).status, 'SOLD');
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: first.receipt.id } })).status, 'COMPLETED');
  await assert.rejects(CancellationService.cancelReturn(first.receipt.id, returned.saleReturnId, userId, 'Повтор'), /уже отменён/);
  const corrected = await ReturnsService.returnItems({ saleId: first.receipt.id, userId, reason: 'Правильное удержание', payoutMethod: 'CASH',
    items: [{ saleItemId: first.receipt.saleItems[0].id, withheldTjs: D(3070) }] });
  assert.equal(corrected.payoutTjs, 7480);
  // Returning and cancelling again must reverse only live owner allocations.
  await CancellationService.cancelReturn(first.receipt.id, corrected.saleReturnId, userId, 'Повторная проверка');
  assert.deepEqual(await owners(), initialOwners);
  assert.equal(await cash(), initialCash);
  assert(afterReturn.lt(initialCash));
  console.log('PASS: screenshot amounts, changed rate/shares, repeated return and exact reversal');

  const beforeSaleCash = await cash();
  const beforeSaleOwners = await owners();
  const second = await sale(10550.01);
  await setTodayRate(11.7, userId);
  await CancellationService.cancelSale(second.receipt.id, userId, 'Ошибочный чек');
  assert.equal(await cash(), beforeSaleCash);
  assert.deepEqual(await owners(), beforeSaleOwners);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: second.phone.id } })).status, 'STORE_STOCK');
  await assert.rejects(CancellationService.cancelSale(second.receipt.id, userId, 'Повтор'), /уже был возвращён/);
  await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [{ deviceId: second.phone.id, salePriceTjs: D(12000) }] });
  console.log('PASS: sale cancellation reverses original dollars and permits a new sale');

  const third = await sale(12000);
  const thirdCash = await cash();
  const thirdOwners = await owners();
  await RefundService.refund({ saleId: third.receipt.id, refundedByUserId: userId, reason: 'Ошибка', paymentMethod: 'CASH', refundAmountTjs: 11000, penaltyFeeTjs: 1000 });
  await setTodayRate(12.3, userId);
  await CancellationService.cancelReturn(third.receipt.id, undefined, userId, 'Отмена полного возврата');
  assert.equal(await cash(), thirdCash);
  assert.deepEqual(await owners(), thirdOwners);
  // A second refund must not pick the cancelled refund audit row.
  await RefundService.refund({ saleId: third.receipt.id, refundedByUserId: userId, reason: 'Повтор', paymentMethod: 'CASH', refundAmountTjs: 10000, penaltyFeeTjs: 2000 });
  await CancellationService.cancelReturn(third.receipt.id, undefined, userId, 'Отмена повторного возврата');
  assert.equal(await cash(), thirdCash);
  assert.deepEqual(await owners(), thirdOwners);
  console.log('PASS: full receipt refund cancellation, including repeated refund');

  const fourth = await sale(12000);
  const ret = await ReturnsService.returnItems({ saleId: fourth.receipt.id, userId, reason: 'Возврат', payoutMethod: 'CASH',
    items: [{ saleItemId: fourth.receipt.saleItems[0].id, withheldTjs: D(1000) }] });
  await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [{ deviceId: fourth.phone.id, salePriceTjs: D(12000) }] });
  const conflictCash = await cash();
  const conflictOwners = await owners();
  await assert.rejects(CancellationService.cancelReturn(fourth.receipt.id, ret.saleReturnId, userId, 'Недопустимая отмена'), /другие операции|уже продан/);
  assert.equal(await cash(), conflictCash);
  assert.deepEqual(await owners(), conflictOwners);
  assert(await prisma.saleReturn.findUnique({ where: { id: ret.saleReturnId } }));
  console.log('PASS: resale blocks cancellation without changing stock, cash or owners');

  const product = await prisma.accessoryProduct.create({ data: { barcode: 'CANCEL-TEST', brand: 'Тест', name: 'Кабель', category: 'Кабели' } });
  const batches = await Promise.all([2, 1].map((quantity, index) => prisma.accessoryBatch.create({ data: {
    productId: product.id, storeId, quantityReceived: quantity, quantityRemaining: quantity,
    unitCostUsd: D(index ? 20 : 10), receivedAt: new Date(Date.now() - (index ? 1000 : 2000)),
  } })));
  await prisma.supplier.update({ where: { id: supplier.id }, data: { totalDebtUsd: { increment: D(40) }, totalPurchasedUsd: { increment: D(40) } } });
  const accessoriesCash = await cash();
  const accessoriesOwners = await owners();
  const accessorySale = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [],
    accessories: [{ productId: product.id, quantity: 3, unitPriceTjs: D(500) }] });
  const accessoryLine = accessorySale.accessoryItems[0];
  const returnAccessory = () => ReturnsService.returnItems({ saleId: accessorySale.id, userId, reason: 'Аксессуар', payoutMethod: 'CASH', items: [],
    accessories: [{ lineId: accessoryLine.id, quantity: 1, withheldTjs: D(10) }] });
  const a1 = await returnAccessory();
  const a2 = await returnAccessory();
  await assert.rejects(CancellationService.cancelReturn(accessorySale.id, a1.saleReturnId, userId, 'Неверный порядок'), /более поздний/);
  await CancellationService.cancelReturn(accessorySale.id, a2.saleReturnId, userId, 'Отмена второго');
  await prisma.accessoryBatch.update({ where: { id: batches[1].id }, data: { quantityReserved: 1 } });
  const reservedCash = await cash();
  await assert.rejects(CancellationService.cancelReturn(accessorySale.id, a1.saleReturnId, userId, 'Резерв'), /зарезервированы/);
  assert.equal(await cash(), reservedCash);
  assert(await prisma.saleReturn.findUnique({ where: { id: a1.saleReturnId } }));
  await prisma.accessoryBatch.update({ where: { id: batches[1].id }, data: { quantityReserved: 0 } });
  await CancellationService.cancelReturn(accessorySale.id, a1.saleReturnId, userId, 'Отмена первого');
  await CancellationService.cancelSale(accessorySale.id, userId, 'Отмена продажи аксессуаров');
  assert.equal(await cash(), accessoriesCash);
  assert.deepEqual(await owners(), accessoriesOwners);
  for (const batch of batches) assert.equal((await prisma.accessoryBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantityRemaining, batch.quantityReceived);
  console.log('PASS: accessory batch costs, reverse order, reserved stock rollback and sale cancellation');

  const customer = await prisma.customer.create({ data: { name: 'Тест отмены долга', phone: '00000111222' } });
  const debtPhone = await device();
  const beforeDebtCash = await cash();
  const beforeDebtOwners = await owners();
  const debtSale = await SalesService.executeSale({ storeId, userId, paymentMethod: 'DEBT', customerId: customer.id,
    cashAmountTjs: D(2000), debtAmountTjs: D(8000), items: [{ deviceId: debtPhone.id, salePriceTjs: D(10000) }] });
  await RefundService.refund({ saleId: debtSale.id, refundedByUserId: userId, reason: 'Долг', paymentMethod: 'CASH', refundAmountTjs: 1900, penaltyFeeTjs: 100 });
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).totalDebtTjs, 0);
  await CancellationService.cancelReturn(debtSale.id, undefined, userId, 'Восстановление долга');
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).totalDebtTjs, 8000);
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: debtSale.id } })).debtAmountTjs, 8000);
  await CancellationService.cancelSale(debtSale.id, userId, 'Отмена продажи в долг');
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).totalDebtTjs, 0);
  assert.equal(await cash(), beforeDebtCash);
  assert.deepEqual(await owners(), beforeDebtOwners);
  console.log('PASS: customer debt and upfront payment restore exactly');

  const report = await computeReportsSummary({ period: 'ALL', storeId, includeEvents: true });
  const totalProfit = (await prisma.owner.findMany()).reduce((sum, row) => sum.plus(row.totalAccruedProfitUsd), D(0));
  assert.equal(report.profitUsd, totalProfit);
  const cancelledEvents = report.events!.filter((event) => event.saleId === first.receipt.id && event.kind === 'REFUND');
  assert.equal(cancelledEvents.reduce((sum, event) => sum.plus(event.amountUsd), D(0)), 0);
  assert.equal(cancelledEvents.reduce((sum, event) => sum.plus(event.penaltyTjs), D(0)), 0);
  console.log('PASS: reports preserve original returns and exact cancellation events; profit reconciles');

  const { app } = await import('../server/src/app');
  const { AuthService } = await import('../server/src/auth/auth.service');
  const otherStore = await prisma.store.findFirstOrThrow({ where: { id: { not: storeId } } });
  await prisma.user.update({ where: { id: 'user-partner' }, data: { storeId: otherStore.id } });
  const tokenFor = async (id: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return AuthService.createSession({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId }, user.password);
  };
  const [adminToken, sellerToken, partnerToken] = await Promise.all([tokenFor(userId), tokenFor('user-ahmad'), tokenFor('user-partner')]);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  const apiSale = await sale(12000);
  const apiCancel = (token: string | null, key: string, reason = 'Ошибка API') => fetch(`http://127.0.0.1:${port}/api/sales/${apiSale.receipt.id}/cancel-operation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ kind: 'SALE', reason, storeId }),
  });
  assert.equal((await apiCancel(null, 'unauthorized')).status, 401);
  assert.equal((await apiCancel(sellerToken, 'seller')).status, 403);
  assert.equal((await apiCancel(partnerToken, 'partner')).status, 403);
  assert.equal((await apiCancel(adminToken, 'missing-reason', '')).status, 400);
  assert.equal((await apiCancel(adminToken, 'cancel-api-once')).status, 200);
  const afterApiCancel = await cash();
  assert.equal((await apiCancel(adminToken, 'cancel-api-once')).status, 200);
  assert.equal(await cash(), afterApiCancel);
  assert.equal(await prisma.auditLog.count({ where: { targetId: apiSale.receipt.id, action: 'REFUND' } }), 1);
  assert.equal((await apiCancel(adminToken, 'cancel-api-once', 'Другие данные')).status, 409);
  const history = await fetch(`http://127.0.0.1:${port}/api/sales?search=${apiSale.receipt.receiptNumber}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const historyRows = await history.json() as { id: string; isCancelled: boolean }[];
  assert.equal(historyRows.find((row) => row.id === apiSale.receipt.id)?.isCancelled, true);
  console.log('PASS: API authentication, store scope, reason validation, retry idempotency and cancelled receipt state');
  const { AnnulmentService } = await import('../server/src/modules/sales/annulment.service');
  const { registerLedgerBalance } = await import('../server/src/modules/finance/cash-balance');
  await setTodayRate(9.3, userId);
  const annulCash = await cash();
  const annulCashTjs = (await registerLedgerBalance(prisma, storeId)).tjs;
  const annulOwners = await owners();
  const mistaken = await sale();
  await ReturnsService.returnItems({ saleId: mistaken.receipt.id, userId, reason: 'Растаможка', payoutMethod: 'CASH',
    items: [{ saleItemId: mistaken.receipt.saleItems[0].id, withheldTjs: D(7480) }] });
  assert.equal((await cash()).minus(annulCash), 804.3);
  assert.equal((await registerLedgerBalance(prisma, storeId)).tjs.minus(annulCashTjs), 7480);
  const annulApi = (token: string | null, key: string) => fetch(`http://127.0.0.1:${port}/api/sales/${mistaken.receipt.id}/cancel-operation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ kind: 'ANNUL' }),
  });
  assert.equal((await annulApi(sellerToken, 'annul-seller')).status, 403);
  assert.equal((await annulApi(partnerToken, 'annul-partner')).status, 403);
  const concurrentAnnuls = await Promise.all([annulApi(adminToken, 'annul-once'), annulApi(adminToken, 'annul-concurrent')]);
  assert.deepEqual(concurrentAnnuls.map((response) => response.status), [200, 200]);
  assert.equal((await annulApi(adminToken, 'annul-once')).status, 200);
  assert.equal((await annulApi(adminToken, 'annul-again')).status, 200);
  assert.equal(await cash(), annulCash);
  assert.equal((await registerLedgerBalance(prisma, storeId)).tjs, annulCashTjs);
  assert.deepEqual(await owners(), annulOwners);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: mistaken.phone.id } })).status, 'STORE_STOCK');
  const annulledHistory = await fetch(`http://127.0.0.1:${port}/api/sales?search=${mistaken.receipt.receiptNumber}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.deepEqual(await annulledHistory.json(), []);
  const annulledReport = await computeReportsSummary({ period: 'ALL', storeId, includeEvents: true });
  assert.equal(annulledReport.events!.filter((event) => event.saleId === mistaken.receipt.id).length, 0);
  const notices = await prisma.notification.findMany({ where: { targetId: mistaken.receipt.id, actionType: 'SALE_ANNULLED' } });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].targetRole, 'ADMIN');
  assert.equal(await prisma.deviceTimelineEvent.count({ where: { deviceId: mistaken.phone.id, type: { in: ['SALE', 'REFUND'] } } }), 0);
  console.log('PASS: screenshot return leaves 7480 TJS / $804.30; full annulment restores both currencies, stock and owners; hidden from history/reports; one admin notice');

  // An earlier cancellation already neutralized the receipt: annulment must not refund twice.
  const beforeAlreadyCancelled = await cash();
  await AnnulmentService.annul(apiSale.receipt.id, userId);
  assert.equal(await cash(), beforeAlreadyCancelled);
  await AnnulmentService.annul(first.receipt.id, userId);
  const noOldCorrections = await computeReportsSummary({ period: 'ALL', storeId, includeEvents: true });
  assert.equal(noOldCorrections.events!.filter((event) => event.saleId === first.receipt.id).length, 0);
  await assert.rejects(ReturnsService.returnItems({ saleId: first.receipt.id, userId, reason: 'Повтор', payoutMethod: 'CASH', items: [{ saleItemId: first.receipt.saleItems[0].id, withheldTjs: 100 }] }), /аннулирован/);
  console.log('PASS: already-cancelled receipt and receipts with repeated corrections annul without duplicate money; old correction events disappear');

  const legacyBeforeCash = await cash();
  const legacyBeforeOwners = await owners();
  const legacyAnnul = await sale();
  await RefundService.refund({ saleId: legacyAnnul.receipt.id, refundedByUserId: userId, reason: 'Возврат', paymentMethod: 'CASH', refundAmountTjs: 7480, penaltyFeeTjs: 3070 });
  await AnnulmentService.annul(legacyAnnul.receipt.id, userId);
  assert.equal(await cash(), legacyBeforeCash);
  assert.deepEqual(await owners(), legacyBeforeOwners);
  console.log('PASS: full receipt refund and its retained amount annul in one action');
  for (const mode of ['return-items', 'refund'] as const) {
    const zeroBeforeCash = await cash();
    const zeroBeforeOwners = await owners();
    const zeroReceipt = await sale();
    const body = mode === 'return-items'
      ? { items: [{ saleItemId: zeroReceipt.receipt.saleItems[0].id, withheldTjs: 0 }], reason: 'Без удержания', paymentMethod: 'CASH' }
      : { refundAmountTjs: 10550, penaltyFeeTjs: 0, reason: 'Без удержания', paymentMethod: 'CASH' };
    const response = await fetch(`http://127.0.0.1:${port}/api/sales/${zeroReceipt.receipt.id}/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': `zero-${mode}` },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.text());
    assert.equal(await cash(), zeroBeforeCash);
    assert.deepEqual(await owners(), zeroBeforeOwners);
    const zeroAfter = await prisma.sale.findUniqueOrThrow({ where: { id: zeroReceipt.receipt.id } });
    assert.equal(zeroAfter.actualRefundAmountTjs, 10550);
    assert.equal(zeroAfter.penaltyFeeTjs, 0);
    assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: zeroReceipt.phone.id } })).status, 'STORE_STOCK');
    await AnnulmentService.annul(zeroReceipt.receipt.id, userId);
  }
  console.log('PASS: both return APIs accept zero withholding and return all 10550 TJS, restoring cash and owner profit');
  const { ExchangesService } = await import('../server/src/modules/exchanges/exchanges.service');
  const exchangeBeforeCash = await cash();
  const exchangeBeforeOwners = await owners();
  const swapOriginal = await sale();
  const swapReplacement = await device();
  const swapped = await ExchangesService.process({ saleId: swapOriginal.receipt.id, returnedImei: swapOriginal.phone.imei,
    withheldTjs: D(100), replacementDeviceId: swapReplacement.id, newPriceTjs: D(12000), processedByUserId: userId, paymentMethod: 'CASH' });
  const wholeExchange = await AnnulmentService.annul(swapped.sale.id, userId);
  assert.equal(wholeExchange.receiptIds.length, 2);
  assert.equal(await cash(), exchangeBeforeCash);
  assert.deepEqual(await owners(), exchangeBeforeOwners);
  for (const id of [swapOriginal.phone.id, swapReplacement.id]) assert.equal((await prisma.device.findUniqueOrThrow({ where: { id } })).status, 'STORE_STOCK');
  assert.equal(await prisma.notification.count({ where: { actionType: 'SALE_ANNULLED', targetId: swapOriginal.receipt.id } }), 1);
  console.log('PASS: one annulment from an exchange receipt annuls the linked sale/return chain and restores both phones');

  const { CustomersService } = await import('../server/src/modules/customers/customers.service');
  const paidCustomer = await prisma.customer.create({ data: { name: 'Аннуляция с оплатой долга' } });
  const paidPhone = await device();
  const paidBeforeCash = await cash();
  const paidBeforeOwners = await owners();
  const paidSale = await SalesService.executeSale({ storeId, userId, customerId: paidCustomer.id, paymentMethod: 'DEBT', cashAmountTjs: D(2000), items: [{ deviceId: paidPhone.id, salePriceTjs: D(10550) }] });
  await setTodayRate(10, userId);
  await CustomersService.recordPayment({ customerId: paidCustomer.id, storeId, userId, amountTjs: D(3000) });
  await AnnulmentService.annul(paidSale.id, userId);
  assert.equal(await cash(), paidBeforeCash);
  assert.deepEqual(await owners(), paidBeforeOwners);
  const paidCustomerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: paidCustomer.id } });
  assert.equal(paidCustomerAfter.totalDebtTjs, 0);
  assert.equal(paidCustomerAfter.totalPaidTjs, 0);
  assert.equal(await prisma.customerPayment.count({ where: { customerId: paidCustomer.id } }), 0);
  console.log('PASS: debt sale and its later repayment annul together, including payment FX and customer totals');

  const accessoryAnnulBeforeCash = await cash();
  const accessoryAnnulBeforeOwners = await owners();
  const accessoryAnnul = await SalesService.executeSale({ storeId, userId, paymentMethod: 'CASH', items: [],
    accessories: [{ productId: product.id, quantity: 3, unitPriceTjs: D(500) }] });
  await ReturnsService.returnItems({ saleId: accessoryAnnul.id, userId, reason: 'Частичный возврат', payoutMethod: 'CASH', items: [],
    accessories: [{ lineId: accessoryAnnul.accessoryItems[0].id, quantity: 1, withheldTjs: D(10) }] });
  await AnnulmentService.annul(accessoryAnnul.id, userId);
  assert.equal(await cash(), accessoryAnnulBeforeCash);
  assert.deepEqual(await owners(), accessoryAnnulBeforeOwners);
  for (const batch of batches) assert.equal((await prisma.accessoryBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantityRemaining, batch.quantityReceived);
  console.log('PASS: partial accessory return and sale annul without double restocking');

  const finalReport = await computeReportsSummary({ period: 'ALL', storeId, includeEvents: true });
  const finalOwnersProfit = (await prisma.owner.findMany()).reduce((sum, row) => sum.plus(row.totalAccruedProfitUsd), D(0));
  assert.equal(finalReport.profitUsd, finalOwnersProfit);
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  console.log('PASS: owner balances, customer debt and capital audit after all corrections');
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
