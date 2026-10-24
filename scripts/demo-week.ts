import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { D } from '../server/src/common/decimal';
import { app } from '../server/src/app';
import { prisma } from '../server/src/prisma/prisma.service';
import { AuthService } from '../server/src/auth/auth.service';
import { getBusinessDateKey } from '../server/src/common/business-date';
import { buildComprehensiveReportWorkbook, type ComprehensiveReportSummary } from '../src/utils/exportReports';
import { mapExpense } from '../src/api/mappers';

/**
 * A week of business on an emptied local database, through the real API: purchases on credit from
 * three suppliers, deliveries to two stores, 10 sales on the first day and 13 on the second, then
 * returns and exchanges of earlier days' receipts on later days, debt sales and repayments, a
 * restock — each day at its own exchange rate. «Сиёма» closes its shift every evening; «ЦУМ» runs
 * the whole week without a closing. Operations happen now and are then moved to their day (every
 * timestamp written that day), so the app sees a real week. Ends with a per-day check of the
 * report, the shifts, the owners' split, the Excel workbook and the owner balances audit.
 *
 *   npm run demo:week      (needs an empty database: npm run db:reset-operations:apply first)
 */
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Только для локальной базы');
if ((await prisma.device.count()) + (await prisma.sale.count()) > 0) {
  console.error('В базе уже есть товары или продажи. Сначала: npm run db:reset-operations:apply');
  process.exit(1);
}

const fail = (message: string): never => { throw new Error(message); };
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
type Res = { status: number; data: any };
const call = async (token: string, method: string, route: string, body?: unknown): Promise<any> => {
  const r = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const res: Res = { status: r.status, data: await r.json().catch(() => null) };
  return res.status < 300 ? res.data : fail(`${method} ${route}: ${res.status} ${JSON.stringify(res.data)}`);
};
const tokens: string[] = [];
const tokenFor = async (where: { role: 'ADMIN' | 'PARTNER' | 'SELLER'; storeId?: string }) => {
  const user = await prisma.user.findFirstOrThrow({ where: { ...where, active: true }, orderBy: { createdAt: 'asc' } });
  const token = await AuthService.createSession({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId }, user.password);
  tokens.push(token);
  return token;
};

// ------------------------------------------------------------------ the week
const RATES = [10.9, 10.95, 10.85, 11.0, 10.92, 11.05, 10.98];
const DAYS = RATES.length;
const offsetOf = (day: number) => DAYS - 1 - day; // days before today
const dayKey = (day: number) => getBusinessDateKey(new Date(Date.now() - offsetOf(day) * 86_400_000));
const SALES_PER_DAY = [10, 13, 5, 6, 7, 8, 6];

/**
 * Moves everything written since `since` to `day`: every timestamp column of the business tables
 * goes back by the day's offset (past days also land around midday). Reference tables, sessions
 * and the rate table (keyed by date) stay as they are.
 */
