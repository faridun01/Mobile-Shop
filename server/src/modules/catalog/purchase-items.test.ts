import { describe, expect, it } from 'vitest';
import { parsePurchaseGroups, purchaseTotalUsd } from './purchase-items';
import { deviceCodeCandidates, isValidSerial, normalizeSerial } from '../../common/device-code';

const IMEI1 = '490154203237518';
const IMEI2 = '356938035643809';

describe('serial numbers', () => {
  it('stores an SN without spaces in upper case and finds it in any case', () => {
    expect(normalizeSerial(' dmpx 12ab3c ')).toBe('DMPX12AB3C');
    expect(deviceCodeCandidates('dmpx12ab3c')).toEqual(['dmpx12ab3c', 'DMPX12AB3C']);
    expect(deviceCodeCandidates(IMEI1)).toEqual([IMEI1]);
  });

  it('accepts letters/digits of any length 4–64, never limited to the IMEI format', () => {
    expect(isValidSerial('R9XN1234567')).toBe(true);
    expect(isValidSerial('C02XG0FDJGH5')).toBe(true);
    expect(isValidSerial('SN-2024/001.A')).toBe(true);
    expect(isValidSerial('ABC')).toBe(false);
    expect(isValidSerial('-ABCD')).toBe(false);
    expect(isValidSerial('A'.repeat(65))).toBe(false);
  });
});

describe('receipt positions', () => {
  it('keeps the phone rules: IMEI 1 / IMEI 2 split, 15 digits, RAM required', () => {
    const { devices, accessories, deviceGroups } = parsePurchaseGroups([
      { brand: 'Apple', model: 'iPhone 15', ram: '6 GB', storage: '128 GB', color: 'Black', purchasePriceUsd: 600, items: [{ imei: `${IMEI1} / ${IMEI2}` }] },
    ]);
    expect(accessories).toEqual([]);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ category: 'PHONE', imei: IMEI1, imei2: IMEI2 });
    expect(deviceGroups[0].quantity).toBe(1);
    expect(() => parsePurchaseGroups([{ brand: 'A', model: 'B', ram: '', storage: '128', color: 'x', purchasePriceUsd: 1, items: [{ imei: IMEI1 }] }]))
      .toThrow('IMEI, бренд, модель, RAM и память');
    expect(() => parsePurchaseGroups([{ brand: 'A', model: 'B', ram: '8', storage: '128', color: 'x', purchasePriceUsd: 1, items: [{ imei: 'R9XN1234567' }] }]))
      .toThrow('ровно 15 цифр');
  });

  it('takes a tablet by its SN and an optional additional SN, RAM optional', () => {
    const { devices } = parsePurchaseGroups([
      { category: 'TABLET', brand: 'Xiaomi', model: 'Redmi Pad Pro', ram: '', storage: '256 GB', color: 'Gray', connectivity: 'Wi-Fi', purchasePriceUsd: 210,
        items: [{ imei: 'r9xn1234567', imei2: 'kb-778899' }, { imei: 'R9XN7654321' }] },
    ]);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ category: 'TABLET', imei: 'R9XN1234567', imei2: 'KB-778899', connectivity: 'Wi-Fi', screenSize: null });
    expect(devices[1].imei2).toBeNull();
  });

  it('rejects a tablet without storage/colour, a bad SN, or the same SN in both slots', () => {
    const tablet = { category: 'TABLET', brand: 'Apple', model: 'iPad', storage: '64 GB', color: 'Silver', purchasePriceUsd: 300 };
    expect(() => parsePurchaseGroups([{ ...tablet, color: '', items: [{ imei: 'DMPX12AB3C' }] }])).toThrow('встроенную память и цвет');
    expect(() => parsePurchaseGroups([{ ...tablet, items: [{ imei: 'AB' }] }])).toThrow('SN планшета');
    expect(() => parsePurchaseGroups([{ ...tablet, items: [{ imei: 'DMPX12AB3C', imei2: 'dmpx12ab3c' }] }])).toThrow('совпадают');
  });

  it('counts an accessory by quantity at its unit cost and totals the receipt to the cent', () => {
    const { devices, accessories } = parsePurchaseGroups([
      { brand: 'Apple', model: 'iPhone 15', ram: '6 GB', storage: '128 GB', color: 'Black', purchasePriceUsd: 600.1, items: [{ imei: IMEI1 }] },
      { category: 'ACCESSORY', barcode: ' 4600000000017 ', brand: 'Baseus', name: 'Кабель Type-C', accessoryCategory: 'Кабели', quantity: 3, purchasePriceUsd: 1.15 },
    ]);
    expect(accessories[0]).toMatchObject({ barcode: '4600000000017', quantity: 3, category: 'Кабели' });
    expect(purchaseTotalUsd(devices, accessories).toFixed(2)).toBe('603.55');
  });

  it('rejects a fractional or zero quantity and the same barcode twice', () => {
    const line = { category: 'ACCESSORY', barcode: 'ABC123', brand: 'B', name: 'N', accessoryCategory: 'C', purchasePriceUsd: 1 };
    expect(() => parsePurchaseGroups([{ ...line, quantity: 0 }])).toThrow('целым числом');
    expect(() => parsePurchaseGroups([{ ...line, quantity: 1.5 }])).toThrow('целым числом');
    expect(() => parsePurchaseGroups([{ ...line, quantity: 1 }, { ...line, barcode: 'abc123', quantity: 2 }])).toThrow('дважды');
  });
});
