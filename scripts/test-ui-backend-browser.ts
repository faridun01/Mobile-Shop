// Run against scripts/serve-ui-audit.ts only: never an arbitrary working installation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { browserExecutable } from './lib/browser-executable';

const fixture = JSON.parse(readFileSync('output/ui-backend-audit/fixture.json', 'utf8'));
assert.equal(fixture.isolated, true);
assert.equal(new URL(fixture.baseUrl).hostname, '127.0.0.1');
const browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true });
const results: any[] = [];
const errors: any[] = [];
const requests: any[] = [];
mkdirSync('output/ui-backend-audit/screens', { recursive: true });
const routes = ['/', '/cash', '/reports', '/cash-collection', '/expenses', '/bonuses', '/owners', '/purchase', '/inventory', '/stock-thresholds', '/transfer', '/revision', '/suppliers', '/employees', '/customers', '/exchange', '/repair', '/notifications', '/audit-log', '/settings', '/sale', '/sales-history', '/receipts'];
try {
  for (const role of ['admin', 'partner', 'ahmad', 'partner-unassigned']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 850 });
    let route = '/login';
    page.on('pageerror', error => errors.push({ role, route, kind: 'crash', error: String(error) }));
    page.on('response', response => {
      if (response.url().startsWith(fixture.baseUrl + '/api/')) {
        const item = { role, route, method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() };
        requests.push(item);
        if (item.status >= 400) errors.push({ ...item, kind: 'http' });
      }
    });
    await page.goto(fixture.baseUrl + '/login', { waitUntil: 'networkidle0' });
    await page.locator('input[type="text"]').fill(role);
    await page.locator('input[type="password"]').fill(role === 'admin' ? 'admin123' : role.startsWith('partner') ? 'partner123' : 'seller123');
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => !location.pathname.includes('login'));
    if (role === 'partner-unassigned') {
      await page.waitForFunction(() => document.body.innerText.includes('Магазин не назначен'));
      assert.equal(errors.filter(e => e.role === role).length, 0, 'unassigned staff must not issue forbidden operational requests');
      results.push({ role, route: '/', assignmentGuard: 'passed' });
      await context.close();
      continue;
    }
    // Dismiss only the optional notification-permission prompt, never a business dialog.
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Позже'); b?.click(); });
    for (route of routes) {
      const start = errors.length;
      await page.goto(fixture.baseUrl + route, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !document.body.innerText.includes('Загрузка…'));
      const state = await page.evaluate(() => ({
        actualPath: location.pathname,
        title: document.querySelector('h1')?.textContent,
        crash: /ПРОИЗОШЛА ОШИБКА|Не удалось открыть раздел/.test(document.body.innerText),
        buttons: [...document.querySelectorAll('main button, [role="main"] button')].map(b => ({ text: b.textContent?.trim(), title: b.getAttribute('title'), disabled: b.hasAttribute('disabled') })),
        selects: [...document.querySelectorAll('select')].map(s => ({ label: s.getAttribute('aria-label'), options: [...s.options].map(o => ({ value: o.value, text: o.textContent, disabled: o.disabled })) })),
      }));
      if (state.crash) errors.push({ role, route, kind: 'boundary' });
      let selections = 0;
      // Native select controls on list pages are filters. Exclude edit/checkout/settings forms.
      if (!['/purchase', '/sale', '/exchange', '/settings', '/repair', '/transfer', '/receipts'].includes(route)) {
        const selects = await page.$$('select');
        for (const select of selects) {
          const inForm = await select.evaluate(s => !!s.closest('form, [role="dialog"]'));
          if (inForm) continue;
          const values = await select.evaluate(s => [...s.options].filter(o => !o.disabled).map(o => o.value));
          const original = await select.evaluate(s => s.value);
          for (const value of values) {
            await select.select(value);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            selections++;
          }
          await select.select(original);
        }
      }
      await page.screenshot({ path: `output/ui-backend-audit/screens/${role}-${route.replaceAll('/', '') || 'home'}.png` });
      results.push({ role, route, ...state, selections, newErrors: errors.slice(start) });
      console.log(role, route, state.crash ? 'CRASH' : 'rendered', 'selections', selections, 'errors', errors.length - start);
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync('output/ui-backend-audit/browser.json', JSON.stringify({ results, errors, requests }, null, 2));
}
console.log(`Browser: ${results.length} route/role renders; ${errors.length} errors`);
process.exitCode = errors.length ? 1 : 0;
