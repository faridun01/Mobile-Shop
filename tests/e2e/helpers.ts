import type { Page } from '@playwright/test';

export const API_BASE = 'http://localhost:3002';

export const CREDENTIALS = {
  ADMIN: { login: 'admin', password: 'admin123' },
  PARTNER: { login: 'partner', password: 'partner123' },
  SELLER: { login: 'ahmad', password: 'seller123' },
} as const;

export type Role = keyof typeof CREDENTIALS;

/** Logs in through the real UI form (proves the full browser -> API -> session path). */
export async function loginAsUi(page: Page, role: Role) {
  const { login, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.locator('input').nth(0).fill(login);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"], button:has-text("Войти")').first().click();
  await page.waitForURL(/\/sale/, { timeout: 10000 });
  // The Sale page fires off its own round of data fetches right after login, which
  // re-renders (and can briefly detach/reattach) sidebar nav buttons — clicking
  // immediately risks the click landing on a node mid-swap. Let things settle first.
  await page.waitForLoadState('networkidle');
}

export const NAV_LABELS = {
  SALE: 'POS Терминал',
  SALES_HISTORY: 'История продаж',
  EXCHANGE: 'Обмен Trade-In',
  REPAIR: 'Сервис и Ремонт',
  INVENTORY: 'Склад товаров',
  PURCHASE: 'Приходы (Партии)',
  TRANSFER: 'Перемещение',
  SUPPLIERS: 'Поставщики',
  REPORTS: 'Финансовые отчёты',
  EXPENSES: 'Расходы',
  BONUSES: 'Бонусы',
  OWNERS: 'Партнеры и капитал',
  EMPLOYEES: 'Сотрудники',
  AUDIT_LOG: 'Журнал аудита',
  NOTIFICATIONS: 'Уведомления',
  SETTINGS: 'Настройки',
} as const;

/**
 * Navigates via a real sidebar click (client-side route change) rather than
 * `page.goto()`. A `page.goto()` to an in-app route forces a full SPA remount,
 * which re-triggers every data fetch from scratch and races the test against
 * that load — clicking a nav link is both how a real user moves between pages
 * and avoids that race entirely, since AppContext's already-loaded data persists.
 */
export async function navigateTo(page: Page, label: (typeof NAV_LABELS)[keyof typeof NAV_LABELS]) {
  await page.getByRole('button', { name: label, exact: true }).click();
  // Vite's dev server compiles each page's module graph on first request, which can
  // outlast a bare click — wait for things to settle before the test acts further.
  await page.waitForLoadState('networkidle');
}

/** Direct API login — used only to fetch a token for DB-state assertions, never to skip UI testing. */
export async function apiLogin(role: Role): Promise<string> {
  const { login, password } = CREDENTIALS[role];
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const json = await res.json();
  if (!json.token) throw new Error(`API login failed for ${role}: ${JSON.stringify(json)}`);
  return json.token;
}

export async function apiGet<T = any>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
