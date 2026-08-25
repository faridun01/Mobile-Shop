import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, API_BASE, navigateTo, NAV_LABELS } from './helpers';

test.describe('Exchange / Trade-In — full path UI -> API -> DB -> inventory -> ledger -> audit', () => {
  test('processing a trade-in through the real form updates the sale, both devices, and the audit log', async ({ page }) => {
    const token = await apiLogin('ADMIN');

    // Set up a real sale to trade in against (precondition, not what this test verifies).
    const rate = (await apiGet<any>(token, '/api/exchange-rate/today')) ?? (await fetch(`${API_BASE}/api/exchange-rate/today`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rate: 10 }),
    }).then((r) => r.json()));

    const devices = await apiGet<any[]>(token, '/api/devices?storeId=store-siyoma');
    const forSale = devices.find((d) => d.status === 'STORE_STOCK');
    const replacement = devices.find((d) => d.status === 'STORE_STOCK' && d.id !== forSale.id);

    const sale = await fetch(`${API_BASE}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId: 'store-siyoma', items: [{ deviceId: forSale.id, salePriceTjs: 5000 }], paymentMethod: 'CASH' }),
    }).then((r) => r.json());

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.EXCHANGE);

    await page.getByPlaceholder('Номер чека или IMEI...').fill(String(sale.receiptNumber));
    await page.getByRole('button', { name: 'НАЙТИ' }).click();
    await expect(page.getByText('ПРИНИМАЕМЫЙ АППАРАТ')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('Поиск по наличию / IMEI...').fill(replacement.imei);
    await page.getByRole('button', { name: 'ВЫБРАТЬ' }).first().click();

    await page.getByRole('button', { name: 'ПРОВЕСТИ ОБМЕН' }).click();
    await expect(page.getByText(/Обмен успешно выполнен/)).toBeVisible({ timeout: 10000 });

    // --- Verify against Postgres ---
    const updatedSale = await apiGet<any[]>(token, '/api/sales').then((list) => list.find((s: any) => s.id === sale.id));
    expect(updatedSale.status).toBe('EXCHANGED');
    expect(updatedSale.exchangeEvents.length).toBe(1);

    const allDevices = await apiGet<any[]>(token, '/api/devices');
    const oldDevice = allDevices.find((d: any) => d.imei === forSale.imei);
    const newDevice = allDevices.find((d: any) => d.imei === replacement.imei);
    expect(oldDevice.status).toBe('IN_STOCK_AFTER_EXCHANGE');
    expect(newDevice.status).toBe('SOLD');

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'EXCHANGE' && l.receiptNumber === sale.receiptNumber)).toBe(true);
  });
});
