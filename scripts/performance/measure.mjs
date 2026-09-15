import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv[2] || 'before';
const base = process.argv[3] || 'http://127.0.0.1:4173';
const scenario = process.argv[4] || 'sale';
const runs = Number(process.argv[5] || 3);
const profile = process.argv.includes('--profile');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
    await context.addInitScript(({ scenario }) => {
      if (scenario === 'sale' && location.hostname === '127.0.0.1') {
        localStorage.setItem('ms_user', JSON.stringify({ id: 'audit-user', name: 'Audit User', login: 'audit', role: 'ADMIN', storeId: 'store', active: true }));
        localStorage.setItem('ms_jwt_token', 'synthetic-audit-token');
      }
      window.__metrics = { lcp: null, cls: 0, shifts: [], longtasks: [], interactions: {} };
      const m = window.__metrics;
      new PerformanceObserver((list) => { for (const e of list.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) m.shifts.push({ time: e.startTime, value: e.value }); }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => { for (const e of list.getEntries()) m.longtasks.push({ time: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.interactionId) m.interactions[e.interactionId] = Math.max(m.interactions[e.interactionId] || 0, e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    }, { scenario });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 90 * 1024, connectionType: 'cellular4g' });
    const requests = [];
    const errors = [];
    context.on('request', (req) => requests.push({ url: req.url(), method: req.method(), type: req.resourceType(), worker: !!req.serviceWorker() }));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/${scenario === 'sale' ? 'sale' : 'login'}`, { waitUntil: 'load', timeout: 90000 });
    if (scenario === 'sale') await page.getByPlaceholder(/Поиск/).first().waitFor({ timeout: 30000 });
    else await page.getByPlaceholder('admin, partner, seller...').waitFor({ timeout: 30000 });
    // A fixed observation window captures SW installation as well as background startup requests.
    await page.waitForTimeout(12000);
    const initialRequestCount = requests.length;
    const initialApiRequests = requests.filter((r) => r.url.includes('/api/')).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    const initialRenderCounts = await page.evaluate(() => window.__renderCounts || null);
    const initialMetrics = await page.evaluate(() => {
      const m = window.__metrics;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
      let cls = 0, value = 0, start = 0, last = 0;
      for (const shift of m.shifts) {
        if (shift.time - last > 1000 || shift.time - start > 5000) { value = 0; start = shift.time; }
        value += shift.value; last = shift.time; cls = Math.max(cls, value);
      }
      return { fcp, lcp: m.lcp, cls, observedBlockingTime: m.longtasks.filter((e) => e.time >= (fcp || 0)).reduce((sum, e) => sum + Math.max(0, e.duration - 50), 0), heapBytes: performance.memory?.usedJSHeapSize ?? null,
        resources: performance.getEntriesByType('resource').map((r) => ({ url: r.name, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize, duration: r.duration })) };
    });
    const input = scenario === 'sale' ? page.getByPlaceholder(/Поиск/).first() : page.getByPlaceholder('admin, partner, seller...');
    await input.click();
    await input.pressSequentially(scenario === 'sale' ? 'Model 12' : 'audit', { delay: 150 });
    await page.waitForTimeout(300);
    const inp = await page.evaluate(() => {
      const values = Object.values(window.__metrics.interactions).sort((a, b) => b - a);
      return values.length ? values[Math.floor(values.length / 50)] : null;
    });
    let notificationRenders = null, repeatedDataRenders = null;
    if (scenario === 'sale' && base.includes('127.0.0.1')) {
      await page.evaluate(() => { window.__renderCounts = {}; });
      await fetch(`${base}/__perf/event?type=NOTIFICATION_CREATED`);
      await page.waitForTimeout(1600);
      notificationRenders = await page.evaluate(() => window.__renderCounts);
      await page.evaluate(() => { window.__renderCounts = {}; });
      for (let i = 0; i < 5; i++) {
        await fetch(`${base}/__perf/event?type=SALE_COMPLETED`);
        await page.waitForTimeout(1000);
      }
      repeatedDataRenders = await page.evaluate(() => window.__renderCounts);
    }
    if (run === 0) await page.screenshot({ path: `output/playwright/perf-${label}-${scenario}${profile ? '-profile' : ''}.png` });
    results.push({ run, ...initialMetrics, labInp: inp, initialRequestCount, initialApiRequests, initialRenderCounts, notificationRenders, repeatedDataRenders, requests, errors });
    console.log(JSON.stringify({ run, fcp: initialMetrics.fcp, lcp: initialMetrics.lcp, blocking: initialMetrics.observedBlockingTime, inp, requests: initialRequestCount, api: initialApiRequests.length, errors }));
    await context.close();
  }
} finally { await browser.close(); }
await mkdir('output/performance', { recursive: true });
await writeFile(`output/performance/${label}-${scenario}${profile ? '-profile' : ''}.json`, JSON.stringify({ base, scenario, profile, cpuSlowdown: 4, latencyMs: 150, downloadKBps: 200, runs: results }, null, 2));