const KEEP_TIME = new Set(['users', 'stores', 'owners', 'store_profit_shares', 'auth_sessions', 'push_subscriptions', 'phone_catalog', '_prisma_migrations', 'exchange_rates', 'operation_requests', 'financial_accounts']);
const timeColumns = (await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND data_type IN ('timestamp without time zone', 'timestamp with time zone')`))
  .filter((c) => !KEEP_TIME.has(c.table_name));
const dbNow = async () => (await prisma.$queryRawUnsafe<{ now: Date }[]>(`SELECT (now() AT TIME ZONE 'UTC') - interval '2 seconds' AS now`))[0].now;
const middayShift = (() => {
  // Tashkent hour now; past days are moved to about 11:00 of their day.
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return 11 - hour;
})();
async function moveToDay(day: number, since: Date) {
  const offset = offsetOf(day);
  if (offset === 0) return;
  const hours = offset * 24 - middayShift;
  for (const { table_name: t, column_name: c } of timeColumns) {
    await prisma.$executeRawUnsafe(`UPDATE "${t}" SET "${c}" = "${c}" - interval '${hours} hours' WHERE "${c}" >= $1`, since);
  }
}

// ------------------------------------------------------------------ catalog of the week
interface Model { key: string; brand: string; model: string; ram: string; storage: string; color: string; costUsd: number; priceTjs: number; category?: 'TABLET'; supplier: number; qty: number }
const MODELS: Model[] = [
  { key: 'ip15', brand: 'Apple', model: 'iPhone 15', ram: '6GB', storage: '128GB', color: 'Black', costUsd: 640, priceTjs: 7600, supplier: 0, qty: 10 },
  { key: 'ip15p', brand: 'Apple', model: 'iPhone 15 Pro', ram: '8GB', storage: '256GB', color: 'Natural Titanium', costUsd: 900, priceTjs: 10800, supplier: 0, qty: 6 },
  { key: 's24', brand: 'Samsung', model: 'Galaxy S24', ram: '8GB', storage: '256GB', color: 'Onyx Black', costUsd: 560, priceTjs: 6700, supplier: 0, qty: 10 },
  { key: 'a55', brand: 'Samsung', model: 'Galaxy A55', ram: '8GB', storage: '256GB', color: 'Awesome Navy', costUsd: 330, priceTjs: 4000, supplier: 1, qty: 12 },
  { key: 'rn13', brand: 'Xiaomi', model: 'Redmi Note 13', ram: '8GB', storage: '256GB', color: 'Midnight Black', costUsd: 185, priceTjs: 2300, supplier: 1, qty: 16 },
  { key: 'x6p', brand: 'Poco', model: 'X6 Pro', ram: '12GB', storage: '512GB', color: 'Yellow', costUsd: 260, priceTjs: 3200, supplier: 1, qty: 10 },
  { key: 'x8b', brand: 'Honor', model: 'X8b', ram: '8GB', storage: '256GB', color: 'Titanium Silver', costUsd: 170, priceTjs: 2100, supplier: 1, qty: 12 },
  { key: 'sp20', brand: 'Tecno', model: 'Spark 20', ram: '8GB', storage: '256GB', color: 'Gravity Black', costUsd: 120, priceTjs: 1550, supplier: 1, qty: 12 },
  { key: 'taba9', brand: 'Samsung', model: 'Galaxy Tab A9', ram: '4GB', storage: '64GB', color: 'Graphite', costUsd: 150, priceTjs: 1900, supplier: 1, qty: 6, category: 'TABLET' },
];
const ACCESSORIES = [
  { barcode: 'CASE-UNI-01', brand: 'Generic', name: 'Чехол силиконовый', category: 'Чехлы', costUsd: 1.5, priceTjs: 40, qty: 60 },
  { barcode: 'CHG-20W-01', brand: 'Baseus', name: 'Зарядка 20W', category: 'Зарядки', costUsd: 4, priceTjs: 90, qty: 30 },
  { barcode: 'EAR-TWS-01', brand: 'Xiaomi', name: 'Наушники Redmi Buds', category: 'Наушники', costUsd: 9, priceTjs: 180, qty: 20 },
  { barcode: 'GLASS-9H-01', brand: 'Generic', name: 'Защитное стекло', category: 'Стёкла', costUsd: 0.6, priceTjs: 25, qty: 100 },
];
let serial = 0;
const codeFor = (m: Model, index: number) => m.category === 'TABLET'
  ? `R9TW${String(index).padStart(2, '0')}${String(++serial).padStart(6, '0')}`
  : `35${String(MODELS.indexOf(m)).padStart(2, '0')}4000${String(++serial).padStart(7, '0')}`;
const group = (m: Model, qty: number) => ({
  ...(m.category ? { category: m.category } : {}),
  brand: m.brand, model: m.model, ram: m.ram, storage: m.storage, color: m.color, purchasePriceUsd: m.costUsd,
  items: Array.from({ length: qty }, (_, i) => ({ imei: codeFor(m, i) })),
});
// A tiny deterministic random, so every run builds the same week.
let seed = 20261018;
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

try {
  const stores = await prisma.store.findMany({ where: { active: true } });
  const central = stores.find((s) => s.isMainWarehouse) ?? fail('Нет главного склада');
  const siyoma = stores.find((s) => s.id === 'store-siyoma') ?? fail('Нет магазина Сиёма');
  const tsum = stores.find((s) => s.id === 'store-tsum') ?? fail('Нет магазина ЦУМ');
  const SHOPS = [siyoma, tsum];
  const CLOSES = new Set([siyoma.id]);
  const admin = await tokenFor({ role: 'ADMIN' });
  const seller = Object.fromEntries(await Promise.all(SHOPS.map(async (s) => [s.id, await tokenFor({ role: 'SELLER', storeId: s.id })])));
  const partner = Object.fromEntries(await Promise.all(SHOPS.map(async (s) => [s.id, await tokenFor({ role: 'PARTNER', storeId: s.id })])));
  const owners0 = Object.fromEntries((await prisma.owner.findMany()).map((o) => [o.id, D(o.totalAccruedProfitUsd)]));

  type Sold = { sale: any; storeId: string; day: number; phone?: Model; priceTjs: number; method: string };
  const sold: Sold[] = [];
  const stock = new Map<string, Map<string, string[]>>(); // store → model key → device ids
  const accessoryIds = new Map<string, string>();
  const log: string[] = [];
  const note = (day: number, text: string) => log.push(`${dayKey(day)}  ${text}`);

  const loadStock = async () => {
    for (const shop of SHOPS) {
      const byModel = new Map<string, string[]>();
      const devices = await prisma.device.findMany({ where: { storeId: shop.id, status: 'STORE_STOCK' }, orderBy: { imei: 'asc' } });
      const used = new Set(sold.flatMap((s) => (s.sale.saleItems ?? []).map((i: any) => i.deviceId)));
      for (const d of devices) {
        const m = MODELS.find((x) => x.model === d.model && x.brand === d.brand);
        if (!m || used.has(d.id)) continue;
        byModel.set(m.key, [...(byModel.get(m.key) ?? []), d.id]);
      }
      stock.set(shop.id, byModel);
    }
  };
  const take = (storeId: string, filter: (m: Model) => boolean = () => true) => {
    const options = MODELS.filter((m) => filter(m) && (stock.get(storeId)!.get(m.key)?.length ?? 0) > 0);
    if (!options.length) return null;
    const m = options[Math.floor(random() * options.length)];
    return { model: m, deviceId: stock.get(storeId)!.get(m.key)!.shift()! };
  };

  // ---------------------------------------------------------------- day by day
  for (let day = 0; day < DAYS; day++) {
    const since = await dbNow();
    await call(admin, 'POST', '/exchange-rate/today', { rate: RATES[day] });
    const rate = RATES[day];

    if (day === 0) {
      const suppliers = await Promise.all(['Dubai Mobile', 'China Tech', 'Аксессуар Сервис'].map((name, i) =>
        call(admin, 'POST', '/suppliers', { name, phone: ['+971 4 555 0101', '+86 20 8888 9999', '+992 93 555 7788'][i] })));
      const invoices = [
        { supplier: 0, number: 'DXB-1018', groups: MODELS.filter((m) => m.supplier === 0).map((m) => group(m, m.qty)) },
        { supplier: 1, number: 'CHN-1018', groups: MODELS.filter((m) => m.supplier === 1).map((m) => group(m, m.qty)) },
        {
          supplier: 2, number: 'ACC-1018', groups: ACCESSORIES.map((a) => ({
            category: 'ACCESSORY', barcode: a.barcode, brand: a.brand, name: a.name, accessoryCategory: a.category, quantity: a.qty, purchasePriceUsd: a.costUsd,
          })),
        },
      ];
      for (const inv of invoices) {
        const r = await call(admin, 'POST', '/purchases', { supplierId: suppliers[inv.supplier].id, invoiceNumber: inv.number, paidAmountUsd: 0, groups: inv.groups });
        note(day, `Приход ${inv.number} от «${suppliers[inv.supplier].name}» на $${r.invoice.totalAmountUsd} — полностью в долг`);
      }
      for (const a of ACCESSORIES) accessoryIds.set(a.barcode, (await prisma.accessoryProduct.findUniqueOrThrow({ where: { barcode: a.barcode } })).id);
      // Half of every model to each store; accessories split too.
      const devices = await prisma.device.findMany({ where: { storeId: central.id }, orderBy: { imei: 'asc' } });
      for (const [index, shop] of SHOPS.entries()) {
        const mine = MODELS.flatMap((m) => {
          const all = devices.filter((d) => d.model === m.model);
          return all.slice(index * Math.floor(all.length / 2), (index + 1) * Math.floor(all.length / 2)).map((d) => d.id);
        });
        await call(admin, 'POST', '/transfers', {
          fromStoreId: central.id, toStoreId: shop.id, deviceIds: mine,
          accessories: ACCESSORIES.map((a) => ({ productId: accessoryIds.get(a.barcode), quantity: Math.floor(a.qty / 2) })),
        });
        note(day, `Перемещение на ${shop.name}: ${mine.length} устр. и аксессуары`);
      }
    }
    if (day === 3) {
      // Restock from China Tech, on credit too, straight on to both stores.
      const supplier = await prisma.supplier.findFirstOrThrow({ where: { name: 'China Tech' } });
      const restock = MODELS.filter((m) => ['rn13', 'sp20'].includes(m.key));
      const r = await call(admin, 'POST', '/purchases', { supplierId: supplier.id, invoiceNumber: 'CHN-1021', paidAmountUsd: 0, groups: restock.map((m) => group(m, 6)) });
      note(day, `Дозаказ CHN-1021 от «China Tech» на $${r.invoice.totalAmountUsd} — в долг`);
      const fresh = await prisma.device.findMany({ where: { purchaseInvoiceId: r.invoice.id }, orderBy: { imei: 'asc' } });
      for (const [index, shop] of SHOPS.entries()) {
        const mine = fresh.filter((_, i) => i % 2 === index).map((d) => d.id);
        await call(admin, 'POST', '/transfers', { fromStoreId: central.id, toStoreId: shop.id, deviceIds: mine });
      }
    }
    await loadStock();

    for (const shop of SHOPS) {
      const sellerToken = seller[shop.id];
      const partnerToken = partner[shop.id];
      const sell = async (body: Record<string, unknown>, phone?: Model, priceTjs = 0, method = String(body.paymentMethod)) => {
        const sale = await call(sellerToken, 'POST', '/sales', { storeId: shop.id, customerName: 'Покупатель', ...body });
        sold.push({ sale, storeId: shop.id, day, phone, priceTjs, method });
        return sale;
      };
      const earlier = (fromDay: number, pick: (s: Sold) => boolean) =>
        sold.find((s) => s.storeId === shop.id && s.day === fromDay && s.phone && s.sale.status !== 'REFUNDED' && !s.sale._touched && pick(s)) ?? fail(`Нет подходящей продажи дня ${fromDay + 1}`);

      // The day's sales: mostly phones (some with accessories), some accessories only; cash, card, split, debt.
      for (let i = 0; i < SALES_PER_DAY[day]; i++) {
        const accessoriesOnly = i % 5 === 4;
        const lines = i % 3 === 0 || accessoriesOnly
          ? [ACCESSORIES[0], ACCESSORIES[3], ...(accessoriesOnly ? [ACCESSORIES[i % 2 === 0 ? 1 : 2]] : [])].map((a) => ({ productId: accessoryIds.get(a.barcode), quantity: 1, unitPriceTjs: a.priceTjs }))
          : [];
        const phone = accessoriesOnly ? null : take(shop.id);
        const phonePrice = phone ? phone.model.priceTjs + [0, -100, 100, -50][i % 4] : 0;
        const total = phonePrice + lines.reduce((s, l) => s + l.unitPriceTjs, 0);
        const method = (day === 0 || day === 2) && i === 6 ? 'DEBT' : i % 7 === 3 ? 'CARD' : i % 7 === 5 ? 'SPLIT' : 'CASH';
        const body: Record<string, unknown> = {
          ...(phone ? { items: [{ deviceId: phone.deviceId, salePriceTjs: phonePrice }] } : {}),
          ...(lines.length ? { accessories: lines } : {}),
          paymentMethod: method,
        };
        if (method === 'SPLIT') Object.assign(body, { cashAmountTjs: Math.round(total / 2), cardAmountTjs: total - Math.round(total / 2) });
        if (method === 'DEBT') {
          const customer = await call(admin, 'POST', '/customers', { name: `Клиент в долг ${shop.name.replace(/.*«|».*/g, '')} ${day + 1}`, phone: `+99290${shop.id === siyoma.id ? 1 : 2}00${day}${i}0` });
          Object.assign(body, { cashAmountTjs: 1000, customerId: customer.id, customerName: customer.name });
        }
        await sell(body, phone?.model, phonePrice, method);
      }
      note(day, `${shop.name}: ${SALES_PER_DAY[day]} продаж по курсу ${rate}`);

      // Returns and exchanges of earlier days' receipts, at today's rate.
      const exchange = async (from: Sold, dearer: boolean, paymentMethod = 'CASH', label = '') => {
        const replacement = take(shop.id, (m) => (dearer ? m.priceTjs > from.phone!.priceTjs : m.priceTjs < from.phone!.priceTjs)) ?? fail('Нет телефона для обмена');
        const item = from.sale.saleItems[0];
        const r = await call(sellerToken, 'POST', '/exchanges', {
          saleId: from.sale.id, saleItemId: item.id, withheldTjs: 0, replacementDeviceId: replacement.deviceId,
          newPriceTjs: replacement.model.priceTjs, paymentMethod, reason: dearer ? 'Клиент захотел модель дороже' : 'Клиент захотел модель дешевле',
        });
        from.sale._touched = true;
        sold.push({ sale: r.sale, storeId: shop.id, day, phone: replacement.model, priceTjs: replacement.model.priceTjs, method: paymentMethod });
        const diff = replacement.model.priceTjs - from.priceTjs;
        note(day, `${shop.name}: обмен чека #${from.sale.receiptNumber} (${dayKey(from.day)}, ${from.phone!.model} ${from.priceTjs} TJS) на ${replacement.model.model} ${replacement.model.priceTjs} TJS → чек #${r.sale.receiptNumber}; ${diff > 0 ? `доплата ${diff} TJS${label}` : `выдано клиенту ${-diff} TJS`}`);
      };
      const returnPhone = async (from: Sold, withheldTjs: number) => {
        await call(partnerToken, 'POST', `/sales/${from.sale.id}/return-items`, {
          items: [{ saleItemId: from.sale.saleItems[0].id, withheldTjs }], accessories: [], reason: 'Клиент вернул телефон', paymentMethod: 'CASH',
        });
        from.sale._touched = true;
        note(day, `${shop.name}: возврат телефона по чеку #${from.sale.receiptNumber} (${dayKey(from.day)}, ${from.priceTjs} TJS)${withheldTjs ? `, удержано ${withheldTjs} TJS` : ''}`);
      };
      const cashPhone = (s: Sold) => s.method === 'CASH' && !(s.sale.accessoryItems ?? []).length;

      if (day === 1) {
        await returnPhone(earlier(0, cashPhone), 100);
        await exchange(earlier(0, (s) => cashPhone(s) && s.phone!.priceTjs < 10800), true);
      }
      if (day === 2) {
        await exchange(earlier(1, (s) => cashPhone(s) && s.phone!.priceTjs > 1550), false);
        const debtor = sold.find((s) => s.storeId === shop.id && s.method === 'DEBT')!;
        await call(sellerToken, 'POST', `/customers/${debtor.sale.customerId}/payments`, { amountTjs: 500, storeId: shop.id });
        note(day, `${shop.name}: погашение долга 500 TJS по чеку #${debtor.sale.receiptNumber}`);
      }
      if (day === 3) {
        const withCase = sold.find((s) => s.storeId === shop.id && s.day === 0 && (s.sale.accessoryItems ?? []).length)!;
        const line = withCase.sale.accessoryItems[0];
        await call(partnerToken, 'POST', `/sales/${withCase.sale.id}/return-items`, { items: [], accessories: [{ lineId: line.id, quantity: 1, withheldTjs: 0 }], reason: 'Не подошёл чехол', paymentMethod: 'CASH' });
        note(day, `${shop.name}: возврат аксессуара по чеку #${withCase.sale.receiptNumber} (${dayKey(0)})`);
        await returnPhone(earlier(2, cashPhone), 0);
      }
      if (day === 4) await exchange(earlier(0, (s) => cashPhone(s) && s.phone!.priceTjs < 10800), true, 'CARD', ' картой');
      if (day === 5) {
        const target = sold.find((s) => s.storeId === shop.id && s.day === 4 && s.phone && s.method === 'CASH' && !(s.sale.accessoryItems ?? []).length && !s.sale._touched)!;
        await call(partnerToken, 'POST', `/sales/${target.sale.id}/refund`, { reason: 'Возврат всего чека', refundAmountTjs: target.priceTjs - 50, penaltyFeeTjs: 50, paymentMethod: 'CASH' });
        target.sale._touched = true;
        note(day, `${shop.name}: возврат всего чека #${target.sale.receiptNumber} (${dayKey(4)}, ${target.priceTjs} TJS), удержано 50 TJS`);
        for (const debtor of sold.filter((s) => s.storeId === shop.id && s.method === 'DEBT')) {
          const left = Number((await prisma.sale.findUniqueOrThrow({ where: { id: debtor.sale.id } })).debtAmountTjs ?? 0);
          if (left > 0) {
            await call(sellerToken, 'POST', `/customers/${debtor.sale.customerId}/payments`, { amountTjs: left, storeId: shop.id });
            note(day, `${shop.name}: долг по чеку #${debtor.sale.receiptNumber} погашен полностью (${left} TJS)`);
          }
        }
      }
      if (day === 6) {
        await exchange(earlier(5, (s) => cashPhone(s) && s.phone!.priceTjs > 1550), false);
        await returnPhone(earlier(1, cashPhone), 200);
      }
    }

    await moveToDay(day, since);
    if (offsetOf(day) > 0) {
      await prisma.exchangeRate.upsert({ where: { date: dayKey(day) }, update: { rate: D(rate) }, create: { date: dayKey(day), rate: D(rate), createdByUserId: 'user-admin' } });
      for (const shop of SHOPS.filter((s) => CLOSES.has(s.id))) {
        const closingSince = await dbNow();
        const shift = await call(partner[shop.id], 'GET', `/daily-closings/summary?storeId=${shop.id}&businessDate=${dayKey(day)}`);
        await call(partner[shop.id], 'POST', '/daily-closings', { storeId: shop.id, businessDate: dayKey(day), actualCashTjs: shift.expectedCashTjs });
        await moveToDay(day, closingSince);
        note(day, `${shop.name}: смена закрыта, в кассе за день ${shift.expectedCashTjs} TJS`);
      }
    }
  }

  // ---------------------------------------------------------------- the check
  console.log('\nЧТО ПРОИЗОШЛО ЗА НЕДЕЛЮ\n' + log.join('\n'));
  const week = `startDate=${dayKey(0)}&endDate=${dayKey(DAYS - 1)}`;
  const problems: string[] = [];
  const check = (okay: boolean, what: string) => { if (!okay) problems.push(what); };
  for (const shop of SHOPS) {
    console.log(`\n${shop.name} (${CLOSES.has(shop.id) ? 'смена закрывается каждый день' : 'без закрытия смены'})`);
    console.log('  дата        курс   продаж  выручка $  себест. $  прибыль $  удерж. $  касса дня TJS  смена');
    for (let day = 0; day < DAYS; day++) {
      const r = await call(admin, 'GET', `/reports/summary?startDate=${dayKey(day)}&endDate=${dayKey(day)}&storeId=${shop.id}&events=1`);
      const s = await call(admin, 'GET', `/daily-closings/summary?storeId=${shop.id}&businessDate=${dayKey(day)}`);
      const receipts = await prisma.sale.count({ where: { storeId: shop.id, createdAt: { gte: new Date(`${dayKey(day)}T00:00:00+05:00`), lt: new Date(new Date(`${dayKey(day)}T00:00:00+05:00`).getTime() + 86_400_000) } } });
      const events = r.events as any[];
      // The day's profit = its rows (sales, returns with what they withheld, exchanges) + the rate difference of debts repaid + shift surpluses.
      const fromRows = events.reduce((a: any, e: any) => a.plus(e.profitUsd), D(0)).plus(r.periodDebtFxUsd ?? 0).plus(r.periodCashSurplusUsd ?? 0);
      check(fromRows.eq(r.profitUsd), `${shop.name} ${dayKey(day)}: строки отчёта $${fromRows} ≠ прибыль $${r.profitUsd}`);
      console.log(`  ${dayKey(day)}  ${RATES[day].toFixed(2)}  ${String(receipts).padStart(6)}  ${D(r.revenueUsd).toFixed(2).padStart(9)}  ${D(r.cogsUsd).toFixed(2).padStart(9)}  ${D(r.profitUsd).toFixed(2).padStart(9)}  ${D(r.periodRefundPenaltiesUsd).toFixed(2).padStart(8)}  ${D(s.expectedCashTjs).toFixed(2).padStart(13)}  ${s.alreadyClosed ? 'закрыта' : 'открыта'}`);
    }
    const w = await call(admin, 'GET', `/reports/summary?${week}&storeId=${shop.id}&events=1`);
    console.log(`  ЗА НЕДЕЛЮ: выручка $${w.revenueUsd}, себестоимость $${w.cogsUsd}, прибыль $${w.profitUsd}, продано единиц ${w.unitsSold}`);
    // The week's Excel: the control row against the program's total is 0.
    const names = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name] as [string, string]));
    const expenses = ((await call(admin, 'GET', `/expenses?${week}&storeId=${shop.id}`)) as any[]).map((e) => mapExpense(e, names));
    const summary: ComprehensiveReportSummary = {
      periodLabel: `${dayKey(0)} — ${dayKey(DAYS - 1)}`, storeName: shop.name, unitsSold: w.unitsSold, revenueUsd: w.revenueUsd, cogsUsd: w.cogsUsd,
      refundPenaltiesUsd: w.periodRefundPenaltiesUsd, debtFxUsd: w.periodDebtFxUsd ?? 0, cashSurplusUsd: w.periodCashSurplusUsd ?? 0,
      bonusDeviceProfitUsd: w.bonusDeviceProfitUsd ?? 0, profitUsd: w.profitUsd, cashBonusesUsd: 0, expensesUsd: w.expensesUsd,
      expenseFxUsd: w.periodExpenseFxUsd ?? 0, netProfitUsd: w.netProfitUsd,
    };
    const workbook = await buildComprehensiveReportWorkbook({ events: w.events, expenses, summary, generatedBy: 'Неделя' });
    const control = workbook.getWorksheet('Итого')!.getCell('B16').value as { result?: number };
    check((control.result ?? 0) === 0, `${shop.name}: контроль Excel ≠ 0`);
    const file = path.resolve(`output/demo-week/otchet_${shop.id}.xlsx`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await workbook.xlsx.writeFile(file);
    console.log(`  Excel за неделю: ${path.relative(process.cwd(), file)} (контроль 0)`);
  }

  const all = await call(admin, 'GET', `/reports/summary?${week}`);
  const owners = await prisma.owner.findMany({ orderBy: { name: 'asc' } });
  console.log(`\nВСЕ МАГАЗИНЫ ЗА НЕДЕЛЮ: выручка $${all.revenueUsd}, прибыль $${all.profitUsd}, чистая $${all.netProfitUsd}`);
  const accrued = owners.reduce((sum, o) => sum.plus(D(o.totalAccruedProfitUsd).minus(owners0[o.id] ?? 0)), D(0));
  for (const o of owners) {
    const delta = D(o.totalAccruedProfitUsd).minus(owners0[o.id] ?? 0);
    if (!delta.isZero()) console.log(`  ${o.name}: начислено $${delta.toFixed(2)}`);
  }
  check(accrued.eq(all.netProfitUsd), `владельцам начислено $${accrued} ≠ чистой прибыли $${all.netProfitUsd}`);
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  console.log('\nДОЛГИ ПОСТАВЩИКАМ: ' + suppliers.map((s) => `${s.name} $${s.totalDebtUsd}`).join(', '));
  for (const s of suppliers) check(D(s.totalDebtUsd).eq(s.totalPurchasedUsd), `${s.name}: долг ≠ закупкам (всё в долг)`);
  for (const shop of [central, ...SHOPS]) {
    const st = await prisma.store.findUniqueOrThrow({ where: { id: shop.id } });
    const account = await prisma.financialAccount.findUnique({ where: { storeId: shop.id } });
    check(D(account?.balanceUsd ?? 0).eq(st.cashBalanceUsd), `${shop.name}: касса ≠ счёт`);
    console.log(`  касса ${shop.name}: $${D(st.cashBalanceUsd).toFixed(2)}`);
  }
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { encoding: 'utf8', timeout: 120000 });
  check(audit.status === 0, `audit:owners: ${audit.stdout}${audit.stderr}`);
  if (problems.length) {
    console.log('\nОШИБКИ:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
  } else {
    console.log('\nПРОВЕРКА: всё сходится — строки отчётов = прибыль каждого дня, Excel (контроль 0), владельцы = чистая прибыль, кассы = счета, долги поставщикам, audit:owners');
  }
} finally {
  for (const token of tokens) await fetch(base + '/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() } }).catch(() => {});
  server.close();
  await prisma.$disconnect();
}
