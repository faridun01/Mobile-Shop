// Runtime measurements on perf_test (restored from its template before every run so each run
// starts from the same data): server start time and memory, API response times and sizes,
// sale latency, report time, and the browser (first load, login to a ready screen, page
// navigation, JS heap) as a desktop and as a throttled phone.
//
//   npx tsx PERFORMANCE_AUDIT/scripts/measure-runtime.ts <label>   → PERFORMANCE_AUDIT/data/runtime-<label>.json
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PERF_DB, perfDatabaseUrl, assertPerfDb } from './perf-env';

const label = process.argv[2] || 'run';
// SERVER_ENTRY=bundle runs server/dist/index.mjs (npm run build:server) the way the Docker image does.
const SERVER_ARGS = process.env.SERVER_ENTRY === 'bundle' ? ['--enable-source-maps', 'server/dist/index.mjs'] : ['--import', 'tsx', 'server/src/index.ts'];
const PORT = 3401;
const BASE = `http://127.0.0.1:${PORT}`;
const url = perfDatabaseUrl();
const root = new URL(url);
root.pathname = '/postgres';
root.searchParams.delete('schema');
const rootDb = new PrismaClient({ datasources: { db: { url: root.href } } });
// Same starting data every run.
await rootDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${PERF_DB}" WITH (FORCE)`);
await rootDb.$executeRawUnsafe(`CREATE DATABASE "${PERF_DB}" TEMPLATE "${PERF_DB}_template"`);
await rootDb.$disconnect();
const db = new PrismaClient({ datasources: { db: { url } } });
await assertPerfDb(db);
const password = JSON.parse(fs.readFileSync('PERFORMANCE_AUDIT/data/.perf-login.json', 'utf8')).admin as string;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const rssMb = (pid: number) => {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${Number(pid)}).WorkingSet64`]).toString().trim();
    return Math.round(Number(out) / 1048576);
  } catch { return null; }
};

// ---------------------------------------------------------------- server start
const t0 = performance.now();
const srv = spawn(process.execPath, SERVER_ARGS, {
  env: { ...process.env, DATABASE_URL: url, PORT: String(PORT), APP_URL: BASE, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
srv.stdout.on('data', (b) => { log += b; });
srv.stderr.on('data', (b) => { log += b; });
for (;;) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 50));
  if (performance.now() - t0 > 60000) throw new Error('сервер не поднялся: ' + log.slice(-500));
}
const startupMs = Math.round(performance.now() - t0);
await new Promise((r) => setTimeout(r, 3000));
const rssIdle = rssMb(srv.pid!);

const out: any = { label, measuredAt: new Date().toISOString(), server: { startupMs, rssIdleMb: rssIdle }, api: {}, browser: {} };
try {
  const login = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password }) })).json() as any;
  const token = login.token as string;
  const get = async (path: string) => {
    const t = performance.now();
    const r = await fetch(BASE + '/api' + path, { headers: { Authorization: `Bearer ${token}` } });
    const body = await r.text();
    return { ms: performance.now() - t, bytes: Buffer.byteLength(body), status: r.status };
  };

  // ---------------------------------------------------------------- API (what the app loads after login, and the heavy pages)
  const endpoints = [
    '/users', '/stores', '/devices?excludeSold=true', '/sales?limit=500', '/repairs?limit=500', '/suppliers',
    '/supplier-invoices?limit=500', '/expenses?limit=500', '/owners', '/store-profit-shares', '/exchange-rate/today',
    '/owner-transactions', '/transfers', '/notifications', '/customers', '/cash-desk/summary', '/cash-collections/balances',
    '/reports/summary?period=TODAY', '/reports/summary?period=ALL&events=1', '/audit-logs', '/daily-closings/summary?storeId=' ,
    '/stock-thresholds', '/bonuses/pool',
  ];
  const stores = await db.store.findMany({ where: { isMainWarehouse: false } });
  for (const ep0 of endpoints) {
    const ep = ep0.endsWith('storeId=') ? ep0 + stores[0].id : ep0;
    await get(ep); // warm-up
    const runs = [];
    let bytes = 0; let status = 0;
    for (let i = 0; i < 7; i++) { const r = await get(ep); runs.push(r.ms); bytes = r.bytes; status = r.status; }
    out.api[ep0] = { medianMs: Math.round(median(runs) * 10) / 10, p95Ms: Math.round(p95(runs) * 10) / 10, bytes, status };
  }
  // The whole startup set fired together, as the app does.
  const startupSet = endpoints.slice(0, 11);
  const runs = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); await Promise.all(startupSet.map(get)); runs.push(performance.now() - t); }
  out.api['__startup_parallel__'] = { medianMs: Math.round(median(runs)), totalBytes: startupSet.reduce((s, ep) => s + (out.api[ep]?.bytes ?? 0), 0) };

  // ---------------------------------------------------------------- sale latency (cash sale of one phone)
  // The volume script closed today's shifts and collected them; reopen them in this throwaway copy.
  await db.$executeRawUnsafe('DELETE FROM daily_cash_closings');
  // Phones in stock in any store (each sale goes to its phone's store).
  const stock = await db.device.findMany({ where: { status: 'STORE_STOCK' }, orderBy: { imei: 'asc' }, take: 20 });
  const saleMs = [];
  for (const d of stock) {
    const t = performance.now();
    const r = await fetch(`${BASE}/api/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ storeId: d.storeId, paymentMethod: 'CASH', items: [{ deviceId: d.id, salePriceTjs: 7000 }], cashAmountTjs: 7000, cardAmountTjs: 0 }) });
    await r.text();
    if (r.status < 300) saleMs.push(performance.now() - t);
  }
  out.api['POST /sales'] = { medianMs: Math.round(median(saleMs) * 10) / 10, p95Ms: Math.round(p95(saleMs) * 10) / 10, n: saleMs.length };
  out.server.rssAfterApiMb = rssMb(srv.pid!);

  // ---------------------------------------------------------------- browser
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const profile of ['desktop', 'phone'] as const) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (profile === 'phone') {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    } else {
      await page.setViewport({ width: 1440, height: 900 });
    }
    let requests = 0; let bytes = 0;
    const urls = new Map<string, { url: string; start: number }>();
    let apiCalls: { url: string; ms: number; bytes: number }[] = [];
    cdp.on('Network.requestWillBeSent', (e: any) => { urls.set(e.requestId, { url: e.request.url, start: e.timestamp }); });
    cdp.on('Network.loadingFinished', (e: any) => {
      requests++; bytes += e.encodedDataLength || 0;
      const u = urls.get(e.requestId);
      if (u && u.url.includes('/api/')) apiCalls.push({ url: u.url.replace(/^.*\/api/, ''), ms: Math.round((e.timestamp - u.start) * 1000), bytes: e.encodedDataLength || 0 });
    });
    // First load of the login page (no cache, no service worker yet).
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: fcp ? fcp.startTime : null };
    });
    const firstLoad = { requests, bytes, ...nav };
    // Login → the main screen with its data loaded.
    requests = 0; bytes = 0;
    await page.waitForSelector('input[placeholder="Введите логин"]', { visible: true });
    await page.type('input[placeholder="Введите логин"]', 'admin');
    await page.type('input[placeholder="••••••••"]', password);
    const tLogin = Date.now();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 60000 });
    const loginToReadyMs = Date.now() - tLogin - 500;
    const afterLogin = { requests, bytes };
    const heap = async () => (await page.metrics()).JSHeapUsedSize! / 1048576;
    const heapAfterLogin = await heap();
    // Navigation between pages (client-side routes, like a user tapping the menu).
    const navTimes: Record<string, number> = {};
    const navDetail: Record<string, unknown> = {};
    for (const route of ['/inventory', '/sales-history', '/reports', '/cash', '/sale']) {
      apiCalls = [];
      const m0 = await page.metrics();
      const t = Date.now();
      await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, route);
      await page.waitForNetworkIdle({ idleTime: 300, timeout: 120000 });
      navTimes[route] = Date.now() - t - 300;
      const m1 = await page.metrics();
      navDetail[route] = {
        scriptMs: Math.round(((m1.ScriptDuration ?? 0) - (m0.ScriptDuration ?? 0)) * 1000),
        taskMs: Math.round(((m1.TaskDuration ?? 0) - (m0.TaskDuration ?? 0)) * 1000),
        layoutMs: Math.round(((m1.LayoutDuration ?? 0) - (m0.LayoutDuration ?? 0)) * 1000),
        nodes: m1.Nodes,
        api: apiCalls,
      };
    }
    out.browser[profile] = { firstLoad, loginToReadyMs, afterLogin, heapAfterLoginMb: Math.round(heapAfterLogin * 10) / 10, heapAfterNavMb: Math.round((await heap()) * 10) / 10, navTimes, navDetail };
    await ctx.close();
  }
  await browser.close();
  out.server.rssAfterBrowserMb = rssMb(srv.pid!);
} finally {
  srv.kill();
  await db.$disconnect();
}
fs.writeFileSync(`PERFORMANCE_AUDIT/data/runtime-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
