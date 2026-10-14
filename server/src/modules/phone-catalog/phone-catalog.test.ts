import { describe, expect, it, vi } from 'vitest';
import { parseTacRow, splitCsvLine, tacOf, titleCaseModel } from './normalize';
import { rememberPhones } from './phone-catalog.service';

vi.mock('../../prisma/prisma.service', () => ({ prisma: {} }));

describe('TAC database rows', () => {
  const row = (line: string) => {
    const [brand = '', tac = '', specs = ''] = splitCsvLine(line);
    return parseTacRow(brand, tac, specs);
  };

  it('reads brand and model names the way the shop writes them', () => {
    expect(row('APPLE,35982437,"APPLE IPHONE 15 PRO MAX, Apple iPhone 15 Pro Max, A3108, 2023"'))
      .toEqual({ tac: '35982437', brand: 'Apple', model: 'iPhone 15 Pro Max' });
    expect(row('SAMSUNG,35000746,"SAMSUNG GALAXY S26 ULTRA, Samsung SC-53G2026"'))
      .toEqual({ tac: '35000746', brand: 'Samsung', model: 'Galaxy S26 Ultra' });
    expect(row('XIAOMI,86302407,"XIAOMI REDMI NOTE 14S, Xiaomi 2502FRA65G, Global Model, 2025"'))
      .toEqual({ tac: '86302407', brand: 'Xiaomi', model: 'Redmi Note 14S' });
  });

  it('files Poco under Xiaomi', () => {
    expect(row('POCO,86701107,"XIAOMI POCO F7 ULTRA, Xiaomi 24122RKC7G, Global Model, 2025"'))
      .toEqual({ tac: '86701107', brand: 'Xiaomi', model: 'Poco F7 Ultra' });
  });

  it('prefers a product name over a manufacturer code when the row has one', () => {
    expect(row('XIAOMI,86339007,"XIAOMI 2506BPN68R, Xiaomi 2506BPN68R, Xiaomi 15T Pro, 2025"'))
      .toEqual({ tac: '86339007', brand: 'Xiaomi', model: '15T Pro' });
    // Without a product name the code is kept: it still identifies that phone exactly.
    expect(row('HONOR,86000001,"HONOR NIC-AN00, N/A, 2025"')?.model).toBe('NIC-AN00');
  });

  it('skips rows without an 8-digit TAC', () => {
    expect(row('APPLE,3598243,"APPLE IPHONE 15"')).toBeNull();
    expect(row('APPLE,ABCDEFGH,"APPLE IPHONE 15"')).toBeNull();
  });

  it('title-cases model words but keeps model numbers', () => {
    expect(titleCaseModel('GALAXY Z FOLD7')).toBe('Galaxy Z Fold7');
    expect(titleCaseModel('SPARK 40 PRO+')).toBe('Spark 40 Pro+');
    expect(titleCaseModel('IPHONE SE')).toBe('iPhone SE');
  });

  it('takes the TAC from the first 8 digits of an IMEI', () => {
    expect(tacOf('359824370123456')).toBe('35982437');
    expect(tacOf('3598-2437-0123')).toBe('35982437');
    expect(tacOf('1234567')).toBeNull();
  });
});

describe('rememberPhones', () => {
  const tx = () => ({ phoneCatalog: { upsert: vi.fn() } }) as any;

  it('remembers each received model once per TAC, under both IMEIs', async () => {
    const db = tx();
    await rememberPhones(db, [
      { imei: '359824370000001', imei2: '359824380000001', brand: 'Apple', model: 'iPhone 15 Pro Max', ram: '8 GB', storage: '256 GB' },
      { imei: '359824370000002', brand: 'Apple', model: 'iPhone 15 Pro Max', ram: '8 GB', storage: '512 GB' },
    ]);
    expect(db.phoneCatalog.upsert).toHaveBeenCalledTimes(2);
    const first = db.phoneCatalog.upsert.mock.calls.find((call: any) => call[0].where.tac === '35982437')[0];
    // The latest phone of the batch sets the suggested storage.
    expect(first.create).toEqual({ tac: '35982437', brand: 'Apple', model: 'iPhone 15 Pro Max', ram: '8 GB', storage: '512 GB' });
    expect(first.update).toEqual({ brand: 'Apple', model: 'iPhone 15 Pro Max', ram: '8 GB', storage: '512 GB' });
  });

  it('keeps the last known RAM and storage when a phone comes without them', async () => {
    const db = tx();
    await rememberPhones(db, [{ imei: '359824370000001', brand: 'Apple', model: 'iPhone 15', ram: '', storage: null }]);
    expect(db.phoneCatalog.upsert.mock.calls[0][0].update).toEqual({ brand: 'Apple', model: 'iPhone 15' });
  });

  it('ignores phones without a brand or model', async () => {
    const db = tx();
    await rememberPhones(db, [{ imei: '359824370000001', brand: ' ', model: 'iPhone 15' }]);
    expect(db.phoneCatalog.upsert).not.toHaveBeenCalled();
  });
});

describe('findPhoneByImei', () => {
  it('falls back to Device table if not found in PhoneCatalog', async () => {
    const { findPhoneByImei } = await import('./phone-catalog.service');
    const { prisma } = await import('../../prisma/prisma.service');
    (prisma as any).phoneCatalog = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ tac: '35982437' }),
    };
    (prisma as any).device = {
      findFirst: vi.fn().mockResolvedValue({
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        ram: '8 GB',
        storage: '256 GB',
        color: 'Natural Titanium',
        costBasisUsd: '950.00',
      }),
    };

    const result = await findPhoneByImei('359824370000001');
    expect(result).toEqual({
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      ram: '8 GB',
      storage: '256 GB',
      color: 'Natural Titanium',
      lastPurchasePriceUsd: null,
    });
    expect((prisma as any).phoneCatalog.create).toHaveBeenCalled();
  });
});

