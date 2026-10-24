import { describe, expect, it } from 'vitest';
import { codeChanges, groupInvoiceDevices, invoiceEditResult, parseUsd, renameChanges, specDraftOf, type InvoiceContents, type InvoiceContentDevice } from './invoiceEdit';

const device = (id: string, model: string, price: number, extra: Partial<InvoiceContentDevice> = {}): InvoiceContentDevice => ({
  id, brand: 'Samsung', model, ram: '8GB', storage: '256GB', color: 'Black', imei: `35${id}`, purchasePriceUsd: price,
  isBonus: false, status: 'MAIN_WAREHOUSE', storeName: 'Главный склад', locked: null, ...extra,
});
// $2300 invoice: 3 × A55 at $500 (two moved to a store, one sold) + 2 × X8d at $300 + 10 cases at $20; $1000 paid.
const contents: InvoiceContents = {
  invoice: { id: 'inv', invoiceNumber: 'INV-A', supplierName: 'Dubai Mobile', totalAmountUsd: 2300, paidAmountUsd: 1000 },
  devices: [
    device('1', 'A55', 500, { storeName: 'Сиёма', status: 'SOLD', locked: 'SOLD' }),
    device('2', 'A55', 500, { storeName: 'Сиёма', status: 'STORE_STOCK' }),
    device('3', 'A55', 500),
    device('4', 'X8d', 300),
    device('5', 'X8d', 300),
  ],
  accessories: [{ id: 'b1', productId: 'p1', brand: 'Generic', name: 'Чехол', category: 'Чехлы', nameEditable: true, barcode: 'C1', quantityReceived: 10, quantityRemaining: 10, unitCostUsd: 20, locked: null }],
  canDelete: false,
  deleteBlockReason: 'Часть телефонов из накладной уже продана',
};

describe('invoice price editing', () => {
  it('groups devices by model and price, with where the unsold units are', () => {
    const [a55, x8d] = groupInvoiceDevices(contents.devices);
    expect(a55).toMatchObject({ model: 'A55', price: 500, soldCount: 1 });
    expect(a55.editable.map((d) => d.id)).toEqual(['2', '3']);
    expect(a55.locations).toEqual([{ name: 'Сиёма', count: 1 }, { name: 'Главный склад', count: 1 }]);
    expect(x8d.editable).toHaveLength(2);
  });

  it('a cheaper price lowers the debt; the sold phone keeps its price', () => {
    const [a55] = groupInvoiceDevices(contents.devices);
    const r = invoiceEditResult(contents, { [a55.key]: '450' }, {});
    expect(r.prices.map((p) => p.deviceId)).toEqual(['2', '3']);
    expect(r).toMatchObject({ newTotal: 2200, diff: -100, refund: 0, debtBefore: 1300, debtAfter: 1200 });
  });

  it('below what was paid, the overpaid part comes back to the Central Cash', () => {
    const [a55, x8d] = groupInvoiceDevices(contents.devices);
    const r = invoiceEditResult(contents, { [a55.key]: '100', [x8d.key]: '100' }, { b1: '5' });
    // 500 (sold) + 2×100 + 2×100 + 10×5 = $950 < $1000 paid.
    expect(r).toMatchObject({ newTotal: 950, refund: 50, debtAfter: 0 });
    expect(r.accessoryCosts).toEqual([{ batchId: 'b1', unitCostUsd: 5 }]);
  });

  it('a dearer price is owed to the supplier', () => {
    const [, x8d] = groupInvoiceDevices(contents.devices);
    expect(invoiceEditResult(contents, { [x8d.key]: '350.50' }, {})).toMatchObject({ newTotal: 2401, refund: 0, debtAfter: 1401 });
  });

  it('rejects amounts that are not prices', () => {
    const [a55] = groupInvoiceDevices(contents.devices);
    expect(invoiceEditResult(contents, { [a55.key]: '0' }, { b1: 'abc' }).invalid).toEqual([a55.key, 'b1']);
    expect(parseUsd('12,5')).toBe(12.5);
    expect(parseUsd('1.234')).toBeNull();
  });
});

