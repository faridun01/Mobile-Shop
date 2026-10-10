/**
 * Where each navigation item leads. «Отчёты» open inside Финансы, so REPORTS points at /finance
 * here. MainLayout keeps its own URL→page table (it also has to recognise the old /reports URL)
 * and NotificationsPage maps notification targets its own way.
 */
export const NAV_PAGE_ROUTES: Record<string, string> = {
  WELCOME: '/',
  SALE: '/sale',
  SALES_HISTORY: '/sales-history',
  INVENTORY: '/inventory',
  PURCHASE: '/purchase',
  STORE_RECEIPT: '/receipts',
  REVISION: '/revision',
  TRANSFER: '/transfer',
  EXCHANGE: '/exchange',
  REPAIR: '/repair',
  SUPPLIERS: '/suppliers',
  BONUSES: '/bonuses',
  EXPENSES: '/expenses',
  OWNERS: '/owners',
  EMPLOYEES: '/employees',
  REPORTS: '/reports',
  FINANCE: '/reports',
  AUDIT_LOG: '/audit-log',
  SETTINGS: '/settings',
  NOTIFICATIONS: '/notifications',
  CASH_COLLECTION: '/cash-collection',
  CASH_DESK: '/cash',
  CUSTOMERS: '/customers',
  STOCK_THRESHOLDS: '/stock-thresholds',
};
