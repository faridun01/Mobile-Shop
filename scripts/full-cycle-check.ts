// Full business day, run through the real HTTP API on the configured database: owner capital,
// purchases from four suppliers, supplier payments, transfers, sales of every payment kind,
// exchanges, refunds, customer debt repayment, repairs, expenses, shift closing and cash
// collection. After every step it checks, to the cent:
//   - every register equals its ledger account and the amount this script expects on its own;
//   - owner profit equals the profit this script computes on its own and the report's net profit;
//   - supplier and customer debt equal their open documents; stock equals its devices;
//   - each receipt's items (+ the part withheld at an exchange) and payments add up to its total;
//   - the report's dated rows add up to its totals, and the Excel workbook's control row is 0.
// The Excel files are written to output/reports/. The owner balance check (audit:owners) must
// end clean. Needs a database with no operations (npm run db:reset-operations:apply) and
// today's exchange rate.
//
//   npm run check:full-cycle
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
import { splitUsdByTjs } from '../src/utils/money';

type Dec = ReturnType<typeof D>;
const results: { name: string; ok: boolean; error?: string }[] = [];
const fail = (message: string): never => { throw new Error(message); };
const eq = (actual: unknown, expected: unknown, what: string) => {
  const a = D(actual as string).toFixed(2);
  const e = D(expected as string).toFixed(2);
  if (a !== e) fail(`${what}: получено ${a}, ожидалось ${e}`);
};
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, error: message });
    console.log(`  ✗ ${name}\n      ${message.split('\n').slice(0, 6).join('\n      ')}`);
    if (process.env.DEBUG_CYCLE && error instanceof Error) console.log(error.stack);
  }
}

const allowExisting = process.argv.includes('--allow-existing');
if (!allowExisting && (await prisma.device.count()) + (await prisma.sale.count()) > 0) {
  console.error('В базе уже есть товары или продажи. Сначала: npm run db:reset-operations:apply');
  process.exit(1);
}
const todayRate = await prisma.exchangeRate.findUnique({ where: { date: getBusinessDateKey() } });
if (!todayRate) {
  console.error(`Нет курса на сегодня (${getBusinessDateKey()}). Задайте курс в программе и повторите.`);
  process.exit(1);
}
const RATE = D(todayRate.rate);
const usd = (tjs: Dec | number | string) => D(tjs).div(RATE).toDecimalPlaces(2);
console.log(`Курс дня ${getBusinessDateKey()}: 1 USD = ${RATE.toString()} TJS\n`);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;

