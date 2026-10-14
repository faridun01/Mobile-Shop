import { D, type MoneyInput } from '../../common/decimal';

export interface SellableDevice {
  id: string;
  storeId: string;
  brand: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
  costBasisUsd: MoneyInput;
}

const norm = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

/** Phones are the same variant when the store, brand, model, RAM, storage and colour match. */
export const variantKey = (d: Omit<SellableDevice, 'id' | 'costBasisUsd'>) =>
  [d.storeId, d.brand, d.model, d.ram, d.storage, d.color].map(norm).join('|');

/**
 * Of identical phones in a store bought at different costs, the dearest should be sold first.
 * Returns the ids of those dearest units; a variant whose units all cost the same has none.
 * Only the choice is shared with store staff, never the cost itself.
 */
export function preferredToSellIds(devices: SellableDevice[]): Set<string> {
  const groups = new Map<string, SellableDevice[]>();
  for (const device of devices) {
    const key = variantKey(device);
    groups.set(key, [...(groups.get(key) ?? []), device]);
  }
  const preferred = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const max = group.reduce((m, d) => (D(d.costBasisUsd).gt(m) ? D(d.costBasisUsd) : m), D(group[0].costBasisUsd));
    const min = group.reduce((m, d) => (D(d.costBasisUsd).lt(m) ? D(d.costBasisUsd) : m), D(group[0].costBasisUsd));
    if (max.eq(min)) continue;
    for (const d of group) if (D(d.costBasisUsd).eq(max)) preferred.add(d.id);
  }
  return preferred;
}

/** Same rule as a sale: below cost when the price is under the phone's cost at today's rate. A free bonus phone never is. */
export function isBelowCost(priceTjs: MoneyInput, costBasisUsd: MoneyInput, rate: MoneyInput, isFreeBonus: boolean) {
  if (isFreeBonus) return false;
  return D(priceTjs).lt(D(costBasisUsd).mul(rate));
}
