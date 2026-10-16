// (Re)creates the perf_test database: migrations, the standard seed, then business volume through
// the real API (stores, staff, purchases, transfers, sales of every kind, refunds, exchanges,
// returns, debt repayments, expenses, repairs, closings and collections).
//
//   npx tsx PERFORMANCE_AUDIT/scripts/setup-perf-db.ts [sales=4000]
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PERF_DB, perfDatabaseUrl, assertPerfDb } from './perf-env';

const SALES = Number(process.argv[2] || 4000);
const url = perfDatabaseUrl();
const admin = new URL(url);
admin.pathname = '/postgres';
admin.searchParams.delete('schema');
const root = new PrismaClient({ datasources: { db: { url: admin.href } } });
await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${PERF_DB}" WITH (FORCE)`);
await root.$executeRawUnsafe(`CREATE DATABASE "${PERF_DB}"`);
await root.$disconnect();

// Seed logins get random passwords, kept only in the scratch file for the measuring scripts.
const passwords: Record<string, string> = {};
for (const l of ['ADMIN', 'PARTNER', 'AHMAD', 'FARHOD']) passwords[`SEED_PASSWORD_${l}`] = `Perf-${crypto.randomBytes(9).toString('base64url')}`;
const env = { ...process.env, ...passwords, DATABASE_URL: url, SEED_TEST_DATA: '' };
for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
  const r = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); }
}
fs.mkdirSync('PERFORMANCE_AUDIT/data', { recursive: true });
fs.writeFileSync('PERFORMANCE_AUDIT/data/.perf-login.json', JSON.stringify({ admin: passwords.SEED_PASSWORD_ADMIN }));

