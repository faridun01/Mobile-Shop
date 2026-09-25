import { Prisma } from '@prisma/client';

// 14-digit money * 10-digit rates, plus ample precision for ratios and sums.
Prisma.Decimal.set({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
export type MoneyInput = Prisma.Decimal | number | string;
export function D(value: MoneyInput): Prisma.Decimal {
  const result = new Prisma.Decimal(value);
  if (!result.isFinite()) throw new Error('Некорректное десятичное значение');
  return result;
}
export function decimalMin(...values: MoneyInput[]) { return Prisma.Decimal.min(...values.map(D)); }
export function decimalMax(...values: MoneyInput[]) { return Prisma.Decimal.max(...values.map(D)); }

/** Explicit JSON boundary. Domain calculations and Prisma reads retain Decimal. */
export function moneyJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, function (key, encoded) {
    const original = this[key];
    return Prisma.Decimal.isDecimal(original) ? original.toNumber() : encoded;
  }));
}

export function decimalJsonReplacer(this: Record<string, unknown>, key: string, encoded: unknown) {
  const original = this[key];
  return Prisma.Decimal.isDecimal(original) ? original.toNumber() : encoded;
}
