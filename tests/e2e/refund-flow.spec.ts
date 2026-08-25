import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, API_BASE, navigateTo, NAV_LABELS } from './helpers';

test.describe('Refund — full path UI -> API -> DB -> inventory -> owner profit -> audit (idempotent)', () => {
  test('refunding a sale through the real form restocks the device, reverses profit, applies the penalty, and cannot be repeated', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    const rate = (await apiGet<any>(token, '/api/exchange-rate/today'))?.rate ?? 10;

    const devices = await apiGet<any[]>(token, '/api/devices?storeId=store-siyoma');
    const device = devices.find((d: any) => d.status === 'STORE_STOCK');
    const salePriceTjs = Math.round(rate * 200);
    const sale = await fetch(`${API_BASE}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId: 'store-siyoma', items: [{ deviceId: device.id, salePriceTjs }], paymentMethod: 'CASH' }),
    }).then((r) => r.json());

    const ownersBefore = await apiGet<any[]>(token, '/api/owners');
    const storeBefore = await apiGet<any[]>(token, '/api/stores').then((list) => list.find((s: any) => s.id === 'store-siyoma'));

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.SALES_HISTORY);
    await page.getByPlaceholder('Номер чека / IMEI / модель / продавец...').fill(String(sale.receiptNumber));
    await page.getByText(`#${sale.receiptNumber}`).first().click();
    await page.getByRole('button', { name: 'ВОЗВРАТ' }).click();

    const penaltyTjs = Math.round(rate * 20); // 20 USD penalty, kept in profit
    await page.getByPlaceholder('Брак / Отказ покупателя / Ошибка').fill('E2E refund test');
    await page.getByPlaceholder('0 TJS').fill(String(penaltyTjs));
    await page.getByRole('button', { name: 'ПОДТВЕРДИТЬ ВОЗВРАТ' }).click();

    await expect(page.getByText(/Возврат.*выполнен|Успешно/i)).toBeVisible({ timeout: 10000 }).catch(async () => {
      // Some builds close the dialog silently on success; fall back to checking the dialog closed.
      await expect(page.getByRole('button', { name: 'ПОДТВЕРДИТЬ ВОЗВРАТ' })).not.toBeVisible({ timeout: 10000 });
    });

    // --- Verify against Postgres ---
    const saleAfter = await apiGet<any[]>(token, '/api/sales').then((list) => list.find((s: any) => s.id === sale.id));
    expect(saleAfter.status).toBe('REFUNDED');
    expect(saleAfter.penaltyFeeTjs).toBe(penaltyTjs);

    const deviceAfter = await apiGet<any[]>(token, `/api/devices?storeId=store-siyoma`).then((list) => list.find((d: any) => d.id === device.id));
    expect(deviceAfter.status).toBe('STORE_STOCK');

    const storeAfter = await apiGet<any[]>(token, '/api/stores').then((list) => list.find((s: any) => s.id === 'store-siyoma'));
    expect(storeAfter.cashBalanceTjs).toBeCloseTo(storeBefore.cashBalanceTjs - saleAfter.actualRefundAmountTjs, 2);

    // Original sale profit is reversed, and 100% of the penalty is added back as profit.
    const originalProfitUsd = sale.totalUsd - sale.saleItems.reduce((sum: number, i: any) => sum + i.costBasisUsd, 0);
    const penaltyUsd = penaltyTjs / rate;
    const netImpactUsd = -originalProfitUsd + penaltyUsd;
    const ownersAfter = await apiGet<any[]>(token, '/api/owners');
    for (const before of ownersBefore) {
      const after = ownersAfter.find((o: any) => o.id === before.id);
      const expectedDelta = Number((netImpactUsd * (before.profitSharePercent / 100)).toFixed(2));
      expect(after.availableProfitUsd).toBeCloseTo(before.availableProfitUsd + expectedDelta, 1);
    }

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'REFUND' && l.receiptNumber === sale.receiptNumber)).toBe(true);

    // Idempotency: a second refund attempt on the same sale must be rejected.
    const secondAttempt = await fetch(`${API_BASE}/api/sales/${sale.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'duplicate attempt', refundAmountTjs: salePriceTjs, paymentMethod: 'CASH' }),
    });
    expect(secondAttempt.status).not.toBe(200);
    expect(secondAttempt.status).not.toBe(201);
  });
});
