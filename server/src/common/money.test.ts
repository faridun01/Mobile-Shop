import { describe, expect, it } from 'vitest';
import { moneyEquals, requireFiniteNumber, requireNonNegativeMoney, requirePositiveMoney, roundMoney } from './money';

describe('money validation', () => {
  it('accepts finite positive values and numeric strings', () => {
    expect(requirePositiveMoney('12.50', 'Сумма')).toBe(12.5);
    expect(requireNonNegativeMoney(0, 'Сумма')).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity, 'not-a-number'])('rejects invalid number %s', (value) => {
    expect(() => requireFiniteNumber(value, 'Сумма')).toThrow();
  });

  it('rejects negative and zero values in the appropriate modes', () => {
    expect(() => requirePositiveMoney(0, 'Сумма')).toThrow();
    expect(() => requireNonNegativeMoney(-0.01, 'Сумма')).toThrow();
  });

  it('compares monetary totals to cent precision', () => {
    expect(moneyEquals(100, 99.995)).toBe(true);
    expect(moneyEquals(100, 99.98)).toBe(false);
  });

  it('rounds positive and negative half cents symmetrically', () => {
    expect(roundMoney(874.765)).toBe(874.77);
    expect(roundMoney(-25.235)).toBe(-25.24);
  });
});
