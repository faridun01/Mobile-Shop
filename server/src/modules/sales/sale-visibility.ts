import type { Role } from '@prisma/client';

/**
 * Purchase cost is ADMIN-only: sellers and partners get receipts without what a phone cost
 * (the same rule /api/devices applies). Both cost columns of a sale item are blanked.
 */
export function hideSaleCosts<T extends { saleItems?: object[] }>(sale: T, role: Role): T {
  if (role === 'ADMIN' || !sale.saleItems) return sale;
  return {
    ...sale,
    saleItems: sale.saleItems.map((item) => ({ ...item, costBasisUsd: 0, purchaseCostUsd: 0 })),
  };
}
