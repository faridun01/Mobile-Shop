import { Decimal } from '@prisma/client/runtime/index-browser.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const decimal = (value: number | string) => new Decimal(value);
export const moneyNumber = (value: Decimal | number | string) => new Decimal(value).toDecimalPlaces(2).toNumber();
export const sumMoney = (values: number[]) => values.reduce((a, b) => a.plus(b), decimal(0)).toNumber();

/**
 * Splits a receipt's booked dollars across its TJS parts (cash, card, debt, …) in proportion,
 * cent-exact: parts that cover the whole TJS total add up to totalUsd exactly (parts covering
 * less get their rounded share of it), the leftover cents going to the largest remainders.
 * Recomputing each part as TJS ÷ rate would drift from the booked total.
 */
export function splitUsdByTjs(totalUsd: number, totalTjs: number, partsTjs: number[]): number[] {
  const total = decimal(totalTjs || 0);
  const nonZero = partsTjs.filter((part) => !decimal(part || 0).isZero()).length;
  if (total.isZero() || nonZero === 0) return partsTjs.map(() => 0);
  const totalCents = decimal(totalUsd || 0).mul(100).round();
  const partsSum = partsTjs.reduce((a, b) => a.plus(b || 0), decimal(0));
  const targetCents = totalCents.mul(partsSum).div(total).round();
  const exact = partsTjs.map((part) => totalCents.mul(part || 0).div(total));
  const cents = exact.map((value) => value.isNegative() ? value.ceil() : value.floor());
  let left = targetCents.minus(cents.reduce((a, b) => a.plus(b), decimal(0))).toNumber();
  const step = left >= 0 ? 1 : -1;
  const order = exact
    .map((value, index) => ({ index, remainder: value.minus(cents[index]).abs() }))
    .filter(({ index }) => !decimal(partsTjs[index] || 0).isZero())
    .sort((a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index);
  for (let i = 0; left !== 0 && order.length; i = (i + 1) % order.length) {
    cents[order[i].index] = cents[order[i].index].plus(step);
    left -= step;
  }
  return cents.map((value) => value.div(100).toNumber());
}

// One Intl.NumberFormat per locale and precision, reused: `number.toLocaleString(locale, options)`
// builds a new one on every call, which made long lists of amounts slow. Same output.
const moneyFormats = new Map<string, Intl.NumberFormat>();
function moneyFormat(locale: string | undefined, min: number, max: number): Intl.NumberFormat {
  const key = `${locale ?? ''}|${min}|${max}`;
  let format = moneyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });
    moneyFormats.set(key, format);
  }
  return format;
}

/**
 * Formats a monetary amount to always show 2 decimal places.
 * Example: 10.5 -> "10.50" (or "10,50"), 1250 -> "1,250.00" (or "1 250,00")
 */
export function formatMoney(
  value: Decimal | number | string | null | undefined,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    locale?: string;
  }
): string {
  if (value === null || value === undefined || value === '') return '0.00';
  const num = typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : Number(value);
  if (!Number.isFinite(num)) return '0.00';
  const min = options?.minimumFractionDigits ?? 2;
  const max = options?.maximumFractionDigits ?? 2;
  return moneyFormat(options?.locale, min, max).format(num);
}

/** Formats a monetary value in TJS with 2 decimal places: e.g. "10.50 TJS" or "-10.50 TJS" */
export function formatTjs(value: Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0.00 TJS';
  const num = typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : Number(value);
  if (!Number.isFinite(num)) return '0.00 TJS';
  if (num < 0) {
    return `-${formatMoney(Math.abs(num))} TJS`;
  }
  return `${formatMoney(num)} TJS`;
}

/** Formats a monetary value in USD with 2 decimal places: e.g. "$10.50" or "-$10.50" */
export function formatUsd(value: Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '$0.00';
  const num = typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : Number(value);
  if (!Number.isFinite(num)) return '$0.00';
  if (num < 0) {
    return `-$${formatMoney(Math.abs(num))}`;
  }
  return `$${formatMoney(num)}`;
}

/**
 * Converts an amount in TJS into approximate USD at given exchange rate (TJS / rate = USD).
 * Example: 2500 TJS @ rate 10.95 -> 228.31 USD
 */
export function convertTjsToUsd(
  tjs: Decimal | number | string | null | undefined,
  exchangeRate: number | null | undefined
): number {
  if (tjs === null || tjs === undefined || tjs === '') return 0;
  const numTjs = typeof tjs === 'number'
    ? tjs
    : typeof tjs === 'string'
    ? Number(tjs.trim().replace(',', '.'))
    : Number(tjs);
  if (!Number.isFinite(numTjs) || numTjs === 0) return 0;
  const rate = Number(exchangeRate) || 0;
  if (rate <= 0) return 0;
  return new Decimal(numTjs).div(rate).toDecimalPlaces(2).toNumber();
}

/**
 * Formats a rate or price for an input field with standard dot separator and 2 decimal places.
 * Example: 10.5 -> "10.50", "10,5" -> "10.50", 11 -> "11.00"
 */
/** What the rate field accepts while typing: up to 8 digits and at most 2 decimals ("10", "10.", "10,5", "10.50"). */
export const RATE_TYPING_PATTERN = /^\d{0,8}(?:[.,]\d{0,2})?$/;

/**
 * A rate as entered, or null: the rate is set with at most 2 decimals (e.g. 10.50) and is never
 * rounded — "10.555" is rejected, not saved as 10.56.
 */
export function parseRateInput(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(text)) return null;
  const rate = Number(text.replace(',', '.'));
  return rate > 0 ? rate : null;
}

export function formatRateOrInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toFixed(2);
}


/**
 * Splits an amount between owners by percent, cent-exact, exactly as the server books owner
 * profit (allocateOwnerProfit): floor each share in cents, then hand the leftover cents to the
 * largest remainders (ties by id). The parts always add up to the total, losses included.
 */
export function allocateByShares(total: Decimal | number | string, shares: { id: string; percent: number | string }[]): Record<string, number> {
  const active = shares.filter((s) => new Decimal(s.percent).gt(0));
  if (!active.length) return {};
  const amount = new Decimal(total).toDecimalPlaces(2);
  const cents = amount.abs().mul(100).round();
  const totalShare = active.reduce((sum, s) => sum.plus(s.percent), new Decimal(0));
  const parts = active.map((s) => {
    const exact = cents.mul(s.percent).div(totalShare);
    return { id: s.id, cents: exact.floor(), remainder: exact.minus(exact.floor()) };
  });
  const leftover = cents.minus(parts.reduce((sum, p) => sum.plus(p.cents), new Decimal(0))).toNumber();
  const ranked = [...parts].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.id.localeCompare(b.id));
  for (let i = 0; i < leftover; i++) ranked[i].cents = ranked[i].cents.plus(1);
  const sign = amount.isNegative() ? -1 : 1;
  return Object.fromEntries(parts.map((p) => [p.id, p.cents.isZero() ? 0 : p.cents.mul(sign).div(100).toNumber()]));
}
