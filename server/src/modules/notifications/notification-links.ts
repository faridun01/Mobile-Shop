/**
 * Where tapping a notification leads: the app path that opens the very record it is about —
 * the receipt, the transfer, the expense — not just the page of its kind. Shared by new
 * notifications (stored as targetRoute and sent with the push) and older ones (built when listed).
 */
export interface NotificationTarget {
  targetType?: string | null;
  actionType?: string | null;
  targetId?: string | null;
  targetRoute?: string | null;
  /** «Чек #42»: a sale's receipt is opened by its number. */
  documentRef?: string | null;
  /** A supplier payment opens its supplier. */
  supplierId?: string | null;
  /** A cash collection and a minimum-stock row are listed per store. */
  storeId?: string | null;
}

const SALE_EVENTS = new Set(['SALE_BELOW_COST', 'SALE_EDITED', 'REFUND', 'EXCHANGE', 'SALE_EXCHANGE', 'SALE_RETURN']);
const EXPENSE_EVENTS = new Set(['EXPENSE', 'EXPENSE_PAID', 'EXPENSE_EDIT', 'EXPENSE_DELETE', 'PAYROLL_PAYOUT']);
const TRANSFER_EVENTS = new Set(['TRANSFER', 'TRANSFER_APPROVAL', 'TRANSFER_REJECT', 'TRANSFER_REQUEST']);

/** Record kind → page and the query parameter that page opens it by. */
const RECORD_LINKS: Record<string, [path: string, param: string]> = {
  REPAIR_STATUS_CHANGE: ['/repair', 'repair'],
  PURCHASE: ['/purchase', 'invoice'],
  STORE_RECEIPT: ['/receipts', 'receipt'],
  DAILY_CLOSING: ['/cash', 'closing'],
  STOCK_REVISION: ['/revision', 'revision'],
};

const link = (path: string, param: string, value: string) => `${path}?${param}=${encodeURIComponent(value)}`;

export function notificationLink(n: NotificationTarget): string {
  const fallback = n.targetRoute || '/notifications';
  // Already a deep link (stored that way).
  if (fallback.includes('?')) return fallback;
  const kind = n.targetType || n.actionType || '';
  if (SALE_EVENTS.has(kind)) {
    const receipt = n.documentRef?.match(/#\s*(\d+)/)?.[1];
    return receipt ? link('/sales-history', 'receipt', receipt) : fallback;
  }
  if (kind === 'SUPPLIER_PAYMENT') return n.supplierId ? link('/suppliers', 'supplier', n.supplierId) : fallback;
  if (!n.targetId) return fallback;
  if (EXPENSE_EVENTS.has(kind)) return link('/expenses', 'expense', n.targetId);
  const withStore = (path: string) => (n.storeId ? `${path}&store=${encodeURIComponent(n.storeId)}` : path);
  if (kind === 'CASH_COLLECTION') return withStore(link('/cash-collection', 'collection', n.targetId));
  if (kind === 'STOCK_THRESHOLD') return withStore(link('/stock-thresholds', 'threshold', n.targetId));
  if (TRANSFER_EVENTS.has(kind)) return link('/transfer', 'transfer', n.targetId);
  const record = RECORD_LINKS[kind];
  return record ? link(record[0], record[1], n.targetId) : fallback;
}
