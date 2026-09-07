import type { TransactionClient } from '../prisma/prisma.service';

/** Resolves the acting user's display name/role for denormalized audit/timeline/ledger snapshots. */
export async function resolveActor(tx: TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  return { id: userId, name: user?.name ?? 'Система', role: user?.role ?? 'ADMIN' };
}
