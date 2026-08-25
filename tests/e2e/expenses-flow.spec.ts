import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, navigateTo, NAV_LABELS } from './helpers';

test.describe('Expenses — full path UI -> API -> DB -> cash register -> owner profit -> audit', () => {
  test('registering an expense through the real form debits the store cash register and owner profit, and logs an audit entry', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    const ownersBefore = await apiGet<any[]>(token, '/api/owners');
    const storesBefore = await apiGet<any[]>(token, '/api/stores');
    const store = storesBefore.find((s: any) => !s.isMainWarehouse);
    const uniqueDescription = `E2E expense ${Date.now()}`;

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.EXPENSES);
    await page.getByRole('button', { name: 'ЗАРЕГИСТРИРОВАТЬ РАСХОД' }).click();

    const modal = page.locator('.fixed.inset-0');
    await modal.locator('select').first().selectOption('UTILITIES');
    await modal.locator('input[placeholder="500"]').fill('200');
    await modal.locator('select').nth(1).selectOption(store.id);
    await modal.getByPlaceholder('Оплата аренды за текущий месяц').fill(uniqueDescription);
    await modal.getByRole('button', { name: 'Сохранить расход' }).click();

    await expect(page.getByText(/успешно проведен/)).toBeVisible({ timeout: 10000 });

    // --- Verify against Postgres ---
    const expenses = await apiGet<any[]>(token, '/api/expenses');
    const created = expenses.find((e: any) => e.description === uniqueDescription);
    expect(created, 'expense should exist in Postgres').toBeTruthy();
    expect(created.category).toBe('UTILITIES');
    expect(created.amountTjs).toBe(200);

    const storesAfter = await apiGet<any[]>(token, '/api/stores');
    const storeAfter = storesAfter.find((s: any) => s.id === store.id);
    expect(storeAfter.cashBalanceTjs).toBe(store.cashBalanceTjs - 200);

    const ownersAfter = await apiGet<any[]>(token, '/api/owners');
    for (const before of ownersBefore) {
      const after = ownersAfter.find((o: any) => o.id === before.id);
      const expectedDelta = -Number(((200 / created.exchangeRate) * (before.profitSharePercent / 100)).toFixed(2));
      expect(Math.abs(after.availableProfitUsd - (before.availableProfitUsd + expectedDelta))).toBeLessThan(0.02);
    }

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'EXPENSE' && l.targetId === created.id)).toBe(true);
  });
});