type Res = { status: number; data: any };
const call = async (token: string, method: string, url: string, body?: unknown): Promise<Res> => {
  const r = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const ok = (r: Res) => (r.status >= 200 && r.status < 300 ? r.data : fail(`HTTP ${r.status}: ${JSON.stringify(r.data)}`));

// Sessions are opened for the real users directly, so no password is needed or stored here.
// Every session this check opens is logged out at the end.
const openedTokens: string[] = [];
const tokenFor = async (where: { role: 'ADMIN' | 'PARTNER' | 'SELLER'; storeId?: string }) => {
  const user = await prisma.user.findFirstOrThrow({ where: { ...where, active: true }, orderBy: { createdAt: 'asc' } });
  const token = await AuthService.createSession({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId }, user.password);
  openedTokens.push(token);
  return token;
};

try {
  const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  const central = stores.find((s) => s.isMainWarehouse) ?? fail('Нет главного склада');
  const retail = stores.filter((s) => !s.isMainWarehouse);
  if (retail.length < 3) fail('Нужно минимум 3 магазина');
  const [A, B, C] = retail;
  const admin = await tokenFor({ role: 'ADMIN' });
  const seller = Object.fromEntries(await Promise.all(retail.map(async (s) => [s.id, await tokenFor({ role: 'SELLER', storeId: s.id })])));
  const partner = Object.fromEntries(await Promise.all(retail.map(async (s) => [s.id, await prisma.user.count({ where: { role: 'PARTNER', storeId: s.id, active: true } }) ? await tokenFor({ role: 'PARTNER', storeId: s.id }) : admin])));
  const adminOwner = await prisma.owner.findFirstOrThrow({ where: { user: { role: 'ADMIN' } } });
  console.log(`Магазины: ${retail.map((s) => s.name).join(', ')}; центральная касса: ${central.name}\n`);

  // ---------------------------------------------------------------- independent expectations
  const expectedCash = new Map<string, Dec>(stores.map((s) => [s.id, D(0)]));
  const addCash = (storeId: string, amount: Dec) => expectedCash.set(storeId, expectedCash.get(storeId)!.plus(amount));
  const expectedProfit = new Map<string, Dec>(); // per store; owners split it by the store's shares
  const addProfit = (storeId: string, amount: Dec) => expectedProfit.set(storeId, (expectedProfit.get(storeId) ?? D(0)).plus(amount));
  let expectedCapital = D(0);
  const expectedSupplierDebt = new Map<string, Dec>();
  const costOf = new Map<string, Dec>(); // device id → cost
  const bonusIds = new Set<string>();
  const saleProfitBooked = new Map<string, Dec>(); // sale id → owner profit booked by its sale and exchanges

  const checkBooks = async (label: string) => {
    for (const store of stores) {
      const row = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
      const account = await prisma.financialAccount.findUnique({ where: { storeId: store.id } });
      eq(row.cashBalanceUsd, account?.balanceUsd ?? 0, `${label}: касса «${store.name}» и её счёт в книге`);
      eq(row.cashBalanceUsd, expectedCash.get(store.id)!, `${label}: касса «${store.name}»`);
      if (D(row.cashBalanceUsd).lt(0)) fail(`${label}: касса «${store.name}» ушла в минус`);
    }
    const owners = await prisma.owner.findMany();
    const totalProfit = owners.reduce((sum, o) => sum.plus(o.totalAccruedProfitUsd), D(0));
    const expected = [...expectedProfit.values()].reduce((sum, v) => sum.plus(v), D(0));
    eq(totalProfit, expected, `${label}: прибыль партнёров всего`);
    eq(owners.reduce((sum, o) => sum.plus(o.capitalBalanceUsd), D(0)), expectedCapital, `${label}: капитал`);
    for (const [supplierId, debt] of expectedSupplierDebt) {
      const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      eq(supplier.totalDebtUsd, debt, `${label}: долг поставщику «${supplier.name}»`);
      const invoices = await prisma.supplierInvoice.findMany({ where: { supplierId } });
      eq(invoices.reduce((sum, i) => sum.plus(i.totalAmountUsd).minus(i.paidAmountUsd), D(0)), debt, `${label}: долг «${supplier.name}» по накладным`);
    }
    for (const customer of await prisma.customer.findMany({ where: { totalDebtTjs: { not: 0 } } })) {
      const open = await prisma.sale.aggregate({ _sum: { debtAmountTjs: true }, where: { customerId: customer.id } });
      eq(customer.totalDebtTjs, open._sum.debtAmountTjs ?? 0, `${label}: долг клиента «${customer.name}» = долг по его чекам`);
    }
  };

  // ---------------------------------------------------------------- 1. capital
  console.log('1. Капитал');
  await step('админ вносит $40 000 в центральную кассу', async () => {
    ok(await call(admin, 'POST', `/owners/${adminOwner.id}/investment`, { amountUsd: 40000 }));
    addCash(central.id, D(40000)); expectedCapital = expectedCapital.plus(40000);
    await checkBooks('вклад');
  });

  // ---------------------------------------------------------------- 2. purchases
  console.log('2. Приход товара от разных поставщиков');
  const suppliers = await prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  if (suppliers.length < 3) fail('Нужно минимум 3 активных поставщика');
  const stamp = String(Date.now()).slice(-7);
  let imeiSeq = 0;
  const nextImei = () => `35${stamp}${String(++imeiSeq).padStart(6, '0')}`;
  const batches = [
    { supplier: suppliers[0], invoice: `ПР-${stamp}-1`, groups: [
      { brand: 'Apple', model: 'iPhone 15', ram: '6GB', storage: '128GB', color: 'Black', purchasePriceUsd: 612.35, count: 4 },
      { brand: 'Apple', model: 'iPhone 15 Pro', ram: '8GB', storage: '256GB', color: 'Natural Titanium', purchasePriceUsd: 905.10, count: 3 },
    ] },
    { supplier: suppliers[1], invoice: `ПР-${stamp}-2`, groups: [
      { brand: 'Samsung', model: 'Galaxy S24 Ultra', ram: '12GB', storage: '512GB', color: 'Titanium Gray', purchasePriceUsd: 1048.99, count: 2 },
      { brand: 'Samsung', model: 'Galaxy A55', ram: '8GB', storage: '128GB', color: 'Awesome Navy', purchasePriceUsd: 287.45, count: 4 },
      { brand: 'Samsung', model: 'Galaxy A15', ram: '4GB', storage: '128GB', color: 'Blue', purchasePriceUsd: 0, count: 1, isBonus: true, bonusCampaign: 'Подарок поставщика' },
    ] },
    { supplier: suppliers[2], invoice: `ПР-${stamp}-3`, groups: [
      { brand: 'Xiaomi', model: 'Redmi Note 13 Pro+', ram: '12GB', storage: '256GB', color: 'Midnight Black', purchasePriceUsd: 318.77, count: 4 },
      { brand: 'Xiaomi', model: '14 Ultra', ram: '16GB', storage: '512GB', color: 'White', purchasePriceUsd: 879.95, count: 2 },
    ] },
    { supplier: suppliers[3] ?? suppliers[0], invoice: `ПР-${stamp}-4`, groups: [
      { brand: 'Apple', model: 'iPhone 13', ram: '4GB', storage: '128GB', color: 'Midnight', purchasePriceUsd: 401.10, count: 3 },
    ] },
  ];
  const invoices: Record<string, any> = {};
  const devicesByModel = new Map<string, string[]>(); // model → device ids, in purchase order
  for (const batch of batches) {
    await step(`накладная ${batch.invoice} от «${batch.supplier.name}»`, async () => {
      const res = ok(await call(admin, 'POST', '/purchases', {
        supplierId: batch.supplier.id, invoiceNumber: batch.invoice, date: getBusinessDateKey(),
        groups: batch.groups.map(({ count, ...g }) => ({ ...g, items: Array.from({ length: count }, () => ({ imei: nextImei() })) })),
      }));
      invoices[batch.invoice] = res.invoice;
      const total = batch.groups.reduce((sum, g) => sum.plus(D(g.purchasePriceUsd).mul(g.count)), D(0));
      eq(res.invoice.totalAmountUsd, total, 'сумма накладной');
      expectedSupplierDebt.set(batch.supplier.id, (expectedSupplierDebt.get(batch.supplier.id) ?? D(0)).plus(total));
      for (const device of res.devices) {
        costOf.set(device.id, D(device.costBasisUsd));
        if (device.isBonus) bonusIds.add(device.id);
        devicesByModel.set(device.model, [...(devicesByModel.get(device.model) ?? []), device.id]);
        if (device.status !== 'MAIN_WAREHOUSE' || device.storeId !== central.id) fail(`${device.imei}: не на главном складе`);
      }
      await checkBooks(batch.invoice);
    });
  }
  const take = (model: string) => (devicesByModel.get(model) ?? []).shift() ?? fail(`Закончились ${model}`);

  await step('оплата поставщикам из центральной кассы: FIFO и по конкретной накладной', async () => {
    const pay = async (url: string, supplierId: string, amount: number) => {
      ok(await call(admin, 'POST', url, { amountUsd: amount }));
      addCash(central.id, D(amount).negated());
      expectedSupplierDebt.set(supplierId, expectedSupplierDebt.get(supplierId)!.minus(amount));
    };
    await pay(`/suppliers/${batches[0].supplier.id}/payments`, batches[0].supplier.id, 3000);
    await pay(`/supplier-invoices/${invoices[batches[1].invoice].id}/payments`, batches[1].supplier.id, 1500.25);
    await pay(`/suppliers/${batches[3].supplier.id}/payments`, batches[3].supplier.id, 1203.30);
    await checkBooks('оплата поставщикам');
  });

  // ---------------------------------------------------------------- 3. transfers
  console.log('3. Перемещения');
  const plan: Record<string, string[]> = {
    [A.id]: ['iPhone 15', 'iPhone 15', 'iPhone 15 Pro', 'Galaxy S24 Ultra', 'Galaxy A55', 'Galaxy A55', 'Galaxy A15', 'Redmi Note 13 Pro+'],
    [B.id]: ['iPhone 15', 'iPhone 15 Pro', 'Galaxy A55', 'Redmi Note 13 Pro+', 'Redmi Note 13 Pro+', '14 Ultra', 'iPhone 13'],
    [C.id]: ['iPhone 15', 'iPhone 15 Pro', 'Galaxy S24 Ultra', 'Galaxy A55', 'Redmi Note 13 Pro+', '14 Ultra', 'iPhone 13', 'iPhone 13'],
  };
  const stock = new Map<string, Map<string, string[]>>(); // store → model → device ids
  for (const store of retail) {
    await step(`склад → «${store.name}»: ${plan[store.id].length} шт`, async () => {
      const ids = plan[store.id].map(take);
      ok(await call(admin, 'POST', '/transfers', { fromStoreId: central.id, toStoreId: store.id, deviceIds: ids }));
      const moved = await prisma.device.findMany({ where: { id: { in: ids } } });
      if (moved.some((d) => d.storeId !== store.id || d.status !== 'STORE_STOCK')) fail('не все телефоны на остатке магазина');
      const byModel = new Map<string, string[]>();
      for (const id of ids) { const d = moved.find((m) => m.id === id)!; byModel.set(d.model, [...(byModel.get(d.model) ?? []), id]); }
      stock.set(store.id, byModel);
      await checkBooks('перемещение');
    });
  }
  const pick = (storeId: string, model: string) => stock.get(storeId)?.get(model)?.shift() ?? fail(`В магазине нет ${model}`);
  await step(`«${C.name}» возвращает iPhone 13 на склад, админ подтверждает`, async () => {
    const id = pick(C.id, 'iPhone 13');
    const tr = ok(await call(seller[C.id], 'POST', '/transfers', { fromStoreId: C.id, toStoreId: central.id, deviceIds: [id] }));
    if ((await prisma.device.findUniqueOrThrow({ where: { id } })).status !== 'TRANSFER_PENDING') fail('не в пути');
    ok(await call(admin, 'POST', `/transfers/${tr.id}/approve`));
    const d = await prisma.device.findUniqueOrThrow({ where: { id } });
    if (d.storeId !== central.id || d.status !== 'MAIN_WAREHOUSE') fail('не вернулся на склад');
    await checkBooks('возврат на склад');
  });

  // ---------------------------------------------------------------- 4. sales
  console.log('4. Продажи');
  const sales: Record<string, any> = {};
  const sell = async (key: string, storeId: string, items: [string, number][], pay: { cash?: number; card?: number; debt?: number; customer?: string; phone?: string }) => {
    const cash = D(pay.cash ?? 0), card = D(pay.card ?? 0), debt = D(pay.debt ?? 0);
    const total = items.reduce((sum, [, price]) => sum.plus(price), D(0));
    eq(cash.plus(card).plus(debt), total, `${key}: оплата = сумма чека (ошибка в сценарии)`);
    const ids = items.map(([model]) => pick(storeId, model));
    const paymentMethod = debt.gt(0) ? 'DEBT' : card.gt(0) && cash.gt(0) ? 'SPLIT' : card.gt(0) ? 'CARD' : 'CASH';
    const sale = ok(await call(seller[storeId], 'POST', '/sales', {
      storeId, paymentMethod, items: ids.map((deviceId, i) => ({ deviceId, salePriceTjs: items[i][1] })),
      cashAmountTjs: cash.toNumber(), cardAmountTjs: card.toNumber(),
      ...(debt.gt(0) ? { debtAmountTjs: debt.toNumber(), customerName: pay.customer, customerPhone: pay.phone } : {}),
    }));
    sales[key] = sale;
    eq(sale.totalTjs, total, `${key}: сумма чека TJS`);
    eq(sale.totalUsd, usd(total), `${key}: сумма чека USD = TJS ÷ курс`);
    eq(sale.saleItems.reduce((sum: Dec, i: any) => sum.plus(i.salePriceUsd), D(0)), sale.totalUsd, `${key}: позиции в USD = итого`);
    // Register: the whole receipt in its booked dollars; a debt sale only the part paid now, at today's rate.
    const paidUsd = debt.gt(0) ? usd(cash.plus(card)) : D(sale.totalUsd);
    addCash(storeId, paidUsd);
    let profit = D(0);
    for (const item of sale.saleItems) if (!bonusIds.has(item.deviceId)) profit = profit.plus(D(item.salePriceUsd).minus(costOf.get(item.deviceId)!));
    addProfit(storeId, profit);
    saleProfitBooked.set(sale.id, profit);
    await checkBooks(key);
  };
  const salePlan: [string, string, [string, number][], Parameters<typeof sell>[3]][] = [
    ['A1 наличные', A.id, [['iPhone 15', 7654.32]], { cash: 7654.32 }],
    ['A2 карта', A.id, [['iPhone 15 Pro', 10987.65]], { card: 10987.65 }],
    ['A3 наличные+карта', A.id, [['Galaxy S24 Ultra', 12345.67]], { cash: 8000, card: 4345.67 }],
    ['A4 в долг', A.id, [['Galaxy A55', 3210.99]], { cash: 1000, debt: 2210.99, customer: 'Проверочный клиент', phone: `+99290${stamp}` }],
    ['A5 бонусный телефон', A.id, [['Galaxy A15', 1499.5]], { cash: 1499.5 }],
    ['A6 два телефона', A.id, [['iPhone 15', 7111.11], ['Galaxy A55', 3333.33]], { cash: 10444.44 }],
    ['B1 наличные', B.id, [['Redmi Note 13 Pro+', 3456.78]], { cash: 3456.78 }],
    ['B2 наличные', B.id, [['iPhone 15 Pro', 10500]], { cash: 10500 }],
    ['B3 карта', B.id, [['14 Ultra', 9876.54]], { card: 9876.54 }],
    ['B4 наличные', B.id, [['iPhone 13', 4400.4]], { cash: 4400.4 }],
    ['C1 наличные', C.id, [['iPhone 15', 7700]], { cash: 7700 }],
    ['C2 наличные+карта', C.id, [['Galaxy S24 Ultra', 12000]], { cash: 6500.5, card: 5499.5 }],
    ['C3 наличные', C.id, [['Galaxy A55', 3150.15]], { cash: 3150.15 }],
    ['C4 наличные', C.id, [['Redmi Note 13 Pro+', 3500]], { cash: 3500 }],
  ];
  for (const [key, storeId, items, pay] of salePlan) await step(`продажа ${key}`, () => sell(key, storeId, items, pay));
  await step('бонусный телефон ушёл в бонусный пул, а не партнёрам', async () => {
    const entry = await prisma.bonusPoolEntry.findFirst({ where: { saleId: sales['A5 бонусный телефон']?.id } });
    if (!entry) fail('нет записи в бонусном пуле');
    eq(entry!.profitUsd, sales['A5 бонусный телефон'].totalUsd, 'бонусный пул');
  });

  // ---------------------------------------------------------------- 5. exchanges
  console.log('5. Обмены: возврат старого телефона + новый чек');
  // Owners' profit of returning `item` with `withheldTjs` kept: its booked profit comes back, the
  // withheld part and the rate result (its booked dollars − the same somoni today) stay.
  const returnProfit = (item: any, withheldTjs: Dec) => {
    const booked = bonusIds.has(item.deviceId) ? D(0) : D(item.salePriceUsd).minus(costOf.get(item.deviceId)!);
    return usd(withheldTjs).plus(D(item.salePriceUsd).minus(usd(item.salePriceTjs))).minus(booked);
  };
  const exchange = async (key: string, saleKey: string, storeId: string, withheldTjs: number, model: string, newPriceTjs: number, method: 'CASH' | 'CARD') => {
    const sale = sales[saleKey];
    const item = sale.saleItems[0];
    const replacementId = pick(storeId, model);
    const res = ok(await call(seller[storeId], 'POST', '/exchanges', {
      saleId: sale.id, returnedImei: item.imei, withheldTjs, replacementDeviceId: replacementId, newPriceTjs, paymentMethod: method,
    }));
    const creditTjs = D(item.salePriceTjs).minus(withheldTjs);
    const creditUsd = usd(item.salePriceTjs).minus(usd(withheldTjs));
    const newUsd = usd(newPriceTjs);
    // The register moves by the new receipt's dollars minus the credit's own dollars.
    addCash(storeId, newUsd.minus(creditUsd));
    const returnPart = returnProfit(item, D(withheldTjs));
    const salePart = newUsd.minus(costOf.get(replacementId)!);
    addProfit(storeId, returnPart.plus(salePart));
    saleProfitBooked.set(sale.id, saleProfitBooked.get(sale.id)!.plus(returnPart));
    saleProfitBooked.set(res.sale.id, salePart);
    sales[key] = res.sale;
    eq(res.creditTjs, creditTjs, `${key}: зачёт = цена − удержание`);
    eq(res.sale.totalTjs, newPriceTjs, `${key}: новый чек на цену нового телефона`);
    eq(res.sale.exchangeTradeInCreditTjs, creditTjs.lte(newPriceTjs) ? creditTjs : newPriceTjs, `${key}: зачёт в оплате нового чека`);
    eq(res.payoutTjs, creditTjs.gt(newPriceTjs) ? creditTjs.minus(newPriceTjs) : 0, `${key}: сдача клиенту`);
    if ((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status !== 'REFUNDED') fail('старый чек не отмечен как возврат');
    const returned = await prisma.device.findUniqueOrThrow({ where: { id: item.deviceId } });
    if (returned.status !== 'STORE_STOCK') fail('сданный телефон не вернулся на остаток');
    eq(returned.costBasisUsd, costOf.get(item.deviceId)!, 'сданный телефон вернулся по своей себестоимости');
    await checkBooks(key);
  };
  await step(`обмен в «${A.name}» со сдачей клиенту: iPhone 15 (удержание 454.32) → Redmi за 3 600`, () => exchange('обмен A1', 'A1 наличные', A.id, 454.32, 'Redmi Note 13 Pro+', 3600, 'CASH'));
  await step(`обмен в «${B.name}» с доплатой картой: Redmi (без удержания) → iPhone 15 за 7 800`, () => exchange('обмен B1', 'B1 наличные', B.id, 0, 'iPhone 15', 7800, 'CARD'));
  await step(`обмен в «${C.name}» с доплатой наличными: A55 (удержание 150.15) → iPhone 15 Pro за 10 999.99`, () => exchange('обмен C3', 'C3 наличные', C.id, 150.15, 'iPhone 15 Pro', 10999.99, 'CASH'));

  // ---------------------------------------------------------------- 6. refunds
  console.log('6. Возвраты');
  const refund = async (key: string, saleKey: string, storeId: string, penaltyTjs: number, method: 'CASH' | 'CARD') => {
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: sales[saleKey].id } });
    const collected = D(sale.totalTjs).minus(sale.debtAmountTjs);
    const refundTjs = collected.minus(penaltyTjs);
    ok(await call(partner[storeId], 'POST', `/sales/${sale.id}/refund`, { reason: `Проверка: ${key}`, refundAmountTjs: refundTjs.toNumber(), penaltyFeeTjs: penaltyTjs, paymentMethod: method }));
    const outUsd = usd(collected).minus(usd(penaltyTjs));
    addCash(storeId, outUsd.negated());
    // Owners give back everything the receipt booked and keep the penalty and the rate result.
    const bookedCollectedUsd = D(sale.totalUsd).mul(collected).div(sale.totalTjs).toDecimalPlaces(2);
    addProfit(storeId, saleProfitBooked.get(sale.id)!.negated().plus(usd(penaltyTjs)).plus(bookedCollectedUsd.minus(usd(collected))));
    const items = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
    for (const item of items) {
      const d = await prisma.device.findUniqueOrThrow({ where: { id: item.deviceId } });
      if (d.status !== 'STORE_STOCK') fail(`${d.imei}: не вернулся на остаток`);
      eq(d.costBasisUsd, costOf.get(d.id)!, `${d.imei}: себестоимость после возврата`);
    }
    await checkBooks(key);
  };
  await step(`возврат всего чека в «${A.name}»: оплата картой, удержание 300 TJS`, () => refund('возврат A2', 'A2 карта', A.id, 300, 'CARD'));
  await step(`возврат всего чека в «${C.name}»: наличные, удержание 150 TJS`, () => refund('возврат C4', 'C4 наличные', C.id, 150, 'CASH'));
  await step(`возврат нового чека после обмена в «${B.name}», удержание 500 TJS`, () => refund('возврат чека обмена B1', 'обмен B1', B.id, 500, 'CASH'));
  await step(`возврат одного телефона из чека с двумя телефонами в «${A.name}», удержание 333.33 TJS`, async () => {
    const sale = sales['A6 два телефона'];
    const item = sale.saleItems.find((i: any) => i.model === 'Galaxy A55');
    ok(await call(partner[A.id], 'POST', `/sales/${sale.id}/return-items`, { items: [{ saleItemId: item.id, withheldTjs: 333.33 }], reason: 'Проверка: возврат одного телефона', paymentMethod: 'CASH' }));
    addCash(A.id, usd(item.salePriceTjs).minus(usd(333.33)).negated());
    const part = returnProfit(item, D(333.33));
    addProfit(A.id, part);
    saleProfitBooked.set(sale.id, saleProfitBooked.get(sale.id)!.plus(part));
    const row = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { saleItems: true } });
    if (row.status !== 'COMPLETED') fail('чек с оставшимся телефоном должен остаться проданным');
    if (row.saleItems.filter((i) => i.returnId).length !== 1) fail('должен быть возвращён ровно один телефон');
    if ((await prisma.device.findUniqueOrThrow({ where: { id: item.deviceId } })).status !== 'STORE_STOCK') fail('телефон не вернулся на остаток');
    const whole = await call(partner[A.id], 'POST', `/sales/${sale.id}/refund`, { reason: 'x', refundAmountTjs: 1, penaltyFeeTjs: 1, paymentMethod: 'CASH' });
    if (whole.status !== 400) fail('возврат всего чека после возврата телефона должен отклоняться');
    await checkBooks('возврат одного телефона');
  });

  // ---------------------------------------------------------------- 7. customer debt
  console.log('7. Долги клиентов');
  await step('клиент гасит часть долга 1 000.55 TJS', async () => {
    const customer = await prisma.customer.findFirstOrThrow({ where: { phone: `+99290${stamp}` } });
    eq(customer.totalDebtTjs, 2210.99, 'долг клиента после продажи');
    ok(await call(seller[A.id], 'POST', `/customers/${customer.id}/payments`, { amountTjs: 1000.55 }));
    addCash(A.id, usd(1000.55));
    // The register gets today's dollars; the difference from the dollars the sale booked for that
    // part of its debt (cent rounding on the same day) is the owners' rate result.
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: sales['A4 в долг'].id } });
    eq(sale.debtAmountTjs, D(2210.99).minus(1000.55), 'остаток долга по чеку');
    const bookedUsd = D(sale.totalUsd).mul(1000.55).div(sale.totalTjs).toDecimalPlaces(2);
    addProfit(A.id, usd(1000.55).minus(bookedUsd));
    await checkBooks('погашение долга');
  });

  // ---------------------------------------------------------------- 8. repairs and expenses
  console.log('8. Ремонт и расходы');
  const repair = async (storeId: string, imei: string, costTjs: number) => {
    const ticket = ok(await call(seller[storeId], 'POST', '/repairs', { imei, brand: 'Apple', model: 'iPhone 12', problemDescription: 'Замена дисплея', customerName: 'Клиент ремонта', customerPhone: '+992900000000' }));
    for (const status of ['IN_PROGRESS', 'READY']) ok(await call(seller[storeId], 'PATCH', `/repairs/${ticket.id}/status`, { status }));
    ok(await call(seller[storeId], 'PATCH', `/repairs/${ticket.id}/status`, { status: 'ISSUED', finalCostTjs: costTjs }));
    // Repairs are paid from the Central Cash and charged to the store's profit.
    addCash(central.id, usd(costTjs).negated());
    addProfit(storeId, usd(costTjs).negated());
    await checkBooks('ремонт');
  };
  await step(`ремонт в «${A.name}»: Принят → В работе → Готов → Выдан, 250.75 TJS`, () => repair(A.id, `35${stamp}900001`, 250.75));
  await step(`ремонт в «${C.name}»: 180 TJS`, () => repair(C.id, `35${stamp}900002`, 180));
  await step('расходы: аренда из кассы магазина, коммуналка, реклама из центральной кассы', async () => {
    ok(await call(admin, 'POST', '/expenses', { category: 'RENT', amountTjs: 1500, storeId: A.id, targetType: 'STORE', paidFromCashRegister: true, comment: 'Аренда (проверка)' }));
    addCash(A.id, usd(1500).negated()); addProfit(A.id, usd(1500).negated());
    ok(await call(admin, 'POST', '/expenses', { category: 'UTILITIES', amountTjs: 333.33, storeId: C.id, targetType: 'STORE', paidFromCashRegister: true, comment: 'Свет и интернет (проверка)' }));
    addCash(C.id, usd(333.33).negated()); addProfit(C.id, usd(333.33).negated());
    ok(await call(admin, 'POST', '/expenses', { category: 'MARKETING', amountTjs: 950.5, targetType: 'BUSINESS', paidFromCashRegister: true, comment: 'Реклама (проверка)' }));
    addCash(central.id, usd(950.5).negated()); addProfit(central.id, usd(950.5).negated());
    await checkBooks('расходы');
  });

  // ---------------------------------------------------------------- 9. receipts
  console.log('9. Чеки');
  await step('каждый чек: позиции = итого; наличные + банк + зачёт по обмену + долг = итого (TJS и USD)', async () => {
    const list = ok(await call(admin, 'GET', '/sales?limit=500')) as any[];
    for (const sale of list) {
      const label = `чек #${sale.receiptNumber}`;
      const itemsTjs = sale.saleItems.reduce((s: Dec, i: any) => s.plus(i.salePriceTjs), D(0));
      const itemsUsd = sale.saleItems.reduce((s: Dec, i: any) => s.plus(i.salePriceUsd), D(0));
      const withheldTjs = D(sale.totalTjs).minus(itemsTjs);
      const withheldUsd = D(sale.totalUsd).minus(itemsUsd);
      if (!sale.exchangeEvents?.length && (!withheldTjs.isZero() || !withheldUsd.isZero())) fail(`${label}: позиции не равны итогу`);
      if (withheldTjs.lt(0) || withheldUsd.lt(0)) fail(`${label}: отрицательное удержание`);
      if (sale.status === 'REFUNDED') continue;
      const cash = D(sale.cashAmountTjs), card = D(sale.cardAmountTjs);
      const tradeIn = D(sale.exchangeTradeInCreditTjs ?? 0);
      const initialDebt = D(sale.totalTjs).minus(cash).minus(card).minus(tradeIn);
      if (initialDebt.lt(0)) fail(`${label}: наличные + банк больше итога`);
      // The credit keeps its own booked dollars; the receipt's other dollars are split by TJS.
      const tradeInUsd = D(sale.exchangeTradeInCreditUsd ?? 0);
      const parts = splitUsdByTjs(Number(D(sale.totalUsd).minus(tradeInUsd)), Number(D(sale.totalTjs).minus(tradeIn)), [Number(cash), Number(card), Number(initialDebt)]);
      eq(parts.reduce((s, v) => s.plus(v), tradeInUsd), sale.totalUsd, `${label}: доллары по способам оплаты`);
      for (const ev of sale.exchangeEvents ?? []) eq(D(ev.newPriceTjs).minus(ev.exchangeInValueTjs), ev.differenceTjs, `${label}: доплата обмена`);
    }
  });

  // ---------------------------------------------------------------- 10. reports + Excel
  console.log('10. Отчёты и Excel');
  const outDir = path.resolve('output/reports');
  fs.mkdirSync(outDir, { recursive: true });
  const names = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name] as [string, string]));
  const reportFor = async (storeId: string | 'all', storeName: string) => {
    const q = `period=TODAY${storeId === 'all' ? '' : `&storeId=${storeId}`}`;
    const report = ok(await call(admin, 'GET', `/reports/summary?${q}&events=1`));
    const events = report.events ?? [];
    const sum = (key: string) => events.reduce((s: Dec, e: any) => s.plus(e[key]), D(0));
    eq(sum('amountUsd'), report.revenueUsd, `${storeName}: строки отчёта = выручка`);
    eq(sum('costUsd'), report.cogsUsd, `${storeName}: строки отчёта = себестоимость`);
    eq(sum('penaltyUsd'), report.periodRefundPenaltiesUsd, `${storeName}: удержания`);
    const mainWarehouseId = central.id;
    const expenses = (ok(await call(admin, 'GET', `/expenses?${q}`)) as any[])
      .map((e) => mapExpense(e, names))
      .filter((e) => storeId === 'all' || e.storeId !== mainWarehouseId);
    const summary: ComprehensiveReportSummary = {
      periodLabel: `Сегодня (${getBusinessDateKey()})`, storeName, unitsSold: report.unitsSold, revenueUsd: report.revenueUsd,
      cogsUsd: report.cogsUsd, refundPenaltiesUsd: report.periodRefundPenaltiesUsd, debtFxUsd: report.periodDebtFxUsd ?? 0,
      bonusDeviceProfitUsd: report.bonusDeviceProfitUsd ?? 0, profitUsd: report.profitUsd,
      cashBonusesUsd: storeId === 'all' ? report.periodCashBonusesUsd : 0, expensesUsd: report.expensesUsd,
      expenseFxUsd: report.periodExpenseFxUsd ?? 0, netProfitUsd: report.netProfitUsd,
    };
    const workbook = await buildComprehensiveReportWorkbook({ events, expenses, summary, generatedBy: 'Проверка полного цикла' });
    const file = path.join(outDir, `otchet_${storeId === 'all' ? 'vse_magaziny' : storeId}_${getBusinessDateKey()}.xlsx`);
    await workbook.xlsx.writeFile(file);
    // Read the file back: the sheets are there, and the control row (Excel total − program total) is 0.
    const ExcelJS = (await import('exceljs')).default;
    const back = new ExcelJS.Workbook();
    await back.xlsx.readFile(file);
    const sheetNames = back.worksheets.map((w) => w.name);
    for (const name of ['Операции', 'Расходы', 'Итого']) if (!sheetNames.includes(name)) fail(`${file}: нет листа «${name}»`);
    const totals = back.getWorksheet('Итого')!;
    let control: unknown; let net: unknown;
    totals.eachRow((row) => {
      const label = String(row.getCell(1).value ?? '');
      const cell = row.getCell(2).value as any;
      const value = cell && typeof cell === 'object' && 'result' in cell ? cell.result : cell;
      if (label.startsWith('Контроль')) control = value;
      if (label === 'ЧИСТАЯ ПРИБЫЛЬ') net = value;
    });
    // ExcelJS reads a cached 0 back as "no result", so the control value is taken from the sheet XML.
    if (control && typeof control === 'object') {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(fs.readFileSync(file));
      const sheetFile = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
      for (const name of sheetFile) {
        const match = (await zip.file(name)!.async('string')).match(/<f>ROUND\(B\d+-\([^<]*\),2\)<\/f><v>([^<]*)<\/v>/);
        if (match) control = match[1];
      }
    }
    eq(control ?? 'нет', 0, `${storeName}: контроль Excel`);
    eq(net ?? 'нет', report.netProfitUsd, `${storeName}: чистая прибыль в Excel`);
    const ops = back.getWorksheet('Операции')!;
    if (ops.rowCount !== 4 + events.length + 1) fail(`${storeName}: в Excel ${ops.rowCount - 5} строк операций, в отчёте ${events.length}`);
    console.log(`      ${path.relative(process.cwd(), file)} — ${events.length} операций, ${expenses.length} расходов, чистая прибыль $${D(report.netProfitUsd).toFixed(2)}`);
    return report;
  };
  let allReport: any;
  await step('отчёт по всем магазинам и Excel', async () => { allReport = await reportFor('all', 'Все магазины'); });
  for (const store of retail) await step(`отчёт «${store.name}» и Excel`, async () => {
    const report = await reportFor(store.id, store.name);
    const card = (allReport?.storeBreakdown ?? []).find((s: any) => s.storeId === store.id);
    if (card) eq(card.netProfitUsd, report.netProfitUsd, `${store.name}: карточка магазина = отчёт магазина`);
    eq(report.netProfitUsd, expectedProfit.get(store.id) ?? D(0), `${store.name}: чистая прибыль магазина`);
  });
  await step('чистая прибыль отчёта = начисленная прибыль партнёров = расчёт этой проверки', async () => {
    const owners = await prisma.owner.findMany();
    const accrued = owners.reduce((s, o) => s.plus(o.totalAccruedProfitUsd), D(0));
    const expected = [...expectedProfit.values()].reduce((s, v) => s.plus(v), D(0));
    eq(allReport.netProfitUsd, expected, 'чистая прибыль отчёта');
    eq(accrued, expected, 'прибыль партнёров');
  });

  // ---------------------------------------------------------------- 11. closing and collection
  console.log('11. Закрытие смены и инкассация');
  for (const store of retail) {
    await step(`«${store.name}»: закрытие смены без расхождений, инкассация в центральную кассу`, async () => {
      const summary = ok(await call(seller[store.id], 'GET', '/daily-closings/summary'));
      const closing = ok(await call(seller[store.id], 'POST', '/daily-closings', {}));
      eq(closing.differenceTjs, 0, 'расхождение при закрытии');
      eq(closing.actualCashTjs, summary.expectedCashTjs, 'факт = ожидаемое');
      const balance = D((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).cashBalanceUsd);
      // Money from free bonus phones sold here (not refunded) goes to the Bonus Account, the rest to the Central Cash.
      const bonusEntries = await prisma.bonusPoolEntry.findMany({ where: { sale: { storeId: store.id, status: { not: 'REFUNDED' } }, status: 'PENDING' } });
      const bonusUsd = bonusEntries.reduce((s, e) => s.plus(e.profitUsd), D(0));
      const bonusAccount = async () => D((await prisma.financialAccount.findFirst({ where: { systemKey: 'BONUS_ACCOUNT' } }))?.balanceUsd ?? 0);
      const bonusBefore = await bonusAccount();
      ok(await call(admin, 'POST', '/cash-collections', { storeId: store.id, expectedCashUsd: balance.toString() }));
      addCash(store.id, balance.negated()); addCash(central.id, balance.minus(bonusUsd));
      eq((await bonusAccount()).minus(bonusBefore), bonusUsd, 'на Бонусный счёт ушли деньги бонусных телефонов');
      await checkBooks('инкассация');
    });
  }

  // ---------------------------------------------------------------- 12. owners and capital
  console.log('12. Сверка партнёров и капитала');
  await step('npm run audit:owners: без расхождений, необъяснённый остаток $0.00', async () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 120000 });
    const out = r.stdout + r.stderr;
    if (r.status !== 0 || !out.includes('Расхождений нет')) fail(out);
    const residual = out.match(/Необъяснённый остаток: \$(-?[\d.]+)/)?.[1];
    eq(residual ?? 'нет', 0, 'необъяснённый остаток капитала');
  });
  await step('склад: себестоимость остатков в отчёте = сумма по телефонам', async () => {
    const report = ok(await call(admin, 'GET', '/reports/summary?period=TODAY'));
    const devices = await prisma.device.findMany({ where: { status: { not: 'SOLD' } } });
    const fromDevices = devices.reduce((s, d) => s.plus(d.costBasisUsd), D(0));
    const fromReport = D(report.mainWarehouseStockCostUsd ?? 0).plus((report.storeBreakdown as any[]).reduce((s, c) => s.plus(c.stockCostUsd ?? 0), D(0)));
    eq(fromReport, fromDevices, 'стоимость склада');
  });
} finally {
  for (const token of openedTokens) await call(token, 'POST', '/auth/logout').catch(() => undefined);
  server.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nПОЛНЫЙ ЦИКЛ: ${results.length - failed.length} проверок пройдено, ${failed.length} с ошибками`);
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.error?.split('\n')[0]}`);
  process.exitCode = failed.length ? 1 : 0;
}
