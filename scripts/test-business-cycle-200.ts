// Real HTTP business operations on a dedicated local audit DB. Retains its schema for review.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { D } from '../server/src/common/decimal';
import { getBusinessDateKey } from '../server/src/common/business-date';

const url = new URL(process.env.DATABASE_URL || '');
assert(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/mobile_shop_audit');
const schema = `audit_fixes_cycle200_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
const output = 'output/business-cycle-200';
mkdirSync(output, { recursive: true });
type Money = ReturnType<typeof D>;
type Totals = { cash: Money; revenue: Money; cost: Money; penalties: Money; expenses: Money; profit: Money };
const tjs = new Map<string, { revenue: Money; cost: Money; penalties: Money; expenses: Money }>();
type Product = { index: number; category: 'PHONE' | 'TABLET' | 'ACCESSORY'; code: string; cost: Money; id: string; store: string; sold: boolean; quantities: Map<string, number> };
const products: Product[] = [];
const totals = new Map<string, Totals>();
const journal: unknown[] = [];
const checks: string[] = [];
const counts: Record<string, number> = {};
let partnerProfit = D(0);
let purchaseCost = D(0);
let supplierPaid = D(0);
let rate = D(10);
let token = '';
let storeA = '';
let server: import('node:http').Server | undefined;
let disconnect: (() => Promise<void>) | undefined;
const central = 'main-warehouse';
const round = (n: Money) => n.toDecimalPlaces(2);
const sum = (values: Money[]) => values.reduce((a, b) => a.plus(b), D(0));
const eq = (actual: unknown, expected: unknown, label: string) => assert.equal(D(String(actual)).toFixed(2), D(String(expected)).toFixed(2), label);
const account = (id: string) => {
  if (!totals.has(id)) totals.set(id, { cash: D(0), revenue: D(0), cost: D(0), penalties: D(0), expenses: D(0), profit: D(0) });
  if (!tjs.has(id)) tjs.set(id, { revenue: D(0), cost: D(0), penalties: D(0), expenses: D(0) });
  return totals.get(id)!;
};
const profit = (store: string, amount: Money) => {
  account(store).profit = account(store).profit.plus(amount);
  if (store === storeA) partnerProfit = partnerProfit.plus(round(amount.mul('0.4')));
};
const stockChange = (p: Product, store: string, quantity: number) => {
  if (p.category === 'ACCESSORY') p.quantities.set(store, (p.quantities.get(store) || 0) + quantity);
  else { p.store = store; p.sold = quantity < 0; }
};
const move = (p: Product, from: string, to: string, quantity = 1) => {
  if (p.category === 'ACCESSORY') { stockChange(p, from, -quantity); stockChange(p, to, quantity); }
  else p.store = to;
};
const saleModel = (p: Product, store: string, quantity: number, totalTjs: Money) => {
  const usd = round(totalTjs.div(rate)); const cost = p.cost.mul(quantity); const t = account(store);
  t.cash = t.cash.plus(usd); t.revenue = t.revenue.plus(usd); t.cost = t.cost.plus(cost);
  const local = tjs.get(store)!; local.revenue = local.revenue.plus(totalTjs); local.cost = local.cost.plus(cost.mul(rate));
  profit(store, usd.minus(cost)); stockChange(p, store, -quantity);
};
const returnModel = (p: Product, store: string, quantity: number, originalTjs: Money, withheldTjs: Money) => {
  const gross = round(originalTjs.div(rate)); const penalty = round(withheldTjs.div(rate)); const credit = gross.minus(penalty);
  const cost = p.cost.mul(quantity); const t = account(store);
  t.cash = t.cash.minus(credit); t.revenue = t.revenue.minus(gross); t.cost = t.cost.minus(cost); t.penalties = t.penalties.plus(penalty);
  const local = tjs.get(store)!; local.revenue = local.revenue.minus(originalTjs); local.cost = local.cost.minus(cost.mul(rate)); local.penalties = local.penalties.plus(withheldTjs);
  profit(store, cost.minus(credit)); stockChange(p, store, quantity);
};
const expenseModel = (store: string, paidFrom: string, usd: Money) => {
  account(store).expenses = account(store).expenses.plus(usd); account(paidFrom).cash = account(paidFrom).cash.minus(usd); profit(store, usd.negated());
  tjs.get(store)!.expenses = tjs.get(store)!.expenses.plus(usd.mul(rate));
};

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
  const api = async (method: string, path: string, body?: unknown, expected?: number, key = crypto.randomUUID()) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await r.json();
    journal.push({ method, path, status: r.status, ...(path.includes('/auth/') ? {} : { body, id: data?.id, receiptNumber: data?.receiptNumber }) });
    if (expected) assert.equal(r.status, expected, JSON.stringify(data));
    else assert(r.ok, `${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
    if (r.ok && method !== 'GET') counts[path.split('/')[1]] = (counts[path.split('/')[1]] || 0) + 1;
    return data;
  };
  const setRate = async (next: number) => { rate = D(next); await api('POST', '/exchange-rate/today', { rate: next }); };
  const reconciled = async (stage: string) => {
    for (const s of await db.store.findMany()) {
      eq(s.cashBalanceUsd, account(s.id).cash, `${stage}: касса ${s.name}`);
      const a = await db.financialAccount.findUnique({ where: { storeId: s.id } });
      eq(a?.balanceUsd ?? 0, account(s.id).cash, `${stage}: счёт ${s.name}`);
    }
    for (const p of products) {
      if (p.category === 'ACCESSORY') {
        const batches = await db.accessoryBatch.groupBy({ by: ['storeId'], where: { productId: p.id }, _sum: { quantityRemaining: true } });
        for (const store of [central, ...totals.keys()]) assert.equal(batches.find(b => b.storeId === store)?._sum.quantityRemaining ?? 0, p.quantities.get(store) || 0, `${stage}: ${p.code} ${store}`);
      } else {
        const row = await db.device.findUniqueOrThrow({ where: { id: p.id } });
        assert.equal(row.storeId, p.store, `${stage}: расположение ${p.code}`);
        assert.equal(row.status, p.sold ? 'SOLD' : p.store === central ? 'MAIN_WAREHOUSE' : 'STORE_STOCK', `${stage}: статус ${p.code}`);
        eq(row.costBasisUsd, p.cost, `${stage}: себестоимость ${p.code}`);
      }
    }
    const owners = await db.owner.findMany();
    eq(owners.find(o => o.id === 'owner-partner')!.availableProfitUsd, partnerProfit, `${stage}: прибыль партнёра`);
    eq(owners.find(o => o.id === 'owner-admin')!.availableProfitUsd, sum([...totals.values()].map(t => t.profit)).minus(partnerProfit), `${stage}: прибыль администратора`);
    checks.push(stage); console.log(`PASS ${stage}`);
  };
  token = (await api('POST', '/auth/login', { login: 'admin', password: 'admin123' })).token;
  await setRate(10);
  storeA = 'store-siyoma';
  const storeB = (await api('POST', '/stores', { name: 'Тест 200 — филиал Б' })).id as string;
  account(central); account(storeA); account(storeB);
  await api('PATCH', '/users/user-partner', { storeId: storeA });
  await api('PUT', `/stores/${storeA}/profit-shares`, { shares: [{ ownerId: 'owner-partner', sharePercent: 40 }] });
  for (const [owner, amount] of [['owner-admin', '100000'], ['owner-partner', '10000']]) await api('POST', `/owners/${owner}/investment`, { amountUsd: amount });
  account(central).cash = D(110000);
  await reconciled('Капитал и начальные кассы');
  const supplierIds = ['sup-china', 'sup-dubai'];
  for (let batch = 0; batch < 2; batch++) {
    const groups = Array.from({ length: 100 }, (_, offset) => {
      const index = batch * 100 + offset;
      const category = index < 80 ? 'PHONE' : index < 140 ? 'TABLET' : 'ACCESSORY';
      const code = category === 'PHONE' ? String(350000002000000 + index) : category === 'TABLET' ? `CYCLE200-SN-${index}` : `CYCLE200-BAR-${index}`;
      const cost = D(category === 'PHONE' ? 80 + index : category === 'TABLET' ? 100 + index : 1 + index % 15).plus('0.25');
      const p: Product = { index, category, code, cost, id: '', store: central, sold: false, quantities: new Map([[central, category === 'ACCESSORY' ? 5 : 1]]) };
      products.push(p); purchaseCost = purchaseCost.plus(cost.mul(category === 'ACCESSORY' ? 5 : 1));
      return { category, brand: ['Samsung', 'Apple', 'Xiaomi', 'Lenovo'][index % 4], model: `Модель теста ${index}`, ram: '8GB', storage: '128GB', color: 'Black', items: [{ imei: code }], barcode: code, name: `Аксессуар теста ${index}`, accessoryCategory: 'Кабели', quantity: 5, purchasePriceUsd: cost.toFixed(2) };
    });
    await api('POST', '/purchases', { supplierId: supplierIds[batch], invoiceNumber: `CYCLE200-${batch}`, date: getBusinessDateKey(), groups });
  }
  for (const p of products) p.id = p.category === 'ACCESSORY' ? (await db.accessoryProduct.findUniqueOrThrow({ where: { barcode: p.code } })).id : (await db.device.findUniqueOrThrow({ where: { imei: p.code } })).id;
  assert.equal(await db.device.count(), 140); assert.equal(await db.accessoryProduct.count(), 60);
  await reconciled('200 разных карточек: 80 телефонов, 60 планшетов, 60 аксессуаров; 440 единиц');
  const transferBody = (selection: Product[], from: string, to: string) => ({ fromStoreId: from, toStoreId: to, deviceIds: selection.filter(p => p.category !== 'ACCESSORY').map(p => p.id), accessories: selection.filter(p => p.category === 'ACCESSORY').map(p => ({ productId: p.id, quantity: 5 })) });
  const even = products.filter(p => p.index % 2 === 0); const odd = products.filter(p => p.index % 2 === 1);
  await api('POST', '/transfers', transferBody(even, central, storeA)); even.forEach(p => move(p, central, storeA, p.category === 'ACCESSORY' ? 5 : 1));
  await api('POST', '/store-receipts', { storeId: storeB, imeis: odd.filter(p => p.category !== 'ACCESSORY').map(p => p.code), accessories: odd.filter(p => p.category === 'ACCESSORY').map(p => ({ productId: p.id, quantity: 5 })) });
  odd.forEach(p => move(p, central, storeB, p.category === 'ACCESSORY' ? 5 : 1));
  await api('POST', '/transfers', { fromStoreId: storeA, toStoreId: storeB, deviceIds: [products[0].id, products[2].id], accessories: [{ productId: products[140].id, quantity: 1 }] });
  [products[0], products[2], products[140]].forEach(p => move(p, storeA, storeB));
  await reconciled('Перемещение со склада, приход в магазин и межмагазинное перемещение');
  const sold = new Map<number, { sale: any; store: string; priceTjs: Money; unitTjs: Money; rate: Money }>();
  for (const store of [storeA, storeB]) {
    await setRate(store === storeA ? 10 : 12);
    for (const p of products.filter(p => p.category !== 'ACCESSORY' ? p.store === store : p.quantities.has(store) && p.index % 2 === (store === storeA ? 0 : 1))) {
      const quantity = p.category === 'ACCESSORY' ? 2 : 1;
      const unitTjs = p.cost.plus(p.category === 'ACCESSORY' ? 5 : 20 + p.index % 5).mul(rate);
      const priceTjs = unitTjs.mul(quantity);
      const body = { storeId: store, paymentMethod: p.index % 3 === 0 ? 'CARD' : p.index % 3 === 1 ? 'SPLIT' : 'CASH', ...(p.index % 3 === 1 ? { cashAmountTjs: priceTjs.div(2).toFixed(2), cardAmountTjs: priceTjs.div(2).toFixed(2) } : {}), ...(p.category === 'ACCESSORY' ? { accessories: [{ productId: p.id, quantity, unitPriceTjs: unitTjs.toFixed(2) }] } : { items: [{ deviceId: p.id, salePriceTjs: priceTjs.toFixed(2) }] }) };
      const sale = await api('POST', '/sales', body);
      sold.set(p.index, { sale, store, priceTjs, unitTjs, rate }); saleModel(p, store, quantity, priceTjs);
    }
  }
  await reconciled('Все 200 карточек прошли продажу: 140 устройств и по 2 единицы каждого аксессуара');
  for (const p of [...products.slice(0, 8), products[120], products[122]]) {
    const old = sold.get(p.index)!; await setRate(old.rate.eq(10) ? 12 : 10);
    await api('POST', `/sales/${old.sale.id}/return-items`, { reason: 'Тест: возврат покупателя', paymentMethod: 'CASH', items: [{ saleItemId: old.sale.saleItems[0].id, withheldTjs: rate.toFixed(2) }] });
    returnModel(p, old.store, 1, old.priceTjs, rate);
  }
  await reconciled('10 возвратов телефонов и планшетов при другом курсе с удержанием $1');
  for (const p of products.slice(8, 14)) {
    const old = sold.get(p.index)!; await setRate(old.rate.eq(10) ? 12 : 10);
    const replacement = products.find(x => x.category !== 'ACCESSORY' && !x.sold && x.store === old.store && x.id !== p.id)!;
    const newTjs = p.index % 2 === 0 ? replacement.cost.plus(30).mul(rate) : round(old.priceTjs.div(2));
    await api('POST', '/exchanges', { saleId: old.sale.id, saleItemId: old.sale.saleItems[0].id, withheldTjs: 0, replacementDeviceId: replacement.id, newPriceTjs: newTjs.toFixed(2), paymentMethod: 'CASH', reason: 'Тест обмена дороже/дешевле' });
    returnModel(p, old.store, 1, old.priceTjs, D(0)); saleModel(replacement, old.store, 1, newTjs);
  }
  for (const p of products.slice(140, 142)) {
    const old = sold.get(p.index)!; await setRate(old.rate.eq(10) ? 12 : 10);
    await api('POST', `/sales/${old.sale.id}/return-items`, { reason: 'Тест частичного возврата аксессуара', paymentMethod: 'CASH', accessories: [{ lineId: old.sale.accessoryItems[0].id, quantity: 1, withheldTjs: rate.toFixed(2) }] });
    returnModel(p, old.store, 1, old.unitTjs, rate);
  }
  {
    const p = products[142]; const old = sold.get(p.index)!; const replacement = products[144]; await setRate(12);
    const newTjs = replacement.cost.plus(7).mul(rate);
    await api('POST', '/exchanges', { saleId: old.sale.id, returnedAccessory: { lineId: old.sale.accessoryItems[0].id, quantity: 1 }, withheldTjs: 0, replacementAccessory: { productId: replacement.id, quantity: 1, unitPriceTjs: newTjs.toFixed(2) }, paymentMethod: 'CASH' });
    returnModel(p, old.store, 1, old.unitTjs, D(0)); saleModel(replacement, old.store, 1, newTjs);
  }
  await reconciled('6 обменов устройств, 2 частичных возврата и 1 обмен аксессуара');
  await setRate(12);
  for (const index of [20, 21, 90, 91]) {
    const p = products[index];
    const ticket = await api('POST', '/repairs', { storeId: p.store, imei: p.code, brand: 'Тест', model: `Ремонт ${index}`, problemDescription: 'Тест: не заряжается', customerName: 'Тестовый покупатель' });
    await api('PATCH', `/repairs/${ticket.id}/status`, { status: 'IN_PROGRESS' });
    await api('PATCH', `/repairs/${ticket.id}/status`, { status: 'READY' });
    await api('PATCH', `/repairs/${ticket.id}/status`, { status: 'ISSUED', finalCostTjs: 120 });
    expenseModel(p.store, central, D(10));
    await api('PATCH', `/repairs/${ticket.id}/status`, { status: 'ISSUED', finalCostTjs: 120 }, 400);
  }
  for (const store of [storeA, storeB]) {
    await api('POST', '/expenses', { storeId: store, category: 'OTHER', amountTjs: 84, paidFromCashRegister: true, description: 'Тест: расход торговой точки' });
    expenseModel(store, store, D(7));
  }
  await reconciled('4 полных ремонта с защитой от двойной выдачи и 2 расхода');
  for (const [i, amount] of [1000, 500].entries()) {
    await api('POST', `/suppliers/${supplierIds[i]}/payments`, { amountUsd: amount });
    supplierPaid = supplierPaid.plus(amount); account(central).cash = account(central).cash.minus(amount);
  }
  const collected = account(storeA).cash;
  await api('POST', '/cash-collections', { storeId: storeA, expectedCashUsd: collected.toFixed(2) }, 400);
  for (const store of [storeA, storeB]) {
    const summary = await api('GET', `/daily-closings/summary?storeId=${store}`);
    eq(summary.expectedCashUsd, account(store).cash, 'Z-отчёт: ожидаемый остаток USD');
    const closing = await api('POST', '/daily-closings', { storeId: store });
    eq(closing.differenceUsd, 0, 'Закрытие смены без расхождения');
  }
  await api('POST', '/cash-collections', { storeId: storeA, expectedCashUsd: collected.toFixed(2) });
  account(storeA).cash = D(0); account(central).cash = account(central).cash.plus(collected);
  await reconciled('Частичная оплата обоим поставщикам и инкассация магазина А');
  for (const store of [central, storeA, storeB]) {
    const revision = await api('POST', '/revisions', { storeId: store, checkedImeis: products.filter(p => p.category !== 'ACCESSORY' && !p.sold && p.store === store).map(p => p.code), accessoryCounts: products.filter(p => p.category === 'ACCESSORY' && (p.quantities.get(store) || 0) > 0).map(p => ({ productId: p.id, counted: p.quantities.get(store) })) });
    assert.equal(revision.status, 'MATCH');
  }
  const expected = [...totals.values()];
  const totalProfit = sum(expected.map(t => t.profit));
  const reports: Record<string, any> = {};
  const day = getBusinessDateKey();
  for (const period of ['ALL', 'TODAY', 'MONTH', `SPECIFIC_MONTH&month=${day.slice(0, 7)}`, `CUSTOM_RANGE&startDate=${day}&endDate=${day}`]) {
    const report = await api('GET', `/reports/summary?period=${period}&events=1`); reports[period] = report;
    eq(report.revenueUsd, sum(expected.map(t => t.revenue)), `${period}: выручка`);
    eq(report.cogsUsd, sum(expected.map(t => t.cost)), `${period}: себестоимость`);
    eq(report.expensesUsd, sum(expected.map(t => t.expenses)), `${period}: расходы`);
    eq(report.netProfitUsd, totalProfit, `${period}: чистая прибыль`);
    eq(report.revenueTjs, sum([...tjs.values()].map(t => t.revenue)), `${period}: выручка TJS`);
    eq(report.cogsTjs, sum([...tjs.values()].map(t => t.cost)), `${period}: себестоимость TJS`);
    eq(report.expensesTjs, sum([...tjs.values()].map(t => t.expenses)), `${period}: расходы TJS`);
    eq(report.netProfitTjs, sum([...tjs.values()].map(t => t.revenue.minus(t.cost).plus(t.penalties).minus(t.expenses))), `${period}: прибыль TJS`);
  }
  for (const store of [storeA, storeB]) {
    const report = await api('GET', `/reports/summary?period=ALL&storeId=${store}`); reports[store] = report;
    eq(report.netProfitUsd, account(store).profit, 'Прибыль конкретной точки');
    const local = tjs.get(store)!;
    eq(report.netProfitTjs, local.revenue.minus(local.cost).plus(local.penalties).minus(local.expenses), 'Прибыль точки TJS');
  }
  eq(sum((await db.supplier.findMany()).map(s => s.totalDebtUsd)), purchaseCost.minus(supplierPaid), 'Долги поставщикам');
  const remainingCost = sum(products.map(p => p.category === 'ACCESSORY' ? p.cost.mul([...p.quantities.values()].reduce((a, b) => a + b, 0)) : p.sold ? D(0) : p.cost));
  const desk = await api('GET', '/cash-desk/summary'); reports.cashDesk = desk;
  eq(desk.cash.totalUsd, sum(expected.map(t => t.cash)), 'Кассовая сводка: деньги');
  eq(desk.inventory.totalCostUsd, remainingCost, 'Кассовая сводка: стоимость остатков');
  eq(desk.suppliers.totalDebtUsd, purchaseCost.minus(supplierPaid), 'Кассовая сводка: поставщики');
  assert.equal(desk.inventory.totalCount, products.filter(p => p.category !== 'ACCESSORY' && !p.sold).length + products.filter(p => p.category === 'ACCESSORY').reduce((n, p) => n + [...p.quantities.values()].reduce((a, b) => a + b, 0), 0));
  eq(purchaseCost, remainingCost.plus(sum(expected.map(t => t.cost))), 'Закупки = продажи по себестоимости + остатки');
  eq(sum(expected.map(t => t.cash)).plus(remainingCost).minus(purchaseCost.minus(supplierPaid)), D(110000).plus(totalProfit), 'Капитал + прибыль = кассы + склад − поставщики');
  for (const a of await db.financialAccount.findMany()) {
    let balance = D(a.openingBalanceUsd);
    for (const p of await db.financialTransaction.findMany({ where: { balanceCurrency: 'USD', OR: [{ accountId: a.id }, { destinationAccountId: a.id }] } })) {
      if (p.accountId !== a.id || p.direction === 'IN') balance = balance.plus(p.amountUsd);
      else if (p.direction === 'OUT' || p.type === 'TRANSFER') balance = balance.minus(p.amountUsd);
    }
    eq(a.balanceUsd, balance, `Восстановление счёта ${a.name} из проводок`);
  }
  checks.push('Отчёты ALL/TODAY/MONTH, магазины, стоимость остатков, поставщики, капитал и восстановление счетов по проводкам');
  // Change the live rate after all writes: historical report dollars must stay unchanged.
  await setRate(15);
  eq((await api('GET', '/reports/summary?period=ALL')).netProfitUsd, totalProfit, 'Историческая прибыль после смены текущего курса');
  const beforeClose = await db.owner.findMany();
  await api('POST', '/owners/quarter-close', { quarterName: 'Тест 200 товаров', transferRemainingToCapital: true });
  for (const o of beforeClose) {
    const after = await db.owner.findUniqueOrThrow({ where: { id: o.id } });
    eq(after.availableProfitUsd, 0, 'Прибыль перенесена в капитал');
    eq(after.capitalBalanceUsd, o.capitalBalanceUsd.plus(o.availableProfitUsd), 'Капитал после закрытия');
  }
  eq((await api('GET', '/reports/summary?period=ALL')).netProfitUsd, totalProfit, 'Отчёт не меняется после закрытия прибыли');
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  writeFileSync(`${output}/owner-audit.log`, audit.stdout + audit.stderr);
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  checks.push('Распределение 60/40 в магазине А, 100% администратору в Б; закрытие прибыли в капитал; audit:owners');
  const result = {
    status: 'PASS', schema, database: 'mobile_shop_audit', port: 55439, date: getBusinessDateKey(), counts,
    productCards: 200, categories: { phones: 80, tablets: 60, accessories: 60 }, receivedUnits: 440,
    saleReceipts: await db.sale.count(), repairTickets: await db.repairTicket.count(),
    purchaseCostUsd: purchaseCost.toFixed(2), supplierPaidUsd: supplierPaid.toFixed(2), supplierDebtUsd: purchaseCost.minus(supplierPaid).toFixed(2),
    remainingCostUsd: remainingCost.toFixed(2), netProfitUsd: totalProfit.toFixed(2), partnerProfitUsd: partnerProfit.toFixed(2), adminProfitUsd: totalProfit.minus(partnerProfit).toFixed(2),
    netProfitTjs: reports.ALL.netProfitTjs,
    stores: Object.fromEntries([...totals].map(([id, t]) => [id, Object.fromEntries(Object.entries(t).map(([key, value]) => [key, value.toFixed(2)]))])),
    devicesSold: products.filter(p => p.category !== 'ACCESSORY' && p.sold).length,
    accessoryUnitsLeft: products.filter(p => p.category === 'ACCESSORY').reduce((n, p) => n + [...p.quantities.values()].reduce((a, b) => a + b, 0), 0),
    ownersBeforeClose: beforeClose.map(o => ({ id: o.id, capitalUsd: o.capitalBalanceUsd.toFixed(2), availableProfitUsd: o.availableProfitUsd.toFixed(2) })),
    ownersAfterClose: (await db.owner.findMany()).map(o => ({ id: o.id, capitalUsd: o.capitalBalanceUsd.toFixed(2), availableProfitUsd: o.availableProfitUsd.toFixed(2) })),
    differences: { cashUsd: '0.00', profitUsd: '0.00', stockUnits: 0, costUsd: '0.00' }, checks,
  };
  writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2));
  writeFileSync(`${output}/reports.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  writeFileSync(`${output}/failure-${schema}.json`, JSON.stringify({ schema, checks, error: String(error) }, null, 2));
  throw error;
} finally {
  writeFileSync(`${output}/operations.json`, JSON.stringify(journal, null, 2));
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await disconnect?.(); await db.$disconnect();
  console.log(`Тестовые записи сохранены в схеме ${schema}`);
}
