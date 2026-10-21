import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer, { type ElementHandle } from 'puppeteer-core';
import { browserExecutable } from './lib/browser-executable';

const fixture = JSON.parse(readFileSync('output/ui-backend-audit/fixture.json', 'utf8'));
assert.equal(fixture.isolated, true);
assert.equal(new URL(fixture.baseUrl).hostname, '127.0.0.1');
const browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 850 });
const actions: any[] = [], errors: any[] = [], requests: any[] = [];
let route = '/login';
page.on('pageerror', e => errors.push({ route, error: String(e) }));
page.on('response', r => {
  if (r.url().startsWith(fixture.baseUrl + '/api/')) {
    const item = { route, method: r.request().method(), path: new URL(r.url()).pathname, status: r.status() };
    requests.push(item);
    if (r.status() >= 400) errors.push(item);
  }
});
const idle = () => page.waitForNetworkIdle({ idleTime: 150, timeout: 10000 });
// A mouse click lands on the button's centre: wait until the button itself is there (not covered
// by another layer, not inert) and has stopped moving, e.g. after a viewport change re-lays out the page.
const waitClickable = async (button: ElementHandle<Element>, label: string) => {
  await button.evaluate(b => b.scrollIntoView({ block: 'center', inline: 'center' }));
  let previousBox = '', state = { box: '', blocker: '' };
  for (let attempt = 0; attempt < 50; attempt++) {
    state = await button.evaluate(b => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const blocker = b.closest('[inert]') ? 'inert ancestor' : top && !b.contains(top) ? top.outerHTML.slice(0, 200) : !top ? 'nothing at the centre' : '';
      return { box: [r.x, r.y, r.width, r.height].map(Math.round).join(','), blocker };
    });
    if (!state.blocker && state.box === previousBox) return;
    previousBox = state.box;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Button ${route}: ${label} is not clickable (box ${state.box}; blocked by: ${state.blocker || 'moving'})`);
};
const click = async (text: string, scope = 'main') => {
  for (const button of await page.$$(`${scope} button`)) {
    const match = await button.evaluate((b, text) => !!b.getClientRects().length && !b.disabled && ((text.endsWith('*') ? b.textContent?.trim().startsWith(text.slice(0, -1)) : b.textContent?.trim() === text) || b.getAttribute('title') === text || b.getAttribute('aria-label') === text), text);
    if (match) { await waitClickable(button, text); await button.click(); await idle(); actions.push({ route, action: 'click', text }); return; }
  }
  throw new Error(`Missing enabled button ${route}: ${text}; ${await page.evaluate(() => document.body.innerText.slice(-2200))}; invalid: ${await page.evaluate(() => [...document.querySelectorAll('input:invalid,select:invalid')].map(i => (i as HTMLInputElement).placeholder + ':' + (i as HTMLInputElement).validationMessage).join(';'))}`);
};
const navigate = async (next: string) => { route = next; await page.goto(fixture.baseUrl + route, { waitUntil: 'networkidle0' }); };
const step = async (label: string, fn: () => Promise<void>) => {
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
  if (only && !label.startsWith(only)) return;
  try { await fn(); console.log('PASS', label); }
  catch (e) {
    await page.screenshot({ path: 'output/ui-backend-audit/screens/action-failure.png' });
    const state = await page.evaluate(() => ({ text: document.body.innerText.slice(-2600), inputs: [...document.querySelectorAll('input,select')].map(i => ({ placeholder: (i as HTMLInputElement).placeholder, value: (i as HTMLInputElement).value, valid: (i as HTMLInputElement).validationMessage })) }));
    errors.push({ route, step: label, error: String(e), state }); console.log('FAIL', label, String(e), JSON.stringify(state));
  }
};
try {
  await navigate('/login');
  await page.locator('input[type="text"]').fill('admin');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(() => location.pathname !== '/login');
  await idle();
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Позже')?.click());

  const plans: Record<string, string[]> = {
    '/inventory': ['Телефоны', 'Планшеты', 'Аксессуары', 'Все устройства', 'Список', 'По моделям', 'По брендам', 'Фильтры'],
    '/transfer': ['История и заявки', 'Новое перемещение', 'Планшеты', 'Аксессуары', 'Телефоны', 'Все товары', 'Штучно', 'Модели'],
    '/revision': ['История ревизий', 'Сверка склада', 'Штучно', 'Модели'],
    '/expenses': ['Не оплачено', 'Оплачено', 'Все'],
    '/bonuses': ['Подарочные телефоны0', 'Журнал бонусов0'],
    '/customers': ['С долгом', 'Все0'],
    '/repair': ['Приняты0', 'В работе0', 'Готовы0', 'Выданы0', 'Все0'],
    '/notifications': ['Все', 'Новые'],
    '/audit-log': ['Сначала новые', 'Дополнительные фильтры'],
    '/settings': ['Светлая', 'Тёмная'],
    '/receipts': [], '/cash-collection': [], '/reports': [], '/purchase': [], '/employees': [], '/owners': [],
  };
  for (const [next, buttons] of Object.entries(process.argv.includes('--writes-only') ? {} : plans)) {
    await navigate(next);
    for (const text of buttons) await step(`${next}: ${text}`, () => click(text));
    // Exercise every option in the common custom filter component, retaining the original.
    const roots = await page.$$('main div.relative.inline-block');
    for (const root of roots) await step(`${next}: custom filter`, async () => {
      const trigger = await root.$(':scope > button');
      if (!trigger || !await trigger.evaluate(b => !!b.getClientRects().length && !b.disabled)) return;
      await trigger.click();
      const options = await root.$$('div.absolute button');
      const count = options.length;
      if (!count) { await page.keyboard.press('Escape'); return; }
      for (let i = 0; i < count; i++) {
        if (i) await trigger.click();
        const current = await root.$$('div.absolute button');
        const text = await current[i].evaluate(b => b.textContent?.trim());
        await current[i].click(); await idle();
        actions.push({ route, action: 'select-filter', text });
      }
      await trigger.click();
      await (await root.$$('div.absolute button'))[0].click(); await idle();
    });
  }

  await step('customer create/edit/delete reaches real API', async () => {
    await navigate('/customers');
    await click('Клиент');
    await page.locator('[role="dialog"] input[required]').fill('UI Audit Customer');
    await page.locator('[role="dialog"] input[type="tel"]').fill('+992900000123');
    const created = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/customers');
    await click('Сохранить', '[role="dialog"]');
    assert.equal((await created).status(), 201);
    await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('UI Audit Customer'));
    await click('Редактировать контакт');
    await page.locator('[role="dialog"] input[required]').fill('UI Audit Customer Edited');
    const edited = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/api/customers/'));
    await click('Сохранить', '[role="dialog"]');
    assert.equal((await edited).status(), 200);
    await click('Удалить');
    const deleted = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().includes('/api/customers/'));
    await click('Удалить', '[role="dialog"]');
    assert.equal((await deleted).status(), 200);
  });

  await step('supplier creation reaches API and refreshes list', async () => {
    await navigate('/suppliers'); await click('Добавить');
    const name = `UI Supplier ${Date.now()}`;
    await page.locator('input[placeholder="Например: Xiaomi Tech Hub"]').fill(name);
    const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/suppliers');
    await click('Добавить', 'form');
    assert.equal((await saved).status(), 201);
    await page.waitForFunction(name => document.querySelector('main')?.textContent?.includes(name), {}, name);
  });

  await step('store creation reaches API and refreshes list', async () => {
    await navigate('/settings'); await click('Добавить');
    const name = `UI Store ${Date.now()}`;
    await page.locator('form input[required]').fill(name);
    const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/stores');
    await click('Создать магазин', 'form');
    assert.equal((await saved).status(), 201);
    await page.waitForFunction(name => document.querySelector('main')?.textContent?.includes(name), {}, name);
  });

  await step('employee role/store choices and creation reach API', async () => {
    await navigate('/employees'); await click('Добавить сотрудника');
    await page.locator('input[placeholder="Саид Каримов"]').fill('UI Seller');
    await page.locator('input[placeholder="seller3"]').fill(`ui${Date.now()}`);
    await page.locator('input[placeholder="Пароль"]').fill('UiTestPassword123');
    const roleSelect = await page.$('#employee-form select'); assert(roleSelect);
    for (const role of ['ADMIN', 'PARTNER', 'SELLER']) {
      await roleSelect.select(role); await idle();
      const storeField = await page.$('#employee-form select[required]');
      assert.equal(Boolean(storeField), role !== 'ADMIN');
      actions.push({ route, action: 'employee-role', role });
    }
    await page.select('#employee-form select[required]', 'store-siyoma');
    const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/users');
    void saved.catch(() => {});
    await click('Создать', '[role="dialog"]');
    assert.equal((await saved).status(), 201);
  });

  await step('phone purchase preview and debt confirmation reach API', async () => {
    await navigate('/purchase'); await click('Новый приход');
    const supplier = await page.$('main select'); assert(supplier);
    const value = await supplier.evaluate(s => [...s.options].find(o => o.value)?.value);
    assert(value); await supplier.select(value);
    await page.locator('input[placeholder="IMEI 1 #1 (15 цифр)"]').fill('356938035643809');
    await page.locator('input[placeholder="Apple"]').fill('App');
    const brandRoot = (await page.$$('main .app-combobox'))[0]; assert(brandRoot);
    const option = await brandRoot.$('div.absolute button'); assert(option);
    await option.focus(); await option.press('Enter');
    assert.equal(await page.$eval('input[placeholder="Apple"]', i => i.value), 'Apple');
    const clear = await brandRoot.$('button[aria-label="Очистить"]'); assert(clear);
    await clear.focus(); await clear.press('Space');
    assert.equal(await page.$eval('input[placeholder="Apple"]', i => i.value), '');
    await page.locator('input[placeholder="Apple"]').fill('Apple');
    actions.push({ route, action: 'keyboard-combobox', selection: 'Enter', clear: 'Space' });
    await page.locator('input[placeholder="iPhone 16 Pro"]').fill('UI Purchase Phone');
    await page.locator('input[placeholder="8 GB"]').fill('8 GB');
    await page.locator('input[placeholder="256 GB"]').fill('256 GB');
    await page.locator('input[placeholder="Black"]').fill('Black');
    await page.locator('main input[type="number"]').fill('60');
    await click('Просмотреть чек');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Принять в долг')), { timeout: 5000 });
    const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/purchases');
    void saved.catch(() => {});
    await click('Принять в долг ($0)', 'body');
    assert.equal((await saved).status(), 201);
    await page.waitForFunction(() => !document.querySelector('input[placeholder="IMEI 1 #1 (15 цифр)"]'));
  });

  await step('purchase categories and accessory barcode unlock', async () => {
    await navigate('/purchase'); await click('Новый приход');
    const radios = await page.$$('main [role="radio"]');
    assert.equal(radios.length, 3);
    await radios[1].click();
    assert(await page.$('input[aria-label="ОСНОВНОЙ SN *"]') || await page.$('input[placeholder*="SN"]'));
    await radios[2].click();
    const barcode = await page.$('main input[required]');
    assert(barcode);
    await barcode.type('6932554477035'); await barcode.press('Tab'); await idle();
    assert(await page.$('[aria-label="Бренд аксессуара"]'));
    await click('Отмена');
  });
  await step('store selection, tablet receipt and phone sale reach API', async () => {
    await navigate('/sale');
    await click('Выбрать магазин');
    // Store cards are clickable divs, not buttons.
    const card = await page.waitForSelector('div.fixed .overflow-y-auto');
    assert(card);
    const storeCard = await page.evaluateHandle(() => [...document.querySelectorAll('div[\u0063lass*="cursor-pointer"]')].find(el => el.querySelector('span')?.textContent === 'Сиёма' && el.closest('div.fixed')));
    const element = storeCard.asElement(); assert(element); await (element as any).click(); await idle();
    await page.waitForSelector('aside[aria-label="Смена рабочего режима магазина"]', { hidden: true });
    actions.push({ route, action: 'select-store', storeId: 'store-siyoma' });
    await click('Приход товара', 'body'); route = '/receipts';
    await page.waitForFunction(() => location.pathname === '/receipts');
    const sn = await page.waitForSelector('input[placeholder="IMEI / SN устройства или штрихкод аксессуара..."]'); assert(sn);
    await sn.type('72255/Y5XH00021'); await sn.press('Enter'); await idle();
    const received = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/store-receipts');
    void received.catch(() => {});
    await click('Оприходовать (1 шт.)');
    assert.equal((await received).status(), 201);
    await navigate('/settings');
    await click('Выйти из аккаунта');
    await page.waitForSelector('input[type="password"]');
    await page.locator('input[type="text"]').fill('ahmad');
    await page.locator('input[type="password"]').fill('seller123');
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => location.pathname === '/sale');
    route = '/sale'; await idle();
    await page.setViewport({ width: 768, height: 900 });
    const search = await page.waitForSelector('input[placeholder="IMEI / SN, штрихкод, название или модель…"]'); assert(search);
    await search.type('490154203237518'); await search.press('Enter'); await idle();
    await click('Оформить');
    await page.locator('[role="dialog"] input[placeholder="Укажите цену продажи..."]').fill('1000'); await idle();
    for (const method of ['Банк', 'Смеш.', 'В долг', 'Нал.']) await click(method, '[role="dialog"]');
    const sold = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/sales');
    void sold.catch(() => {});
    await click('Оплатить*', '[role="dialog"]');
    const response = await sold; assert.equal(response.status(), 201);
    const sale = await response.json();
    assert.equal(Number(sale.totalTjs), 1000);
    actions.push({ route, action: 'sale-result', saleId: sale.id, totalTjs: sale.totalTjs });
  });
  // Responsive render + real category buttons on phone and tablet widths.
  for (const width of [360, 768]) await step(`inventory categories at ${width}px`, async () => {
    await page.setViewport({ width, height: 900 }); await navigate('/inventory');
    for (const label of ['Телефоны', 'Планшеты', 'Аксессуары']) await click(label);
    await page.screenshot({ path: `output/ui-backend-audit/screens/inventory-${width}.png` });
  });
} finally {
  await browser.close();
  writeFileSync('output/ui-backend-audit/actions.json', JSON.stringify({ actions, errors, requests }, null, 2));
}
console.log(`UI actions: ${actions.length}; errors: ${errors.length}`);
process.exitCode = errors.length ? 1 : 0;
