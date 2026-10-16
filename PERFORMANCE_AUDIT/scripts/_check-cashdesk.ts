// /cash-desk/summary with and without inventoryItems=0: every field except the stock list and its
// per-model breakdown must be identical; prints the size and time of both.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { perfDatabaseUrl } from './perf-env';

process.env.DATABASE_URL = perfDatabaseUrl();
const { app } = await import('../../server/src/app');
const { prisma } = await import('../../server/src/prisma/prisma.service');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
const pw = JSON.parse(fs.readFileSync('PERFORMANCE_AUDIT/data/.perf-login.json', 'utf8')).admin;
const token = (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: pw }) })).json() as { token: string }).token;
const get = async (p: string) => {
  const t = performance.now();
  const text = await (await fetch(base + p, { headers: { Authorization: `Bearer ${token}` } })).text();
  return { ms: performance.now() - t, text, json: JSON.parse(text) };
};
const store = await prisma.store.findFirstOrThrow({ where: { isMainWarehouse: false } });
for (const q of ['', `storeId=${store.id}`]) {
  for (let i = 0; i < 3; i++) { await get(`/cash-desk/summary?${q}`); await get(`/cash-desk/summary?inventoryItems=0&${q}`); }
  const fullRuns = []; const leanRuns = [];
  let full: any; let lean: any;
  for (let i = 0; i < 9; i++) { full = await get(`/cash-desk/summary?${q}`); fullRuns.push(full.ms); lean = await get(`/cash-desk/summary?inventoryItems=0&${q}`); leanRuns.push(lean.ms); }
  const strip = (j: any) => ({ ...j, inventory: { ...j.inventory, models: undefined, items: undefined } });
  assert.deepEqual(strip(lean.json), strip(full.json), 'всё, кроме списка телефонов, совпадает');
  assert.deepEqual([lean.json.inventory.models, lean.json.inventory.items], [[], []]);
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(1);
  console.log(`${q || 'все магазины'}: совпадает; полный ${(full.text.length / 1024).toFixed(0)} КБ ${med(fullRuns)} мс → без списка ${(lean.text.length / 1024).toFixed(1)} КБ ${med(leanRuns)} мс; итог склада ${lean.json.inventory.totalCount} шт / $${lean.json.inventory.totalCostUsd}`);
}
server.close();
await prisma.$disconnect();
