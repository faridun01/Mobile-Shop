// CPU profile of switching the sales history to last month (as in sales-history-bench.ts),
// with self time attributed to source files and functions through the build's source maps.
// Needs a build with source maps: npx vite build --sourcemap
//   npx tsx PERFORMANCE_AUDIT/scripts/sales-history-profile.ts [desktop|phone]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { SourceMapConsumer } from 'source-map-js';
import { PERF_DB, perfDatabaseUrl } from './perf-env';

const profile = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const PORT = 3406;
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
const srv = spawn(process.execPath, ['server/dist/index.mjs'], {
  env: { ...process.env, DATABASE_URL: url, PORT: String(PORT), APP_URL: BASE, NODE_ENV: 'production' },
  stdio: 'ignore',
});
try {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  if (profile === 'phone') await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  else await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('adminPushPromptDismissedAt', String(Date.now())); } catch { /* storage unavailable */ } });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[placeholder="Введите логин"]', { visible: true });
  await new Promise((r) => setTimeout(r, 600));
  await page.type('input[placeholder="Введите логин"]', 'admin');
  await page.type('input[placeholder="••••••••"]', password);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.pathname !== '/login', { timeout: 30000 });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 60000 });
  await page.evaluate(() => { window.history.pushState({}, '', '/sales-history'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 60000 });
  await page.evaluate(() => {
    const today = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Сегодня')!;
    (today.nextElementSibling?.querySelector('button') as HTMLButtonElement).click();
  });
  await page.waitForSelector('[aria-label="Выбор периода"]', { visible: true });
  await page.evaluate(() => ([...document.querySelectorAll('[aria-label="Выбор периода"] button')].find((b) => b.textContent?.trim() === 'Прошлый') as HTMLButtonElement).click());
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.evaluate(() => ([...document.querySelectorAll('[aria-label="Выбор периода"] button')].find((b) => b.textContent?.trim() === 'Подтвердить') as HTMLButtonElement).click());
  await page.waitForFunction(() => {
    const w = window as any;
    const rows = document.querySelectorAll('tbody tr').length || document.querySelectorAll('div.md\\:hidden > button').length;
    const now = performance.now();
    if (rows !== w.__rows) { w.__rows = rows; w.__rowsAt = now; return false; }
    return rows >= 500 && now - w.__rowsAt > 1000;
  }, { timeout: 120000, polling: 'raf' });
  const { profile: prof } = await cdp.send('Profiler.stop') as any;
  await browser.close();

  // Self time per node, then per source location through the chunk's source map.
  const self = new Map<number, number>();
  for (let i = 0; i < prof.samples.length; i++) self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0));
  const maps = new Map<string, SourceMapConsumer | null>();
  const consumer = (u: string) => {
    if (!maps.has(u)) {
      const file = path.join('dist', new URL(u).pathname) + '.map';
      maps.set(u, fs.existsSync(file) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(file, 'utf8'))) : null);
    }
    return maps.get(u)!;
  };
  const bySource = new Map<string, number>();
  const byFunction = new Map<string, number>();
  let total = 0;
  for (const node of prof.nodes) {
    const us = self.get(node.id) ?? 0;
    if (!us) continue;
    total += us;
    const cf = node.callFrame;
    let file = cf.url ? new URL(cf.url).pathname : `(${cf.functionName || 'native'})`;
    let fn = cf.functionName || '(anonymous)';
    if (cf.url && cf.url.startsWith(BASE)) {
      const c = consumer(cf.url);
      const pos = c?.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber });
      if (pos?.source) { file = pos.source.replace(/^.*node_modules\//, 'node_modules/').replace(/^(\.\.\/)+/, ''); fn = `${pos.name ?? fn} ${file}:${pos.line}`; }
    }
    const group = file.startsWith('node_modules/') ? file.split('/').slice(0, file.split('/')[1].startsWith('@') ? 3 : 2).join('/') : file;
    bySource.set(group, (bySource.get(group) ?? 0) + us);
    byFunction.set(fn, (byFunction.get(fn) ?? 0) + us);
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} мс ${(v / total * 100).toFixed(1).padStart(5)} %  ${k}`).join('\n');
  console.log(`[${profile}] всего ${(total / 1000).toFixed(0)} мс в профиле\n== по файлам\n${top(bySource, 15)}\n== по функциям\n${top(byFunction, 25)}`);
} finally {
  srv.kill();
}
