import { Decimal } from '@prisma/client/runtime/index-browser.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const decimal = (value: number | string) => new Decimal(value);
export const moneyNumber = (value: Decimal | number | string) => new Decimal(value).toDecimalPlaces(2).toNumber();
export const sumMoney = (values: number[]) => values.reduce((a, b) => a.plus(b), decimal(0)).toNumber();
