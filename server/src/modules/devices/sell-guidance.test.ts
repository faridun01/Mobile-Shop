import '../../common/decimal-test-setup';
import { describe, expect, it } from 'vitest';
import { isBelowCost, preferredToSellIds } from './sell-guidance';

const phone = (id: string, cost: number, extra: Partial<{ storeId: string; color: string; storage: string }> = {}) => ({
  id, storeId: extra.storeId ?? 's1', brand: 'Apple', model: 'iPhone 15', ram: '6GB', storage: extra.storage ?? '128GB', color: extra.color ?? 'Black', costBasisUsd: cost,
});

describe('preferredToSellIds', () => {
  it('marks the dearest of identical phones bought at different costs', () => {
    expect([...preferredToSellIds([phone('a', 600), phone('b', 650.5), phone('c', 620)])]).toEqual(['b']);
  });

  it('marks every unit sharing the highest cost', () => {
    expect([...preferredToSellIds([phone('a', 650), phone('b', 650), phone('c', 600)])].sort()).toEqual(['a', 'b']);
  });

  it('marks nothing when all cost the same or the phone is alone', () => {
    expect(preferredToSellIds([phone('a', 600), phone('b', 600)]).size).toBe(0);
    expect(preferredToSellIds([phone('a', 600)]).size).toBe(0);
  });

  it('keeps colours, memory and stores apart (case and spaces do not matter)', () => {
    const ids = preferredToSellIds([
      phone('a', 600), phone('b', 700, { color: 'White' }), phone('c', 800, { storage: '256GB' }), phone('d', 900, { storeId: 's2' }),
      { ...phone('e', 650), color: ' black ' },
    ]);
    expect([...ids]).toEqual(['e']);
  });
});

describe('isBelowCost', () => {
  it('compares the price with the cost at today\'s rate', () => {
    expect(isBelowCost(5609.99, 600, 9.35, false)).toBe(true);
    expect(isBelowCost(5610, 600, 9.35, false)).toBe(false);
  });

  it('never flags a free bonus phone', () => {
    expect(isBelowCost(1, 0, 9.35, true)).toBe(false);
  });
});
