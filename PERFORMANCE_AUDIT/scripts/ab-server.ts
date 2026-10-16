// Focused server A/B: on a fresh copy of perf_test, 40 cash sales (one phone each) and the cash panel
// request with and without inventoryItems=0. Run alternately on the old and the new server code.
//   npx tsx PERFORMANCE_AUDIT/scripts/ab-server.ts <label>   → appends to PERFORMANCE_AUDIT/data/ab-server.jsonl
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PERF_DB, perfDatabaseUrl, assertPerfDb } from './perf-env';

const label = process.argv[2] || 'run';
// SERVER_ENTRY=bundle runs server/dist/index.mjs (npm run build:server) the way the Docker image does.
const SERVER_ARGS = process.env.SERVER_ENTRY === 'bundle' ? ['--enable-source-maps', 'server/dist/index.mjs'] : ['--import', 'tsx', 'server/src/index.ts'];
const PORT = 3403;
const BASE = `http://127.0.0.1:${PORT}`;
const url = perfDatabaseUrl();
const root = new URL(url);
root.pathname = '/postgres';
root.searchParams.delete('schema');
const rootDb = new PrismaClient({ datasources: { db: { url: root.href } } });
await rootDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${PERF_DB}" WITH (FORCE)`);
await rootDb.$executeRawUnsafe(`CREATE DATABASE "${PERF_DB}" TEMPLATE "${PERF_DB}_template"`);
await rootDb.$disconnect();
const db = new PrismaClient({ datasources: { db: { url } } });
await assertPerfDb(db);
await db.$executeRawUnsafe('DELETE FROM daily_cash_closings');
const password = JSON.parse(fs.readFileSync('PERFORMANCE_AUDIT/data/.perf-login.json', 'utf8')).admin as string;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)] * 10) / 10; };

const srv = spawn(process.execPath, SERVER_ARGS, {
  env: { ...process.env, DATABASE_URL: url, PORT: String(PORT), APP_URL: BASE, NODE_ENV: 'production' },
  stdio: 'ignore',
});
const res: Record<string, unknown> = { label };
try {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const { token } = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password }) })).json() as any;
  const auth = { Authorization: `Bearer ${token}` };
  const timeGet = async (path: string, n: number) => {
    await (await fetch(BASE + '/api' + path, { headers: auth })).text();
    const ms: number[] = []; let bytes = 0;
    for (let i = 0; i < n; i++) { const t = performance.now(); const body = await (await fetch(BASE + '/api' + path, { headers: auth })).text(); ms.push(performance.now() - t); bytes = Buffer.byteLength(body); }
    return { medianMs: median(ms), bytes };
  };
  res.cashDeskFull = await timeGet('/cash-desk/summary', 15);
  res.cashDeskTotalsOnly = await timeGet('/cash-desk/summary?inventoryItems=0', 15);
  const stock = await db.device.findMany({ where: { status: 'STORE_STOCK' }, orderBy: { imei: 'asc' }, take: 41 });
  const ms: number[] = [];
  for (const [i, d] of stock.entries()) {
    const t = performance.now();
    const r = await fetch(`${BASE}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ storeId: d.storeId, paymentMethod: 'CASH', items: [{ deviceId: d.id, salePriceTjs: 7000 }], cashAmountTjs: 7000, cardAmountTjs: 0 }) });
    await r.text();
    if (r.status < 300 && i > 0) ms.push(performance.now() - t); // the first sale warms up
  }
  res.postSales = { medianMs: median(ms), n: ms.length };
} finally {
  srv.kill();
  await db.$disconnect();
}
fs.appendFileSync('PERFORMANCE_AUDIT/data/ab-server.jsonl', JSON.stringify(res) + '\n');
console.log(JSON.stringify(res));
