import { expect, it } from 'vitest';
import { allocateMoney } from './allocation';
import { D } from './decimal';

it('allocates every cent deterministically without changing the invoice total', () => {
  expect(allocateMoney('1', ['1', '1', '1']).map(String)).toEqual(['0.34', '0.33', '0.33']);
  for (const total of ['0', '0.01', '20.01', '999999.99']) {
    const parts = allocateMoney(total, ['17.29', '0.01', '42.73', '9.11']);
    expect(parts.reduce((a, b) => a.plus(b), D(0)).toString()).toBe(D(total).toString());
    expect(parts.every(p => p.gte(0) && p.decimalPlaces() <= 2)).toBe(true);
  }
});
