import type { TransactionClient } from '../../prisma/prisma.service';

/**
 * Returns the CASH FinancialAccount linked to a store, creating it on first use.
 * Every store gets exactly one (Phase 1 backfill creates these for existing stores;
 * this covers a store created afterwards).
 */
export async function getStoreCashAccount(tx: TransactionClient, storeId: string, storeName?: string) {
  const existing = await tx.financialAccount.findUnique({ where: { storeId } });
  if (existing) return existing;
  const store = storeName ? { name: storeName } : await tx.store.findUnique({ where: { id: storeId }, select: { name: true } });
  return tx.financialAccount.create({
    data: { name: `Касса ${store?.name ?? ''}`.trim(), type: 'CASH', storeId },
  });
}
