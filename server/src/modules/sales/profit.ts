import { D, type MoneyInput } from '../../common/decimal';
interface ProfitAuditRecord {
  action: string;
  financialDetails: unknown;
}

import { roundMoney } from '../../common/money';

export type OwnerProfitAllocation = { ownerId: string; amountUsd: MoneyInput };

/**
 * Orders parts for the leftover cents: by fractional remainder (largest first, or smallest first
 * when cents are taken back), and owners whose remainders are equal (a tie, e.g. an odd cent split
 * 50/50) in a rotation chosen by the amount. A fixed order would always hand a tied cent to the
 * same owner; the rotation (Fibonacci hashing of the cents) gives each tied owner the cent about
 * equally often over many bookings, and the same amount always gives the same result.
 */
function rankForLeftover<T extends { ownerId: string; remainder: ReturnType<typeof D> }>(parts: T[], cents: ReturnType<typeof D>, largestFirst = true): T[] {
  const sorted = [...parts].sort((a, b) => (largestFirst ? b.remainder.comparedTo(a.remainder) : a.remainder.comparedTo(b.remainder)) || a.ownerId.localeCompare(b.ownerId));
  const spread = (Math.imul(Number(cents.abs().mod(4294967296)), 0x9e3779b1) >>> 0) / 4294967296;
  const ranked: T[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j < sorted.length && sorted[j].remainder.eq(sorted[i].remainder)) j++;
    const group = sorted.slice(i, j);
    const shift = Math.floor(spread * group.length);
    for (let k = 0; k < group.length; k++) ranked.push(group[(k + shift) % group.length]);
    i = j;
  }
  return ranked;
}

/**
 * The dollars a debt sale booked for its unpaid part: the receipt's dollars less what its register
 * took up front (the paid TJS at the sale's rate). Register, receivable and profit then add up to
 * the cent; a share of the receipt's dollars by TJS would leave a stray cent on some sales.
 * Without the sale's rate (very old sales) it falls back to that share.
 */
export function bookedDebtUsd(sale: { totalUsd: MoneyInput; totalTjs: MoneyInput; cashAmountTjs: MoneyInput; cardAmountTjs: MoneyInput; exchangeRate?: MoneyInput | null }, originalDebtTjs: MoneyInput): ReturnType<typeof D> {
  if (!D(originalDebtTjs).gt(0) || !D(sale.totalTjs).gt(0)) return D(0);
  if (sale.exchangeRate && D(sale.exchangeRate).gt(0)) {
    const paidUpFrontUsd = roundMoney(D(sale.cashAmountTjs).plus(sale.cardAmountTjs).div(sale.exchangeRate));
    return roundMoney(D(sale.totalUsd).minus(paidUpFrontUsd));
  }
  return roundMoney(D(sale.totalUsd).mul(originalDebtTjs).div(sale.totalTjs));
}

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
  const ranked = rankForLeftover(parts, cents);
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
  const ranked = rankForLeftover(parts, cents, step > 0);
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

/**
 * The owner profit a return (or an exchange's return) took back, by its SALE_RETURN log id: the
 * returned goods' profit booked on the sale's day. Read from the reversal actually posted (edits
 * keep it current); a log without one falls back to the goods' booked profit.
 */
export function reversedProfitByReturn(logs: ProfitAuditRecord[]): Map<string, MoneyInput> {
  const result = new Map<string, MoneyInput>();
  for (const log of logs) {
    if (log.action !== 'SALE_RETURN') continue;
    const details = (log.financialDetails ?? {}) as {
      saleReturnId?: unknown;
      reversedAllocations?: { amountUsd?: unknown }[];
      items?: { bookedProfitUsd?: unknown }[];
      accessories?: { bookedProfitUsd?: unknown }[];
    };
    if (typeof details.saleReturnId !== 'string') continue;
    const sum = (rows: { [key: string]: unknown }[] | undefined, key: string) =>
      (rows ?? []).reduce((acc, row) => acc.plus(typeof row?.[key] === 'number' ? (row[key] as number) : 0), D(0));
    result.set(details.saleReturnId, roundMoney(Array.isArray(details.reversedAllocations)
      ? sum(details.reversedAllocations, 'amountUsd')
      : sum(details.items, 'bookedProfitUsd').plus(sum(details.accessories, 'bookedProfitUsd'))));
  }
  return result;
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
    if (['SALE_RETURN', 'SALE_RETURN_CANCEL'].includes(log.action) && typeof returnDelta === 'number' && Number.isFinite(returnDelta)) {
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
