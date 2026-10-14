import './decimal-test-setup';
import { describe, expect, it } from 'vitest';
import { averageRate, moneyEquals, requireExchangeRate, requireFiniteNumber, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from './money';

describe('money validation', () => {
  it('accepts finite positive values and numeric strings', () => {
    expect(requirePositiveMoney('12.50', 'Сумма')).toEqual(12.5);
    expect(requireNonNegativeMoney(0, 'Сумма')).toEqual(0);
  });

  it.each([NaN, Infinity, -Infinity, 'not-a-number', null, undefined, true, false, '', ' ', [], {}])('rejects invalid number %s', (value) => {
    expect(() => requireFiniteNumber(value, 'Сумма')).toThrow();
  });

  it('rejects negative and zero values in the appropriate modes', () => {
    expect(() => requirePositiveMoney(0, 'Сумма')).toThrow();
    expect(() => requirePositiveMoney(0.001, 'Сумма')).toThrow();
    expect(() => requireNonNegativeMoney(-0.01, 'Сумма')).toThrow();
  });

  it('compares monetary totals to cent precision', () => {
    expect(moneyEquals(100, 99.995)).toEqual(true);
    expect(moneyEquals(100, 99.98)).toEqual(false);
  });

  it('rounds positive and negative half cents symmetrically', () => {
    expect(roundMoney(874.765)).toEqual(874.77);
    expect(roundMoney(-25.235)).toEqual(-25.24);
  });
});

describe('the exchange rate has at most 2 decimals', () => {
  it('accepts a rate with up to 2 decimals as typed', () => {
    expect(requireExchangeRate('9.35').toString()).toBe('9.35');
    expect(requireExchangeRate(10).toString()).toBe('10');
    expect(requireExchangeRate(10.5).toString()).toBe('10.5');
  });

  it('rejects more decimals instead of rounding them', () => {
    expect(() => requireExchangeRate('9.355')).toThrow('не более чем с 2 знаками');
    expect(() => requireExchangeRate(9.3499)).toThrow('не более чем с 2 знаками');
  });

  it('rejects zero, negative, oversized and non-numeric rates', () => {
    for (const bad of [0, -1, '100000000', 'abc', '', null]) expect(() => requireExchangeRate(bad)).toThrow();
  });

  it('gives the average rate of a moved balance with 2 decimals, never 4', () => {
    expect(averageRate(6500, 695.19)?.toString()).toBe('9.35');
    expect(averageRate(100, 0)).toBeNull();
  });
});
