import type { Role } from '@prisma/client';

/**
 * Purchase cost is ADMIN-only. For store staff (SELLER, PARTNER) a sale read back from the
 * server has `costBasisUsd` and `purchaseCostUsd` on each item set to 0, and each
 * accessory line loses its cost and its batch allocations (which carry unit costs), also
 * on the accessory units of each return.
 */
export function hideSaleCosts<T extends { saleItems?: object[]; accessoryItems?: object[]; returns?: object[] }>(sale: T, role: Role): T {
  if (role === 'ADMIN') return sale;
  return {
    ...sale,
    ...(sale.saleItems ? { saleItems: sale.saleItems.map((item) => ({ ...item, costBasisUsd: 0, purchaseCostUsd: 0 })) } : {}),
    ...(sale.accessoryItems ? { accessoryItems: sale.accessoryItems.map((item) => ({ ...item, costUsd: 0, returnedCostUsd: 0, allocations: [] })) } : {}),
    ...(sale.returns ? { returns: sale.returns.map(hideReturnCosts) } : {}),
  };
}

function hideReturnCosts<R extends object>(ret: R): R {
  const lines = (ret as { accessoryLines?: unknown }).accessoryLines;
  if (!Array.isArray(lines)) return ret;
  return { ...ret, accessoryLines: lines.map((line) => ({ ...(line as object), costUsd: 0 })) };
}
