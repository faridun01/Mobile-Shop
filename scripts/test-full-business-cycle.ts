import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from './lib/decimal-assert';
import { withDisposableApi } from './lib/disposable-api';
import { D } from '../server/src/common/decimal';
import { buildComprehensiveReportWorkbook, eventOperationLabel, type ComprehensiveReportSummary } from '../src/utils/exportReports';
import { mapExpense } from '../src/api/mappers';

// The whole business cycle through the real API on a temporary schema, with round numbers (rate 10):
// a purchase invoice edited and another deleted, goods delivered to the store and one moved back,
// yesterday's sales with the shift closed, then today a sale, a dearer and a cheaper exchange of
// yesterday's phones, a return with a withheld part, a debt sale and its repayment, accessories
// sold and a whole receipt refunded, an expense, and the shift closed. Every step checks the
// registers, the supplier, the report (and its Excel), the shift and the owners' split.
await withDisposableApi('full_cycle', async ({ db, call, env, login, baseUrl }) => {
  const ok = (r: { status: number; data: any }, what: string) => { assert(r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
  const refused = (r: { status: number; data: any }, pattern: RegExp, what: string) => {
    assert(r.status >= 400, `${what} must be refused, got ${r.status}`);
    assert.match(String(r.data?.message), pattern, what);
    console.log(`   отказ: ${what} → «${r.data.message}»`);
  };
  const usd = (v: unknown) => `$${D(v as number).toFixed(2)}`;
  const tjs = (v: unknown) => `${D(v as number).toFixed(0)} TJS`;
  const step = (title: string) => console.log(`\n=== ${title}`);
  const STORE = 'store-siyoma';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(d);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const Y = day(yesterday);
  const T = day(new Date());

  await db.exchangeRate.upsert({ where: { date: Y }, update: { rate: 10 }, create: { date: Y, rate: 10, createdByUserId: 'user-admin' } });
  ok(await call('POST', '/exchange-rate/today', { rate: 10 }), 'rate');
  ok(await call('POST', '/owners/owner-admin/investment', { amountUsd: 10000 }), 'investment');
  await db.user.update({ where: { id: 'user-partner' }, data: { storeId: STORE } });
  ok(await call('PUT', `/stores/${STORE}/profit-shares`, { shares: [{ ownerId: 'owner-partner', sharePercent: 40 }] }), 'partner share');
  const seller = await login('ahmad', 'seller123');
  const supplier = await db.supplier.findFirstOrThrow();
  const central = await db.store.findFirstOrThrow({ where: { isMainWarehouse: true } });
  const imei = (i: number) => `35${String(9400000000000 + i).padStart(13, '0')}`;

  // Each register equals its ledger account; the supplier's debt equals its unpaid invoices.
  const books = async () => {
    for (const id of [central.id, STORE]) {
      const store = await db.store.findUniqueOrThrow({ where: { id } });
      // A store's ledger account is opened by its first money movement.
      const account = await db.financialAccount.findUnique({ where: { storeId: id } });
      assert.equal(account?.balanceUsd ?? 0, store.cashBalanceUsd, `${store.name}: касса = счёт в журнале`);
    }
    const s = await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
    const invoices = await db.supplierInvoice.findMany({ where: { supplierId: supplier.id } });
    assert.equal(s.totalDebtUsd, invoices.reduce((a, i) => a.plus(D(i.totalAmountUsd).minus(i.paidAmountUsd)), D(0)), 'долг поставщику = неоплаченные накладные');
    const cash = async (id: string) => D((await db.store.findUniqueOrThrow({ where: { id } })).cashBalanceUsd);
    return { central: await cash(central.id), store: await cash(STORE), debt: D(s.totalDebtUsd), purchased: D(s.totalPurchasedUsd) };
  };
  const owners = async () => Object.fromEntries((await db.owner.findMany()).map((o) => [o.id, D(o.totalAccruedProfitUsd)]));

  // ------------------------------------------------------------------ 1. Purchase
  step('1. Приход: накладная INV-1 на $2120, оплачено $1500 из Центральной кассы');
  const b0 = await books();
  const owners0 = await owners();
  const inv1 = ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-1', paidAmountUsd: 1500,
    groups: [
      { brand: 'Samsung', model: 'A55', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 400, items: [0, 1, 2].map((i) => ({ imei: imei(i) })) },
      { brand: 'Honor', model: 'X8d', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 250, items: [3, 4].map((i) => ({ imei: imei(i) })) },
      { brand: 'Xiaomi', model: 'Redmi 14', ram: '8GB', storage: '128GB', color: 'Blue', purchasePriceUsd: 150, items: [5, 6].map((i) => ({ imei: imei(i) })) },
      { brand: 'Tecno', model: 'Spark 30', ram: '8GB', storage: '128GB', color: 'Black', purchasePriceUsd: 100, items: [{ imei: imei(7) }] },
      { category: 'ACCESSORY', barcode: 'CASE-A55', brand: 'Generic', name: 'Чехол A55', accessoryCategory: 'Чехлы', quantity: 10, purchasePriceUsd: 2 },
    ],
  }), 'purchase INV-1').invoice;
  let b = await books();
  assert.equal(inv1.totalAmountUsd, 2120);
  assert.equal(b.central.minus(b0.central), -1500, 'Центральная касса −$1500');
  assert.equal(b.debt.minus(b0.debt), 620, 'долг поставщику +$620');
  console.log(`   накладная ${usd(inv1.totalAmountUsd)}, касса −$1500, долг поставщику +$620`);

  const dev = async (i: number) => db.device.findUniqueOrThrow({ where: { imei: imei(i) } });
  const pricesOf = async (model: string, price: number) => (await db.device.findMany({ where: { purchaseInvoiceId: inv1.id, model } })).map((d) => ({ deviceId: d.id, purchasePriceUsd: price }));

  step('2. Редактирование цены: Samsung $400 → $420 (накладная дороже — это долг поставщику)');
  ok(await call('PUT', `/supplier-invoices/${inv1.id}`, { prices: await pricesOf('A55', 420) }), 'edit samsung');
  let prev = b; b = await books();
  assert.equal(b.debt.minus(prev.debt), 60, 'долг +$60');
  assert.equal(b.central, prev.central, 'касса не меняется');
  assert.equal((await dev(0)).costBasisUsd, 420, 'себестоимость телефона = новая цена');
  console.log('   накладная $2180, долг поставщику +$60, касса без изменений');

  step('3. Вторая накладная INV-2 на $200 (оплачена полностью) — удаляем');
  const inv2 = ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-2', paidAmountUsd: 200,
    groups: [{ brand: 'Poco', model: 'M8', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 200, items: [{ imei: imei(9) }] }],
  }), 'purchase INV-2').invoice;
  prev = b; b = await books();
  assert.equal(b.central.minus(prev.central), -200);
  ok(await call('DELETE', `/supplier-invoices/${inv2.id}`), 'delete INV-2');
  prev = b; b = await books();
  assert.equal(b.central.minus(prev.central), 200, 'оплата вернулась в Центральную кассу');
  assert.equal(await db.supplierInvoice.count({ where: { id: inv2.id } }), 0, 'накладная исчезла');
  assert.equal(await db.device.count({ where: { imei: imei(9) } }), 0, 'телефон накладной удалён');
  console.log('   $200 вернулись в Центральную кассу, накладная и телефон удалены');

  // ------------------------------------------------------------------ 4. Moving goods
  step('4. Доставка в магазин Сиёма и перемещение обратно');
  const caseProduct = await db.accessoryProduct.findUniqueOrThrow({ where: { barcode: 'CASE-A55' } });
  ok(await call('POST', '/store-receipts', { storeId: STORE, imeis: [0, 1, 2, 5, 6, 7].map(imei), accessories: [{ productId: caseProduct.id, quantity: 10 }] }), 'store receipt');
  ok(await call('POST', '/transfers', { fromStoreId: central.id, toStoreId: STORE, deviceIds: [(await dev(3)).id, (await dev(4)).id] }), 'admin transfer');
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) assert.equal((await dev(i)).storeId, STORE, `IMEI ${i} в магазине`);
  // The seller sends the Tecno back; the admin approves.
  const back = ok(await call('POST', '/transfers', { fromStoreId: STORE, toStoreId: central.id, deviceIds: [(await dev(7)).id] }, { token: seller }), 'seller transfer request');
  assert.equal((await dev(7)).status, 'TRANSFER_PENDING');
  ok(await call('POST', `/transfers/${back.id}/approve`), 'approve transfer');
  assert.equal((await dev(7)).storeId, central.id, 'Tecno вернулся на главный склад');
  prev = b; b = await books();
  assert.equal(b.central, prev.central, 'перемещение не двигает деньги');
  assert.equal(b.store, prev.store);
  console.log('   приход в магазин: 3 Samsung, 2 Redmi, Tecno, 10 чехлов; перемещение: 2 Honor; Tecno отправлен обратно и подтверждён');

  step('5. Цена после перемещения: Redmi $150 → $140 (накладная дешевле — долг меньше)');
  ok(await call('PUT', `/supplier-invoices/${inv1.id}`, { prices: await pricesOf('Redmi 14', 140) }), 'edit redmi');
  prev = b; b = await books();
  assert.equal(b.debt.minus(prev.debt), -20, 'долг −$20');
  assert.equal(D((await db.supplierInvoice.findUniqueOrThrow({ where: { id: inv1.id } })).totalAmountUsd), 2160);
  console.log('   накладная $2160, долг поставщику $660');

  // ------------------------------------------------------------------ 6. Yesterday
  step('6. Вчера: три продажи, смена закрыта');
  const sell = async (body: Record<string, unknown>, what: string) => ok(await call('POST', '/sales', { storeId: STORE, customerName: 'Покупатель', paymentMethod: 'CASH', ...body }, { token: seller }), what);
  const phone = async (i: number, priceTjs: number, extra: Record<string, unknown> = {}) => sell({ items: [{ deviceId: (await dev(i)).id, salePriceTjs: priceTjs }], ...extra }, `sale IMEI ${i}`);
  const s1 = await phone(0, 5000); // Samsung: $500 − $420 = +$80
  const h1 = await phone(3, 3000); // Honor:   $300 − $250 = +$50
  const r1 = await phone(5, 2000); // Redmi:   $200 − $140 = +$60
  for (const s of [s1, h1, r1]) {
    await db.sale.update({ where: { id: s.id }, data: { createdAt: yesterday } });
    await db.financialTransaction.updateMany({ where: { sourceType: 'SALE', sourceId: s.id }, data: { transactionDate: yesterday } });
    await db.ledgerEntry.updateMany({ where: { referenceId: s.id }, data: { createdAt: yesterday } });
    await db.auditLog.updateMany({ where: { targetId: s.id }, data: { createdAt: yesterday } });
  }
  const yShift = ok(await call('GET', `/daily-closings/summary?storeId=${STORE}&businessDate=${Y}`), 'yesterday summary');
  ok(await call('POST', '/daily-closings', { storeId: STORE, businessDate: Y, actualCashTjs: yShift.expectedCashTjs }), 'close yesterday');
  const report = async (from: string, to: string) => ok(await call('GET', `/reports/summary?startDate=${from}&endDate=${to}&storeId=${STORE}&events=1`), 'report');
  const ry = await report(Y, Y);
  assert.equal(ry.revenueUsd, 1000); assert.equal(ry.cogsUsd, 810); assert.equal(ry.profitUsd, 190);
  const o1 = await owners();
  assert.equal(o1['owner-partner'].minus(owners0['owner-partner']), 76, 'партнёр 40% от $190');
  assert.equal(o1['owner-admin'].minus(owners0['owner-admin']), 114, 'админ 60% от $190');
  console.log(`   выручка ${usd(ry.revenueUsd)}, себестоимость ${usd(ry.cogsUsd)}, прибыль ${usd(ry.profitUsd)} → партнёр $76 (40%), админ $114 (60%)`);
  console.log(`   смена ${Y} закрыта, в кассе ${tjs(yShift.expectedCashTjs)}`);

  step('7. Накладная после продажи: проданный телефон не переоценить, накладную не удалить');
  const contents = ok(await call('GET', `/supplier-invoices/${inv1.id}/contents`), 'contents');
  assert.equal(contents.devices.find((d: any) => d.imei === imei(0)).locked, 'SOLD');
  assert.equal(contents.canDelete, false);
  refused(await call('PUT', `/supplier-invoices/${inv1.id}`, { prices: [{ deviceId: (await dev(0)).id, purchasePriceUsd: 300 }] }), /продава/, 'цена проданного Samsung');
  refused(await call('DELETE', `/supplier-invoices/${inv1.id}`), /продан/, 'удаление накладной с проданным товаром');

  // ------------------------------------------------------------------ 8. Today
  step('8. Сегодня');
  const shift0 = ok(await call('GET', `/daily-closings/summary?storeId=${STORE}&businessDate=${T}`), 'today summary');
  prev = b; b = await books();
  assert.equal(b.store.minus(prev.store), 1000, 'вчера в кассу магазина пришло $1000');
  const s2 = await phone(1, 5200, { paymentMethod: 'SPLIT', cashAmountTjs: 3200, cardAmountTjs: 2000 });
  console.log('   a) продажа Samsung 5200 TJS (3200 нал + 2000 карта): +$100');
  const exchange = async (from: any, i: number, priceTjs: number, what: string) => ok(await call('POST', '/exchanges', {
    saleId: from.id, saleItemId: from.saleItems[0].id, withheldTjs: 0, replacementDeviceId: (await dev(i)).id, newPriceTjs: priceTjs, paymentMethod: 'CASH', reason: what,
  }, { token: seller }), what);
  const ex1 = await exchange(h1, 2, 5500, 'Обмен на Samsung'); // dearer: customer pays 2500 TJS
  console.log('   b) обмен вчерашнего Honor (3000) на Samsung 5500: клиент доплатил 2500 TJS; −$50 Honor, +$130 Samsung');
  const ex2 = await exchange(s1, 4, 2800, 'Обмен на Honor'); // cheaper: 2200 TJS back
  console.log('   c) обмен вчерашнего Samsung (5000) на Honor 2800: клиенту выдали 2200 TJS; −$80 Samsung, +$30 Honor');
  ok(await call('POST', `/sales/${r1.id}/return-items`, { items: [{ saleItemId: r1.saleItems[0].id, withheldTjs: 200 }], accessories: [], reason: 'Не подошёл', paymentMethod: 'CASH' }), 'return (admin)');
  console.log('   d) админ оформил возврат вчерашнего Redmi (2000), удержано 200 TJS: клиенту 1800 TJS; −$60 и +$20 удержание');
  const customer = ok(await call('POST', '/customers', { name: 'Фарход', phone: '+992900000111' }), 'customer');
  await phone(6, 1800, { paymentMethod: 'DEBT', cashAmountTjs: 800, customerId: customer.id });
  ok(await call('POST', `/customers/${customer.id}/payments`, { amountTjs: 500, storeId: STORE }, { token: seller }), 'debt payment');
  console.log('   e) продажа Redmi 1800 TJS в долг (800 сразу, 1000 долг), погашено 500: +$40');
  await sell({ accessories: [{ productId: caseProduct.id, quantity: 3, unitPriceTjs: 40 }] }, 'accessories');
  console.log('   f) 3 чехла по 40 TJS: выручка $12, себестоимость $6, +$6');
  const acc2 = await sell({ accessories: [{ productId: caseProduct.id, quantity: 2, unitPriceTjs: 40 }] }, 'accessories 2');
  ok(await call('POST', `/sales/${acc2.id}/refund`, { reason: 'Передумал', refundAmountTjs: 80, penaltyFeeTjs: 0, paymentMethod: 'CASH' }), 'full refund');
  console.log('   g) 2 чехла по 40 TJS и полный возврат чека: +$4 и −$4');
  ok(await call('POST', '/expenses', { category: 'RENT', amountTjs: 500, storeId: STORE, targetType: 'STORE', paidFromCashRegister: true, comment: 'Аренда' }, { token: await login('partner', 'partner123') }), 'expense by partner');
  console.log('   h) партнёр записал расход: аренда 500 TJS из кассы магазина ($50)');

  // ------------------------------------------------------------------ 9. Report
  step('9. Отчёт за сегодня (строки отчёта)');
  const rt = await report(T, T);
  console.log('   операция                                   | сумма TJS | выручка $ | себест. $ | прибыль $ | удерж. $');
  for (const e of rt.events) {
    console.log(`   ${eventOperationLabel(e).padEnd(43)}| ${String(e.amountTjs).padStart(9)} | ${String(e.amountUsd).padStart(9)} | ${String(e.costUsd).padStart(9)} | ${String(e.profitUsd).padStart(9)} | ${String(e.penaltyUsd).padStart(7)}`);
  }
  // 520 − 300 + 550 − 500 + 280 − 200 + 180 + 12 + 8 − 8
  assert.equal(rt.revenueUsd, 542, 'выручка сегодня');
  assert.equal(rt.cogsUsd, 426, 'себестоимость сегодня');
  assert.equal(rt.periodRefundPenaltiesUsd, 20, 'удержание');
  // 100 − 50 + 130 − 80 + 30 − 60 + 20 + 40 + 6 + 4 − 4
  assert.equal(rt.profitUsd, 136, 'прибыль сегодня');
  assert.equal(rt.expensesUsd, 50);
  assert.equal(rt.netProfitUsd, 86, 'чистая прибыль сегодня');
  assert.equal(rt.events.reduce((s: any, e: any) => s.plus(e.amountUsd), D(0)), rt.revenueUsd, 'строки = выручка');
  assert.equal(rt.events.reduce((s: any, e: any) => s.plus(e.costUsd), D(0)), rt.cogsUsd, 'строки = себестоимость');
  assert.equal(rt.events.reduce((s: any, e: any) => s.plus(e.profitUsd).plus(e.penaltyUsd), D(0)), rt.profitUsd, 'строки = прибыль');
  const labels = rt.events.map(eventOperationLabel);
  assert(labels.includes(`Обмен: возврат по чеку № ${h1.receiptNumber} (новый чек № ${ex1.sale.receiptNumber})`), 'обмен дороже подписан');
  assert(labels.includes(`Обмен: новый чек (взамен № ${s1.receiptNumber})`), 'обмен дешевле подписан');
  assert(labels.includes(`Возврат (чек № ${r1.receiptNumber})`), 'возврат подписан');
  console.log(`   ИТОГО сегодня: выручка ${usd(rt.revenueUsd)}, себестоимость ${usd(rt.cogsUsd)}, удержано ${usd(rt.periodRefundPenaltiesUsd)}, прибыль ${usd(rt.profitUsd)}, расходы ${usd(rt.expensesUsd)}, чистая ${usd(rt.netProfitUsd)}`);

  const ry2 = await report(Y, Y);
  assert.equal(ry2.profitUsd, 190, 'вчерашняя прибыль не изменилась после обменов и возврата');
  const rb = await report(Y, T);
  assert.equal(rb.profitUsd, 326, 'за два дня = 190 + 136');
  assert.equal(rb.netProfitUsd, 276);
  const models = Object.fromEntries(rb.modelCounts.map((m: any) => [m.name, [m.count, m.profitUsd]]));
  console.log(`   вчера ${usd(ry2.profitUsd)} (не изменилась), за два дня ${usd(rb.profitUsd)}, чистая ${usd(rb.netProfitUsd)}`);
  console.log('   модели за два дня (продано, прибыль):', JSON.stringify(models));
  assert(!('Honor X8d' in models && models['Honor X8d'][0] > 1), 'возвращённый Honor не считается проданным');

  step('10. Excel за два дня');
  const names = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name] as [string, string]));
  const expenses = (ok(await call('GET', `/expenses?startDate=${Y}&endDate=${T}&storeId=${STORE}`), 'expenses') as any[]).map((e) => mapExpense(e, names));
  const summary: ComprehensiveReportSummary = {
    periodLabel: `${Y} — ${T}`, storeName: 'Сиёма', unitsSold: rb.unitsSold, revenueUsd: rb.revenueUsd, cogsUsd: rb.cogsUsd,
    refundPenaltiesUsd: rb.periodRefundPenaltiesUsd, debtFxUsd: rb.periodDebtFxUsd ?? 0, cashSurplusUsd: rb.periodCashSurplusUsd ?? 0,
    bonusDeviceProfitUsd: rb.bonusDeviceProfitUsd ?? 0, profitUsd: rb.profitUsd, cashBonusesUsd: 0,
    expensesUsd: rb.expensesUsd, expenseFxUsd: rb.periodExpenseFxUsd ?? 0, netProfitUsd: rb.netProfitUsd,
  };
  const workbook = await buildComprehensiveReportWorkbook({ events: rb.events, expenses, summary, generatedBy: 'Полный цикл' });
  const file = path.resolve('output/full-cycle/otchet_siyoma.xlsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await workbook.xlsx.writeFile(file);
  const ExcelJS = (await import('exceljs')).default;
  const xlsx = new ExcelJS.Workbook();
  await xlsx.xlsx.readFile(file);
  const result = (sheet: string, cell: string) => { const v = xlsx.getWorksheet(sheet)!.getCell(cell).value as any; return v && typeof v === 'object' && 'formula' in v ? (v.result ?? 0) : v; };
  assert.equal(result('Итого', 'B16'), 276, 'Excel: чистая прибыль');
  assert.equal(result('Итого', 'B17'), 0, 'Excel: контроль = 0');
  assert.equal(result('Итого', 'B9'), D(rb.profitUsd).minus(rb.periodRefundPenaltiesUsd), 'Excel: прибыль от продаж');
  assert.equal(result('Итого', 'B14'), 50, 'Excel: расходы');
  console.log(`   ${path.relative(process.cwd(), file)}: чистая прибыль $276, контрольная строка 0`);

  // ------------------------------------------------------------------ 11. Shift and registers
  step('11. Касса смены сегодня');
  const shift = ok(await call('GET', `/daily-closings/summary?storeId=${STORE}&businessDate=${T}`), 'today summary');
  const f = (k: string) => tjs(shift[k]);
  console.log(`   на начало ${f('openingCashTjs')}; продажи нал ${f('salesCashTjs')}, карта ${f('salesCardTjs')}; возвраты ${f('refundsCashTjs')}; расходы ${f('expensesCashTjs')}; погашения ${f('otherCashTjs')} → ожидается ${f('expectedCashTjs')}`);
  // The shift shows the day's movements (one register for cash and card):
  // sales 3200 + 2500 (exchange top-up) + 800 (debt sale) + 120 + 80 = 6700 cash, 2000 card;
  // handed back 2200 (cheaper exchange) + 1800 (return) + 80 (refund) = 4080; rent 500; repaid 500.
  assert.equal(shift.openingCashTjs, shift0.openingCashTjs);
  assert.equal(D(shift.salesCashTjs), 6700, 'продажи наличными');
  assert.equal(D(shift.salesCardTjs), 2000, 'карта 2000 TJS');
  assert.equal(D(shift.refundsCashTjs), 4080, 'выдано клиентам: сдача обмена, возврат, полный возврат');
  assert.equal(D(shift.expensesCashTjs), 500);
  assert.equal(D(shift.otherCashTjs), 500, 'погашение долга');
  assert.equal(D(shift.expectedCashTjs).minus(shift.openingCashTjs), 4620, 'касса за день +4620 TJS (из них 2000 картой)');
  prev = b; b = await books();
  assert.equal(b.store.minus(prev.store), 462, 'касса магазина (вместе с картой) +$462');
  assert.equal(b.central, prev.central, 'Центральная касса не задета продажами');
  // FULL_CYCLE_HOLD=1 (with UI_AUDIT_FRONTEND=true) keeps the app up on this data, before today's
  // closing, until "stop" on stdin: to look at the screens. Writes the URL to output/full-cycle/app.json.
  if (process.env.FULL_CYCLE_HOLD) {
    fs.writeFileSync('output/full-cycle/app.json', JSON.stringify({ baseUrl }));
    console.log(`   приложение на этих данных: ${baseUrl}`);
    await new Promise<void>((resolve) => process.stdin.on('data', (data) => { if (String(data).trim() === 'stop') resolve(); }));
  }
  ok(await call('POST', '/daily-closings', { storeId: STORE, businessDate: T, actualCashTjs: shift.expectedCashTjs }), 'close today');
  // The returned Redmi is back in stock, but the day is closed.
  refused(await call('POST', '/sales', { storeId: STORE, customerName: 'Покупатель', paymentMethod: 'CASH', items: [{ deviceId: (await dev(5)).id, salePriceTjs: 2000 }] }, { token: seller }), /смен/i, 'продажа после закрытия смены');

  // ------------------------------------------------------------------ 12. Owners
  step('12. Распределение прибыли владельцам (магазин Сиёма: партнёр 40%, админ 60%)');
  const o2 = await owners();
  const partnerDelta = o2['owner-partner'].minus(owners0['owner-partner']);
  const adminDelta = o2['owner-admin'].minus(owners0['owner-admin']);
  console.log(`   прибыль $326 − расходы $50 = $276 → партнёр ${usd(partnerDelta)}, админ ${usd(adminDelta)}`);
  assert.equal(partnerDelta, 110.4, 'партнёр: 40% × 276');
  assert.equal(adminDelta, 165.6, 'админ: 60% × 276');
  assert.equal(partnerDelta.plus(adminDelta), rb.netProfitUsd, 'владельцам начислено ровно столько, сколько в отчёте');

  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  console.log('\nPASS: полный цикл — приход, правка и удаление накладной, перемещения, продажи, обмены, возврат, долг, аксессуары, расходы, отчёт, Excel, смена и владельцы сходятся');
});
