import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const server = spawn(process.execPath, ['scripts/performance/serve.mjs', 'output/performance/builds/final-profile', '4190'], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
const browser = await chromium.launch();
const checks = [], errors = [], requests = [];
const base = 'http://127.0.0.1:4190';
function check(name, ok) { checks.push({ name, ok: !!ok }); if (!ok) throw new Error(name); }
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await context.addInitScript(() => {
    localStorage.setItem('ms_user', JSON.stringify({ id: 'audit-user', name: 'Audit User', role: 'ADMIN', active: true, storeId: 'store' }));
    localStorage.setItem('ms_jwt_token', 'synthetic-audit-token');
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().includes('/api/')) requests.push(new URL(r.url()).pathname); });
  await page.goto(`${base}/sale`);
  await page.waitForFunction(() => window.__auditStore?.getState().devices.length === 2000);
  await page.waitForTimeout(500);
  check('startup only loads core data and notifications', !requests.includes('/api/sales') && !requests.includes('/api/repairs') && !requests.includes('/api/expenses'));
  await page.evaluate(() => {
    window.__oldAction = window.__auditStore.getState().openScanner;
    window.__auditStore.getState().openScanner((value) => { window.__scanResult = value; });
  });
  await page.waitForFunction(() => typeof window.__auditStore.getState().scannerCallback === 'function');
  await page.evaluate(() => { window.__auditStore.getState().scannerCallback('350000000000001'); window.__auditStore.getState().closeScanner(); });
  check('scanner callback receives the code after selector migration', await page.evaluate(() => window.__scanResult === '350000000000001'));
  check('action identity is stable across state changes', await page.evaluate(() => window.__oldAction === window.__auditStore.getState().openScanner));
  await fetch(`${base}/__perf/event?type=DEVICE_CHANGED`);
  await page.waitForFunction(() => window.__auditStore.getState().devices[0]?.model === 'Updated Model');
  check('changed inventory is published after websocket update', await page.getByText('Updated Model', { exact: false }).count() > 0);
  const reportStart = requests.length;
  await page.evaluate(() => { history.pushState({}, '', '/reports'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForResponse((response) => response.url().includes('/api/reports/summary'));
  await page.waitForTimeout(300);
  check('report loads one summary without itemized history', JSON.stringify(requests.slice(reportStart)) === JSON.stringify(['/api/reports/summary']));
  check('Excel is not downloaded to view the financial report', await page.evaluate(() => !performance.getEntriesByType('resource').some((r) => /exceljs/i.test(r.name))));
  const routes = ['sales-history', 'inventory', 'purchase', 'transfer', 'exchange', 'repair', 'suppliers', 'bonuses', 'expenses', 'owners', 'employees', 'audit-log', 'settings', 'notifications'];
  for (const route of routes) {
    await page.evaluate((route) => { history.pushState({}, '', `/${route}`); dispatchEvent(new PopStateEvent('popstate')); }, route);
    await page.waitForTimeout(700);
    check(`route /${route} renders`, !await page.getByText('Произошла ошибка', { exact: false }).count());
  }
  check('visiting history loads deferred sales', requests.includes('/api/sales'));
  check('visiting repair loads deferred repairs', requests.includes('/api/repairs'));
  check('visiting expenses loads deferred expenses', requests.includes('/api/expenses'));
  for (const width of [390, 800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    check(`no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.waitForFunction(async () => { const registration = await navigator.serviceWorker.getRegistration(); return !!registration?.active; });
  check('service worker activates', true);
  const cacheUrls = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    return urls;
  });
  for (const chunk of ['OwnersPage', 'EmployeesPage', 'BonusesPage', 'AuditLogPage']) check(`${chunk} remains available in offline precache`, cacheUrls.some((url) => url.includes(chunk)));
  check('no application exceptions', errors.length === 0);
  await page.screenshot({ path: 'output/playwright/perf-verified-desktop.png' });
  console.log(JSON.stringify({ checks, errors, apiRequests: requests }, null, 2));
} finally {
  await writeFile('output/performance/verification.json', JSON.stringify({ checks, errors, requests }, null, 2));
  await browser.close(); server.kill();
}
