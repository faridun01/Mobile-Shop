import assert from 'node:assert/strict';
import { D } from '../server/src/common/decimal';
import { withDisposableApi } from './lib/disposable-api';

let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };

await withDisposableApi('shiftcash', async ({ db, call, login }) => {
  const storeId = 'store-siyoma';
  const seller = await login('ahmad', 'seller123');
  const ok = async (method: string, path: string, body?: unknown, status = 200) => {
    const r = await call(method, path, body);
    assert.equal(r.status, status, JSON.stringify(r));
    return r.data;
  };
  const snapshot = async () => {
    const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    const account = await db.financialAccount.findFirstOrThrow({ where: { storeId } });
    const rows = await db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId: account.id }, { destinationAccountId: account.id }] } });
    const balance = rows.reduce((s, r) => s.plus(D(r.amountUsd).mul(r.accountId === account.id && (r.direction === 'OUT' || r.type === 'TRANSFER') ? -1 : 1)), D(0));
    assert.equal(String(store.cashBalanceUsd), String(account.balanceUsd));
    assert.equal(String(store.cashBalanceUsd), balance.toString());
    return {
      cash: String(store.cashBalanceUsd),
      owners: (await db.owner.findMany({ orderBy: { id: 'asc' } })).map(o => [o.id, String(o.availableProfitUsd), String(o.totalAccruedProfitUsd), String(o.capitalBalanceUsd)]),
    };
  };
  await ok('POST', '/exchange-rate/today', { rate: 10 });
  const device = await db.device.create({ data: { imei: '359900000000001', brand: 'Apple', model: 'Shift fixture', storage: '128GB', color: 'Black', storeId, status: 'STORE_STOCK', purchasePriceUsd: 50, costBasisUsd: 50 } });
  await ok('POST', '/sales', { storeId, items: [{ deviceId: device.id, salePriceTjs: 1000 }], paymentMethod: 'CASH', cashAmountTjs: 1000, cardAmountTjs: 0 }, 201);
  const before = await snapshot();
  assert.equal(before.cash, '100');
  await ok('POST', '/exchange-rate/today', { rate: 12 });

  const key = crypto.randomUUID();
  const body = { storeId, actualCashTjs: 1120 };
  const surplus = await call('POST', '/daily-closings', body, { key });
  assert.equal(surplus.status, 201, JSON.stringify(surplus));
  assert.equal(String(surplus.data.differenceTjs), '120');
  assert.equal((await snapshot()).cash, '110');
  const replay = await call('POST', '/daily-closings', body, { key });
  assert.equal(replay.data.id, surplus.data.id);
  assert.equal((await snapshot()).cash, '110');
  assert.equal((await call('POST', '/daily-closings', body)).status, 409);
  assert.equal((await call('DELETE', `/daily-closings/${surplus.data.id}`, undefined, { token: seller })).status, 403);
  await ok('DELETE', `/daily-closings/${surplus.data.id}`);
  assert.deepEqual(await snapshot(), before);
  pass('surplus +120 TJS at rate 12 books +$10 once; admin reopening restores cash and owner profit exactly');

  const shortage = await ok('POST', '/daily-closings', { storeId, actualCashTjs: 880 }, 201);
  assert.equal(String(shortage.differenceTjs), '-120');
  assert.equal((await snapshot()).cash, '90');
  const expense = await db.expense.findUniqueOrThrow({ where: { id: shortage.shortageExpenseId } });
  assert.equal(String(expense.amountUsd), '10');
  await ok('POST', '/exchange-rate/today', { rate: 15 });
  await ok('DELETE', `/daily-closings/${shortage.id}`);
  assert.deepEqual(await snapshot(), before);
  pass('shortage -120 TJS books $10 expense; reopening at rate 15 reverses historical $10, not $8');

  for (const invalid of [{ actualCashTjs: -1 }, { businessDate: '2099-01-01' }, { storeId: 'main-warehouse' }]) {
    assert.equal((await call('POST', '/daily-closings', { storeId, ...invalid })).status, 400);
    assert.deepEqual(await snapshot(), before);
  }
  pass('negative cash, future date and central warehouse closing are refused without balance changes');

  const concurrent = await Promise.all([1, 2].map(() => call('POST', '/daily-closings', { storeId })));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
  assert.deepEqual(await snapshot(), before);
  pass('two simultaneous closings create one document, without extra postings');
  await ok('POST', '/cash-collections', { storeId, expectedCashUsd: 100 }, 201);
  assert.equal((await snapshot()).cash, '0');
  const closing = concurrent.find(r => r.status === 201)!.data;
  assert.equal((await call('DELETE', `/daily-closings/${closing.id}`)).status, 409);
  assert.equal((await snapshot()).cash, '0');
  pass('collection moves $100 once; reopening an already collected shift is refused');
});
console.log(`Shift cash flow: ${passed} groups passed`);
