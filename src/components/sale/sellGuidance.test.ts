import { describe, expect, it } from 'vitest';
import type { Device } from '../../types';
import { preferredInsteadOf, variantKeyOf } from './sellGuidance';

const phone = (id: string, extra: Partial<Device> = {}): Device => ({
  id, imei: `35000000000000${id}`, brand: 'Apple', model: 'iPhone 15', ram: '6GB', storage: '128GB', color: 'Black',
  costBasisUsd: 0, purchaseCostUsd: 0, retailPriceTjs: 7000, status: 'STORE_STOCK', locationId: 's1', locationName: 'S1',
  supplierId: 'x', createdAt: '2026-10-15', timeline: [], ...extra,
} as Device);

describe('variantKeyOf', () => {
  it('ignores case and spaces', () => {
    expect(variantKeyOf(phone('1'))).toBe(variantKeyOf(phone('2', { color: ' black ' })));
  });
});

describe('preferredInsteadOf', () => {
  it('suggests the preferred identical phone of the same store', () => {
    const preferred = phone('2', { preferredToSell: true });
    expect(preferredInsteadOf(phone('1'), [phone('1'), preferred])?.id).toBe('2');
  });

  it('suggests nothing for the preferred phone itself, another variant, store, sold or already-chosen phone', () => {
    expect(preferredInsteadOf(phone('1', { preferredToSell: true }), [phone('2', { preferredToSell: true })])).toBeNull();
    expect(preferredInsteadOf(phone('1'), [phone('2', { preferredToSell: true, color: 'White' })])).toBeNull();
    expect(preferredInsteadOf(phone('1'), [phone('2', { preferredToSell: true, locationId: 's2' })])).toBeNull();
    expect(preferredInsteadOf(phone('1'), [phone('2', { preferredToSell: true, status: 'SOLD' })])).toBeNull();
    expect(preferredInsteadOf(phone('1'), [phone('2', { preferredToSell: true })], new Set(['2']))).toBeNull();
  });
});
