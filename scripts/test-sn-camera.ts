// Real ZXing decoding of generated Code128 video frames, not manual input or mocked scan results.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { browserExecutable } from './lib/browser-executable';
import { withDisposableApi } from './lib/disposable-api';
import { prepareUiAudit } from './lib/ui-audit-fixture';

const require = createRequire(import.meta.url);
const patterns: number[][] = Array.from(
  require('../node_modules/html5-qrcode/third_party/zxing-js.umd.js').Code128Reader.CODE_PATTERNS,
  (pattern: ArrayLike<number>) => Array.from(pattern),
);
assert.equal(patterns.length, 107);
const url = new URL(process.env.DATABASE_URL || '');
assert(/(?:audit|test|_ci$)/i.test(url.pathname), 'Требуется отдельная тестовая БД');
process.env.UI_AUDIT_FRONTEND = 'true';
const results: object[] = [];
await withDisposableApi('sncamera', async api => {
  await prepareUiAudit(api);
  await api.db.device.create({ data: { imei: '65577/W5SE65983', brand: 'Honor', model: 'Camera tablet', storage: '128GB', color: 'Black', storeId: 'store-siyoma', status: 'STORE_STOCK', purchasePriceUsd: 80, costBasisUsd: 80, category: 'TABLET' } });
  const browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true });
  try {
    for (const scenario of [
      { path: '/inventory', login: 'admin', serial: '72255/Y5XH00021', expected: '72255/Y5XH00021' },
      { path: '/transfer', login: 'admin', serial: '72255/Y5XH00021', expected: 'Добавлено устройство: Honor UI Tablet' },
      { path: '/receipts', login: 'ahmad', serial: '72255/Y5XH00021', expected: 'Оприходовать (1 шт.)' },
      { path: '/sale', login: 'ahmad', serial: '65577/W5SE65983', expected: '65577/W5SE65983' },
    ]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 390, height: 844 });
      const errors: string[] = [];
      page.on('pageerror', e => { if (!errors.length) console.log('PAGE ERROR', scenario.path, String(e)); errors.push(String(e)); });
      // tsx/esbuild preserves nested function names using this helper; the serialized
      // camera fixture runs in a new browser realm, outside the Node helper's scope.
      await page.evaluateOnNewDocument('window.__name = (target) => target;');
      await page.evaluateOnNewDocument((patterns) => {
        const state = window as unknown as { cameraCode: string; cameraFrames: number };
        state.cameraCode = ''; state.cameraFrames = 0;
        Reflect.deleteProperty(window, 'BarcodeDetector');
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1920; canvas.height = 1080;
          const ctx = canvas.getContext('2d')!;
          const draw = () => {
            ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (state.cameraCode) {
              const values = [104, ...Array.from(state.cameraCode, c => c.charCodeAt(0) - 32)];
              values.push(values.reduce((sum, value, i) => sum + value * (i || 1), 0) % 103, 106);
              const width = values.reduce((sum, value) => sum + patterns[value].reduce((sum, w) => sum + w, 0), 0) * 3;
              let x = Math.floor((canvas.width - width) / 2);
              for (const value of values) patterns[value].forEach((w, i) => {
                if (i % 2 === 0) { ctx.fillStyle = 'black'; ctx.fillRect(x, 480, w * 3, 120); }
                x += w * 3;
              });
            }
            state.cameraFrames++;
          };
          draw();
          const timer = setInterval(draw, 50);
          const stream = canvas.captureStream(20);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => { clearInterval(timer); stop(); };
          }
          return stream;
        }, configurable: true });
      }, patterns);
      await page.goto(api.baseUrl + '/login', { waitUntil: 'networkidle0' });
      await page.locator('input[type="text"]').fill(scenario.login);
      await page.locator('input[type="password"]').fill(scenario.login === 'admin' ? 'admin123' : 'seller123');
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => location.pathname !== '/login');
      await page.goto(api.baseUrl + scenario.path, { waitUntil: 'networkidle0' });
      console.log('Camera scenario', scenario.path);
      // Explicitly start from PHONE: SN must not inherit that category's IMEI mode/filter.
      for (const button of await page.$$('main [aria-label="Категория товара"] button')) {
        if (await button.evaluate(b => b.textContent?.trim() === 'Телефоны')) { await button.click(); break; }
      }
      await page.locator('main button[aria-label="Сканировать SN"]').click();
      await page.waitForSelector('input[placeholder="Введите SN вручную…"]');
      assert.equal(await page.$$eval('[role="dialog"] button', buttons => buttons.some(b => b.textContent?.trim() === 'IMEI')), false);
      await page.evaluate(() => { (window as any).cameraCode = '6932554477035'; (window as any).cameraFrames = 0; });
      await page.waitForFunction(() => (window as any).cameraFrames >= 16);
      assert(await page.$('input[placeholder="Введите SN вручную…"]'), 'numeric product code must not finish the SN scan');
      await page.evaluate(serial => { (window as any).cameraCode = serial; }, scenario.serial);
      await page.waitForSelector('input[placeholder="Введите SN вручную…"]', { hidden: true, timeout: 15000 });
      await page.waitForFunction(expected => document.body.textContent?.includes(expected), { timeout: 10000 }, scenario.expected);
      assert.deepEqual(errors, []);
      mkdirSync('output/sn-camera', { recursive: true });
      await page.screenshot({ path: `output/sn-camera/${scenario.path.slice(1)}.png` });
      results.push({ ...scenario, result: 'passed', decoder: 'ZXing', source: 'Code128 canvas video', ignoredNumericBarcode: true });
      console.log('PASS', scenario.path, 'SN camera decoded', scenario.serial);
      await context.close();
    }
  } finally { await browser.close(); }
});
writeFileSync('output/sn-camera/results.json', JSON.stringify(results, null, 2));
console.log(`SN camera: ${results.length} scenarios passed`);
