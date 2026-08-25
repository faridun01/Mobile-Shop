import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, API_BASE, navigateTo, NAV_LABELS } from './helpers';

test.describe('Supplier Payment (FIFO) — full path UI -> API -> DB -> ledger -> audit', () => {
  test('paying down supplier debt through the real form allocates FIFO across invoices and updates the ledger', async ({ page }) => {
    const token = await apiLogin('ADMIN');
    const supplierName = `E2E Supplier ${Date.now()}`;
    const supplier = await fetch(`${API_BASE}/api/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: supplierName }),
    }).then((r) => r.json());

    // Two invoices so we can prove FIFO allocation (oldest paid first).
    await fetch(`${API_BASE}/api/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        supplierId: supplier.id, invoiceNumber: `E2E-SP-1-${Date.now()}`, date: new Date(Date.now() - 86400000).toISOString(),
        isStorePurchase: false, storeId: 'main-warehouse',
        groups: [{ brand: 'X', model: 'X', storage: '1GB', color: 'x', purchasePriceUsd: 100, imeis: [`E2ESP1-${Date.now()}`] }],
      }),
    }).then((r) => r.json());
    await fetch(`${API_BASE}/api/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        supplierId: supplier.id, invoiceNumber: `E2E-SP-2-${Date.now()}`, date: new Date().toISOString(),
        isStorePurchase: false, storeId: 'main-warehouse',
        groups: [{ brand: 'Y', model: 'Y', storage: '1GB', color: 'x', purchasePriceUsd: 200, imeis: [`E2ESP2-${Date.now()}`] }],
      }),
    }).then((r) => r.json());

    await loginAsUi(page, 'ADMIN');
    await navigateTo(page, NAV_LABELS.SUPPLIERS);
    await page.getByText(supplierName).click();
    await page.getByRole('button', { name: /Погасить долг/ }).click();
    await page.locator('input[type="number"]').first().fill('100');
    await page.getByRole('button', { name: 'Оплатить', exact: true }).click();

    await expect(page.getByText(/успешно проведена/)).toBeVisible({ timeout: 10000 });

    // --- Verify against Postgres ---
    const updatedSupplier = await apiGet<any[]>(token, '/api/suppliers').then((list) => list.find((s: any) => s.id === supplier.id));
    expect(updatedSupplier.totalPaidUsd).toBe(100);
    expect(updatedSupplier.totalDebtUsd).toBe(200); // 300 total debt - 100 paid

    const invoices = await apiGet<any[]>(token, '/api/supplier-invoices').then((list) => list.filter((i: any) => i.supplierId === supplier.id));
    const oldest = invoices.find((i: any) => i.invoiceNumber.includes('SP-1'));
    const newest = invoices.find((i: any) => i.invoiceNumber.includes('SP-2'));
    expect(oldest.status, 'the older $100 invoice should be fully paid first (FIFO)').toBe('PAID');
    expect(newest.status, 'the newer $200 invoice should remain untouched').toBe('UNPAID');

    const logs = await apiGet<any[]>(token, '/api/audit-logs?limit=20');
    expect(logs.some((l) => l.action === 'SUPPLIER_PAYMENT' && l.details.includes(supplierName))).toBe(true);
  });
});
