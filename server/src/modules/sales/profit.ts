export interface ProfitAuditRecord {
  action: string;
  financialDetails: unknown;
}

import { roundMoney } from '../../common/money';

export type OwnerProfitAllocation = { ownerId: string; amountUsd: number };

export function allocateOwnerProfit(amountUsd: number, owners: { id: string; profitSharePercent: number }[]): OwnerProfitAllocation[] {
  return owners.map((owner) => ({
    ownerId: owner.id,
    amountUsd: roundMoney(amountUsd * owner.profitSharePercent / 100),
  }));
}

/** Reverse the amounts actually booked, including rounding and every exchange. */
export function refundOwnerProfit(
  logs: ProfitAuditRecord[],
  owners: { id: string; profitSharePercent: number }[],
  penaltyUsd: number,
): OwnerProfitAllocation[] {
  const missingHistory = () => new Error('Для этого чека не сохранено исходное распределение прибыли партнёров. Возврат требует восстановления истории начислений.');
  const originals = logs.filter((log) => log.action === 'SALE' || log.action === 'SALE_BELOW_COST');
  if (originals.length !== 1) throw missingHistory();
  const deltas = new Map(allocateOwnerProfit(penaltyUsd, owners).map((a) => [a.ownerId, a.amountUsd]));
  for (const log of logs) {
    if (!['SALE', 'SALE_BELOW_COST', 'EXCHANGE'].includes(log.action)) continue;
    const details = log.financialDetails as { ownerProfitAllocations?: unknown } | null;
    const allocations = details?.ownerProfitAllocations;
    if (!Array.isArray(allocations)) throw missingHistory();
    const seen = new Set<string>();
    for (const allocation of allocations) {
      if (!allocation || typeof allocation.ownerId !== 'string' ||
          typeof allocation.amountUsd !== 'number' || !Number.isFinite(allocation.amountUsd) ||
          seen.has(allocation.ownerId)) throw missingHistory();
      if (!deltas.has(allocation.ownerId)) {
        throw new Error('Партнёр из исходного распределения прибыли не найден. Восстановите его учётную запись перед возвратом.');
      }
      seen.add(allocation.ownerId);
      deltas.set(allocation.ownerId, roundMoney(deltas.get(allocation.ownerId)! - allocation.amountUsd));
    }
  }
  return Array.from(deltas, ([ownerId, amountUsd]) => ({ ownerId, amountUsd }));
}

export function calculateRecognizedProfit(logs: ProfitAuditRecord[], fallbackProfitUsd: number): number {
  let amount = 0;
  let hasOriginal = false;

  for (const log of logs) {
    const details = log.financialDetails && typeof log.financialDetails === 'object' && !Array.isArray(log.financialDetails)
      ? (log.financialDetails as Record<string, unknown>)
      : {};
    const originalProfit = details.recognizedProfitUsd;
    const exchangeProfit = details.exchangeProfitUsd;

    if ((log.action === 'SALE' || log.action === 'SALE_BELOW_COST') && typeof originalProfit === 'number' && Number.isFinite(originalProfit)) {
      amount += originalProfit;
      hasOriginal = true;
    }
    if (log.action === 'EXCHANGE' && typeof exchangeProfit === 'number' && Number.isFinite(exchangeProfit)) {
      amount += exchangeProfit;
    }
  }

  return roundMoney(hasOriginal ? amount : fallbackProfitUsd);
}
