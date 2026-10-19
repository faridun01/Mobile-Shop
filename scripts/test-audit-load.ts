import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { withDisposableApi } from './lib/disposable-api';
import { D } from '../server/src/common/decimal';
import { auditOutput } from './lib/audit-output';
import { requireAuditDatabase } from './lib/audit-database';

requireAuditDatabase();

const timings: number[] = [];
let requests = 0;
await withDisposableApi('load', async ({ db, call, baseUrl }) => {
  const request: typeof call = async (...args) => {
    const start = performance.now();
    try { return await call(...args); } finally { timings.push(performance.now() - start); requests++; }
  };
  assert.equal((await request('POST', '/exchange-rate/today', { rate: 10 })).status, 200);
  const storeId = 'store-siyoma';
  const devices = await Promise.all(Array.from({ length: 101 }, (_, i) => db.device.create({ data: {
    imei: String(359800000000000 + i), brand: 'Audit', model: `Concurrency ${i}`, storage: '128GB', color: 'Black',
    storeId, status: 'STORE_STOCK', purchasePriceUsd: 50, costBasisUsd: 50,
  } })));
  const sale = (i: number) => ({ storeId, items: [{ deviceId: devices[i].id, salePriceTjs: 1000 }], paymentMethod: 'CASH' });
  const begin = performance.now();
  for (let offset = 0; offset < 100; offset += 20) {
    const results = await Promise.all(Array.from({ length: 20 }, (_, n) => request('POST', '/sales', sale(offset + n))));
    for (const r of results) assert.equal(r.status, 201, JSON.stringify(r));
  }
  const loadSeconds = (performance.now() - begin) / 1000;
  const race = await Promise.all(Array.from({ length: 20 }, () => request('POST', '/sales', sale(100))));
  assert.equal(race.filter(r => r.status === 201).length, 1, 'Only one concurrent sale may win');
  assert(race.filter(r => r.status !== 201).every(r => [400, 409].includes(r.status)));
  const product = await db.accessoryProduct.create({ data: { barcode: 'LOAD-STOCK', brand: 'Audit', name: 'Кабель', category: 'Кабели' } });
  const batch = await db.accessoryBatch.create({ data: { productId: product.id, storeId, quantityReceived: 5, quantityRemaining: 5, unitCostUsd: 1 } });
  const stockRace = await Promise.all(Array.from({ length: 20 }, () => request('POST', '/sales', { storeId, paymentMethod: 'CASH', accessories: [{ productId: product.id, quantity: 1, unitPriceTjs: 20 }] })));
  assert.equal(stockRace.filter(r => r.status === 201).length, 5, 'No more units than the five in stock may sell');
  assert(stockRace.filter(r => r.status !== 201).every(r => [400, 409].includes(r.status)));
  assert.equal((await db.accessoryBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantityRemaining, 0);
  const key = crypto.randomUUID();
  const expense = { storeId, category: 'OTHER', amountTjs: 10, paidFromCashRegister: true };
  const replays = await Promise.all(Array.from({ length: 20 }, () => request('POST', '/expenses', expense, { key })));
  assert(replays.every(r => r.status === 201), JSON.stringify(replays));
  assert.equal(new Set(replays.map(r => r.data.id)).size, 1);
  assert.equal((await request('POST', '/expenses', { ...expense, amountTjs: 11 }, { key })).status, 409);

  // Lose a committed response at the transport boundary, then recover with the same key.
  const token = (await call('POST', '/auth/login', { login: 'admin', password: 'admin123' })).data.token;
  const recoveryKey = crypto.randomUUID();
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/expenses`, { method: 'POST', signal: controller.signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': recoveryKey }, body: JSON.stringify(expense) });
  assert.equal(response.status, 201);
  controller.abort(); // Deliberately discard body, simulating a response unavailable to the caller.
  const recovered = await request('POST', '/expenses', expense, { key: recoveryKey });
  assert.equal(recovered.status, 201);
  assert.equal(await db.expense.count(), 2);
  assert.equal(await db.sale.count(), 106);
  const expected = D(101).mul(100).plus(10).minus(2);
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const account = await db.financialAccount.findUniqueOrThrow({ where: { storeId } });
  assert.equal(store.cashBalanceUsd.toFixed(2), expected.toFixed(2));
  assert.equal(account.balanceUsd.toFixed(2), expected.toFixed(2));
  assert.equal((await request('POST', '/expenses', { ...expense, amountTjs: 99999999 })).status, 400);
  assert.equal((await db.store.findUniqueOrThrow({ where: { id: storeId } })).cashBalanceUsd.toFixed(2), expected.toFixed(2));
  timings.sort((a, b) => a - b);
  const result = { requests, concurrentClients: 20, distinctSales: 106, accessoryUnitsSold: 5, expenseRows: 2, cashUsd: expected.toFixed(2), unexplainedDifferenceUsd: '0.00',
    saleThroughputPerSecond: 100 / loadSeconds, p50ms: timings[Math.floor(timings.length * .5)], p95ms: timings[Math.floor(timings.length * .95)],
    limitation: 'Local HTTP contention test; committed-response discard, not a physical network outage or production capacity benchmark' };
  writeFileSync(`${auditOutput}/load-result.json`, JSON.stringify(result, null, 2));
  console.log('PASS concurrent writes, device race, same-key replay, conflicting replay, lost-response recovery, insufficient cash');
  console.log(JSON.stringify(result, null, 2));
});