process.env.DATABASE_URL = url;
const { app } = await import('../../server/src/app');
const { prisma } = await import('../../server/src/prisma/prisma.service');
await assertPerfDb(prisma);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
const call = async (token: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json().catch(() => null);
  if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data as any;
};
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const t0 = Date.now();
const adminToken = (await call('', 'POST', '/auth/login', { login: 'admin', password: passwords.SEED_PASSWORD_ADMIN })).token;
await call(adminToken, 'POST', '/exchange-rate/today', { rate: 9.5 });
const stores: { id: string; seller: string; partner: string }[] = [];
const owners = await prisma.owner.findMany();
for (let i = 1; i <= 3; i++) {
  const st = await call(adminToken, 'POST', '/stores', { name: `Перф ${i}`, address: '-' });
  const pw = `Perf-${crypto.randomBytes(9).toString('base64url')}`;
  await call(adminToken, 'POST', '/users', { login: `pseller${i}`, password: pw, name: `Продавец ${i}`, role: 'SELLER', storeId: st.id });
  await call(adminToken, 'POST', '/users', { login: `ppartner${i}`, password: pw, name: `Партнёр ${i}`, role: 'PARTNER', storeId: st.id });
  const seller = (await call('', 'POST', '/auth/login', { login: `pseller${i}`, password: pw })).token;
  const partner = (await call('', 'POST', '/auth/login', { login: `ppartner${i}`, password: pw })).token;
  const po = (await prisma.owner.findFirstOrThrow({ where: { user: { login: `ppartner${i}` } } })).id;
  await call(adminToken, 'PUT', `/stores/${st.id}/profit-shares`, { shares: [{ ownerId: po, sharePercent: 40 }] });
  stores.push({ id: st.id, seller, partner });
}
void owners;
const suppliers = [];
for (let i = 1; i <= 4; i++) suppliers.push(await call(adminToken, 'POST', '/suppliers', { name: `Перф поставщик ${i}`, phone: '0', contactPerson: '-' }));
await call(adminToken, 'POST', `/owners/${(await prisma.owner.findFirstOrThrow({ where: { user: { role: 'ADMIN' } } })).id}/investment`, { amountUsd: 5000000 });
const models = [['Apple', 'iPhone 15', '6GB', '128GB', 'Black', 612], ['Apple', 'iPhone 13', '4GB', '128GB', 'Midnight', 401], ['Samsung', 'Galaxy A55', '8GB', '128GB', 'Navy', 287], ['Xiaomi', 'Redmi Note 13 Pro+', '12GB', '256GB', 'Midnight Black', 318], ['Samsung', 'Galaxy S24 Ultra', '12GB', '512GB', 'Titanium Gray', 1049], ['Honor', 'X9b', '12GB', '256GB', 'Orange', 241]] as const;
let imei = 0;
const devicesNeeded = Math.ceil(SALES * 1.4);
const purchased: any[] = [];
for (let inv = 0; purchased.length < devicesNeeded; inv++) {
  const groups = models.map(([brand, model, ram, storage, color, cost]) => ({ brand, model, ram, storage, color, purchasePriceUsd: cost, items: Array.from({ length: 17 }, () => ({ imei: `35${String(5000000000000 + ++imei).padStart(13, '0')}` })) }));
  const res = await call(adminToken, 'POST', '/purchases', { supplierId: suppliers[inv % 4].id, invoiceNumber: `PERF-${inv}`, date: new Date().toISOString().slice(0, 10), groups });
  purchased.push(...res.devices);
}
// Most stock goes to the stores, a quarter stays at the main warehouse.
const perStore = Math.floor((purchased.length * 0.75) / 3);
const stock: Record<string, string[]> = {};
for (const [i, s] of stores.entries()) {
  const ids = purchased.slice(i * perStore, (i + 1) * perStore).map((d) => d.id);
  for (let k = 0; k < ids.length; k += 200) await call(adminToken, 'POST', '/transfers', { fromStoreId: 'main-warehouse', toStoreId: s.id, deviceIds: ids.slice(k, k + 200) });
  stock[s.id] = ids;
}
const sales: { id: string; store: (typeof stores)[number]; items: any[]; debt: boolean; customerId?: string }[] = [];
for (let n = 0; n < SALES; n++) {
  const s = stores[n % 3];
  const ids = stock[s.id];
  if (!ids.length) break;
  const two = rnd() < 0.1 && ids.length > 1;
  const chosen = two ? [ids.pop()!, ids.pop()!] : [ids.pop()!];
  const prices = chosen.map(() => Math.round(5000 + rnd() * 8000));
  const total = prices.reduce((a, b) => a + b, 0);
  const roll = rnd();
  const debt = roll > 0.9;
  const body: any = { storeId: s.id, items: chosen.map((deviceId, i) => ({ deviceId, salePriceTjs: prices[i] })) };
  if (debt) Object.assign(body, { paymentMethod: 'DEBT', cashAmountTjs: Math.round(total * 0.3), cardAmountTjs: 0, debtAmountTjs: total - Math.round(total * 0.3), customerName: `Клиент ${n}`, customerPhone: `+99299${String(1000000 + n)}` });
  else if (roll > 0.7) Object.assign(body, { paymentMethod: 'CARD', cashAmountTjs: 0, cardAmountTjs: total });
  else if (roll > 0.55) Object.assign(body, { paymentMethod: 'SPLIT', cashAmountTjs: Math.round(total / 2), cardAmountTjs: total - Math.round(total / 2) });
  else Object.assign(body, { paymentMethod: 'CASH', cashAmountTjs: total, cardAmountTjs: 0 });
  const sale = await call(s.seller, 'POST', '/sales', body);
  sales.push({ id: sale.id, store: s, items: sale.saleItems, debt, customerId: sale.customerId });
  if (n % 500 === 0) console.log(`  продаж ${n} (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
}
// Returns, exchanges, refunds, repayments, expenses, repairs.
const paid = sales.filter((x) => !x.debt);
for (let k = 0; k < Math.round(SALES * 0.04); k++) {
  const x = paid.splice(Math.floor(rnd() * paid.length), 1)[0];
  if (x.items.length === 1) {
    const repl = stock[x.store.id].pop();
    if (repl) await call(x.store.seller, 'POST', '/exchanges', { saleId: x.id, returnedImei: x.items[0].imei, withheldTjs: 100, replacementDeviceId: repl, newPriceTjs: 9000, paymentMethod: 'CASH' });
  } else {
    await call(x.store.partner, 'POST', `/sales/${x.id}/return-items`, { items: [{ saleItemId: x.items[0].id, withheldTjs: 50 }], reason: 'Перф', paymentMethod: 'CASH' });
  }
}
for (let k = 0; k < Math.round(SALES * 0.03); k++) {
  const x = paid.splice(Math.floor(rnd() * paid.length), 1)[0];
  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: x.id } });
  const collected = Number(sale.totalTjs) - Number(sale.debtAmountTjs);
  await call(x.store.partner, 'POST', `/sales/${x.id}/refund`, { reason: 'Перф', refundAmountTjs: collected - 100, penaltyFeeTjs: 100, paymentMethod: 'CASH' });
}
for (const x of sales.filter((y) => y.debt).slice(0, Math.round(SALES * 0.05))) {
  const c = await prisma.sale.findUniqueOrThrow({ where: { id: x.id } });
  await call(x.store.seller, 'POST', `/customers/${c.customerId}/payments`, { amountTjs: Math.round(Number(c.debtAmountTjs) / 2) });
}
for (let k = 0; k < Math.round(SALES * 0.08); k++) {
  const s = pick(stores);
  await call(adminToken, 'POST', '/expenses', { category: pick(['RENT', 'UTILITIES', 'SUPPLIES', 'MARKETING']), amountTjs: Math.round(50 + rnd() * 300), storeId: s.id, targetType: 'STORE', paidFromCashRegister: true, comment: 'Перф' });
}
for (let k = 0; k < Math.round(SALES * 0.03); k++) {
  const s = pick(stores);
  const t = await call(s.seller, 'POST', '/repairs', { imei: `35${String(6000000000000 + k).padStart(13, '0')}`, brand: 'Apple', model: 'iPhone 12', problemDescription: 'Перф', customerName: 'Клиент', customerPhone: '+992900000000' });
  for (const status of ['IN_PROGRESS', 'READY']) await call(s.seller, 'PATCH', `/repairs/${t.id}/status`, { status });
  await call(s.seller, 'PATCH', `/repairs/${t.id}/status`, { status: 'ISSUED', finalCostTjs: 200 });
}
for (const s of stores) {
  await call(s.seller, 'POST', '/daily-closings', {});
  const bal = (await prisma.store.findUniqueOrThrow({ where: { id: s.id } })).cashBalanceUsd;
  await call(adminToken, 'POST', '/cash-collections', { storeId: s.id, expectedCashUsd: bal.toString() });
}
const counts = Object.fromEntries(await Promise.all(['device', 'sale', 'saleItem', 'auditLog', 'financialTransaction', 'ledgerEntry', 'expense', 'customer', 'repairTicket'].map(async (m) => [m, await (prisma as any)[m].count()])));
console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(0)} с:`, JSON.stringify(counts));
server.close();
await prisma.$disconnect();
