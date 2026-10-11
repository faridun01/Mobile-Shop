import { describe, expect, it } from 'vitest';
import { hideSaleCosts } from './sale-visibility';

const sale = {
  id: 'sale-1',
  totalUsd: 120,
  saleItems: [{ imei: '1', salePriceUsd: 120, costBasisUsd: 70, purchaseCostUsd: 70 }],
};

describe('hideSaleCosts', () => {
  it('blanks both cost columns for sellers and partners', () => {
    for (const role of ['SELLER', 'PARTNER'] as const) {
      const visible = hideSaleCosts(sale, role);
      expect(visible.saleItems).toEqual([{ imei: '1', salePriceUsd: 120, costBasisUsd: 0, purchaseCostUsd: 0 }]);
      expect(visible.totalUsd).toBe(120);
    }
  });

  it('shows the admin the full receipt', () => {
    expect(hideSaleCosts(sale, 'ADMIN')).toBe(sale);
  });
});
