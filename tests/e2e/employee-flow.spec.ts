import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, navigateTo, NAV_LABELS } from './helpers';

test.describe('Employee CRUD & Salary — full path UI -> API -> DB -> cash register -> audit', () => {
  test('creating an employee through the real form persists it with a hashed password (never exposed) and logs an audit entry', async ({ page }) => {
    const uniqueLogin = `e2eseller${Date.now()}`;

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.EMPLOYEES);
    await page.getByRole('button', { name: 'ДОБАВИТЬ СОТРУДНИКА' }).click();

    const modal = page.locator('.fixed.inset-0').first();
    await modal.getByPlaceholder('Саид Каримов').fill('E2E Test Employee');
    await modal.getByPlaceholder('seller3').fill(uniqueLogin);
    await modal.getByPlaceholder('Пароль для входа в систему').fill('testpass123');
    await modal.locator('input[placeholder="1500"]').fill('1000');
    await modal.locator('input[placeholder="2.5"]').fill('3');
    await modal.getByRole('button', { name: 'СОЗДАТЬ' }).click();

    await expect(page.getByText(/успешно добавлен/)).toBeVisible({ timeout: 10000 });

    const token = await apiLogin('ADMIN');
    const users = await apiGet<any[]>(token, '/api/users');
    const created = users.find((u: any) => u.login === uniqueLogin);
    expect(created, 'employee should exist in Postgres').toBeTruthy();
    expect(created.role).toBe('SELLER');
    expect(created.baseSalaryTjs).toBe(1000);
    expect(created).not.toHaveProperty('password');
    expect(created).not.toHaveProperty('passwordHash');

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'USER_CREATE' && l.targetId === created.id)).toBe(true);

    // A real login with the freshly created credentials must work end-to-end.
    const newUserToken = await fetch('http://localhost:3002/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: uniqueLogin, password: 'testpass123' }),
    }).then((r) => r.json());
    expect(newUserToken.token, 'the new employee should be able to log in with their real password').toBeTruthy();
  });

  test('paying a salary through the real form books it as an expense against the correct store', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    const stores = await apiGet<any[]>(token, '/api/stores');
    const store = stores.find((s: any) => !s.isMainWarehouse);
    const uniqueLogin = `e2esalary${Date.now()}`;
    const created = await fetch('http://localhost:3002/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ login: uniqueLogin, password: 'testpass123', name: 'E2E Salary Employee', role: 'SELLER', storeId: store.id, baseSalaryTjs: 500 }),
    }).then((r) => r.json());

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.EMPLOYEES);
    const row = page.locator('div', { hasText: 'E2E Salary Employee' }).filter({ has: page.getByRole('button', { name: 'ЗАРПЛАТА' }) }).last();
    await row.getByRole('button', { name: 'ЗАРПЛАТА' }).click();

    const modal = page.locator('.fixed.inset-0').first();
    await modal.locator('input[placeholder="Например: 1500"]').fill('500');
    await modal.getByRole('button', { name: 'ВЫПЛАТИТЬ ЗАРПЛАТУ' }).click();

    await expect(page.getByText(/успешно выплачена/)).toBeVisible({ timeout: 10000 });

    const expenses = await apiGet<any[]>(token, '/api/expenses');
    const salaryExpense = expenses.find((e: any) => e.employeeId === created.id);
    expect(salaryExpense, 'salary payout should be booked as an expense').toBeTruthy();
    expect(salaryExpense.category).toBe('SALARY');
    expect(salaryExpense.amountTjs).toBe(500);
    expect(salaryExpense.storeId).toBe(store.id);
  });
});
