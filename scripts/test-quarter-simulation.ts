// Deterministic volume regression on a NEW local database only. Dates of sales/expenses
// are fixture-assigned after execution; this is not an OS/PostgreSQL clock simulation.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname, '/mobile_shop_audit', 'Нужна отдельная БД mobile_shop_audit');
assert.equal(url.port, '55439', 'Нужен отдельный тестовый порт 55439');
const schema = `audit_fixes_quarter_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
let server: import('node:http').Server | undefined;
let disconnect: (() => Promise<void>) | undefined;
let operations = 0;
let token = '';
let partnerProfit = D(0);
const monthly = new Map<string, { revenue: ReturnType<typeof D>; profit: ReturnType<typeof D> }>();
const totals = new Map<string, { cash: ReturnType<typeof D>; revenue: ReturnType<typeof D>; cost: ReturnType<typeof D>; expenses: ReturnType<typeof D> }>();
const sum = (values: Array<ReturnType<typeof D>>) => values.reduce((a, b) => a.plus(b), D(0));
const eq = (actual: unknown, expected: unknown, label: string) => assert.equal(D(String(actual)).toFixed(2), D(String(expected)).toFixed(2), label);
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
try {
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
    const r = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
  const { app } = await import('../server/src/app');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnect = () => prisma.$disconnect();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
  const api = async (method: string, path: string, body?: unknown, key = crypto.randomUUID()) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await r.json();
    assert(r.ok, `${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
    if (method !== 'GET') operations++;
    return data;
  };
  token = (await api('POST', '/auth/login', { login: 'admin', password: 'admin123' })).token;
  await api('POST', '/exchange-rate/today', { rate: '10.00' });
  const stores = ['store-siyoma'];
  for (let i = 1; i <= 2; i++) stores.push((await api('POST', '/stores', { name: `Аудит ${i}` })).id);
  await api('PATCH', '/users/user-partner', { storeId: stores[0] });
  await api('PUT', `/stores/${stores[0]}/profit-shares`, { shares: [{ ownerId: 'owner-partner', sharePercent: 40 }] });
  for (let i = 1; i < stores.length; i++) await api('POST', '/users', { login: `quarter${i}`, password: 'quarter-test-password', name: `Продавец ${i}`, role: 'SELLER', storeId: stores[i] });
  const suppliers = ['sup-china', 'sup-dubai', (await api('POST', '/suppliers', { name: 'Поставщик аудита' })).id];
  for (const id of stores) totals.set(id, { cash: D(0), revenue: D(0), cost: D(0), expenses: D(0) });
  let purchaseCost = D(0);
  // 500 phone models, 200 tablets, 300 accessory cards; 3700 physical units.
  for (let batch = 0; batch < 10; batch++) {
    const groups = Array.from({ length: 100 }, (_, j) => {
      const i = batch * 100 + j;
      const cost = D(i % 97 + 1).plus('0.17');
      purchaseCost = purchaseCost.plus(cost.mul(i >= 700 ? 10 : 1));
      return { category: i < 500 ? 'PHONE' : i < 700 ? 'TABLET' : 'ACCESSORY', brand: 'Audit', model: `Модель ${i}`, ram: '8GB', storage: '128GB', color: 'Black', purchasePriceUsd: cost.toFixed(2), items: [{ imei: i < 500 ? String(350000000100000 + i) : `AUDIT-TABLET-${i}` }], barcode: `AUDIT-${i}`, name: `Аксессуар ${i}`, quantity: 10 };
    });
    await api('POST', '/purchases', { supplierId: suppliers[batch % 3], invoiceNumber: `QUARTER-${batch}`, date: '2026-07-01', groups: groups.map(g => ({ ...g, accessoryCategory: 'Кабели' })) });
  }
  const devices = await db.device.findMany({ orderBy: { imei: 'asc' } });
  const products = await db.accessoryProduct.findMany({ orderBy: { barcode: 'asc' } });
  assert.equal(devices.length, 700); assert.equal(products.length, 300);
  for (let i = 0; i < stores.length; i++) {
    const imeis = devices.filter((_, n) => n % 3 === i).map(d => d.imei);
    for (let offset = 0; offset < imeis.length; offset += 200) await api('POST', '/store-receipts', { storeId: stores[i], imeis: imeis.slice(offset, offset + 200), accessories: offset === 0 ? products.filter((_, n) => n % 3 === i).map(p => ({ productId: p.id, quantity: 10 })) : [] });
  }
  const stock = await db.device.findMany({ orderBy: { imei: 'asc' } });
  const accessoryCost = new Map((await db.accessoryBatch.findMany({ where: { storeId: { in: stores } } })).map(b => [b.productId, b.unitCostUsd]));
  for (let day = 0; day < 90; day++) {
    const rate = D('9.50').plus(D(day % 21).div(10));
    await api('POST', '/exchange-rate/today', { rate: rate.toFixed(2) });
    const date = new Date(Date.UTC(2026, 6, 1 + day, 7));
    const month = date.toISOString().slice(0, 7);
    if (!monthly.has(month)) monthly.set(month, { revenue: D(0), profit: D(0) });
    const tasks: Array<{ storeId: string; cost: ReturnType<typeof D>; body: object }> = [];
    for (let n = day; n < stock.length; n += 90) {
      const d = stock[n];
      const price = D(d.costBasisUsd).mul(rate).mul(D('0.90').plus(D(n % 9).div(20))).toDecimalPlaces(2);
      tasks.push({ storeId: d.storeId, cost: D(d.costBasisUsd), body: { items: [{ deviceId: d.id, salePriceTjs: price.toFixed(2) }], total: price } });
    }
    for (let n = 0; n < 30; n++) {
      const index = (day * 30 + n) % 300;
      const p = products[index];
      const cost = D(accessoryCost.get(p.id)!);
      tasks.push({ storeId: stores[index % 3], cost, body: { accessories: [{ productId: p.id, quantity: 1, unitPriceTjs: cost.mul(rate).mul('1.3').toFixed(2) }], total: D(cost.mul(rate).mul('1.3').toFixed(2)) } });
    }
    // Parallel writes to the SAME registers; oracle does not read balances from services.
    for (let start = 0; start < tasks.length; start += 6) await Promise.all(tasks.slice(start, start + 6).map(async task => {
      const { total, ...body } = task.body as { total: ReturnType<typeof D> };
      const sale = await api('POST', '/sales', { ...body, storeId: task.storeId, paymentMethod: 'CASH' });
      await db.sale.update({ where: { id: sale.id }, data: { createdAt: date } });
      const expected = totals.get(task.storeId)!;
      const usd = total.div(rate).toDecimalPlaces(2);
      eq(sale.totalUsd, usd, 'Снапшот USD продажи');
      expected.cash = expected.cash.plus(usd); expected.revenue = expected.revenue.plus(usd); expected.cost = expected.cost.plus(task.cost);
      const m = monthly.get(month)!; m.revenue = m.revenue.plus(usd); m.profit = m.profit.plus(usd.minus(task.cost));
      if (task.storeId === stores[0]) partnerProfit = partnerProfit.plus(usd.minus(task.cost).mul('0.4').toDecimalPlaces(2));
    }));
    for (const storeId of stores) {
      const amount = D('1.13').plus(D(day % 7).div(10));
      const expense = await api('POST', '/expenses', { category: 'OTHER', storeId, amountTjs: amount.toFixed(2), paidFromCashRegister: true });
      await db.expense.update({ where: { id: expense.id }, data: { createdAt: date, paidAt: date } });
      const t = totals.get(storeId)!; const usd = amount.div(rate).toDecimalPlaces(2);
      t.cash = t.cash.minus(usd); t.expenses = t.expenses.plus(usd);
      const m = monthly.get(month)!; m.profit = m.profit.minus(usd);
      if (storeId === stores[0]) partnerProfit = partnerProfit.minus(usd.mul('0.4').toDecimalPlaces(2));
      const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
      const a = await db.financialAccount.findUniqueOrThrow({ where: { storeId } });
      eq(s.cashBalanceUsd, t.cash, `День ${day}: касса с независимой моделью`);
      eq(a.balanceUsd, t.cash, `День ${day}: финансовый счёт`);
    }
    if (day % 10 === 9) console.log(`Дней ${day + 1}/90, операций ${operations}`);
  }
  assert.equal(await db.device.count({ where: { status: 'SOLD' } }), 700);
  assert.equal(sum((await db.accessoryBatch.findMany()).map(b => D(b.quantityRemaining))).toString(), '300');
  eq(sum((await db.supplier.findMany()).map(s => D(s.totalDebtUsd))), purchaseCost, 'Долг поставщиков = закупки');
  const report = await api('GET', '/reports/summary?period=ALL');
  const values = [...totals.values()];
  eq(report.revenueUsd, sum(values.map(t => t.revenue)), 'Выручка отчёта');
  eq(report.cogsUsd, sum(values.map(t => t.cost)), 'Себестоимость отчёта');
  eq(report.expensesUsd, sum(values.map(t => t.expenses)), 'Расходы отчёта');
  eq(report.netProfitUsd, sum(values.map(t => t.revenue.minus(t.cost).minus(t.expenses))), 'Чистая прибыль отчёта');
  const batches = await db.accessoryBatch.findMany();
  eq(purchaseCost, D(report.cogsUsd).plus(sum(batches.map(b => D(b.unitCostUsd).mul(b.quantityRemaining)))), 'Закупки = себестоимость продаж + стоимость остатков');
  for (const batch of batches) assert(batch.quantityRemaining >= 0 && batch.quantityReserved === 0);
  const months = await Promise.all(['2026-07', '2026-08', '2026-09'].map(month => api('GET', `/reports/summary?period=SPECIFIC_MONTH&month=${month}`)));
  eq(sum(months.map(m => D(m.revenueUsd))), report.revenueUsd, 'Аддитивность выручки 3 месяцев');
  eq(sum(months.map(m => D(m.netProfitUsd))), report.netProfitUsd, 'Аддитивность прибыли 3 месяцев');
  for (const [i, month] of ['2026-07', '2026-08', '2026-09'].entries()) {
    eq(months[i].revenueUsd, monthly.get(month)!.revenue, `Независимая выручка ${month}`);
    eq(months[i].netProfitUsd, monthly.get(month)!.profit, `Независимая прибыль ${month}`);
  }
  for (const storeId of stores) {
    const r = await api('GET', `/reports/summary?period=ALL&storeId=${storeId}`); const t = totals.get(storeId)!;
    eq(r.netProfitUsd, t.revenue.minus(t.cost).minus(t.expenses), 'Прибыль магазина');
  }
  const owners = await db.owner.findMany();
  eq(sum(owners.map(o => D(o.availableProfitUsd))), report.netProfitUsd, 'Общая прибыль владельцев');
  for (const o of owners) eq(o.availableProfitUsd, o.totalAccruedProfitUsd.minus(o.totalPaidProfitUsd).minus(o.totalReinvestedUsd), 'Баланс владельца');
  eq(owners.find(o => o.id === 'owner-partner')!.availableProfitUsd, partnerProfit, 'Независимая прибыль партнёра 40% по каждой операции');
  eq(owners.find(o => o.id === 'owner-admin')!.availableProfitUsd, D(report.netProfitUsd).minus(partnerProfit), 'Независимая прибыль администратора');
  for (const account of await db.financialAccount.findMany()) {
    let balance = D(account.openingBalanceUsd);
    for (const posting of await db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId: account.id }, { destinationAccountId: account.id }] } })) {
      if (posting.accountId === account.id) balance = balance.plus(posting.direction === 'IN' ? posting.amountUsd : D(posting.amountUsd).negated());
      else balance = balance.plus(posting.amountUsd);
    }
    eq(account.balanceUsd, balance, 'Восстановление счёта из всех финансовых проводок');
  }
  const result = { schema, days: 90, productCards: 1000, physicalUnits: 3700, operations, sales: await db.sale.count(), expenses: await db.expense.count(), revenueUsd: report.revenueUsd, costUsd: report.cogsUsd, netProfitUsd: report.netProfitUsd, cashDifferenceUsd: '0.00', stockDifference: 0, dateMethod: 'Fixture dates on sales/expenses; real execution clock and daily rate changes', excluded: 'Debt, returns, exchanges, repairs, transfers, payroll and collections are covered separately by other suites, not this volume model' };
  writeFileSync('audit-quarter-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
}
