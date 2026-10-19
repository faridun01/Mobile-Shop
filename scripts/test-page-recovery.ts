import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { withDisposableApi } from './lib/disposable-api';
import { requireAuditDatabase } from './lib/audit-database';
import { browserExecutable } from './lib/browser-executable';
import { prepareUiAudit } from './lib/ui-audit-fixture';

requireAuditDatabase(); process.env.UI_AUDIT_FRONTEND = 'true';
const results: any[] = [];
await withDisposableApi('page_recovery', async api => {
  await prepareUiAudit(api);
  const browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true });
  try {
    const anonymous = await browser.newPage();
    for (const route of ['/login', '/inventory', '/purchase', '/reports', '/sale', '/not-existing']) {
      await anonymous.goto(api.baseUrl + route, { waitUntil: 'networkidle0' });
      assert.equal(new URL(anonymous.url()).pathname, '/login');
      assert(await anonymous.$('[data-login-page]'));
      results.push({ case: 'anonymous', route, result: 'login' });
    }
    await anonymous.close();
    const session = (await api.call('POST', '/auth/login', { login: 'admin', password: 'admin123' }, { token: '' })).data;
    for (const mode of ['chunk-failure', 'api-failure', 'offline']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 360, height: 850 }); await page.setCacheEnabled(false); await page.setBypassServiceWorker(true);
      await page.evaluateOnNewDocument(session => { localStorage.setItem('ms_jwt_token', session.token); localStorage.setItem('ms_user', JSON.stringify(session.user)); }, session);
      let fault = true; let injected = 0;
      await page.setRequestInterception(true);
      page.on('request', async r => {
        if (fault && mode === 'chunk-failure' && /\/assets\/PurchasePage-[^/]+\.js/.test(r.url())) { injected++; await r.abort(); return; }
        if (fault && mode === 'api-failure' && r.url().startsWith(api.baseUrl + '/api/') && r.method() === 'GET') { injected++; await r.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Тест: нет связи с сервером' }) }); return; }
        await r.continue();
      });
      const route = mode === 'chunk-failure' ? '/purchase' : '/inventory';
      await page.goto(api.baseUrl + route, { waitUntil: 'networkidle0' });
      if (mode === 'chunk-failure') {
        await page.waitForFunction(() => document.body.innerText.includes('Не удалось загрузить раздел'));
        assert(injected > 0); results.push({ case: mode, fallback: 'visible', injected });
      } else if (mode === 'offline') {
        await page.setOfflineMode(true);
        await page.evaluate(() => { history.pushState({}, '', '/suppliers'); dispatchEvent(new PopStateEvent('popstate')); });
        await page.waitForFunction(() => /Нет сети|Не удалось загрузить раздел/.test(document.body.innerText));
        results.push({ case: mode, fallback: 'visible' });
        await page.setOfflineMode(false);
      } else {
        await page.waitForSelector('[data-testid="data-load-error"]', { visible: true });
        results.push({ case: mode, injected, text: await page.evaluate(() => document.body.innerText.slice(0, 2000)) });
      }
      fault = false;
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(() => !!document.querySelector('main')?.textContent?.trim() && !/Произошла ошибка|Не удалось загрузить раздел|Загрузка…/i.test(document.body.innerText));
      assert.equal(new URL(page.url()).pathname, mode === 'offline' ? '/suppliers' : route);
      results.push({ case: mode, recoveredAfterReload: true });
      await context.close();
    }
    const stale = await browser.createBrowserContext();
    const stalePage = await stale.newPage();
    const staleSeed = await stalePage.evaluateOnNewDocument(session => { localStorage.setItem('ms_jwt_token', session.token); localStorage.setItem('ms_user', JSON.stringify(session.user)); }, session);
    await stalePage.goto(api.baseUrl + '/not-existing', { waitUntil: 'networkidle0' });
    assert.equal(new URL(stalePage.url()).pathname, '/');
    await stalePage.removeScriptToEvaluateOnNewDocument(staleSeed.identifier);
    results.push({ case: 'unknown-route-authenticated', result: 'home' });
    assert.equal((await api.call('POST', '/auth/logout', {}, { token: session.token })).status, 200);
    await stalePage.goto(api.baseUrl + '/inventory', { waitUntil: 'domcontentloaded' });
    await stalePage.waitForSelector('[data-login-page]');
    assert.equal(new URL(stalePage.url()).pathname, '/login');
    results.push({ case: 'revoked-session', result: 'login' });
    await stale.close();
  } finally { await browser.close(); }
});
mkdirSync('output/page-loading', { recursive: true });
writeFileSync('output/page-loading/recovery.json', JSON.stringify(results, null, 2));
console.log(`PASS ${results.length} login / chunk / offline / API recovery checks`);
