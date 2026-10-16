// Screenshots of the main pages for visual comparison, taken on perf_test restored from its template
// (same data every run), as admin, at a desktop and a phone size.
//   npx tsx PERFORMANCE_AUDIT/scripts/screenshots.ts <label>   → PERFORMANCE_AUDIT/data/screens-<label>/
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PERF_DB, perfDatabaseUrl } from './perf-env';

const label = process.argv[2] || 'run';
// SERVER_ENTRY=bundle runs server/dist/index.mjs (npm run build:server) the way the Docker image does.
const SERVER_ARGS = process.env.SERVER_ENTRY === 'bundle' ? ['--enable-source-maps', 'server/dist/index.mjs'] : ['--import', 'tsx', 'server/src/index.ts'];
const PORT = 3402;
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
const dir = `PERFORMANCE_AUDIT/data/screens-${label}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const srv = spawn(process.execPath, SERVER_ARGS, {
  env: { ...process.env, DATABASE_URL: url, PORT: String(PORT), APP_URL: BASE, NODE_ENV: 'production' },
  stdio: 'ignore',
});
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 250));
}
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const pages = ['/', '/sale', '/inventory', '/sales-history', '/reports', '/cash', '/owners', '/revision', '/expenses', '/transfer', '/customers', '/suppliers', '/employees', '/repair', '/exchange'];
try {
  for (const [profile, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] as const) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(viewport);
    // Freeze time-dependent rendering as far as possible: no animations or transitions.
    await page.evaluateOnNewDocument(() => {
      const style = document.createElement('style');
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
      try { localStorage.setItem('adminPushPromptDismissedAt', String(Date.now())); } catch { /* storage unavailable */ }
    });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('input[placeholder="Введите логин"]', { visible: true });
    await new Promise((r) => setTimeout(r, 600));
    await page.type('input[placeholder="Введите логин"]', 'admin');
    await page.type('input[placeholder="••••••••"]', password);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 });
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 60000 });
    for (const route of pages) {
      await page.evaluate((r) => { window.history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')); }, route);
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 60000 });
      await new Promise((r) => setTimeout(r, 700));
      await page.screenshot({ path: `${dir}/${profile}${route === '/' ? '-home' : route.replace(/\//g, '-')}.png` });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`скриншоты: ${dir}`);
