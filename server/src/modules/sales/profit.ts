export interface ProfitAuditRecord {
  action: string;
  financialDetails: unknown;
}

import { roundMoney } from '../../common/money';

export type OwnerProfitAllocation = { ownerId: string; amountUsd: number };

export function allocateOwnerProfit(amountUsd: number, owners: { id: string; profitSharePercent: number }[]): OwnerProfitAllocation[] {
  if (!owners.length) return [];
  const totalShare = owners.reduce((sum, owner) => sum + owner.profitSharePercent, 0);
  if (owners.some((owner) => !Number.isFinite(owner.profitSharePercent) || owner.profitSharePercent < 0) ||
      Math.abs(totalShare - 100) > 0.000001 || new Set(owners.map((owner) => owner.id)).size !== owners.length) {
    throw new Error('Доли владельцев должны составлять ровно 100%');
  }
  const cents = Math.round(Math.abs(roundMoney(amountUsd)) * 100);
  const parts = owners.map((owner) => {
    const exact = cents * owner.profitSharePercent / totalShare;
    return { ownerId: owner.id, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remainder = cents - parts.reduce((sum, part) => sum + part.cents, 0);
  const ranked = [...parts].sort((a, b) => b.remainder - a.remainder || a.ownerId.localeCompare(b.ownerId));
  for (let i = 0; i < remainder; i++) ranked[i].cents++;
  return parts.map((part) => ({ ownerId: part.ownerId, amountUsd: part.cents === 0 ? 0 : Math.sign(amountUsd) * part.cents / 100 }));
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