describe('fixing names typed wrong at receipt', () => {
  it('renames the unsold units of a model only, and only when something changed', () => {
    const groups = groupInvoiceDevices(contents.devices);
    const [a55] = groups;
    expect(renameChanges(groups, { [a55.key]: specDraftOf(a55) }, contents.accessories, {}).specs).toEqual([]);
    const r = renameChanges(groups, { [a55.key]: { ...specDraftOf(a55), model: ' A56  5G ' } }, contents.accessories, {});
    // The sold unit (id 1) keeps its name on the receipt.
    expect(r.specs.map((s) => [s.deviceId, s.model])).toEqual([['2', 'A56 5G'], ['3', 'A56 5G']]);
    expect(r.invalid).toEqual([]);
  });

  it('asks for the fields a receipt requires', () => {
    const groups = groupInvoiceDevices(contents.devices);
    const [a55] = groups;
    expect(renameChanges(groups, { [a55.key]: { ...specDraftOf(a55), ram: '' } }, contents.accessories, {}).invalid).toEqual([a55.key]);
    expect(renameChanges(groups, {}, contents.accessories, { p1: { brand: '', name: '', category: 'Чехлы', barcode: 'C1' } }).invalid).toEqual(['p1']);
  });

  it('renames an accessory card this invoice brought in, not one other invoices share', () => {
    const draft = { p1: { brand: 'Generic', name: 'Чехол A55', category: 'Чехлы', barcode: ' c 1 ' } };
    expect(renameChanges([], {}, contents.accessories, draft).accessoryNames).toEqual([{ productId: 'p1', brand: 'Generic', name: 'Чехол A55', category: 'Чехлы', barcode: 'C1' }]);
    const shared = contents.accessories.map((b) => ({ ...b, nameEditable: false }));
    expect(renameChanges([], {}, shared, draft).accessoryNames).toEqual([]);
  });
});

describe('fixing IMEIs and serial numbers typed wrong at receipt', () => {
  const phone = (id: string, imei: string, imei2: string | null = null) => device(id, 'A55', 500, { imei, imei2 });
  const tablet = (id: string, imei: string) => device(id, 'Tab', 150, { imei, category: 'TABLET' });

  it('saves only codes that changed, an SN upper-cased, an empty second code as none', () => {
    const devices = [phone('a', '350000000000001'), phone('b', '350000000000002', '350000000000099'), tablet('t', 'R9TW001')];
    const r = codeChanges(devices, {
      a: { imei: '350000000000001', imei2: '' },
      b: { imei: '35 0000 0000 0000 3', imei2: '' },
      t: { imei: 'r9tw002', imei2: '' },
    });
    expect(r.invalid).toEqual([]);
    expect(r.codes).toEqual([{ deviceId: 'b', imei: '350000000000003', imei2: null }, { deviceId: 't', imei: 'R9TW002', imei2: null }]);
  });

  it('lets two units swap codes but refuses a code typed twice or in the wrong format', () => {
    const devices = [phone('a', '350000000000001'), phone('b', '350000000000002')];
    expect(codeChanges(devices, { a: { imei: '350000000000002', imei2: '' }, b: { imei: '350000000000001', imei2: '' } }).codes).toHaveLength(2);
    expect(codeChanges(devices, { a: { imei: '350000000000005', imei2: '' }, b: { imei: '350000000000005', imei2: '' } }).invalid.sort()).toEqual(['a', 'b']);
    expect(codeChanges(devices, { a: { imei: '3500', imei2: '' } }).invalid).toEqual(['a']);
    expect(codeChanges(devices, { a: { imei: '350000000000001', imei2: '350000000000001' } }).invalid).toEqual(['a']);
  });
});
