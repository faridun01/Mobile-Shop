import { test, expect } from '@playwright/test';
import { loginAsUi, type Role } from './helpers';

/**
 * Confirms the UI-level RBAC surface (sidebar visibility + direct-URL page guards)
 * for all three roles. Complements tests/integration/rbac-security.test.ts, which
 * covers the same boundary at the API layer (the layer that actually matters for
 * security — this spec exists to catch UI/API RBAC drifting out of sync, e.g. a
 * nav link hidden from a role whose page-level guard doesn't actually match).
 */

const ADMIN_ONLY_ROUTES = ['/employees', '/audit-log'];
const ADMIN_PARTNER_ROUTES = ['/suppliers', '/bonuses', '/expenses', '/owners', '/reports', '/purchase'];
const ALL_ROLES_ROUTES = ['/sale', '/sales-history', '/exchange', '/repair', '/inventory', '/transfer', '/notifications'];

async function expectAccessDenied(page: import('@playwright/test').Page) {
  // Pages that block a role render an explicit "access restricted" message rather
  // than the real content (see e.g. AuditLogPage/OwnersPage/ExpensesPage guards).
  await expect(page.getByText(/ДОСТУП ОГРАНИЧЕН|нет прав|только (Администратор|партнер)/i).first()).toBeVisible({ timeout: 10000 });
}

for (const role of ['ADMIN', 'PARTNER', 'SELLER'] as Role[]) {
  test.describe(`RBAC navigation as ${role}`, () => {
    test(`${role}: routes it should access render real content, not an access-denied guard`, async ({ page }) => {
      await loginAsUi(page, role);

      const allowed =
        role === 'ADMIN'
          ? [...ALL_ROLES_ROUTES, ...ADMIN_PARTNER_ROUTES, ...ADMIN_ONLY_ROUTES]
          : role === 'PARTNER'
            ? [...ALL_ROLES_ROUTES, ...ADMIN_PARTNER_ROUTES]
            : ALL_ROLES_ROUTES;

      for (const route of allowed) {
        await page.goto(route);
        await expect(page.getByText(/ДОСТУП ОГРАНИЧЕН/i)).not.toBeVisible();
      }
    });

    if (role === 'SELLER') {
      test('SELLER: ADMIN/PARTNER-only routes show an access-denied guard, not the real page', async ({ page }) => {
        await loginAsUi(page, role);
        for (const route of [...ADMIN_ONLY_ROUTES, ...ADMIN_PARTNER_ROUTES]) {
          await page.goto(route);
          await expectAccessDenied(page);
        }
      });

      test('SELLER: cannot see ADMIN/PARTNER-only links in the sidebar', async ({ page }) => {
        await loginAsUi(page, role);
        for (const label of ['Сотрудники', 'Журнал аудита', 'Поставщики', 'Бонусы', 'Партнеры и капитал']) {
          await expect(page.getByRole('button', { name: label, exact: true })).not.toBeVisible();
        }
      });
    }

    if (role === 'PARTNER') {
      test('PARTNER: ADMIN-only routes show an access-denied guard', async ({ page }) => {
        await loginAsUi(page, role);
        for (const route of ADMIN_ONLY_ROUTES) {
          await page.goto(route);
          await expectAccessDenied(page);
        }
      });

      test('PARTNER: cannot see ADMIN-only links, but can see Owners/Suppliers/Expenses', async ({ page }) => {
        await loginAsUi(page, role);
        for (const label of ['Сотрудники', 'Журнал аудита']) {
          await expect(page.getByRole('button', { name: label, exact: true })).not.toBeVisible();
        }
        for (const label of ['Партнеры и капитал', 'Поставщики', 'Расходы']) {
          await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
        }
      });
    }
  });
}
