import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, navigateTo, NAV_LABELS } from './helpers';

test.describe('Purchase (Приход товара) — full path UI -> API -> DB -> inventory -> audit', () => {
  test('creating a purchase invoice through the real form persists devices, supplier debt, ledger, and audit log', async ({ page }) => {
    const uniqueImei = `E2E-PUR-${Date.now()}`;
    const invoiceNumber = `E2E-INV-${Date.now()}`;

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.PURCHASE);
    await page.getByRole('button', { name: 'НОВЫЙ ПРИХОД' }).click();
    await expect(page.getByText('НОВЫЙ ПРИХОД ТОВАРОВ')).toBeVisible();

    // Suppliers load asynchronously from the API — wait for the select to actually
    // resolve to a real supplier before filling the rest of the form.
    await expect(page.locator('select').first()).not.toHaveValue('', { timeout: 10000 });

    await page.locator('input[placeholder="INV-999"]').fill(invoiceNumber);

    const groupCard = page.locator('text=Позиция #1').locator('..').locator('..');
    await groupCard.locator('input').nth(0).fill('E2EBrand'); // Бренд
    await groupCard.locator('input').nth(1).fill('E2EModel'); // Модель
    await groupCard.locator('input').nth(4).fill('321'); // Цена закупки

    await page.locator('input[placeholder*="Быстрая вставка"]').fill(uniqueImei);
    await page.locator('input[placeholder*="Быстрая вставка"]').press('Enter');

    await expect(page.getByText(/Список IMEI \(1 шт\.\)/)).toBeVisible();

    await page.getByRole('button', { name: 'СОХРАНИТЬ ПРИХОД' }).click();
    await expect(page.getByText(/успешно сохранен/)).toBeVisible({ timeout: 10000 });

    // --- Verify against the real database via the API (not just UI toast) ---
    const token = await apiLogin('ADMIN');
    const devices = await apiGet<any[]>(token, '/api/devices');
    const created = devices.find((d) => d.imei === uniqueImei);
    expect(created, 'device should exist in Postgres with the submitted IMEI').toBeTruthy();
    expect(created.brand).toBe('E2EBrand');
    expect(created.purchasePriceUsd).toBe(321);
    expect(created.status).toBe('MAIN_WAREHOUSE');

    const invoices = await apiGet<any[]>(token, '/api/supplier-invoices');
    const invoice = invoices.find((i) => i.invoiceNumber === invoiceNumber);
    expect(invoice, 'supplier invoice should be recorded').toBeTruthy();
    expect(invoice.totalAmountUsd).toBe(321);

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'PURCHASE' && l.details.includes(invoiceNumber))).toBe(true);

    // Realtime: the app resyncs on its own WS broadcast, so Inventory should show it
    // without a manual refresh — a sidebar click, not a full reload, is the real test.
    await navigateTo(page, NAV_LABELS.INVENTORY);
    await page.locator('input[placeholder*="Поиск"]').fill(uniqueImei);
    await expect(page.getByRole('heading', { name: 'E2EBrand E2EModel' })).toBeVisible({ timeout: 10000 });
  });
});
