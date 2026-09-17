import type { LedgerCurrency } from '../types';

/** No shared money-formatting util existed before the Finance module — every other page
 * inlines its own `.toLocaleString()` + manual "TJS"/"$" suffix (left as-is, unretrofitted). */
export function formatMoney(amount: number, currency: LedgerCurrency): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const formatted = Math.abs(rounded).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = rounded < 0 ? '-' : '';
  return currency === 'USD' ? `${sign}$${formatted}` : `${sign}${formatted} TJS`;
}
