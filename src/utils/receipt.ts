import type { PaymentMethod, Sale } from '../types';
import { formatMoney } from './money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Наличные',
  CARD: 'Банк',
  SPLIT: 'Наличные + Банк',
  DEBT: 'В долг',
};

/** How the customer paid, with the split amounts when both were used. */
export function paymentSummary(sale: Pick<Sale, 'paymentMethod' | 'cashAmountTjs' | 'cardAmountTjs'>): string {
  if (sale.paymentMethod === 'SPLIT') {
    return `Наличные ${formatMoney(sale.cashAmountTjs)} TJS + Банк ${formatMoney(sale.cardAmountTjs)} TJS`;
  }
  return PAYMENT_METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod;
}

/** Plain-text receipt for sharing with the customer (messenger, SMS) or copying. */
export function formatReceiptText(
  sale: Sale,
  opts: { showStore?: boolean; storeAddress?: string; showUsd?: boolean } = {},
): string {
  const address = opts.storeAddress?.trim();
  const includeUsd = Boolean(opts.showUsd && sale.exchangeRate && sale.exchangeRate > 0);
  const lines = [
    `Чек №${sale.receiptNumber}`,
    new Date(sale.date).toLocaleString('ru-RU'),
    ...(opts.showStore !== false && sale.storeName ? [`Магазин: ${sale.storeName}`] : []),
    ...(address ? [`Адрес: ${address}`] : []),
    ...(sale.sellerName ? [`Продавец: ${sale.sellerName}`] : []),
    '',
    ...sale.items.map((item) => {
      const priceStr = includeUsd
        ? `$${formatMoney(item.salePriceTjs / sale.exchangeRate!)} (${formatMoney(item.salePriceTjs)} TJS)`
        : `${formatMoney(item.salePriceTjs)} TJS`;
      return `${item.brand} ${item.model}${item.storage ? ` ${item.storage}` : ''} — ${priceStr}\nIMEI: ${item.imei}`;
    }),
    '',
    `Итого: ${includeUsd ? `$${formatMoney(sale.totalTjs / sale.exchangeRate!)} (${formatMoney(sale.totalTjs)} TJS)` : `${formatMoney(sale.totalTjs)} TJS`}`,
    `Оплата: ${paymentSummary(sale)}`,
    ...(sale.customerName
      ? [`Покупатель: ${sale.customerName}${sale.customerPhone ? ` (${sale.customerPhone})` : ''}`]
      : sale.customerPhone
      ? [`Покупатель: ${sale.customerPhone}`]
      : []),
  ];
  return lines.join('\n');
}
