import { describe, expect, it } from 'vitest';
import { notificationLink } from './notification-links';

describe('notificationLink', () => {
  it('opens a sale event by its receipt', () => {
    for (const targetType of ['SALE_BELOW_COST', 'SALE_EDITED', 'REFUND', 'EXCHANGE', 'SALE_EXCHANGE', 'SALE_RETURN']) {
      expect(notificationLink({ targetType, targetId: 'sale-1', targetRoute: '/sales-history', documentRef: 'Чек #42' }), targetType).toBe('/sales-history?receipt=42');
    }
    expect(notificationLink({ targetType: 'REFUND', targetId: 'sale-1', targetRoute: '/sales-history' })).toBe('/sales-history');
  });

  it('opens the transfer, the expense and every other record by its id', () => {
    expect(notificationLink({ targetType: 'TRANSFER_REQUEST', targetId: 't1', targetRoute: '/transfer' })).toBe('/transfer?transfer=t1');
    expect(notificationLink({ targetType: 'TRANSFER_APPROVAL', targetId: 't1', targetRoute: '/transfer' })).toBe('/transfer?transfer=t1');
    expect(notificationLink({ targetType: 'EXPENSE_PAID', targetId: 'e1', targetRoute: '/expenses' })).toBe('/expenses?expense=e1');
    expect(notificationLink({ targetType: 'PAYROLL_PAYOUT', targetId: 'e2', targetRoute: '/employees' })).toBe('/expenses?expense=e2');
    expect(notificationLink({ targetType: 'REPAIR_STATUS_CHANGE', targetId: 'r1', targetRoute: '/repair' })).toBe('/repair?repair=r1');
    expect(notificationLink({ targetType: 'PURCHASE', targetId: 'i1', targetRoute: '/purchase' })).toBe('/purchase?invoice=i1');
    expect(notificationLink({ targetType: 'STORE_RECEIPT', targetId: 'sr1', targetRoute: '/receipts' })).toBe('/receipts?receipt=sr1');
    expect(notificationLink({ targetType: 'STOCK_REVISION', targetId: 'rv1', targetRoute: '/revision' })).toBe('/revision?revision=rv1');
    expect(notificationLink({ targetType: 'STOCK_THRESHOLD', targetId: 'th1', targetRoute: '/stock-thresholds', storeId: 's1' })).toBe('/stock-thresholds?threshold=th1&store=s1');
    expect(notificationLink({ targetType: 'SUPPLIER_PAYMENT', targetId: 'p1', targetRoute: '/suppliers', supplierId: 's1' })).toBe('/suppliers?supplier=s1');
  });

  it('leads a collection and a shift closing to their own screens, not the old /finance redirect', () => {
    expect(notificationLink({ targetType: 'CASH_COLLECTION', targetId: 'h1', targetRoute: '/finance', storeId: 'store-siyoma' })).toBe('/cash-collection?collection=h1&store=store-siyoma');
    expect(notificationLink({ targetType: 'CASH_COLLECTION', targetId: 'h1', targetRoute: '/finance' })).toBe('/cash-collection?collection=h1');
    expect(notificationLink({ targetType: 'DAILY_CLOSING', targetId: 'c1', targetRoute: '/finance' })).toBe('/cash?closing=c1');
  });

  it('keeps a stored deep link and falls back to the page for anything else', () => {
    expect(notificationLink({ targetType: 'STORE_RECEIPT', targetId: 'x', targetRoute: '/receipts?receipt=sr1' })).toBe('/receipts?receipt=sr1');
    expect(notificationLink({ targetType: 'OWNER_INVESTMENT', targetId: 'o1', targetRoute: '/owners' })).toBe('/owners');
    expect(notificationLink({ targetType: 'SALE_ANNULLED', targetId: 's1', targetRoute: '/notifications', documentRef: 'Чек #5' })).toBe('/notifications');
    expect(notificationLink({})).toBe('/notifications');
  });
});
