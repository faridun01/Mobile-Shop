import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, API_BASE, navigateTo, NAV_LABELS } from './helpers';

async function ensureRate(token: string) {
  const rate = await apiGet<any>(token, '/api/exchange-rate/today');
  if (!rate) {
    await fetch(`${API_BASE}/api/exchange-rate/today`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rate: 10 }),
    });
  }
}

/** Sells a device for well above cost so all owners accrue enough available profit to test payouts against. */
async function generateProfit(token: string, minUsd: number) {
  await ensureRate(token);
  const devices = await apiGet<any[]>(token, `/api/devices?storeId=store-siyoma`);
  const device = devices.find((d: any) => d.status === 'STORE_STOCK');
  const res = await fetch(`${API_BASE}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ storeId: 'store-siyoma', items: [{ deviceId: device.id, salePriceTjs: device.purchasePriceUsd * 10 + minUsd * 10 + 5000 }], paymentMethod: 'CASH' }),
  });
  if (!res.ok) throw new Error(`generateProfit setup sale failed: ${res.status} ${await res.text()}`);
}

test.describe('Owner Capital — full path UI -> API -> DB -> audit', () => {
  test('an investment through the real form increases the partner\'s capital balance and logs an audit entry', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    const before = await apiGet<any[]>(token, '/api/owners');
    const owner = before[0];

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.OWNERS);
    await page.getByRole('button', { name: 'ПРОВЕСТИ ОПЕРАЦИЮ' }).click();

    const modal = page.locator('.fixed.inset-0').first();
    await modal.locator('select').nth(0).selectOption(owner.id);
    await modal.locator('select').nth(1).selectOption('INVESTMENT');
    await modal.locator('input[placeholder="1000"]').fill('500');
    await modal.getByRole('button', { name: 'ПРОВЕСТИ', exact: true }).click();

    await expect(page.getByText(/успешно проведена/)).toBeVisible({ timeout: 10000 });

    const after = await apiGet<any[]>(token, '/api/owners').then((list) => list.find((o: any) => o.id === owner.id));
    expect(after.capitalBalanceUsd).toBeCloseTo(owner.capitalBalanceUsd + 500, 5);

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'OWNER_INVESTMENT')).toBe(true);
  });

  test('a profit payout through the real form decreases available profit and increases paid profit', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    await generateProfit(token, 200);
    const before = await apiGet<any[]>(token, '/api/owners');
    const owner = before.find((o: any) => o.availableProfitUsd >= 50);
    expect(owner, 'at least one owner should have available profit after the setup sale').toBeTruthy();

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.OWNERS);
    await page.getByRole('button', { name: 'ПРОВЕСТИ ОПЕРАЦИЮ' }).click();

    const modal = page.locator('.fixed.inset-0').first();
    await modal.locator('select').nth(0).selectOption(owner.id);
    await modal.locator('select').nth(1).selectOption('PROFIT_PAYOUT');
    await modal.locator('input[placeholder="1000"]').fill('50');
    await modal.getByRole('button', { name: 'ПРОВЕСТИ', exact: true }).click();

    await expect(page.getByText(/успешно проведена/)).toBeVisible({ timeout: 10000 });

    const after = await apiGet<any[]>(token, '/api/owners').then((list) => list.find((o: any) => o.id === owner.id));
    expect(after.totalPaidProfitUsd).toBeCloseTo(owner.totalPaidProfitUsd + 50, 5);
    expect(after.availableProfitUsd).toBeCloseTo(owner.availableProfitUsd - 50, 5);

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'PROFIT_PAYOUT')).toBe(true);
  });

  test('reinvesting available profit through the real form moves it into capital', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    await generateProfit(token, 200);
    const before = await apiGet<any[]>(token, '/api/owners');
    const owner = before.find((o: any) => o.availableProfitUsd >= 50);
    expect(owner).toBeTruthy();

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.OWNERS);
    await page.getByRole('button', { name: 'ПРОВЕСТИ ОПЕРАЦИЮ' }).click();

    const modal = page.locator('.fixed.inset-0').first();
    await modal.locator('select').nth(0).selectOption(owner.id);
    await modal.locator('select').nth(1).selectOption('REINVEST');
    await modal.locator('input[placeholder="1000"]').fill('50');
    await modal.getByRole('button', { name: 'ПРОВЕСТИ', exact: true }).click();

    await expect(page.getByText(/успешно проведена/)).toBeVisible({ timeout: 10000 });

    const after = await apiGet<any[]>(token, '/api/owners').then((list) => list.find((o: any) => o.id === owner.id));
    expect(after.capitalBalanceUsd).toBeCloseTo(owner.capitalBalanceUsd + 50, 5);
    expect(after.totalReinvestedUsd).toBeCloseTo(owner.totalReinvestedUsd + 50, 5);
    expect(after.availableProfitUsd).toBeCloseTo(owner.availableProfitUsd - 50, 5);
  });

  test('closing a quarter through the real form archives a snapshot and resets accrued/paid counters without deleting history', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    await generateProfit(token, 50);
    const before = await apiGet<any[]>(token, '/api/owners');

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.OWNERS);
    await page.getByRole('button', { name: /КВАРТАЛЬНЫЙ ОТЧЕТ/ }).click();
    await page.getByRole('button', { name: 'ЗАКРЫТЬ КВАРТАЛ И ОБНУЛИТЬ' }).click();

    await expect(page.getByText(/официально закрыт/)).toBeVisible({ timeout: 10000 });

    const after = await apiGet<any[]>(token, '/api/owners');
    for (const b of before) {
      const a = after.find((o: any) => o.id === b.id);
      expect(a.totalAccruedProfitUsd).toBe(0);
      expect(a.totalPaidProfitUsd).toBe(0);
    }

    // The quarter's figures must survive somewhere, not vanish — captured in the audit log at minimum.
    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'QUARTER_CLOSE')).toBe(true);
  });
});
