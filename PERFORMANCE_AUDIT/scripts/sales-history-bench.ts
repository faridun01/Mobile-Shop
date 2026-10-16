// Sales history switched to last month (~1,300 receipts on perf_test), as a desktop and as a
// throttled phone: time until every receipt row is in the DOM, the longest main-thread block
// (long task) on the way, and the DOM size. Serves the current dist/ with the bundled server.
//   npx tsx PERFORMANCE_AUDIT/scripts/sales-history-bench.ts <label>  → PERFORMANCE_AUDIT/data/sales-history-<label>.json
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PERF_DB, perfDatabaseUrl } from './perf-env';

const label = process.argv[2] || 'run';
const PORT = 3404;
const BASE = `http://127.0.0.1:${PORT}`;
const url = perfDatabaseUrl();
const root = new URL(url);
root.pathname = '/postgres';
root.searchParams.delete('schema');
const rootDb = new PrismaClient({ datasources: { db: { url: root.href } } });
await rootDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${PERF_DB}" WITH (FORCE)`);
await rootDb.$executeRawUnsafe(`CREATE DATABASE "${PERF_DB}" TEMPLATE "${PERF_DB}_template"`);
await rootDb.$disconnect();
const password = JSON.parse(fs.readFileSync('PERFORMANCE_AUDIT/data/.perf-login.json', 'utf8')).admin as string;
const srv = spawn(process.execPath, ['--enable-source-maps', 'server/dist/index.mjs'], {
  env: { ...process.env, DATABASE_URL: url, PORT: String(PORT), APP_URL: BASE, NODE_ENV: 'production' },
  stdio: 'ignore',
});
const out: Record<string, unknown> = { label };
try {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const profile of ['desktop', 'phone'] as const) {
    const runs: unknown[] = [];
    for (let run = 0; run < 3; run++) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      const cdp = await page.createCDPSession();
      if (profile === 'phone') {
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
      } else {
        await page.setViewport({ width: 1440, height: 900 });
      }
      await page.evaluateOnNewDocument(() => {
        try { localStorage.setItem('adminPushPromptDismissedAt', String(Date.now())); } catch { /* storage unavailable */ }
        (window as any).__longTasks = [];
        new PerformanceObserver((list) => { for (const e of list.getEntries()) (window as any).__longTasks.push({ start: e.startTime, ms: e.duration }); })
          .observe({ type: 'longtask', buffered: true });
      });
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('input[placeholder="Введите логин"]', { visible: true });
      await page.type('input[placeholder="Введите логин"]', 'admin');
      await page.type('input[placeholder="••••••••"]', password);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 60000 });
      await page.evaluate(() => { window.history.pushState({}, '', '/sales-history'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 60000 });
      // Open the period picker (the button right after «Сегодня») and choose last month.
      await page.evaluate(() => {
        const today = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Сегодня')!;
        (today.nextElementSibling?.querySelector('button') as HTMLButtonElement).click();
      });
      await page.waitForSelector('[aria-label="Выбор периода"]', { visible: true });
      const dialogButton = (text: string) => page.evaluate((t: string) => {
        ([...document.querySelectorAll('[aria-label="Выбор периода"] button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement).click();
      }, text);
      await dialogButton('Прошлый');
      await new Promise((r) => setTimeout(r, 300));
      if (profile === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = await page.evaluate(() => {
        (window as any).__longTasks = [];
        const btn = [...document.querySelectorAll('[aria-label="Выбор периода"] button')].find((b) => b.textContent?.trim() === 'Подтвердить') as HTMLButtonElement;
        const t = performance.now();
        btn.click();
        return t;
      });
      // Done when the month's rows stop growing for a second; the time is when the last row arrived.
      const result = await page.waitForFunction((start: number) => {
        const w = window as any;
        const rows = document.querySelectorAll('tbody tr').length || document.querySelectorAll('div.md\\:hidden > button').length;
        const now = performance.now();
        if (rows !== w.__rows) { w.__rows = rows; w.__rowsAt = now; return false; }
        if (rows < 500 || now - w.__rowsAt < 1000) return false;
        const label = [...document.querySelectorAll('span')].find((s) => s.textContent?.startsWith('Чеков:'));
        const tasks = (w.__longTasks as { start: number; ms: number }[]).filter((x) => x.start >= start);
        return { ms: Math.round(w.__rowsAt - start), receipts: Number(label?.querySelector('strong')?.textContent || 0), rows,
          nodes: document.getElementsByTagName('*').length,
          longestTaskMs: Math.round(Math.max(0, ...tasks.map((x) => x.ms))), longTasksMs: Math.round(tasks.reduce((s, x) => s + x.ms, 0)) };
      }, { timeout: 120000, polling: 'raf' }, t0);
      if (profile === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      runs.push(await result.jsonValue());
      await ctx.close();
    }
    out[profile] = runs;
  }
  await browser.close();
} finally {
  srv.kill();
}
fs.writeFileSync(`PERFORMANCE_AUDIT/data/sales-history-${label}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
