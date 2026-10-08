import type { PaymentMethod, Sale } from '../types';
import { formatMoney } from './money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Наличные',
  CARD: 'Банк',
  SPLIT: 'Наличные + Банк',
  DEBT: 'В долг',
};

/** Warranty line printed on every receipt, set per deployment (VITE_RECEIPT_WARRANTY, e.g. «30 дней»). */
export const RECEIPT_WARRANTY = (import.meta.env?.VITE_RECEIPT_WARRANTY || '').trim();

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
  opts: { showStore?: boolean; storeAddress?: string; warranty?: string } = {},
): string {
  const warranty = (opts.warranty ?? RECEIPT_WARRANTY).trim();
  const address = opts.storeAddress?.trim();
  const lines = [
    `Чек №${sale.receiptNumber}`,
    new Date(sale.date).toLocaleString('ru-RU'),
    ...(opts.showStore !== false && sale.storeName ? [`Магазин: ${sale.storeName}`] : []),
    ...(address ? [`Адрес: ${address}`] : []),
    ...(sale.sellerName ? [`Продавец: ${sale.sellerName}`] : []),
    '',
    ...sale.items.map((item) =>
      `${item.brand} ${item.model}${item.storage ? ` ${item.storage}` : ''} — ${formatMoney(item.salePriceTjs)} TJS\nIMEI: ${item.imei}`),
    '',
    `Итого: ${formatMoney(sale.totalTjs)} TJS`,
    `Оплата: ${paymentSummary(sale)}`,
    ...(sale.customerName
      ? [`Покупатель: ${sale.customerName}${sale.customerPhone ? ` (${sale.customerPhone})` : ''}`]
      : sale.customerPhone
      ? [`Покупатель: ${sale.customerPhone}`]
      : []),
    ...(warranty ? [`Гарантия: ${warranty}`] : []),
  ];
  return lines.join('\n');
}
