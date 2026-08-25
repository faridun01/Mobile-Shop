import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, navigateTo, NAV_LABELS } from './helpers';

test.describe('Repair (Прием в ремонт) — full path UI -> API -> DB -> expense -> audit', () => {
  test('creating a repair ticket persists it, books the repair cost as an expense, and logs an audit entry', async ({ page }) => {
    const uniqueImei = `E2E-REP-${Date.now()}`;

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.REPAIR);
    await page.getByText('ПРИЕМ В РЕМОНТ').click();

    await page.getByPlaceholder('Алишер Рахимов').fill('E2E Test Customer');
    await page.getByPlaceholder('+992 90 123 4567').fill('+992900000000');
    await page.getByPlaceholder('iPhone 16 Pro').fill('E2E Repair Model');
    await page.getByPlaceholder('351234567890123').fill(uniqueImei);
    await page.getByPlaceholder(/Опишите поломку/).fill('E2E test: screen replacement');
    await page.getByPlaceholder(/Например: 250 TJS/).fill('150');

    await page.getByRole('button', { name: 'ОФОРМИТЬ КВИТАНЦИЮ НА РЕМОНТ' }).click();
    await expect(page.getByText(/успешно оформлена/)).toBeVisible({ timeout: 10000 });

    const token = await apiLogin('ADMIN');
    const repairs = await apiGet<any[]>(token, '/api/repairs');
    const ticket = repairs.find((r) => r.imei === uniqueImei);
    expect(ticket, 'repair ticket should exist in Postgres').toBeTruthy();
    expect(ticket.status).toBe('ACCEPTED');
    expect(ticket.customerName).toBe('E2E Test Customer');

    const expenses = await apiGet<any[]>(token, '/api/expenses');
    const linkedExpense = expenses.find((e) => e.category === 'REPAIR_PARTS' && e.comment?.includes(String(ticket.ticketNumber)));
    expect(linkedExpense, 'repair cost should be booked as a REPAIR_PARTS expense').toBeTruthy();
    expect(linkedExpense.amountTjs).toBe(150);

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'REPAIR_INTAKE' && l.imei === uniqueImei)).toBe(true);
  });

  test('updating repair status through the UI persists the new status and status history', async ({ page }) => {
    const uniqueImei = `E2E-REP-STATUS-${Date.now()}`;
    const token = await apiLogin('ADMIN');
    const stores = await apiGet<any[]>(token, '/api/stores');
    const store = stores.find((s) => !s.isMainWarehouse);

    const created = await fetch('http://localhost:3002/api/repairs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId: store.id, imei: uniqueImei, brand: 'E2E', model: 'StatusTest', problemDescription: 'test' }),
    }).then((r) => r.json());

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.REPAIR);
    await page.getByPlaceholder('Квитанция / ФИО / IMEI...').fill(uniqueImei);
    const ticketRow = page.locator('div', { hasText: uniqueImei }).filter({ has: page.getByRole('button', { name: 'В РАБОТУ' }) }).last();
    await expect(ticketRow.getByRole('button', { name: 'В РАБОТУ' })).toBeVisible({ timeout: 10000 });
    await ticketRow.getByRole('button', { name: 'В РАБОТУ' }).click();

    await page.waitForTimeout(1500);
    const updated = await apiGet<any>(token, `/api/repairs`).then((list) => list.find((r: any) => r.id === created.id));
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.statusHistory.length).toBeGreaterThan(1);
  });
});
