import type { TransactionClient } from '../../prisma/prisma.service';
import { roundMoney } from '../../common/money';
import { allocateOwnerProfit, type OwnerProfitAllocation } from '../sales/profit';

export function readOwnerAllocations(value: unknown): OwnerProfitAllocation[] {
  const error = () => new Error('Не сохранено исходное распределение прибыли партнёров. Сначала восстановите историю начислений для этой операции.');
  if (!Array.isArray(value)) throw error();
  const seen = new Set<string>();
  return value.map((row) => {
    if (!row || typeof row.ownerId !== 'string' || !row.ownerId || seen.has(row.ownerId) ||
        typeof row.amountUsd !== 'number' || !Number.isFinite(row.amountUsd) || row.amountUsd < 0) throw error();
    seen.add(row.ownerId);
    return { ownerId: row.ownerId, amountUsd: roundMoney(row.amountUsd) };
  });
}

// Preserve the amounts actually booked for unchanged documents. On an amount
// change reverse those amounts, then book the replacement at the current shares.
export async function replaceOwnerAllocations(tx: TransactionClient, previous: OwnerProfitAllocation[], next: OwnerProfitAllocation[], sign: 1 | -1, guard = false) {
  const deltas = new Map<string, number>();
  for (const row of previous) deltas.set(row.ownerId, roundMoney((deltas.get(row.ownerId) ?? 0) - sign * row.amountUsd));
  for (const row of next) deltas.set(row.ownerId, roundMoney((deltas.get(row.ownerId) ?? 0) + sign * row.amountUsd));
  for (const [id, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
    if (delta === 0) continue;
    const result = await tx.owner.updateMany({
      where: { id, ...(guard && delta < 0 ? { availableProfitUsd: { gte: -delta } } : {}) },
      data: { totalAccruedProfitUsd: { increment: delta }, availableProfitUsd: { increment: delta } },
    });
    if (result.count !== 1) throw new Error('Не удалось скорректировать прибыль партнёра: запись отсутствует или прибыль уже выплачена/реинвестирована. Требуется сверка.');
  }
}

export async function currentOwnerAllocations(tx: TransactionClient, amountUsd: number) {
  return allocateOwnerProfit(amountUsd, await tx.owner.findMany());
}
