import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer, { type Page } from 'puppeteer-core';
import { withDisposableApi } from './lib/disposable-api';
import { requireAuditDatabase } from './lib/audit-database';
import { browserExecutable } from './lib/browser-executable';
import { prepareUiAudit } from './lib/ui-audit-fixture';

requireAuditDatabase();
process.env.UI_AUDIT_FRONTEND = 'true';
const output = 'output/page-loading';
mkdirSync(output, { recursive: true });
const routes = ['/', '/cash', '/reports', '/finance', '/cash-collection', '/expenses', '/bonuses', '/owners', '/purchase', '/inventory', '/stock-thresholds', '/transfer', '/revision', '/suppliers', '/employees', '/customers', '/exchange', '/repair', '/notifications', '/audit-log', '/settings', '/sale', '/sales-history', '/receipts'];
const common = ['/sale', '/sales-history', '/inventory', '/transfer', '/exchange', '/repair', '/expenses', '/settings', '/receipts', '/stock-thresholds'];
const results: any[] = [];
const faults: any[] = [];
const failures: any[] = [];
const smoke = process.argv.includes('--smoke');
await withDisposableApi('pageload', async api => {
  await prepareUiAudit(api);
  const browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true });
  const expectedPath = (role: string, path: string) => role === 'admin' ? (path === '/finance' ? '/reports' : path) : role === 'ahmad' && path === '/settings' ? '/sale' : [...common, ...(role === 'partner' ? ['/cash', '/customers', '/notifications'] : [])].includes(path) ? path : '/sale';
  const settle = async (page: Page) => {
    await page.waitForFunction(() => (!!document.querySelector('main')?.children.length || !!document.querySelector('[data-login-page]')) && !/Загрузка…/.test(document.body.innerText), { timeout: 15000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 });
  };
  const inspect = (page: Page) => page.evaluate(() => ({
    path: location.pathname, title: document.querySelector('h1')?.textContent,
    crash: /Произошла ошибка|Не удалось загрузить раздел/i.test(document.body.innerText),
    loading: /Загрузка…/.test(document.body.innerText),
    errorVisible: /не удалось|ошибк|нет связи|проверьте интернет|недоступ|соединени.*потер/i.test(document.body.innerText),
    mainText: document.querySelector('main')?.textContent?.trim().slice(0, 400),
    text: document.body.innerText.slice(0, 1000),
  }));
  try {
    const sessions = new Map<string, { token: string; user: any }>();
    for (const role of ['admin', 'partner', 'ahmad']) {
      const login = await api.call('POST', '/auth/login', { login: role, password: role === 'admin' ? 'admin123' : role === 'partner' ? 'partner123' : 'seller123' }, { token: '' });
      assert.equal(login.status, 200); sessions.set(role, login.data);
    }
    const newPage = async (role: string, width: number) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 850 }); await page.setCacheEnabled(false);
      await page.setBypassServiceWorker(true);
      const session = sessions.get(role)!;
      await page.evaluateOnNewDocument((session) => {
        localStorage.setItem('ms_jwt_token', session.token); localStorage.setItem('ms_user', JSON.stringify(session.user));
      }, session);
      return page;
    };
    for (const role of smoke ? [process.argv.find(a => a.startsWith('--role='))?.slice(7) || 'admin'] : ['admin', 'partner', 'ahmad']) for (const width of [360, 768, 1280]) {
      for (const route of smoke ? [process.argv.find(a => a.startsWith('--route='))?.slice(8) || '/'] : routes) {
        console.log('CHECK', role, width, route);
        const page = await newPage(role, width);
        const errors: string[] = [];
        const traffic: string[] = [];
        page.on('request', r => { if (r.url().includes('/api/')) traffic.push('REQ ' + new URL(r.url()).pathname); });
        page.on('response', r => { if (r.url().includes('/api/')) traffic.push(r.status() + ' ' + new URL(r.url()).pathname); });
        page.on('pageerror', e => errors.push(String(e)));
        page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
        try {
          for (const mode of ['cold', 'reload']) {
            const start = performance.now();
            if (mode === 'cold') await page.goto(api.baseUrl + route, { waitUntil: 'domcontentloaded' }); else await page.reload({ waitUntil: 'domcontentloaded' });
            await settle(page);
            const state = await inspect(page);
            assert.equal(state.path, expectedPath(role, route), `${role} ${route} redirect`);
            assert(!state.crash && !state.loading && state.mainText, JSON.stringify(state));
            assert.equal(errors.length, 0, errors.join('\n'));
            results.push({ role, width, route, mode, ms: performance.now() - start, path: state.path, title: state.title });
          }
        } catch (e) { failures.push({ role, width, route, error: String(e), traffic: traffic.slice(-30) }); console.log('FAIL', role, width, route, String(e), traffic.slice(-20)); }
        finally { await page.close(); }
      }
      console.log(`PASS matrix ${role} ${width}: ${results.length} loads, ${failures.length} failures`);
    }
    if (smoke) { assert.equal(failures.length, 0, JSON.stringify(failures)); return; }
    // Same tab: SPA transitions and browser back/forward, without reloading the document.
    const navigation = await newPage('admin', 1280);
    await navigation.goto(api.baseUrl, { waitUntil: 'networkidle0' });
    for (const route of routes) {
      await navigation.evaluate(path => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, route);
      await settle(navigation); const state = await inspect(navigation);
      assert.equal(state.path, expectedPath('admin', route)); assert(!state.crash && !state.loading);
      results.push({ role: 'admin', route, mode: 'spa', path: state.path });
    }
    await navigation.goBack(); await settle(navigation); assert(!(await inspect(navigation)).crash);
    await navigation.goForward(); await settle(navigation); assert(!(await inspect(navigation)).crash);
    await navigation.close();
    // Slow and unavailable GETs, on each real admin screen; injected errors are expected.
    for (const mode of ['slow', 'api503']) for (const route of routes.filter(r => r !== '/finance')) {
      const page = await newPage('admin', 360);
      const crashes: string[] = []; page.on('pageerror', e => crashes.push(String(e)));
      let injected = 0;
      await page.setRequestInterception(true);
      page.on('request', async request => {
        if (request.url().startsWith(api.baseUrl + '/api/') && request.method() === 'GET') {
          injected++;
          if (mode === 'api503') { await request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Тест: сервер временно недоступен' }) }); return; }
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        await request.continue();
      });
      try {
        await page.goto(api.baseUrl + route, { waitUntil: 'domcontentloaded' }); await settle(page);
        const state = await inspect(page);
        faults.push({ mode, route, injected, ...state, crashes });
        assert(!state.crash && !state.loading && crashes.length === 0, JSON.stringify({ mode, route, state, crashes }));
      } catch (e) { failures.push({ mode, route, error: String(e) }); }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
});
writeFileSync(`${output}/${smoke ? 'focused' : 'result'}.json`, JSON.stringify({ results, faults, failures }, null, 2));
console.log(JSON.stringify({ loads: results.length, faultScenarios: faults.length, failures: failures.length, silentApiFailures: faults.filter(r => r.mode === 'api503' && !r.errorVisible).map(r => r.route) }));
assert.equal(failures.length, 0, JSON.stringify(failures));
