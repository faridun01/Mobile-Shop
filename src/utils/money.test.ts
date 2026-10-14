import { describe, expect, it } from 'vitest';
import { decimal, moneyNumber, sumMoney, formatMoney, formatTjs, formatUsd, formatRateOrInput, splitUsdByTjs } from './money';
import { getBusinessDateKey } from './businessDate';

it('does not show binary floating point tails in split payment', () => {
  expect(moneyNumber(decimal('1200.10').minus(600))).toBe(600.1);
  expect(sumMoney([0.1, 0.2])).toBe(0.3);
});
it('rounds a commission to cents instead of whole somoni', () => {
  expect(moneyNumber(decimal('1200.10').mul('1.25').div(100))).toBe(15);
});
it('uses the business date around UTC day/month boundaries', () => {
  expect(getBusinessDateKey(new Date('2026-08-31T20:00:00Z'))).toBe('2026-09-01');
  expect(getBusinessDateKey(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26');
});
it('formats money and rates always with 2 decimal places', () => {
  expect(formatRateOrInput(10.5)).toBe('10.50');
  expect(formatRateOrInput('10.5')).toBe('10.50');
  expect(formatRateOrInput('10,5')).toBe('10.50');
  expect(formatRateOrInput(10)).toBe('10.00');
  expect(formatRateOrInput('')).toBe('');
  expect(formatRateOrInput(null)).toBe('');

  // formatMoney guarantees 2 fraction digits
  expect(formatMoney(10.5, { locale: 'en-US' })).toBe('10.50');
  expect(formatMoney(10, { locale: 'en-US' })).toBe('10.00');
  expect(formatMoney(1250, { locale: 'en-US' })).toBe('1,250.00');
  expect(formatTjs(10.5)).toContain('.50');
  expect(formatTjs(10.5)).toContain('TJS');
  expect(formatUsd(10.5)).toContain('$');
  expect(formatUsd(10.5)).toContain('.50');
});


describe('allocateByShares (same cent-exact split as the server)', () => {
  it('splits $100.01 at 50/50 into $50.01 + $50.00, never $50.01 twice', async () => {
    const { allocateByShares } = await import('./money');
    expect(allocateByShares(100.01, [{ id: 'admin', percent: 50 }, { id: 'partner', percent: 50 }])).toEqual({ admin: 50.01, partner: 50 });
  });

  it('always adds up to the total exactly, losses included', async () => {
    const { allocateByShares } = await import('./money');
    for (const total of [0.03, 100.01, 333.33, -0.03, -150.55, 1234.57]) {
      const split = allocateByShares(total, [{ id: 'a', percent: 33.33 }, { id: 'b', percent: 33.33 }, { id: 'c', percent: 33.34 }]);
      expect(Object.values(split).reduce((s, v) => s + Math.round(v * 100), 0)).toBe(Math.round(total * 100));
    }
  });

  it('matches the server allocation (allocateOwnerProfit) cent for cent', async () => {
    const { allocateByShares } = await import('./money');
    const { allocateOwnerProfit } = await import('../../server/src/modules/sales/profit');
    const owners = [{ id: 'owner-admin', percent: 60 }, { id: 'owner-partner', percent: 40 }];
    for (const total of [0.01, 0.05, 99.99, 100.01, -19.04, -150.55, 7.77]) {
      const server = Object.fromEntries(allocateOwnerProfit(total, owners.map((o) => ({ id: o.id, profitSharePercent: o.percent })))
        .map((a) => [a.ownerId, Number(a.amountUsd)]));
      expect(allocateByShares(total, owners)).toEqual(server);
    }
  });
});

describe('splitUsdByTjs', () => {
  it('splits an exchanged receipt so cash + card equal the booked total, not TJS ÷ rate', () => {
    // 5000 TJS sale ($534.76) + exchange paid 2000 TJS ($695.19 − $481.28) = $748.67; 7000 / 9.35 = $748.66
    const [cash, card] = splitUsdByTjs(748.67, 7000, [6000, 1000]);
    expect(Math.round((cash + card) * 100) / 100).toBe(748.67);
    expect([cash, card]).toEqual([641.72, 106.95]);
  });

  it('keeps zero parts at zero and gives the whole amount to the only part', () => {
    expect(splitUsdByTjs(100.01, 935, [0, 935, 0])).toEqual([0, 100.01, 0]);
  });

  it('returns zeros for an empty receipt', () => {
    expect(splitUsdByTjs(0, 0, [0, 0])).toEqual([0, 0]);
  });

  it('sums exactly for three awkward parts', () => {
    const parts = splitUsdByTjs(10, 3, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0).toFixed(2)).toBe('10.00');
    expect(parts).toEqual([3.34, 3.33, 3.33]);
  });
});

describe('splitUsdByTjs with parts covering only part of the receipt', () => {
  it('gives a single debt part only its own share of the dollars', () => {
    // 6000 TJS receipt booked at $641.71, 5000 TJS of it still owed
    expect(splitUsdByTjs(641.71, 6000, [5000])).toEqual([534.76]);
  });
});

describe('rate input: at most 2 decimals, never rounded', () => {
  it('lets the user type up to 2 decimals only', async () => {
    const { RATE_TYPING_PATTERN } = await import('./money');
    for (const ok of ['', '9', '9.', '9,3', '9.35', '10,50']) expect(RATE_TYPING_PATTERN.test(ok)).toBe(true);
    for (const bad of ['9.355', '9,3501', 'abc', '9.3.5', '-9']) expect(RATE_TYPING_PATTERN.test(bad)).toBe(false);
  });

  it('parses a finished rate exactly, rejects anything else', async () => {
    const { parseRateInput } = await import('./money');
    expect(parseRateInput('9.35')).toBe(9.35);
    expect(parseRateInput(' 10,5 ')).toBe(10.5);
    expect(parseRateInput('11')).toBe(11);
    for (const bad of ['9.355', '9.', '0', '0.00', '', 'abc']) expect(parseRateInput(bad)).toBeNull();
  });
});
