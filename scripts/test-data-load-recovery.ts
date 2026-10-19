import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { withDisposableApi } from './lib/disposable-api';
import { requireAuditDatabase } from './lib/audit-database';
import { browserExecutable } from './lib/browser-executable';
import { prepareUiAudit } from './lib/ui-audit-fixture';

requireAuditDatabase(); process.env.UI_AUDIT_FRONTEND = 'true';
const routes = ['/', '/cash', '/reports', '/cash-collection', '/expenses', '/bonuses', '/owners', '/purchase', '/inventory', '/stock-thresholds', '/transfer', '/revision', '/suppliers', '/employees', '/customers', '/exchange', '/repair', '/notifications', '/audit-log', '/settings', '/sale', '/sales-history', '/receipts'];
const results: any[] = [];
const partial = process.argv.includes('--partial');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const endpoints: Record<string, string> = { '/inventory': '/api/devices', '/suppliers': '/api/suppliers', '/owners': '/api/owners', '/expenses': '/api/expenses' };
await withDisposableApi('load_retry', async api => {
  await prepareUiAudit(api);
  const browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true });
  try {
    for (const role of partial || only ? [process.argv.find(a => a.startsWith('--role='))?.slice(7) || 'admin'] : ['admin', 'partner', 'ahmad']) {
      const session = (await api.call('POST', '/auth/login', { login: role, password: role === 'admin' ? 'admin123' : role === 'partner' ? 'partner123' : 'seller123' }, { token: '' })).data;
      for (const route of only ? [only] : partial ? Object.keys(endpoints) : role === 'admin' ? routes : ['/inventory', '/sale', '/receipts']) {
        console.log('CHECK', role, route);
        const context = await browser.createBrowserContext(); const page = await context.newPage();
        await page.setViewport({ width: 360, height: 850 }); await page.setBypassServiceWorker(true);
        await page.evaluateOnNewDocument(session => { localStorage.setItem('ms_jwt_token', session.token); localStorage.setItem('ms_user', JSON.stringify(session.user)); }, session);
        let broken = true; let writes = 0;
        const crashes: string[] = []; page.on('pageerror', e => crashes.push(String(e)));
        const traffic: string[] = [];
        page.on('response', r => { if (r.url().includes('/api/')) traffic.push(`${r.status()} ${new URL(r.url()).pathname}`); });
        await page.setRequestInterception(true);
        page.on('request', async r => {
          // Isolate data retry from a fresh service worker claiming the tab and reloading it.
          if (new URL(r.url()).pathname === '/registerSW.js') { await r.respond({ status: 200, contentType: 'application/javascript', body: '' }); return; }
          if (r.url().startsWith(api.baseUrl + '/api/')) {
            if (r.method() !== 'GET') writes++;
            if (broken && r.method() === 'GET' && (!partial || new URL(r.url()).pathname === endpoints[route])) { await r.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Тест: недоступно' }) }); return; }
          }
          await r.continue();
        });
        await page.goto(api.baseUrl + route, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="data-load-error"]', { visible: true }).catch(async error => {
          console.log('INITIAL FAILURE', role, route, traffic, crashes, await page.evaluate(() => document.body.innerText));
          throw error;
        });
        assert(!(await page.evaluate(() => document.body.innerText)).includes('Устройства не найдены'));
        const marker = await page.evaluate(() => { (window as any).__retryMarker = crypto.randomUUID(); return (window as any).__retryMarker; });
        if (route === '/inventory') {
          await page.locator('[data-testid="data-load-error"] button').click();
          await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-testid="data-load-error"] button')?.disabled);
          assert(await page.$('[data-testid="data-load-error"]'));
        }
        broken = false;
        await page.locator('[data-testid="data-load-error"] button').click();
        await page.waitForSelector('[data-testid="data-load-error"]', { hidden: true }).catch(async error => {
          console.log('RECOVERY FAILED', role, route, traffic, await page.evaluate(() => document.body.innerText));
          throw error;
        });
        await page.waitForFunction(() => !!document.querySelector('main')?.innerText.trim());
        assert.equal(await page.evaluate(() => (window as any).__retryMarker), marker, 'Retry must not reload document');
        assert.equal(writes, 0, 'Retry must not replay business writes'); assert.equal(crashes.length, 0, crashes.join('\n'));
        if (route === '/inventory') assert(!(await page.evaluate(() => document.body.innerText)).includes('Устройства не найдены'));
        results.push({ role, route, errorVisible: true, recoveredWithoutReload: true, businessWrites: writes });
        console.log('PASS', role, route);
        await context.close();
      }
    }
    // A realtime read fails while an unsaved purchase form is open; retry must preserve it.
    const session = (await api.call('POST', '/auth/login', { login: 'admin', password: 'admin123' }, { token: '' })).data;
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(session => { localStorage.setItem('ms_jwt_token', session.token); localStorage.setItem('ms_user', JSON.stringify(session.user)); }, session);
    let broken = false;
    await page.setRequestInterception(true);
    page.on('request', async r => {
      if (new URL(r.url()).pathname === '/registerSW.js') { await r.respond({ status: 200, contentType: 'application/javascript', body: '' }); return; }
      if (broken && r.method() === 'GET' && r.url().includes('/api/exchange-rate/today')) { await r.respond({ status: 503, contentType: 'application/json', body: '{}' }); return; }
      await r.continue();
    });
    await page.goto(api.baseUrl + '/purchase', { waitUntil: 'networkidle0' });
    await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Новый приход')?.click(); });
    const field = 'input[placeholder^="IMEI 1"]'; await page.locator(field).fill('123');
    await page.waitForFunction(() => document.body.innerText.includes('Система активна'));
    broken = true;
    assert.equal((await api.call('POST', '/exchange-rate/today', { rate: 11 })).status, 200);
    await page.waitForSelector('[data-testid="data-load-error"]', { visible: true });
    broken = false; await page.locator('[data-testid="data-load-error"] button').click();
    await page.waitForSelector('[data-testid="data-load-error"]', { hidden: true });
    assert.equal(await page.$eval(field, e => (e as HTMLInputElement).value), '123');
    results.push({ case: 'unsaved-purchase-survives-realtime-error-and-retry', passed: true });
    console.log('PASS unsaved purchase preserved');
    await page.close();
    // A successful response confirming no rate must still require entering one.
    await api.db.exchangeRate.deleteMany();
    const seller = (await api.call('POST', '/auth/login', { login: 'ahmad', password: 'seller123' }, { token: '' })).data;
    const ratePage = await browser.newPage();
    await ratePage.setRequestInterception(true);
    ratePage.on('request', async r => {
      if (new URL(r.url()).pathname === '/registerSW.js') { await r.respond({ status: 200, contentType: 'application/javascript', body: '' }); return; }
      await r.continue();
    });
    await ratePage.evaluateOnNewDocument(session => { localStorage.setItem('ms_jwt_token', session.token); localStorage.setItem('ms_user', JSON.stringify(session.user)); }, seller);
    await ratePage.goto(api.baseUrl + '/sale', { waitUntil: 'domcontentloaded' });
    await ratePage.waitForSelector('[role="dialog"] input', { visible: true });
    assert.equal(await ratePage.$('[data-testid="data-load-error"]'), null);
    await ratePage.locator('[role="dialog"] input').fill('10');
    await ratePage.evaluate(() => { [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.includes('Сохранить курс'))?.click(); });
    await ratePage.waitForSelector('[role="dialog"]', { hidden: true });
    assert.equal((await api.db.exchangeRate.findFirstOrThrow()).rate.toString(), '10');
    results.push({ case: 'confirmed-missing-rate-still-prompts-and-saves', passed: true });
    console.log('PASS confirmed missing rate');
    await ratePage.close();
  } finally { await browser.close(); }
});
mkdirSync('output/page-loading', { recursive: true });
writeFileSync(`output/page-loading/data-retry${partial ? '-partial' : ''}.json`, JSON.stringify(results, null, 2));
console.log(`PASS ${results.length} recovery regressions`);
