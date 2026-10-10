// End-to-end business audit (blocks 1–11 of the acceptance checklist), run against the real
// Express app and a disposable Postgres schema: every step checks the HTTP answer, the rows it
// left in the database and, where relevant, the realtime broadcast. Steps keep running after a
// failure so one run reports every broken flow.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import WebSocket from 'ws';
import { D } from '../server/src/common/decimal';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Disposable local database required');
const schema = `audit_fixes_system_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);

let server: import('node:http').Server | undefined;
let disconnect: (() => Promise<void>) | undefined;
const results: Array<{ block: string; name: string; ok: boolean; error?: string }> = [];
let block = '';

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ block, name, ok: true });
    console.log(`  PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ block, name, ok: false, error: message });
    console.log(`  FAIL ${name}\n       ${message.split('\n').slice(0, 4).join('\n       ')}`);
  }
}

const money = (v: unknown) => D(v as string).toFixed(2);

try {
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', 'prisma/seed.ts']]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 180000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { app } = await import('../server/src/app');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  const { RealtimeSyncGateway } = await import('../server/src/websocket/websocket.gateway');
  disconnect = () => prisma.$disconnect();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  RealtimeSyncGateway.init(server);
  const port = (server.address() as import('node:net').AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;

  type Res = { status: number; data: any };
  const call = async (token: string, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const ok = (r: Res, expected = [200, 201]) => {
    assert(expected.includes(r.status), `HTTP ${r.status}: ${JSON.stringify(r.data)}`);
    return r.data;
  };
  const login = async (l: string, p: string) => ok(await call('', 'POST', '/auth/login', { login: l, password: p })).token as string;

  // Realtime: collect every event a client receives.
  const listen = (token: string) => {
    const events: Array<{ type: string; payload: any }> = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['auth', token]);
    socket.on('message', (raw) => events.push(JSON.parse(String(raw))));
    const ready = new Promise<void>((resolve, reject) => { socket.once('open', () => setTimeout(resolve, 300)); socket.once('error', reject); });
    return { events, socket, ready };
  };
  const settle = () => new Promise((r) => setTimeout(r, 300));

  const admin = await login('admin', 'admin123');
  const seller = await login('ahmad', 'seller123');

  // A second retail store. The seeded partner has no store until the admin assigns one by hand.
  const storeB = ok(await call(admin, 'POST', '/stores', { name: 'Тестовая точка', address: 'ул. Проверки, 1' }));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: 'user-partner' } })).storeId, null, 'seed must not pick a store for the partner');
  ok(await call(admin, 'PATCH', '/users/user-partner', { storeId: 'store-siyoma' }));
  const partner = await login('partner', 'partner123');
  ok(await call(admin, 'POST', '/users', { login: 'sellerb', password: 'seller-b-pass-1', name: 'Продавец Б', role: 'SELLER', storeId: storeB.id }));
  const sellerB = await login('sellerb', 'seller-b-pass-1');

  const storeCash = async (id: string) => D((await db.store.findUniqueOrThrow({ where: { id } })).cashBalanceUsd);
  const accountBalance = async (storeId: string) => D((await db.financialAccount.findUnique({ where: { storeId } }))?.balanceUsd ?? 0);
  const reconciled = async (storeId: string) => assert.equal(money(await storeCash(storeId)), money(await accountBalance(storeId)), `register ${storeId}: store row and ledger account differ`);

  // ------------------------------------------------------------------ BLOCK 2 (rate first)
  block = 'Блок 2: курс';
  const adminWs = listen(admin);
  const sellerWs = listen(seller);
  const sellerBWs = listen(sellerB);
  await Promise.all([adminWs.ready, sellerWs.ready, sellerBWs.ready]);

  await step('админ задаёт курс 9.20, затем меняет на 9.50; изменение в журнале аудита', async () => {
    ok(await call(admin, 'POST', '/exchange-rate/today', { rate: 9.2 }));
    ok(await call(admin, 'POST', '/exchange-rate/today', { rate: 9.5 }));
    const today = ok(await call(seller, 'GET', '/exchange-rate/today'));
    assert.equal(money(today.rate), '9.50');
    assert(await db.auditLog.findFirst({ where: { action: 'RATE_CHANGE' } }), 'RATE_CHANGE not audited');
    assert(await db.auditLog.findFirst({ where: { action: 'RATE_SET' } }), 'RATE_SET not audited');
  });
  await step('изменение курса приходит всем по WebSocket', async () => {
    await settle();
    for (const [who, ws] of [['admin', adminWs], ['seller', sellerWs]] as const) {
      assert(ws.events.some((e) => e.type === 'EXCHANGE_RATE_UPDATED'), `${who} did not get EXCHANGE_RATE_UPDATED`);
    }
  });
  await step('партнёр и продавец могут задавать курс', async () => {
    ok(await call(partner, 'POST', '/exchange-rate/today', { rate: 9.5 }));
    ok(await call(seller, 'POST', '/exchange-rate/today', { rate: 9.5 }));
  });
  const RATE = D(9.5);

  // ------------------------------------------------------------------ BLOCK 6 (stock first)
  block = 'Блок 6: закупки и поставщики';
  const imeis = Array.from({ length: 14 }, (_, i) => `35${String(9100000000000 + i).padStart(13, '0')}`);
  let invoice1: any; let invoice2: any;
  await step('приход партии: накладная, IMEI, подарок за $0, долг поставщика', async () => {
    const before = D((await db.supplier.findUniqueOrThrow({ where: { id: 'sup-china' } })).totalDebtUsd);
    const res = ok(await call(admin, 'POST', '/purchases', {
      supplierId: 'sup-china', invoiceNumber: 'AUD-001', date: '2026-10-01',
      groups: [
        { brand: 'Apple', model: 'iPhone 15', ram: '6GB', storage: '128GB', color: 'Black', purchasePriceUsd: 600, items: imeis.slice(0, 10).map((imei) => ({ imei })) },
        { brand: 'Xiaomi', model: 'Redmi 13', ram: '8GB', storage: '256GB', color: 'Blue', purchasePriceUsd: 0, isBonus: true, bonusCampaign: 'Подарок', items: [{ imei: imeis[10] }] },
      ],
    }));
    invoice1 = res.invoice;
    assert.equal(res.devices.length, 11);
    const bonus = await db.device.findFirstOrThrow({ where: { imei: imeis[10] } });
    assert(bonus.isBonus && D(bonus.purchasePriceUsd).eq(0), 'bonus device not stored at $0');
    assert.equal((await db.device.count({ where: { imei: { in: imeis.slice(0, 11) }, status: 'MAIN_WAREHOUSE' } })), 11);
    const after = D((await db.supplier.findUniqueOrThrow({ where: { id: 'sup-china' } })).totalDebtUsd);
    assert.equal(money(after.minus(before)), '6000.00', 'supplier debt must grow by the invoice total');
  });
  await step('вторая накладная того же поставщика', async () => {
    invoice2 = ok(await call(admin, 'POST', '/purchases', {
      supplierId: 'sup-china', invoiceNumber: 'AUD-002', date: '2026-10-05',
      groups: [{ brand: 'Samsung', model: 'A55', ram: '8GB', storage: '256GB', color: 'Gray', purchasePriceUsd: 300, items: imeis.slice(11, 14).map((imei) => ({ imei })) }],
    })).invoice;
  });
  await step('продавец и партнёр не видят поставщиков и накладные', async () => {
    for (const t of [seller, partner]) {
      assert.equal((await call(t, 'GET', '/suppliers')).status, 403);
      assert.equal((await call(t, 'GET', '/supplier-invoices')).status, 403);
    }
  });

  // Central Cash needs money for supplier payments: the admin invests capital.
  await step('погашение долга поставщику: только из Центральной кассы, FIFO по старейшей накладной', async () => {
    ok(await call(admin, 'POST', '/owners/owner-admin/investment', { amountUsd: 5000 }));
    const centralBefore = await storeCash('main-warehouse');
    const siyomaBefore = await storeCash('store-siyoma');
    ok(await call(admin, 'POST', '/suppliers/sup-china/payments', { amountUsd: 4000 }));
    assert.equal(money(centralBefore.minus(await storeCash('main-warehouse'))), '4000.00', 'Central Cash must pay');
    assert.equal(money(await storeCash('store-siyoma')), money(siyomaBefore), 'a store register must not pay suppliers');
    const inv1 = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoice1.id } });
    const inv2 = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoice2.id } });
    assert.equal(money(inv1.paidAmountUsd), '4000.00', 'FIFO: the oldest invoice is paid first');
    assert.equal(money(inv2.paidAmountUsd), '0.00');
    await reconciled('main-warehouse');
  });
  await step('платёж больше остатка Центральной кассы отклоняется', async () => {
    const r = await call(admin, 'POST', '/suppliers/sup-china/payments', { amountUsd: 999999 });
    assert.equal(r.status, 400, JSON.stringify(r));
  });
  await step('оплата конкретной накладной', async () => {
    ok(await call(admin, 'POST', `/supplier-invoices/${invoice2.id}/payments`, { amountUsd: 300 }));
    const inv2 = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoice2.id } });
    assert.equal(money(inv2.paidAmountUsd), '300.00');
    await reconciled('main-warehouse');
  });

  // ------------------------------------------------------------------ BLOCK 5 (stock to stores)
  block = 'Блок 5: склад и перемещения';
  const devByImei = async (imei: string) => db.device.findFirstOrThrow({ where: { imei } });
  await step('админ перемещает 7 телефонов со склада в Сиёму и 2 в Тестовую точку (сразу на остатке)', async () => {
    const toSiyoma = await db.device.findMany({ where: { imei: { in: imeis.slice(0, 7) } } });
    ok(await call(admin, 'POST', '/transfers', { fromStoreId: 'main-warehouse', toStoreId: 'store-siyoma', deviceIds: toSiyoma.map((d) => d.id) }));
    const toB = await db.device.findMany({ where: { imei: { in: imeis.slice(7, 9) } } });
    ok(await call(admin, 'POST', '/transfers', { fromStoreId: 'main-warehouse', toStoreId: storeB.id, deviceIds: toB.map((d) => d.id) }));
    assert.equal(await db.device.count({ where: { storeId: 'store-siyoma', status: 'STORE_STOCK' } }), 7);
    assert.equal(await db.device.count({ where: { storeId: storeB.id, status: 'STORE_STOCK' } }), 2);
  });
  await step('продавец принимает телефон со склада через «Приход товара» по IMEI', async () => {
    const lookup = ok(await call(seller, 'POST', '/store-receipts/lookup', { imei: imeis[9] }));
    assert.equal(lookup.imei, imeis[9]);
    assert.equal(lookup.purchasePriceUsd, undefined, 'cost must not leak to the seller');
    ok(await call(seller, 'POST', '/store-receipts', { imeis: [imeis[9]] }));
    const d = await devByImei(imeis[9]);
    assert.equal(d.storeId, 'store-siyoma'); assert.equal(d.status, 'STORE_STOCK');
  });
  await step('продавец отправляет телефон на склад: TRANSFER_PENDING, продать нельзя', async () => {
    const d = await devByImei(imeis[6]);
    const tr = ok(await call(seller, 'POST', '/transfers', { fromStoreId: 'store-siyoma', toStoreId: 'main-warehouse', deviceIds: [d.id] }));
    assert.equal((await devByImei(imeis[6])).status, 'TRANSFER_PENDING');
    const sale = await call(seller, 'POST', '/sales', { storeId: 'store-siyoma', paymentMethod: 'CASH', items: [{ deviceId: d.id, salePriceTjs: 9000 }], cashAmountTjs: 9000, cardAmountTjs: 0 });
    assert.equal(sale.status, 400, 'a device in transfer must not be sellable');
    // partner cannot approve warehouse transfers; admin rejects with a reason → back in the store
    assert.equal((await call(partner, 'POST', `/transfers/${tr.id}/approve`)).status, 403);
    ok(await call(admin, 'POST', `/transfers/${tr.id}/reject`, { reason: 'Не нужен на складе' }));
    const back = await devByImei(imeis[6]);
    assert.equal(back.status, 'STORE_STOCK'); assert.equal(back.storeId, 'store-siyoma');
    assert.equal((await db.transferRequest.findUniqueOrThrow({ where: { id: tr.id } })).status, 'REJECTED');
  });
  await step('подтверждённое перемещение меняет магазин; продавец не видит чужие остатки', async () => {
    const d = await devByImei(imeis[6]);
    const tr = ok(await call(seller, 'POST', '/transfers', { fromStoreId: 'store-siyoma', toStoreId: 'main-warehouse', deviceIds: [d.id] }));
    ok(await call(admin, 'POST', `/transfers/${tr.id}/approve`));
    const moved = await devByImei(imeis[6]);
    assert.equal(moved.storeId, 'main-warehouse'); assert.equal(moved.status, 'MAIN_WAREHOUSE');
    const visible = ok(await call(seller, 'GET', '/devices')) as any[];
    assert(visible.length > 0 && visible.every((x) => x.storeId === 'store-siyoma'), 'seller must only see own store stock');
    assert(visible.every((x) => Number(x.purchasePriceUsd) === 0 && Number(x.costBasisUsd) === 0), 'seller must not see purchase cost');
  });

  // ------------------------------------------------------------------ BLOCK 1
  block = 'Блок 1: роли и доступ';
  await step('продавец: закрыты Центральная касса, отчёты, поставщики, зарплаты, капитал, настройки магазинов', async () => {
    const forbidden: Array<[string, string, unknown?]> = [
      ['GET', '/reports/summary?period=TODAY'], ['GET', '/cash-collections'], ['GET', '/cash-collections/balances'],
      ['GET', '/owners'], ['GET', '/owner-transactions'], ['GET', '/payroll/user-ahmad?month=2026-10'],
      ['POST', '/stores', { name: 'X' }], ['PATCH', `/stores/store-siyoma`, { name: 'X' }],
      ['POST', '/stores/store-siyoma/adjust-cash', { newBalanceUsd: 0 }], ['GET', '/audit-logs'], ['GET', '/bonuses/pool'],
      ['POST', '/expenses', { category: 'OTHER', amountTjs: 10 }], ['POST', '/owners/owner-admin/investment', { amountUsd: 1 }],
    ];
    for (const [m, p, b] of forbidden) {
      const r = await call(seller, m, p, b);
      assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
    }
  });
  await step('продавец видит свой магазин и главный склад только по имени', async () => {
    const stores = ok(await call(seller, 'GET', '/stores')) as any[];
    assert.deepEqual(stores.map((s) => s.id).sort(), ['main-warehouse', 'store-siyoma'].sort());
    const wh = stores.find((s) => s.id === 'main-warehouse');
    assert.equal(wh.cashBalanceUsd, undefined, 'main warehouse cash must be hidden');
  });
  await step('партнёр: касса своей точки и свои расходы; нет Центральной кассы и капитала', async () => {
    const desk = ok(await call(partner, 'GET', '/cash-desk/summary'));
    assert.deepEqual(desk.cash.stores.map((s: any) => s.id), ['store-siyoma']);
    assert.equal(desk.suppliers.totalDebtUsd, 0, 'supplier debt is ADMIN-only');
    assert.equal(desk.cash.central, undefined, 'Central Cash balance is ADMIN-only');
    ok(await call(partner, 'GET', '/expenses'));
    for (const [m, p] of [['GET', '/cash-collections'], ['GET', '/owners'], ['GET', '/reports/summary?period=TODAY'], ['POST', '/stores/store-siyoma/adjust-cash']] as const) {
      assert.equal((await call(partner, m, p, m === 'POST' ? { newBalanceUsd: 0 } : undefined)).status, 403, `${m} ${p}`);
    }
    const otherDesk = ok(await call(partner, 'GET', `/cash-desk/summary?storeId=${storeB.id}`));
    assert.deepEqual(otherDesk.cash.stores.map((s: any) => s.id), ['store-siyoma'], 'storeId query must not widen the partner scope');
  });
  await step('админ: Центральная касса и все разделы доступны', async () => {
    for (const p of ['/reports/summary?period=TODAY', '/cash-collections/balances', '/owners', '/suppliers', '/audit-logs', '/users', '/bonuses/pool']) {
      ok(await call(admin, 'GET', p));
    }
    const desk = ok(await call(admin, 'GET', '/cash-desk/summary'));
    assert(desk.cash.central, 'admin sees Central Cash');
    assert.deepEqual(desk.cash.stores.map((s: any) => s.id).sort(), ['store-siyoma', storeB.id].sort(), 'admin sees every retail register');
    const local = ok(await call(admin, 'GET', '/cash-desk/summary?storeId=store-siyoma'));
    assert.deepEqual(local.cash.stores.map((s: any) => s.id), ['store-siyoma'], 'store mode scopes the admin to the chosen store');
  });

  // ------------------------------------------------------------------ BLOCK 3
  block = 'Блок 3: продажи';
  const sellable = async () => db.device.findMany({ where: { storeId: 'store-siyoma', status: 'STORE_STOCK', isBonus: false }, orderBy: { imei: 'asc' } });
  const sale = (body: Record<string, unknown>) => call(seller, 'POST', '/sales', { storeId: 'store-siyoma', ...body });
  const sales: Record<string, any> = {};
  sellerWs.events.length = 0; sellerBWs.events.length = 0; adminWs.events.length = 0;
  await step('продажа за наличные: SOLD, касса +сумма, история', async () => {
    const [d] = await sellable();
    const before = await storeCash('store-siyoma');
    sales.cash = ok(await sale({ paymentMethod: 'CASH', items: [{ deviceId: d.id, salePriceTjs: 9500 }], cashAmountTjs: 9500, cardAmountTjs: 0 }));
    assert.equal((await db.device.findUniqueOrThrow({ where: { id: d.id } })).status, 'SOLD');
    assert.equal(money((await storeCash('store-siyoma')).minus(before)), money(D(9500).div(RATE)));
    assert.equal(money(sales.cash.totalUsd), money(D(9500).div(RATE)), 'sale USD snapshot');
    const history = ok(await call(seller, 'GET', `/sales?search=${sales.cash.receiptNumber}`)) as any[];
    assert.equal(history[0]?.id, sales.cash.id);
    await reconciled('store-siyoma');
  });
  await step('продажа приходит по WebSocket своему магазину и админу, но не чужому магазину', async () => {
    await settle();
    assert(sellerWs.events.some((e) => e.type === 'SALE_COMPLETED'), 'own-store seller missed SALE_COMPLETED');
    assert(adminWs.events.some((e) => e.type === 'SALE_COMPLETED'), 'admin missed SALE_COMPLETED');
    assert(!sellerBWs.events.some((e) => e.type === 'SALE_COMPLETED'), 'another store must not get the sale event');
  });
  await step('продажа по карте: cardAmountTjs', async () => {
    const [d] = await sellable();
    sales.card = ok(await sale({ paymentMethod: 'CARD', items: [{ deviceId: d.id, salePriceTjs: 8000 }], cashAmountTjs: 0, cardAmountTjs: 8000 }));
    assert.equal(money(sales.card.cardAmountTjs), '8000.00'); assert.equal(money(sales.card.cashAmountTjs), '0.00');
  });
  await step('смешанная оплата: раздельно наличные и карта', async () => {
    const [d] = await sellable();
    sales.split = ok(await sale({ paymentMethod: 'SPLIT', items: [{ deviceId: d.id, salePriceTjs: 7000 }], cashAmountTjs: 4000, cardAmountTjs: 3000 }));
    assert.equal(money(sales.split.cashAmountTjs), '4000.00'); assert.equal(money(sales.split.cardAmountTjs), '3000.00');
    const wrong = await sale({ paymentMethod: 'SPLIT', items: [{ deviceId: (await sellable())[0].id, salePriceTjs: 7000 }], cashAmountTjs: 1, cardAmountTjs: 1 });
    assert.equal(wrong.status, 400, 'split parts must add up to the total');
  });
  await step('продажа в долг: клиент обязателен, долг растёт, клиент в должниках', async () => {
    const [d] = await sellable();
    const noCustomer = await sale({ paymentMethod: 'DEBT', items: [{ deviceId: d.id, salePriceTjs: 6000 }], cashAmountTjs: 1000, cardAmountTjs: 0, debtAmountTjs: 5000 });
    assert.equal(noCustomer.status, 400, 'a debt sale without a customer must be rejected');
    sales.debt = ok(await sale({ paymentMethod: 'DEBT', items: [{ deviceId: d.id, salePriceTjs: 6000 }], cashAmountTjs: 1000, cardAmountTjs: 0, debtAmountTjs: 5000, customerName: 'Фарид Должник', customerPhone: '+992900000001' }));
    const customer = await db.customer.findFirstOrThrow({ where: { phone: '+992900000001' } });
    assert.equal(money(customer.totalDebtTjs), '5000.00');
    const debtors = ok(await call(admin, 'GET', '/customers?debtorsOnly=true'));
    assert(debtors.items.some((c: any) => c.id === customer.id), 'customer missing from debtors');
  });
  await step('продажа ниже себестоимости помечается и попадает в аудит', async () => {
    const [d] = await sellable();
    sales.below = ok(await sale({ paymentMethod: 'CASH', items: [{ deviceId: d.id, salePriceTjs: 100 }], cashAmountTjs: 100, cardAmountTjs: 0 }));
    const row = await db.sale.findUniqueOrThrow({ where: { id: sales.below.id } });
    assert(row.hasBelowCostItem, 'hasBelowCostItem not set');
    assert(await db.auditLog.findFirst({ where: { action: 'SALE_BELOW_COST', targetId: row.id } }), 'below-cost sale not audited');
  });
  await step('чек: номер, дата, продавец, модель, память, IMEI, сумма; без себестоимости для продавца', async () => {
    const [receipt] = ok(await call(seller, 'GET', `/sales?search=${sales.cash.receiptNumber}`)) as any[];
    assert(receipt.receiptNumber && receipt.createdAt && receipt.user?.name);
    const item = receipt.saleItems[0];
    assert(item.model && item.storage && item.imei && Number(item.salePriceTjs) === 9500);
    assert.equal(Number(item.costBasisUsd), 0, 'seller receipt must not carry cost');
    assert.equal(receipt.recognizedProfitUsd, undefined, 'seller must not see profit');
  });

  // ------------------------------------------------------------------ BLOCK 4
  block = 'Блок 4: обмен и возврат';
  await step('обмен с доплатой клиента: касса растёт, принятый телефон IN_STOCK_AFTER_EXCHANGE', async () => {
    const saleItem = await db.saleItem.findFirstOrThrow({ where: { saleId: sales.cash.id } });
    const [replacement] = await sellable();
    const before = await storeCash('store-siyoma');
    // inValue 9000 ≤ sold price 9500; new phone 11000 → customer pays 2000
    ok(await call(seller, 'POST', '/exchanges', { saleId: sales.cash.id, returnedImei: saleItem.imei, exchangeInValueTjs: 9000, replacementDeviceId: replacement.id, newPriceTjs: 11000, differenceTjs: 2000, paymentMethod: 'CASH', cashAmountTjs: 2000, cardAmountTjs: 0 }));
    assert.equal((await db.device.findUniqueOrThrow({ where: { id: saleItem.deviceId } })).status, 'IN_STOCK_AFTER_EXCHANGE');
    assert.equal((await db.device.findUniqueOrThrow({ where: { id: replacement.id } })).status, 'SOLD');
    // The exchange books USD as newPriceUsd − inValueUsd, each rounded at today's rate.
    assert.equal(money((await storeCash('store-siyoma')).minus(before)), money(D(D(11000).div(RATE).toFixed(2)).minus(D(9000).div(RATE).toFixed(2))));
    await reconciled('store-siyoma');
  });
  await step('обмен с выплатой разницы клиенту: касса уменьшается', async () => {
    const saleItem = await db.saleItem.findFirstOrThrow({ where: { saleId: sales.split.id } });
    const [replacement] = await sellable();
    const before = await storeCash('store-siyoma');
    // inValue 7000, new phone 5000 → shop pays out 2000
    ok(await call(seller, 'POST', '/exchanges', { saleId: sales.split.id, returnedImei: saleItem.imei, exchangeInValueTjs: 7000, replacementDeviceId: replacement.id, newPriceTjs: 5000, differenceTjs: -2000, paymentMethod: 'CASH', cashAmountTjs: -2000, cardAmountTjs: 0 }));
    assert.equal(money(before.minus(await storeCash('store-siyoma'))), money(D(D(7000).div(RATE).toFixed(2)).minus(D(5000).div(RATE).toFixed(2))));
    await reconciled('store-siyoma');
  });
  await step('продавец не может обменять чек чужого магазина', async () => {
    const saleItem = await db.saleItem.findFirstOrThrow({ where: { saleId: sales.card.id } });
    const r = await call(sellerB, 'POST', '/exchanges', { saleId: sales.card.id, returnedImei: saleItem.imei, exchangeInValueTjs: 1, replacementDeviceId: 'x', newPriceTjs: 1, differenceTjs: 0 });
    assert.equal(r.status, 403);
  });
  await step('возврат: телефон в STORE_STOCK, касса −сумма, чек REFUNDED', async () => {
    const before = await storeCash('store-siyoma');
    const saleItem = await db.saleItem.findFirstOrThrow({ where: { saleId: sales.below.id } });
    ok(await call(partner, 'POST', `/sales/${sales.below.id}/refund`, { reason: 'Брак', refundAmountTjs: 100, penaltyFeeTjs: 0, paymentMethod: 'CASH' }));
    assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sales.below.id } })).status, 'REFUNDED');
    assert.equal((await db.device.findUniqueOrThrow({ where: { id: saleItem.deviceId } })).status, 'STORE_STOCK');
    assert.equal(money(before.minus(await storeCash('store-siyoma'))), money(D(100).div(RATE)));
    await reconciled('store-siyoma');
  });
  await step('штраф больше оплаченной суммы отклоняется', async () => {
    const r = await call(partner, 'POST', `/sales/${sales.card.id}/refund`, { reason: 'x', refundAmountTjs: 0, penaltyFeeTjs: 999999, paymentMethod: 'CASH' });
    assert.equal(r.status, 400, JSON.stringify(r));
  });
  await step('продавец не может оформить возврат', async () => {
    assert.equal((await call(seller, 'POST', `/sales/${sales.card.id}/refund`, { reason: 'x', refundAmountTjs: 1, paymentMethod: 'CASH' })).status, 403);
  });

  // ------------------------------------------------------------------ BLOCK 10
  block = 'Блок 10: клиенты';
  await step('база клиентов только в Центральной кассе; на кассе — короткий поиск для продажи в долг', async () => {
    assert.equal((await call(seller, 'GET', '/customers')).status, 403);
    assert.equal((await call(partner, 'GET', '/customers?debtorsOnly=true')).status, 403);
    const anyCustomer = await db.customer.findFirstOrThrow();
    assert.equal((await call(seller, 'GET', `/customers/${anyCustomer.id}`)).status, 403);
    assert.equal((await call(seller, 'PATCH', `/customers/${anyCustomer.id}`, { name: 'X' })).status, 403);
    const lookup = ok(await call(seller, 'GET', '/customers?search=900000001'));
    assert.deepEqual(Object.keys(lookup.items[0]).sort(), ['id', 'name', 'phone', 'totalDebtTjs']);
    ok(await call(admin, 'GET', '/customers'));
  });
  await step('поиск клиента по имени и по телефону', async () => {
    const byName = ok(await call(seller, 'GET', `/customers?search=${encodeURIComponent('Фарид')}`));
    const byPhone = ok(await call(seller, 'GET', '/customers?search=900000001'));
    assert(byName.items.length === 1 && byPhone.items.length === 1);
    assert.equal(byName.items[0].pushSubscription, undefined, 'push subscription must not be exposed');
  });
  await step('погашение долга: долг меньше, касса больше, долг чека уменьшен; переплата отклоняется', async () => {
    const customer = await db.customer.findFirstOrThrow({ where: { phone: '+992900000001' } });
    assert.equal((await call(seller, 'POST', `/customers/${customer.id}/payments`, { amountTjs: 999999 })).status, 400, 'overpayment must be rejected');
    const before = await storeCash('store-siyoma');
    ok(await call(seller, 'POST', `/customers/${customer.id}/payments`, { amountTjs: 2000, storeId: storeB.id }));
    const after = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(money(after.totalDebtTjs), '3000.00');
    assert.equal(money((await storeCash('store-siyoma')).minus(before)), money(D(2000).div(RATE)), 'payment goes to the seller store, whatever storeId the client sends');
    assert.equal(money((await db.sale.findUniqueOrThrow({ where: { id: sales.debt.id } })).debtAmountTjs), '3000.00');
    await reconciled('store-siyoma');
  });

  // ------------------------------------------------------------------ BLOCK 8
  block = 'Блок 8: расходы и зарплаты';
  await step('расход магазина из кассы точки', async () => {
    const before = await storeCash('store-siyoma');
    ok(await call(admin, 'POST', '/expenses', { category: 'RENT', amountTjs: 950, storeId: 'store-siyoma', targetType: 'STORE', paidFromCashRegister: true, comment: 'Аренда' }));
    assert.equal(money(before.minus(await storeCash('store-siyoma'))), money(D(950).div(RATE)));
    await reconciled('store-siyoma');
  });
  await step('расход бизнеса из Центральной кассы', async () => {
    const before = await storeCash('main-warehouse');
    const siyoma = await storeCash('store-siyoma');
    ok(await call(admin, 'POST', '/expenses', { category: 'MARKETING', amountTjs: 1900, targetType: 'BUSINESS', paidFromCashRegister: true, comment: 'Реклама' }));
    assert.equal(money(before.minus(await storeCash('main-warehouse'))), money(D(1900).div(RATE)));
    assert.equal(money(await storeCash('store-siyoma')), money(siyoma));
    await reconciled('main-warehouse');
  });
  await step('партнёр: расход своего магазина создаётся неоплаченным, касса не меняется', async () => {
    const before = await storeCash('store-siyoma');
    const e = ok(await call(partner, 'POST', '/expenses', { category: 'SUPPLIES', amountTjs: 200, storeId: storeB.id, paidFromCashRegister: true }));
    assert.equal(e.storeId, 'store-siyoma', 'partner expense is pinned to the partner store');
    assert.equal(e.status, 'UNPAID');
    assert.equal(money(await storeCash('store-siyoma')), money(before));
  });
  await step('аванс, затем зарплата за месяц: аванс удерживается', async () => {
    const month = new Date().toISOString().slice(0, 7);
    ok(await call(admin, 'POST', '/expenses', { category: 'EMPLOYEE_ADVANCE', amountTjs: 500, employeeId: 'user-ahmad', isEmployeeAdvance: true, payrollMonth: month, storeId: 'store-siyoma', paidFromCashRegister: true }));
    const summary = ok(await call(admin, 'GET', `/payroll/user-ahmad?month=${month}`));
    assert.equal(money(summary.paidAdvancesTjs), '500.00');
    const payout = ok(await call(admin, 'POST', '/payroll/user-ahmad/payout', { month, grossTjs: 3000 }));
    assert.equal(money(payout.amountTjs), '2500.00', 'payout = gross − advance');
    await reconciled('main-warehouse');
  });

  // ------------------------------------------------------------------ BLOCK 9
  block = 'Блок 9: ремонт';
  let ticket: any;
  await step('приём в ремонт: квитанция; предоплата не принимается', async () => {
    const withPrepay = await call(seller, 'POST', '/repairs', { imei: imeis[0], brand: 'Apple', model: 'iPhone 15', problemDescription: 'Не заряжается', customerName: 'Иван', customerPhone: '+992900000002', prepaymentTjs: 100 });
    assert.equal(withPrepay.status, 400);
    ticket = ok(await call(seller, 'POST', '/repairs', { imei: imeis[0], brand: 'Apple', model: 'iPhone 15', problemDescription: 'Не заряжается', customerName: 'Иван', customerPhone: '+992900000002' }));
    assert(ticket.ticketNumber, 'ticket number missing');
    assert.equal(ticket.storeId, 'store-siyoma');
  });
  await step('статусы Принят → В работе → Готов → Выдан; запчасти — расход магазина из Центральной кассы', async () => {
    ok(await call(seller, 'PATCH', `/repairs/${ticket.id}/status`, { status: 'IN_PROGRESS' }));
    ok(await call(seller, 'PATCH', `/repairs/${ticket.id}/status`, { status: 'READY' }));
    const storeBefore = await storeCash('store-siyoma');
    const centralBefore = await storeCash('main-warehouse');
    ok(await call(seller, 'PATCH', `/repairs/${ticket.id}/status`, { status: 'ISSUED', finalCostTjs: 380 }));
    assert.equal(money(await storeCash('store-siyoma')), money(storeBefore), 'the store register must not pay for repairs');
    assert.equal(money(centralBefore.minus(await storeCash('main-warehouse'))), money(D(380).div(RATE)), 'Central Cash pays for the repair');
    const expense = await db.expense.findFirstOrThrow({ where: { category: 'REPAIR_PARTS' }, orderBy: { createdAt: 'desc' } });
    assert.equal(expense.storeId, 'store-siyoma', 'the repair expense is charged to the store');
    await reconciled('main-warehouse'); await reconciled('store-siyoma');
  });
  await step('чужой магазин не видит и не меняет ремонт', async () => {
    const list = ok(await call(sellerB, 'GET', '/repairs')) as any[];
    assert(!list.some((t) => t.id === ticket.id));
    assert.equal((await call(sellerB, 'PATCH', `/repairs/${ticket.id}/status`, { status: 'IN_PROGRESS' })).status, 403);
  });

  // ------------------------------------------------------------------ BLOCK 7
  block = 'Блок 7: касса, закрытие дня, инкассация';
  await step('касса точки: выручка за день с разделением наличные/банк', async () => {
    const summary = ok(await call(seller, 'GET', '/daily-closings/summary'));
    // cash: 9500 + 4000(split) + 1000(debt down) + 100(below, refunded same day) − 100 refund
    //       + exchanges 2000 − 2000 + customer payment 2000 − rent 950
    assert.equal(money(summary.salesCardTjs), '11000.00', 'card = 8000 + 3000');
    assert.equal(money(summary.salesCashTjs), '14600.00', 'cash sales incl. exchanges');
    assert.equal(money(summary.otherCashTjs), '2000.00', 'customer debt repayment');
    assert.equal(money(summary.expensesCashTjs), '950.00', 'only expenses paid from this register');
    assert.equal(money(summary.refundsCashTjs), '100.00');
  });
  await step('закрытие смены продавцом — подтверждение факта: наличные и банк в отчёте', async () => {
    const summary = ok(await call(seller, 'GET', '/daily-closings/summary'));
    const closing = ok(await call(seller, 'POST', '/daily-closings', {}));
    assert.equal(money(closing.actualCashTjs), money(summary.expectedCashTjs));
    assert.equal(money(closing.differenceTjs), '0.00');
    assert.equal(money(closing.salesCardTjs), '11000.00');
    const again = await call(seller, 'POST', '/daily-closings', {});
    assert.equal(again.status, 409, 'a day closes once');
    const list = ok(await call(partner, 'GET', '/daily-closings')) as any[];
    assert(list.every((c) => c.storeId === 'store-siyoma'));
  });
  await step('инкассация: касса магазина в Центральную кассу (только админ)', async () => {
    const storeBefore = await storeCash('store-siyoma');
    const centralBefore = await storeCash('main-warehouse');
    assert.equal((await call(partner, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: storeBefore.toString() })).status, 403);
    ok(await call(admin, 'POST', '/cash-collections', { storeId: 'store-siyoma', expectedCashUsd: storeBefore.toString() }));
    assert.equal(money(await storeCash('store-siyoma')), '0.00');
    assert.equal(money((await storeCash('main-warehouse')).minus(centralBefore)), money(storeBefore));
    await reconciled('store-siyoma'); await reconciled('main-warehouse');
  });

  // ------------------------------------------------------------------ BLOCK 11
  block = 'Блок 11: партнёры и капитал';
  await step('доли партнёров по магазину задаются админом; админ получает остаток', async () => {
    ok(await call(admin, 'PUT', '/stores/store-siyoma/profit-shares', { shares: [{ ownerId: 'owner-partner', sharePercent: 40 }] }));
    const shares = ok(await call(admin, 'GET', '/store-profit-shares')) as any[];
    assert(shares.some((s) => s.storeId === 'store-siyoma' && s.ownerId === 'owner-partner' && Number(s.sharePercent) === 40));
  });
  await step('ввод и частичный вывод капитала партнёром (своя касса или Центральная)', async () => {
    const owner = () => db.owner.findUniqueOrThrow({ where: { id: 'owner-partner' } });
    const before = D((await owner()).capitalBalanceUsd);
    ok(await call(partner, 'POST', '/owners/owner-partner/investment', { amountUsd: 1000 }));
    ok(await call(partner, 'POST', '/owners/owner-partner/withdrawal', { amountUsd: 400 }));
    assert.equal(money(D((await owner()).capitalBalanceUsd).minus(before)), '600.00');
    assert.equal((await call(partner, 'POST', '/owners/owner-admin/withdrawal', { amountUsd: 1 })).status, 403, 'not another owner');
    assert.equal((await call(partner, 'POST', '/owners/owner-partner/withdrawal', { amountUsd: 1, source: storeB.id })).status, 403, 'not another store');
    await reconciled('main-warehouse');
  });
  await step('квартальное закрытие: прибыль переносится в капитал', async () => {
    const owners = await db.owner.findMany();
    const res = await call(admin, 'POST', '/owners/quarter-close', { quarterName: 'Q4 2026', transferRemainingToCapital: true });
    ok(res);
    for (const o of owners) {
      const after = await db.owner.findUniqueOrThrow({ where: { id: o.id } });
      assert.equal(money(after.availableProfitUsd), '0.00', `${o.name}: profit left after close`);
      assert.equal(money(D(after.capitalBalanceUsd).minus(o.capitalBalanceUsd)), money(o.availableProfitUsd), `${o.name}: capital must grow by the profit`);
    }
    assert(await db.quarterClosure.findFirst({ where: { quarterName: 'Q4 2026' } }));
  });

  // ------------------------------------------------------------------ cross-cutting
  block = 'Сквозные проверки';
  await step('все кассы сходятся с главной книгой', async () => {
    for (const s of await db.store.findMany()) await reconciled(s.id);
  });
  await step('ни одна касса не ушла в минус', async () => {
    for (const s of await db.store.findMany()) assert(D(s.cashBalanceUsd).gte(0), `${s.name}: negative register`);
  });
  await step('logout отзывает сессию и закрывает WebSocket', async () => {
    const closed = new Promise<number>((resolve) => sellerWs.socket.once('close', (code) => resolve(code)));
    ok(await call(seller, 'POST', '/auth/logout'));
    assert.equal(await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(-1), 2000))]), 1008);
    assert.equal((await call(seller, 'GET', '/devices')).status, 401);
  });

  for (const ws of [adminWs, sellerBWs]) ws.socket.close();
} finally {
  server?.close();
  await disconnect?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSYSTEM AUDIT: ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log(`  ✗ [${f.block}] ${f.name}: ${f.error?.split('\n')[0]}`);
  process.exitCode = failed.length ? 1 : 0;
}
