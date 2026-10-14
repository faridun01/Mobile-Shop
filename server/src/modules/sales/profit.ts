import { D, type MoneyInput } from '../../common/decimal';
interface ProfitAuditRecord {
  action: string;
  financialDetails: unknown;
}

import { roundMoney } from '../../common/money';

export type OwnerProfitAllocation = { ownerId: string; amountUsd: MoneyInput };

export function allocateOwnerProfit(amountUsd: MoneyInput, owners: { id: string; profitSharePercent: MoneyInput }[]): OwnerProfitAllocation[] {
  if (!owners.length) return [];
  const totalShare = owners.reduce((sum, owner) => D(sum).plus(owner.profitSharePercent), D(0));
  if (owners.some((owner) => !D(owner.profitSharePercent).isFinite() || D(owner.profitSharePercent).lt(0)) ||
      D(D(D(totalShare).minus(100)).abs()).gt(0.000001) || new Set(owners.map((owner) => owner.id)).size !== owners.length) {
    throw new Error('Доли владельцев должны составлять ровно 100%');
  }
  const cents = D(D(D(roundMoney(amountUsd)).abs()).mul(100)).round();
  const parts = owners.map((owner) => {
    const exact = D(D(cents).mul(owner.profitSharePercent)).div(totalShare);
    return { ownerId: owner.id, cents: exact.floor(), remainder: exact.minus(exact.floor()) };
  });
  const remainder = D(cents).minus(parts.reduce((sum, part) => D(sum).plus(part.cents), D(0)));
  const ranked = [...parts].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.ownerId.localeCompare(b.ownerId));
  for (let i = 0; i < remainder.toNumber(); i++) ranked[i].cents = ranked[i].cents.plus(1);
  return parts.map((part) => ({
    ownerId: part.ownerId,
    amountUsd: roundMoney(D(part.cents).eq(0) ? 0 : D(D(D(amountUsd).isNegative() ? -1 : 1).mul(part.cents)).div(100)),
  }));
}

/**
 * Splits `amountUsd` among owners in the same proportions as an earlier booking (`booked`, whose
 * amounts add up to `bookedTotalUsd`), cent-exact: the parts always add up to the amount, leftover
 * cents going to the largest remainders. Used to reverse part of a sale's profit with the shares
 * it was booked at, however the shares have changed since. Null when there is nothing to scale by.
 */
export function allocateLikeBooked(amountUsd: MoneyInput, booked: OwnerProfitAllocation[], bookedTotalUsd: MoneyInput): OwnerProfitAllocation[] | null {
  const total = D(bookedTotalUsd);
  if (total.isZero() || booked.length === 0) return null;
  const cents = D(roundMoney(amountUsd)).mul(100).round();
  const exact = booked.map((row) => ({ ownerId: row.ownerId, value: cents.mul(row.amountUsd).div(total) }));
  const parts = exact.map((row) => ({ ownerId: row.ownerId, cents: row.value.trunc(), remainder: row.value.minus(row.value.trunc()) }));
  let left = cents.minus(parts.reduce((sum, part) => sum.plus(part.cents), D(0))).toNumber();
  const step = left >= 0 ? 1 : -1;
  const ranked = [...parts].sort((a, b) => (step > 0 ? b.remainder.comparedTo(a.remainder) : a.remainder.comparedTo(b.remainder)) || a.ownerId.localeCompare(b.ownerId));
  for (let i = 0; left !== 0 && ranked.length; i = (i + 1) % ranked.length) {
    ranked[i].cents = ranked[i].cents.plus(step);
    left -= step;
  }
  return parts.map((part) => ({ ownerId: part.ownerId, amountUsd: roundMoney(part.cents.div(100)) }));
}

/** Reverse the amounts actually booked, including rounding and every exchange. */
export function refundOwnerProfit(
  logs: ProfitAuditRecord[],
  owners: { id: string; profitSharePercent: MoneyInput }[],
  penaltyUsd: MoneyInput,
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
      // A partner who has since moved to another store still gets back exactly what they were
      // booked; the caller rejects the refund only if that owner record no longer exists.
      if (!deltas.has(allocation.ownerId)) deltas.set(allocation.ownerId, 0);
      seen.add(allocation.ownerId);
      deltas.set(allocation.ownerId, roundMoney(D(deltas.get(allocation.ownerId)!).minus(allocation.amountUsd)));
    }
  }
  return Array.from(deltas, ([ownerId, amountUsd]) => ({ ownerId, amountUsd }));
}

export function calculateRecognizedProfit(logs: ProfitAuditRecord[], fallbackProfitUsd: MoneyInput) {
  let amount = D(0);
  let hasOriginal = false;

  for (const log of logs) {
    const details = log.financialDetails && typeof log.financialDetails === 'object' && !Array.isArray(log.financialDetails)
      ? (log.financialDetails as Record<string, unknown>)
      : {};
    const originalProfit = details.recognizedProfitUsd;
    const exchangeProfit = details.exchangeProfitUsd;

    if ((log.action === 'SALE' || log.action === 'SALE_BELOW_COST') && typeof originalProfit === 'number' && Number.isFinite(originalProfit)) {
      amount = D(amount).plus(originalProfit);
      hasOriginal = true;
    }
    if (log.action === 'EXCHANGE' && typeof exchangeProfit === 'number' && Number.isFinite(exchangeProfit)) {
      amount = D(amount).plus(exchangeProfit);
    }
    // A return of some phones: their profit is reversed, the withheld part kept.
    const returnDelta = details.profitDeltaUsd;
    if (log.action === 'SALE_RETURN' && typeof returnDelta === 'number' && Number.isFinite(returnDelta)) {
      amount = D(amount).plus(returnDelta);
    }
  }

  return roundMoney(hasOriginal ? amount : fallbackProfitUsd);
}

type ExchangeCostRestoration = { deviceId: string; tradeInCostUsd: MoneyInput; originalCostUsd: MoneyInput };

/**
 * An exchange brings the customer's device back into stock at the agreed trade-in value.
 * If the whole sale is later refunded that trade-in is undone too, so the device's cost
 * basis must go back to what it was before. Exchanges logged before these fields existed
 * are skipped (their original cost was never recorded).
 */
export function exchangeCostRestorations(logs: ProfitAuditRecord[]): ExchangeCostRestoration[] {
  const restorations: ExchangeCostRestoration[] = [];
  for (const log of logs) {
    if (log.action !== 'EXCHANGE') continue;
    const details = log.financialDetails as Record<string, unknown> | null;
    const deviceId = details?.returnedDeviceId;
    // Exchanges since the return-and-sale model record the cost the device came back at; it
    // equals the original cost unless the device was a bonus one. Older ones used the trade-in value.
    const tradeIn = details?.returnedCostBasisAfterUsd ?? details?.exchangeInValueUsd;
    const original = details?.returnedCostBasisUsd;
    if (typeof deviceId !== 'string' || typeof tradeIn !== 'number' || typeof original !== 'number' ||
        !Number.isFinite(tradeIn) || !Number.isFinite(original)) continue;
    if (roundMoney(tradeIn).eq(roundMoney(original))) continue;
    restorations.push({ deviceId, tradeInCostUsd: roundMoney(tradeIn), originalCostUsd: roundMoney(original) });
  }
  return restorations;
}
