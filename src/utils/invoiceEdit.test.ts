import { describe, expect, it } from 'vitest';
import { groupInvoiceDevices, invoiceEditResult, parseUsd, type InvoiceContents, type InvoiceContentDevice } from './invoiceEdit';

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
  accessories: [{ id: 'b1', brand: 'Generic', name: 'Чехол', barcode: 'C1', quantityReceived: 10, quantityRemaining: 10, unitCostUsd: 20, locked: null }],
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
