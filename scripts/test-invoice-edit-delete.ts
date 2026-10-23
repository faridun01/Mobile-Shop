import { spawnSync } from 'node:child_process';
import assert from './lib/decimal-assert';
import { withDisposableApi } from './lib/disposable-api';
import { D } from '../server/src/common/decimal';

// Editing a purchase invoice by price and deleting it, through the real API on a temporary schema.
// The rules: any device or accessory batch that never left the invoice can be repriced (moving it
// between stores does not matter); a dearer invoice is owed to the supplier, a cheaper one below
// what was paid gives the overpaid part back to the Central Cash. An invoice with nothing sold
// can be deleted wherever its goods are, and what was paid on it comes back to the Central Cash.
await withDisposableApi('invoice_edit', async ({ db, call, env, login }) => {
  const ok = (r: { status: number; data: any }, what: string) => { assert(r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
  const refused = (r: { status: number; data: any }, pattern: RegExp, what: string) => {
    assert(r.status >= 400, `${what} must be refused, got ${r.status}`);
    assert.match(String(r.data?.message), pattern);
  };
  ok(await call('POST', '/exchange-rate/today', { rate: 10 }), 'rate');
  ok(await call('POST', '/owners/owner-admin/investment', { amountUsd: 10000 }), 'investment');
  const seller = await login('ahmad', 'seller123');
  const supplier = await db.supplier.findFirstOrThrow();
  const central = await db.store.findFirstOrThrow({ where: { isMainWarehouse: true } });
  const imei = (i: number) => `35${String(9300000000000 + i).padStart(13, '0')}`;

  const snap = async (invoiceId?: string) => {
    const store = await db.store.findUniqueOrThrow({ where: { id: central.id } });
    const account = await db.financialAccount.findUniqueOrThrow({ where: { storeId: central.id } });
    assert.equal(account.balanceUsd, store.cashBalanceUsd, 'Central Cash = its ledger account');
    const s = await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
    const invoices = await db.supplierInvoice.findMany({ where: { supplierId: supplier.id } });
    assert.equal(s.totalPurchasedUsd, invoices.reduce((a, i) => a.plus(i.totalAmountUsd), D(0)), 'supplier purchases = its invoices');
    assert.equal(s.totalDebtUsd, invoices.reduce((a, i) => a.plus(D(i.totalAmountUsd).minus(i.paidAmountUsd)), D(0)), 'supplier debt = unpaid invoices');
    for (const i of invoices) assert(D(i.paidAmountUsd).lte(i.totalAmountUsd), `invoice ${i.invoiceNumber} overpaid`);
    const invoice = invoiceId ? await db.supplierInvoice.findUnique({ where: { id: invoiceId } }) : null;
    return { cash: D(store.cashBalanceUsd), purchased: D(s.totalPurchasedUsd), paid: D(s.totalPaidUsd), debt: D(s.totalDebtUsd), total: invoice ? D(invoice.totalAmountUsd) : null, invPaid: invoice ? D(invoice.paidAmountUsd) : null };
  };
  const prices = async (invoiceId: string, model: string, price: number) => (await db.device.findMany({ where: { purchaseInvoiceId: invoiceId, model } })).map((d) => ({ deviceId: d.id, purchasePriceUsd: price }));

  // Invoice A: 3 Samsung at $500 and 2 Honor at $300 = $2100, $1000 paid from the Central Cash; 2 Samsung moved to a store.
  const before = await snap();
  const a = ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-A', paidAmountUsd: 1000,
    groups: [
      { brand: 'Samsung', model: 'A55', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 500, items: [0, 1, 2].map((i) => ({ imei: imei(i) })) },
      { brand: 'Honor', model: 'X8d', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 300, items: [3, 4].map((i) => ({ imei: imei(i) })) },
    ],
  }), 'purchase A').invoice;
  const samsung = await db.device.findMany({ where: { purchaseInvoiceId: a.id, model: 'A55' }, orderBy: { imei: 'asc' } });
  ok(await call('POST', '/transfers', { fromStoreId: central.id, toStoreId: 'store-siyoma', deviceIds: samsung.slice(0, 2).map((d) => d.id) }), 'transfer');
  let s = await snap(a.id);
  assert.equal(s.cash.minus(before.cash), -1000);
  assert.equal(s.debt.minus(before.debt), 1100);

  const contents = ok(await call('GET', `/supplier-invoices/${a.id}/contents`), 'contents');
  assert.equal(contents.devices.length, 5);
  assert(contents.devices.every((d: any) => d.locked === null), 'nothing locked yet');
  assert.equal(contents.canDelete, true);
  console.log('PASS: invoice contents list every device, editable after a transfer');

  // 1. Samsung $500 → $450 (the two moved to the store included): total $1950, debt $950, cash untouched.
  let prev = s;
  ok(await call('PUT', `/supplier-invoices/${a.id}`, { prices: await prices(a.id, 'A55', 450) }), 'edit samsung 450');
  s = await snap(a.id);
  assert.equal(s.total, 1950);
  assert.equal(s.invPaid, 1000);
  assert.equal(s.debt.minus(prev.debt), -150);
  assert.equal(s.cash, prev.cash);
  const moved = await db.device.findUniqueOrThrow({ where: { id: samsung[0].id } });
  assert.equal(moved.purchasePriceUsd, 450);
  assert.equal(moved.costBasisUsd, 450);
  assert.equal(moved.storeId, 'store-siyoma');
  console.log('PASS: a cheaper price lowers the debt, also for phones already moved to a store');

  // 2. Below what was paid: Samsung $200, Honor $100 → total $800 < $1000 paid → $200 back to the Central Cash.
  prev = s;
  ok(await call('PUT', `/supplier-invoices/${a.id}`, { prices: [...await prices(a.id, 'A55', 200), ...await prices(a.id, 'X8d', 100)] }), 'edit below paid');
  s = await snap(a.id);
  assert.equal(s.total, 800);
  assert.equal(s.invPaid, 800);
  assert.equal(s.cash.minus(prev.cash), 200);
  assert.equal(s.paid.minus(prev.paid), -200);
  assert.equal(s.debt.minus(prev.debt), -950);
  const refund = await db.financialTransaction.findFirstOrThrow({ where: { sourceType: 'SUPPLIER_REFUND', sourceId: a.id } });
  assert.equal(refund.direction, 'IN');
  assert.equal(refund.amountUsd, 200);
  console.log('PASS: priced below what was paid, the overpaid $200 goes back to the Central Cash');

  // 3. Dearer again: Honor $100 → $400 → total $1400, the extra $600 is owed; cash untouched.
  prev = s;
  ok(await call('PUT', `/supplier-invoices/${a.id}`, { prices: await prices(a.id, 'X8d', 400) }), 'edit dearer');
  s = await snap(a.id);
  assert.equal(s.total, 1400);
  assert.equal(s.invPaid, 800);
  assert.equal(s.debt.minus(prev.debt), 600);
  assert.equal(s.cash, prev.cash);
  console.log('PASS: a dearer price is owed to the supplier as debt');

  // 4. A sold phone keeps its price; the others still change; the invoice can no longer be deleted.
  ok(await call('POST', '/sales', { storeId: 'store-siyoma', paymentMethod: 'CASH', items: [{ deviceId: samsung[0].id, salePriceTjs: 3000 }] }, { token: seller }), 'sale');
  refused(await call('PUT', `/supplier-invoices/${a.id}`, { prices: [{ deviceId: samsung[0].id, purchasePriceUsd: 250 }] }), /уже продавался/, 'repricing a sold phone');
  ok(await call('PUT', `/supplier-invoices/${a.id}`, { prices: [{ deviceId: samsung[1].id, purchasePriceUsd: 250 }] }), 'repricing an unsold phone');
  s = await snap(a.id);
  assert.equal(s.total, 1450);
  const after = ok(await call('GET', `/supplier-invoices/${a.id}/contents`), 'contents after sale');
  assert.equal(after.devices.find((d: any) => d.id === samsung[0].id).locked, 'SOLD');
  assert.equal(after.canDelete, false);
  refused(await call('DELETE', `/supplier-invoices/${a.id}`), /уже продана/, 'deleting with a sold phone');
  console.log('PASS: a sold phone keeps its price and blocks deleting the invoice; unsold ones still change');

  // 5. Invoice B, fully paid $700 (2 Poco at $250 + 10 cases at $20), one Poco moved to the store: deleted.
  prev = await snap();
  const b = ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-B', paidAmountUsd: 700,
    groups: [
      { brand: 'Poco', model: 'M8', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 250, items: [10, 11].map((i) => ({ imei: imei(i) })) },
      { category: 'ACCESSORY', barcode: 'CASE-001', brand: 'Generic', name: 'Чехол', accessoryCategory: 'Чехлы', quantity: 10, purchasePriceUsd: 20 },
    ],
  }), 'purchase B').invoice;
  const poco = await db.device.findMany({ where: { purchaseInvoiceId: b.id } });
  const moveB = ok(await call('POST', '/transfers', { fromStoreId: central.id, toStoreId: 'store-siyoma', deviceIds: [poco[0].id] }), 'transfer B');
  // The case's unit cost can change while all ten are in stock.
  const batch = await db.accessoryBatch.findFirstOrThrow({ where: { purchaseInvoiceId: b.id } });
  ok(await call('PUT', `/supplier-invoices/${b.id}`, { accessoryCosts: [{ batchId: batch.id, unitCostUsd: 15 }] }), 'reprice cases');
  s = await snap(b.id);
  assert.equal(s.total, 650);
  assert.equal(s.invPaid, 650);
  assert.equal(s.cash.minus(prev.cash), -650);
  console.log('PASS: an untouched accessory batch is repriced; the $50 overpaid comes back to the Central Cash');
  prev = s;
  ok(await call('DELETE', `/supplier-invoices/${b.id}`), 'delete B');
  s = await snap();
  assert.equal(s.cash.minus(prev.cash), 650);
  assert.equal(s.purchased.minus(prev.purchased), -650);
  assert.equal(s.paid.minus(prev.paid), -650);
  assert.equal(s.debt, prev.debt);
  assert.equal(await db.device.count({ where: { id: { in: poco.map((d) => d.id) } } }), 0);
  assert.equal(await db.supplierInvoice.count({ where: { id: b.id } }), 0);
  assert.equal(await db.accessoryBatch.count({ where: { purchaseInvoiceId: b.id } }), 0);
  const moveId = moveB.id ?? moveB.transfer?.id;
  if (moveId) assert.equal(await db.transferRequest.count({ where: { id: moveId } }), 0);
  console.log('PASS: a paid invoice whose phone was moved to a store is deleted, its $650 back in the Central Cash');

  // 5b. An unpaid invoice (all on credit), its phone moved to a store: deleted, the debt drops, no cash moves.
  prev = await snap();
  const c = ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-C',
    groups: [{ brand: 'Redmi', model: '14C', ram: '4GB', storage: '128GB', color: 'Blue', purchasePriceUsd: 150, items: [20, 21].map((i) => ({ imei: imei(i) })) }],
  }), 'purchase C').invoice;
  const redmi = await db.device.findFirstOrThrow({ where: { purchaseInvoiceId: c.id } });
  ok(await call('POST', '/transfers', { fromStoreId: central.id, toStoreId: 'store-siyoma', deviceIds: [redmi.id] }), 'transfer C');
  ok(await call('PUT', `/supplier-invoices/${c.id}`, { prices: [{ deviceId: redmi.id, purchasePriceUsd: 140 }] }), 'reprice unpaid');
  assert.equal((await snap(c.id)).debt.minus(prev.debt), 290);
  ok(await call('DELETE', `/supplier-invoices/${c.id}`), 'delete unpaid C');
  s = await snap();
  assert.equal(s.debt, prev.debt);
  assert.equal(s.cash, prev.cash);
  assert.equal(await db.supplierInvoice.count({ where: { id: c.id } }), 0);
  console.log('PASS: an unpaid invoice is repriced and deleted after a transfer; only the supplier debt changes');

  // 7. A name typed wrong at receipt: "Samsung A5" instead of "A55", "Чехл" instead of "Чехол".
  // Unsold units take the right name, a sold one keeps it on its receipt; no money moves.
  prev = await snap();
  const d = ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-D',
    groups: [
      { brand: 'Samsung', model: 'A5', ram: '8GB', storage: '256GB', color: 'Black', purchasePriceUsd: 300, items: [30, 31].map((i) => ({ imei: imei(i) })) },
      { category: 'ACCESSORY', barcode: 'CASE-D', brand: 'Generic', name: 'Чехл', accessoryCategory: 'Чехлы', quantity: 5, purchasePriceUsd: 3 },
    ],
  }), 'purchase D').invoice;
  const [soldA5, keptA5] = await db.device.findMany({ where: { purchaseInvoiceId: d.id }, orderBy: { imei: 'asc' } });
  ok(await call('POST', '/transfers', { fromStoreId: central.id, toStoreId: 'store-siyoma', deviceIds: [soldA5.id] }), 'transfer D');
  const saleD = ok(await call('POST', '/sales', { storeId: 'store-siyoma', paymentMethod: 'CASH', items: [{ deviceId: soldA5.id, salePriceTjs: 3500 }] }, { token: seller }), 'sale D');
  const spec = (id: string, model: string) => ({ deviceId: id, brand: 'Samsung', model, ram: '8GB', storage: '256GB', color: 'Black' });
  refused(await call('PUT', `/supplier-invoices/${d.id}`, { specs: [spec(soldA5.id, 'A55'), spec(keptA5.id, 'A55')] }), /уже продавался.*название/, 'renaming a sold phone');
  refused(await call('PUT', `/supplier-invoices/${d.id}`, { specs: [spec(keptA5.id, '')] }), /бренд, модель/, 'an empty model');
  const productD = await db.accessoryProduct.findUniqueOrThrow({ where: { barcode: 'CASE-D' } });
  const contentsD = ok(await call('GET', `/supplier-invoices/${d.id}/contents`), 'contents D');
  assert.equal(contentsD.accessories[0].nameEditable, true, 'the card only this invoice brought in can be renamed');
  ok(await call('PUT', `/supplier-invoices/${d.id}`, {
    specs: [spec(keptA5.id, 'A55')],
    accessoryNames: [{ productId: productD.id, brand: 'Generic', name: 'Чехол A55', category: 'Чехлы' }],
  }), 'rename');
  assert.equal((await db.device.findUniqueOrThrow({ where: { id: keptA5.id } })).model, 'A55', 'the unsold phone has the right name');
  assert.equal((await db.device.findUniqueOrThrow({ where: { id: soldA5.id } })).model, 'A5', 'the sold phone keeps its name');
  assert.equal((await db.saleItem.findFirstOrThrow({ where: { saleId: saleD.id } })).model, 'A5', 'the receipt is unchanged');
  assert.equal((await db.phoneCatalog.findUniqueOrThrow({ where: { tac: imei(31).slice(0, 8) } })).model, 'A55', 'the IMEI autofill learns the right name');
  assert.deepEqual((await db.invoiceGroup.findMany({ where: { invoiceId: d.id }, orderBy: { model: 'asc' } })).map((g) => [g.model, g.quantity]), [['A5', 1], ['A55', 1]]);
  assert.equal((await db.accessoryProduct.findUniqueOrThrow({ where: { id: productD.id } })).name, 'Чехол A55');
  s = await snap(d.id);
  assert.equal(s.total, 615, 'renaming does not change the invoice total');
  assert.equal(s.cash, prev.cash);
  assert.equal(s.debt.minus(prev.debt), 615);
  // The same card received again on another invoice: its name is no longer this invoice's alone.
  ok(await call('POST', '/purchases', {
    supplierId: supplier.id, invoiceNumber: 'INV-E',
    groups: [{ category: 'ACCESSORY', barcode: 'CASE-D', brand: 'Generic', name: 'Чехол A55', accessoryCategory: 'Чехлы', quantity: 2, purchasePriceUsd: 3 }],
  }), 'purchase E');
  assert.equal(ok(await call('GET', `/supplier-invoices/${d.id}/contents`), 'contents D again').accessories[0].nameEditable, false);
  refused(await call('PUT', `/supplier-invoices/${d.id}`, { accessoryNames: [{ productId: productD.id, brand: 'Generic', name: 'Чехол', category: 'Чехлы' }] }), /других приходах/, 'renaming a shared card');
  const renameLog = await db.auditLog.findFirstOrThrow({ where: { action: 'INVOICE_EDIT', targetId: d.id }, orderBy: { createdAt: 'desc' } });
  assert.match(renameLog.details, /названия: .*A5 .*→ .*A55/);
  console.log('PASS: a name typed wrong is fixed on unsold phones and on the invoice\'s own accessory card; receipts and money stay');

  // 6. Everything reconciles: owners, capital, customer debt.
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  console.log('PASS: owner balances and capital reconcile after repricing and deleting invoices');
});
