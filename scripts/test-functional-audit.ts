import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_functional_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
let server: import('node:http').Server | undefined;
let disconnect: (() => Promise<void>) | undefined;
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
try {
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { app } = await import('../server/src/app');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnect = () => prisma.$disconnect();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
  let token = '';
  const api = async (method: string, path: string, body?: unknown, key?: string) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  token = (await api('POST', '/auth/login', { login: 'admin', password: 'admin123' })).data.token;
  for (const query of ['startDate=2026-02-31', 'startDate=invalid', 'startDate=', 'startDate=2026-01-01&endDate=2026-04-31', 'endDate=2026-01-01']) {
    assert.equal((await api('GET', `/reports/summary?${query}`)).status, 400, query);
  }
  pass('report rejects impossible, malformed and incomplete custom periods');
  assert.equal((await api('POST', '/exchange-rate/today', { rate: 10 })).status, 200);
  assert.equal((await api('POST', '/stores/store-siyoma/adjust-cash', { newBalanceTjs: 10000, reason: 'Test fixture' })).status, 200);
  assert.equal((await api('POST', '/stores/main-warehouse/adjust-cash', { newBalanceTjs: 10000, reason: 'Test fixture central' })).status, 200);
  const adjustment = await db.financialTransaction.findFirstOrThrow({ where: { sourceType: 'STORE_ADJUSTMENT', sourceId: 'store-siyoma' } });
  assert(adjustment.amountTjs.eq(10000));
  assert.equal(adjustment.direction, 'IN');
  assert.equal(adjustment.type, 'ADJUSTMENT');
  const cash = async () => (await db.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceUsd.toString();
  const expense = { category: 'OTHER', amountTjs: '12.34', storeId: 'store-siyoma', paidFromCashRegister: true };
  const retries = await Promise.all([api('POST', '/expenses', expense, 'same-expense'), api('POST', '/expenses', expense, 'same-expense')]);
  assert.deepEqual(retries.map(r => r.status), [201, 201]);
  assert.equal(retries[0].data.id, retries[1].data.id);
  assert.equal(await db.expense.count(), 1);
  assert.equal(await cash(), '998.77');
  assert.equal((await api('POST', '/expenses', { ...expense, amountTjs: 99 }, 'same-expense')).status, 409);
  assert.equal((await api('POST', '/expenses', expense, 'same-expense')).data.id, retries[0].data.id);
  pass('persistent atomic idempotency, simultaneous replay and changed-payload conflict');

  const failed = await api('POST', '/expenses', { ...expense, amountTjs: 999999 }, 'failed-expense');
  assert.equal(failed.status, 400);
  const storedFailure = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM operation_requests WHERE key = 'user-admin:failed-expense'`;
  assert.equal(Number(storedFailure[0].count), 0);
  assert.equal(await db.expense.count(), 1);
  pass('failed operation rolls back data and idempotency record');

  const purchase = (number: string, items: { imei: string; imei2?: string }[], price = 1) => api('POST', '/purchases', {
    supplierId: 'sup-dubai', invoiceNumber: number, storeId: 'main-warehouse', groups: [{ brand: 'Audit', model: 'Phone', ram: '8GB', storage: '128', color: 'Black', purchasePriceUsd: price, items }],
  });
  const p = await purchase('ROUND', [{ imei: '350000000000001' }, { imei: '350000000000002' }, { imei: '350000000000003' }]);
  assert.equal(p.status, 201);
  const invoiceId = p.data.invoice.id;
  assert.equal((await api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 1 })).status, 200);
  const devices = await db.device.findMany({ where: { purchaseInvoiceId: invoiceId } });
  assert.equal(devices.reduce((a, d) => a.plus(d.costBasisUsd), new (devices[0].costBasisUsd.constructor as any)(0)).toString(), '1');
  const groups = await db.invoiceGroup.findMany({ where: { invoiceId } });
  assert.equal(groups.reduce((a, g) => a.plus(g.purchasePriceUsd.mul(g.quantity)), new (devices[0].costBasisUsd.constructor as any)(0)).toString(), '1');
  pass('invoice/device/group cent reconciliation');
  const concurrentEdits = await Promise.all([api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 4 }), api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 5 })]);
  assert(concurrentEdits.every(r => r.status === 200));
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: 'sup-dubai' } });
  const invoice = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert.equal(supplier.totalDebtUsd.toString(), invoice.totalAmountUsd.toString());
  pass('parallel invoice edits preserve supplier debt');
  const paymentBody = { amountUsd: 0.5, storeId: 'main-warehouse' };
  const payments = await Promise.all([api('POST', `/supplier-invoices/${invoiceId}/payments`, paymentBody, 'same-payment'), api('POST', `/supplier-invoices/${invoiceId}/payments`, paymentBody, 'same-payment')]);
  assert(payments.every(r => r.status === 201));
  assert.equal(await db.supplierPayment.count(), 1);
  // Below what was paid: the overpaid cent comes back to the Central Cash, the invoice is paid in full.
  assert.equal((await api('PUT', `/supplier-invoices/${invoiceId}`, { totalAmountUsd: 0.49 })).status, 200);
  const below = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  assert.equal(below.paidAmountUsd.toString(), '0.49');
  assert.equal((await db.supplier.findUniqueOrThrow({ where: { id: 'sup-dubai' } })).totalDebtUsd.toString(), '0');
  pass('supplier payment retry; an invoice cut below what was paid gives the overpayment back');

  const imeiRace = await Promise.all([purchase('IMEI-A', [{ imei: '350000000000011', imei2: '350000000000012' }]), purchase('IMEI-B', [{ imei: '350000000000012', imei2: '350000000000011' }])]);
  assert.equal(imeiRace.filter(r => r.status === 201).length, 1);
  assert.equal(await db.device.count({ where: { OR: [{ imei: '350000000000011' }, { imei2: '350000000000011' }] } }), 1);
  pass('concurrent cross-slot IMEI uniqueness');

  const store = await api('POST', '/stores', { name: 'Audit nonzero' });
  await api('POST', `/stores/${store.data.id}/adjust-cash`, { newBalanceTjs: 1000, reason: 'fixture' });
  assert.equal((await api('DELETE', `/stores/${store.data.id}`)).status, 400);
  assert.equal((await db.store.findUniqueOrThrow({ where: { id: store.data.id } })).cashBalanceUsd.toString(), '100');
  pass('nonzero cash register cannot be deleted');

  await db.owner.updateMany({ data: { totalAccruedProfitUsd: 100, availableProfitUsd: 100 } });
  await api('POST', '/owners/owner-admin/investment', { amountUsd: 100 });
  assert.equal((await api('POST', '/owners/owner-admin/payout', { amountUsd: 5 })).status, 404);
  // A profit payout made before payouts were removed still blocks rewriting balances by shares.
  await db.owner.update({ where: { id: 'owner-admin' }, data: { totalPaidProfitUsd: 5, availableProfitUsd: 95 } });
  const shares = [{ ownerId: 'owner-admin', sharePercent: 60 }, { ownerId: 'owner-partner', sharePercent: 40 }];
  assert.equal((await api('POST', '/owners/profit-shares', { shares, rebalanceBalances: true })).status, 400);
  assert.equal((await api('POST', '/owners/profit-shares', { shares })).status, 200);
  for (const o of await db.owner.findMany()) assert(o.availableProfitUsd.eq(o.totalAccruedProfitUsd.minus(o.totalPaidProfitUsd).minus(o.totalReinvestedUsd)));
  await api('POST', '/owners/owner-partner/link-user', { userId: null });
  assert.equal((await api('GET', '/owners')).data.find((o: any) => o.id === 'owner-partner').userId, null);
  pass('partner settlement identity and explicit unlink persist');

  assert.equal((await api('POST', '/users', { login: 'invalid', password: 'test-only-password', name: 'Invalid', role: 'SELLER', storeId: 'store-siyoma', baseSalaryTjs: -1 })).status, 400);
  assert.equal((await api('PATCH', '/users/user-ahmad', { salesCommissionPercent: 150 })).status, 400);
  assert.equal((await api('PATCH', '/users/user-ahmad/status', { active: 'false' })).status, 400);
  assert.equal((await api('PUT', '/suppliers/sup-dubai', { name: '   ' })).status, 400);
  pass('invalid compensation, boolean and blank supplier rejected');

  const racePurchase = await api('POST', '/purchases', { supplierId: 'sup-china', invoiceNumber: 'SALE-EDIT-RACE', storeId: 'store-siyoma', groups: [{ brand: 'Audit', model: 'Race', ram: '8GB', storage: '128', color: 'Black', purchasePriceUsd: 10, items: [{ imei: '350000000000099' }] }] });
  assert.equal(racePurchase.status, 201);
  const raceId = racePurchase.data.invoice.id;
  const raceDeviceId = racePurchase.data.devices[0].id;
  await db.device.update({ where: { id: raceDeviceId }, data: { storeId: 'store-siyoma', status: 'STORE_STOCK' } });
  const [saleRace, editRace] = await Promise.all([
    api('POST', '/sales', { storeId: 'store-siyoma', paymentMethod: 'CASH', items: [{ deviceId: raceDeviceId, salePriceTjs: 200 }] }),
    api('PUT', '/supplier-invoices/' + raceId, { totalAmountUsd: 12 }),
  ]);
  assert.equal(saleRace.status, 201);
  assert([200, 400].includes(editRace.status));
  const saleItem = await db.saleItem.findFirstOrThrow({ where: { deviceId: raceDeviceId } });
  const soldDevice = await db.device.findUniqueOrThrow({ where: { id: raceDeviceId } });
  assert(saleItem.costBasisUsd.eq(soldDevice.costBasisUsd));
  pass('sale racing invoice repricing snapshots the committed cost');

  const createdSupplier = await api('POST', '/suppliers', { name: 'Audit CRUD' }, 'supplier-create');
  assert.equal(createdSupplier.status, 201);
  assert.equal((await api('POST', '/suppliers', { name: 'Audit CRUD' }, 'supplier-create')).data.id, createdSupplier.data.id);
  assert.equal((await api('PUT', '/suppliers/' + createdSupplier.data.id, { name: 'Audit Updated' })).status, 200);
  assert.equal((await api('DELETE', '/suppliers/' + createdSupplier.data.id)).status, 200);
  assert.equal(await db.auditLog.count({ where: { targetId: createdSupplier.data.id } }), 3);
  pass('supplier CRUD is audited and create retry does not duplicate');

  const repairBase = { storeId: 'store-siyoma', imei: '350000000000098', brand: 'Audit', model: 'Repair', problemDescription: 'Test' };
  assert.equal((await api('POST', '/repairs', { ...repairBase, estimatedCostTjs: -1 })).status, 400);
  assert.equal((await api('POST', '/repairs', { ...repairBase, prepaymentTjs: 1 })).status, 400);
  pass('repair rejects negative estimates and unsupported unbooked prepayment');

  await db.auditLog.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ userId: 'user-admin', userName: 'Audit', userRole: 'ADMIN', action: 'AUDIT_TEST', details: String(i) })) });
  const seen = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const batch = await api('GET', '/audit-logs?limit=200' + (cursor ? '&cursor=' + cursor : ''));
    assert.equal(batch.status, 200);
    for (const row of batch.data) { assert(!seen.has(row.id)); seen.add(row.id); }
    if (batch.data.length < 200) break;
    cursor = batch.data.at(-1).id;
  }
  assert.equal(seen.size, await db.auditLog.count());
  pass('cursor history returns all records beyond 500 with tied timestamps');
  await db.notification.create({ data: { id: 'scoped-notification', title: 'Private', message: 'Test', targetUserId: 'user-partner', targetRole: 'ADMIN' } });
  assert(!(await api('GET', '/notifications')).data.some((n: any) => n.id === 'scoped-notification'));
  assert.equal((await api('PATCH', '/notifications/scoped-notification/read')).status, 404);
  await api('POST', '/notifications/read-all');
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: 'scoped-notification' } })).read, false);
  pass('notification recipient and role restrictions are both enforced');
  // Revision is evidence of a physical count; it must not silently adjust stock or money.
  const revisionStore = (await api('POST', '/stores', { name: 'Ревизия аудита' })).data;
  const accessoryReceipt = await api('POST', '/purchases', { supplierId: 'sup-china', invoiceNumber: 'REVISION-ACCESSORIES', groups: [{ category: 'ACCESSORY', barcode: 'REVISION-AUDIT', brand: 'Audit', name: 'Кабель', accessoryCategory: 'Кабели', quantity: 10, purchasePriceUsd: '1.23' }] });
  assert.equal(accessoryReceipt.status, 201);
  const product = await db.accessoryProduct.findUniqueOrThrow({ where: { barcode: 'REVISION-AUDIT' } });
  assert.equal((await api('POST', '/store-receipts', { storeId: revisionStore.id, accessories: [{ productId: product.id, quantity: 10 }] })).status, 201);
  const revisionBody = { storeId: revisionStore.id, checkedImeis: [], accessoryCounts: [{ productId: product.id, counted: 10 }] };
  const matched = await api('POST', '/revisions', revisionBody, 'revision-match');
  assert.equal(matched.status, 201);
  assert.equal(matched.data.status, 'MATCH');
  assert.equal(matched.data.totalExpected, 10);
  assert.equal(matched.data.totalChecked, 10);
  assert.equal((await api('POST', '/revisions', revisionBody, 'revision-match')).data.id, matched.data.id);
  for (const [counted, missing, surplus] of [[7, 3, 0], [12, 0, 2]]) {
    const revision = await api('POST', '/revisions', { ...revisionBody, accessoryCounts: [{ productId: product.id, counted }] });
    assert.equal(revision.status, 201);
    assert.equal(revision.data.status, 'DISCREPANCY');
    assert.equal(revision.data.totalMissing, missing);
    assert.equal(revision.data.totalSurplus, surplus);
  }
  assert.equal((await api('POST', '/revisions', { ...revisionBody, accessoryCounts: [{ productId: product.id, counted: -1 }] })).status, 400);
  const remaining = await db.accessoryBatch.aggregate({ where: { storeId: revisionStore.id }, _sum: { quantityRemaining: true } });
  assert.equal(remaining._sum.quantityRemaining, 10);
  assert((await db.store.findUniqueOrThrow({ where: { id: revisionStore.id } })).cashBalanceUsd.eq(0));
  assert.equal(await db.auditLog.count({ where: { action: 'STOCK_REVISION', targetId: matched.data.id } }), 1);
  pass('accessory receipt and revision: match, shortage, surplus, validation, idempotency, audit; no stock/cash adjustment');
  const ownerProfitBefore = (await db.owner.findMany()).reduce((s, o) => s.plus(o.availableProfitUsd), D(0));
  const accessorySale = await api('POST', '/sales', { storeId: revisionStore.id, paymentMethod: 'CASH', accessories: [{ productId: product.id, quantity: 3, unitPriceTjs: 20 }] });
  assert.equal(accessorySale.status, 201);
  const lineId = accessorySale.data.accessoryItems[0].id;
  const returned = await api('POST', `/sales/${accessorySale.data.id}/return-items`, { paymentMethod: 'CASH', reason: 'Тест частичного возврата', accessories: [{ lineId, quantity: 1, withheldTjs: 2 }] }, 'accessory-partial-return');
  assert.equal(returned.status, 200, JSON.stringify(returned));
  const exchangeBody = { saleId: accessorySale.data.id, returnedAccessory: { lineId, quantity: 1 }, withheldTjs: 0, replacementAccessory: { productId: product.id, quantity: 1, unitPriceTjs: 30 }, paymentMethod: 'CASH', reason: 'Тест обмена аксессуара' };
  const exchanged = await api('POST', '/exchanges', exchangeBody, 'accessory-exchange');
  assert.equal(exchanged.status, 200, JSON.stringify(exchanged));
  assert.equal((await api('POST', '/exchanges', exchangeBody, 'accessory-exchange')).data.sale.id, exchanged.data.sale.id);
  assert.equal((await api('POST', `/sales/${accessorySale.data.id}/return-items`, { paymentMethod: 'CASH', reason: 'Проверка превышения остатка', accessories: [{ lineId, quantity: 2, withheldTjs: 2 }] })).status, 400);
  assert.equal((await db.saleAccessoryItem.findUniqueOrThrow({ where: { id: lineId } })).returnedQuantity, 2);
  assert.equal((await db.accessoryBatch.aggregate({ where: { storeId: revisionStore.id }, _sum: { quantityRemaining: true } }))._sum.quantityRemaining, 8);
  assert((await db.store.findUniqueOrThrow({ where: { id: revisionStore.id } })).cashBalanceUsd.eq('5.20'));
  assert((await db.financialAccount.findUniqueOrThrow({ where: { storeId: revisionStore.id } })).balanceUsd.eq('5.20'));
  const accessoryReport = await api('GET', `/reports/summary?period=ALL&storeId=${revisionStore.id}`);
  assert.equal(accessoryReport.status, 200);
  // A return takes back only what was handed out: the $0.20 withheld stays in the revenue, which equals
  // the store's register ($5.20); periodRefundPenaltiesUsd says how much of it was withheld.
  assert(D(accessoryReport.data.revenueUsd).eq('5.20'), JSON.stringify(accessoryReport.data));
  assert(D(accessoryReport.data.periodRefundPenaltiesUsd).eq('0.20'));
  assert(D(accessoryReport.data.cogsUsd).eq('2.46'));
  assert(D(accessoryReport.data.netProfitUsd).eq('2.74'));
  const ownerProfitAfter = (await db.owner.findMany()).reduce((s, o) => s.plus(o.availableProfitUsd), D(0));
  assert(ownerProfitAfter.minus(ownerProfitBefore).eq('2.74'));
  pass('accessory sale → partial return → exchange: FIFO units, cash, accounts, owner profit, report, retries and over-return rejection reconcile');
  const tabletPurchase = await api('POST', '/purchases', { supplierId: 'sup-china', invoiceNumber: 'TABLET-LOCATIONS', groups: [{ category: 'TABLET', brand: 'Samsung', model: 'Galaxy Tab Audit', storage: '128GB', color: 'Black', purchasePriceUsd: '123.45', items: [{ imei: 'R58N-AUDIT-2026' }] }] });
  assert.equal(tabletPurchase.status, 201, JSON.stringify(tabletPurchase));
  const tablet = tabletPurchase.data.devices[0];
  assert.equal(tablet.category, 'TABLET');
  assert.equal(tablet.storeId, 'main-warehouse');
  const tabletLookup = await api('POST', '/store-receipts/lookup', { storeId: revisionStore.id, imei: 'r58n-audit-2026' });
  assert.equal(tabletLookup.status, 200, JSON.stringify(tabletLookup));
  assert.equal(tabletLookup.data.category, 'TABLET');
  assert.equal((await api('POST', '/store-receipts', { storeId: revisionStore.id, imeis: ['R58N-AUDIT-2026'] })).status, 201);
  const atReceiptStore = await api('GET', `/devices?storeId=${revisionStore.id}&excludeSold=true`);
  assert(atReceiptStore.data.some((d: any) => d.id === tablet.id && d.category === 'TABLET' && d.status === 'STORE_STOCK'));
  assert.equal((await api('POST', '/transfers', { fromStoreId: revisionStore.id, toStoreId: 'store-siyoma', deviceIds: [tablet.id] })).status, 201);
  const atDestination = await api('GET', '/devices?storeId=store-siyoma&search=r58n-audit-2026');
  assert(atDestination.data.some((d: any) => d.id === tablet.id && d.category === 'TABLET'));
  const movedTablet = await db.device.findUniqueOrThrow({ where: { id: tablet.id } });
  assert.equal(movedTablet.storeId, 'store-siyoma');
  assert(movedTablet.costBasisUsd.eq('123.45'));
  pass('tablet SN: purchase → warehouse → store receipt → another store; category, search, stock and cost remain correct');
  token = (await api('POST', '/auth/login', { login: 'partner', password: 'partner123' })).data.token;
  assert.equal((await api('POST', '/revisions', revisionBody)).status, 403);
  assert.equal((await purchase('FORBIDDEN', [{ imei: '350000000000021' }])).status, 403);
  pass('main warehouse purchase permission enforced on backend');
  console.log(`Functional regressions: ${passed} passed`);
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Functional regression schema removed');
}
