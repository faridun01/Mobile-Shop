import type { SaleAccessoryLine } from '../types';
import { decimal, moneyNumber } from './money';

/** Units of an accessory line not returned yet. */
export const accessoryUnitsLeft = (line: SaleAccessoryLine) => line.quantity - line.returnedQuantity;

/**
 * The price of `quantity` more returned units of an accessory line, as the server splits it: a
 * proportional share of the line, and the last units take exactly what is left of it.
 */
export function accessoryReturnPrice(line: SaleAccessoryLine, quantity: number): number {
  if (quantity >= accessoryUnitsLeft(line)) return moneyNumber(decimal(line.salePriceTjs).minus(line.returnedPriceTjs));
  return moneyNumber(decimal(line.salePriceTjs).mul(quantity).div(line.quantity));
}
