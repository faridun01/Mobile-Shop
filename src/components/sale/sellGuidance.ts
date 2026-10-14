import type { Device } from '../../types';

const norm = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

/** Phones are the same variant when brand, model, RAM, storage and colour match (the server's rule). */
export const variantKeyOf = (d: Pick<Device, 'brand' | 'model' | 'ram' | 'storage' | 'color'>) =>
  [d.brand, d.model, d.ram, d.storage, d.color].map(norm).join('|');

/**
 * The phone to sell instead of `chosen`: an identical one in the same store that the server marks
 * as preferred (bought dearer), not already in the cart. Null when `chosen` is the one to sell.
 */
export function preferredInsteadOf(chosen: Device, stock: Device[], excludeIds: Set<string> = new Set()): Device | null {
  if (chosen.preferredToSell) return null;
  const key = variantKeyOf(chosen);
  return stock.find((d) => d.id !== chosen.id && !excludeIds.has(d.id) && d.preferredToSell && d.locationId === chosen.locationId
    && (d.status === 'STORE_STOCK' || d.status === 'IN_STOCK_AFTER_EXCHANGE') && variantKeyOf(d) === key) ?? null;
}
