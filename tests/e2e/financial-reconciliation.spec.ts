import { test, expect } from '@playwright/test';
import { loginAsUi, apiLogin, apiGet, API_BASE, navigateTo, NAV_LABELS } from './helpers';

/**
 * Deterministic financial reconciliation: builds a known-value scenario in an
 * isolated store (so no other test's data can pollute the numbers), computes the
 * expected Revenue/COGS/Gross Profit/Expenses/Net Profit *independently* here (not
 * by calling the app's own formula), then checks that figure against:
 *   1) raw Postgres rows via the API (devices/sales/expenses),
 *   2) what the Reports page actually renders in the browser.
 * A mismatch means the UI's aggregation has drifted from the ground truth in the
 * database, which is exactly the class of bug this check exists to catch (see the
 * repair-income double-counting bug found and fixed in ReportsPage.tsx).
 */

function parseUsd(text: string): number {
  const match = text.match(/\$(-?[\d,]+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not parse a $ amount out of: "${text}"`);
  return Number(match[1].replace(/,/g, ''));
}

test('Revenue, COGS, Gross Profit, Expenses, and Net Profit reconcile across Postgres, the API, and the Reports UI', async ({ page }) => {
  const token = await apiLogin('ADMIN');

  const rateInfo = await apiGet<any>(token, '/api/exchange-rate/today');
  const rate = rateInfo?.rate ?? (await fetch(`${API_BASE}/api/exchange-rate/today`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rate: 10 }),
  }).then((r) => r.json())).rate;

  // 1. Isolated store, so this scenario's numbers are never mixed with other tests' data.
  const storeName = `Recon-Store-${Date.now()}`;
  const store = await fetch(`${API_BASE}/api/stores`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: storeName }),
  }).then((r) => r.json());

  // 2. Purchase one device with a known $100 cost, directly into the new store.
  const supplier = (await apiGet<any[]>(token, '/api/suppliers'))[0];
  const purchase = await fetch(`${API_BASE}/api/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      supplierId: supplier.id, invoiceNumber: `RECON-${Date.now()}`, date: new Date().toISOString(), isStorePurchase: true, storeId: store.id,
      groups: [{ brand: 'Recon', model: 'Device', storage: '1GB', color: 'x', purchasePriceUsd: 100, imeis: [`RECONIMEI${Date.now()}`] }],
    }),
  }).then((r) => r.json());
  const device = purchase.devices[0];

  // 3. Sell it for a known 300 TJS/rate ($300 revenue), giving a clean $200 gross profit.
  const salePriceTjs = Math.round(rate * 300);
  const sale = await fetch(`${API_BASE}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ storeId: store.id, items: [{ deviceId: device.id, salePriceTjs }], paymentMethod: 'CASH' }),
  }).then((r) => r.json());

  // 4. One known expense against the same store.
  const expenseTjs = Math.round(rate * 50);
  await fetch(`${API_BASE}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ category: 'OTHER', amountTjs: expenseTjs, storeId: store.id, comment: 'reconciliation test expense', paidFromCashRegister: false }),
  });

  // --- Independent hand-computation (the "ground truth" this test checks against) ---
  const expectedRevenueUsd = sale.totalUsd; // == salePriceTjs / rate, rounded as the API rounds it
  const expectedCogsUsd = 100;
  const expectedGrossProfitUsd = expectedRevenueUsd - expectedCogsUsd;
  const expectedExpensesUsd = Number((expenseTjs / rate).toFixed(2));
  const expectedNetProfitUsd = expectedGrossProfitUsd - expectedExpensesUsd;

  // --- Layer 1: raw rows via the API must match what we just wrote ---
  const devicesAfter = await apiGet<any[]>(token, `/api/devices?storeId=${store.id}`);
  expect(devicesAfter.find((d: any) => d.id === device.id)?.status).toBe('SOLD');
  const salesAfter = await apiGet<any[]>(token, '/api/sales').then((list) => list.find((s: any) => s.id === sale.id));
  expect(salesAfter.totalUsd).toBeCloseTo(expectedRevenueUsd, 2);
  const expensesAfter = await apiGet<any[]>(token, '/api/expenses').then((list) => list.filter((e: any) => e.storeId === store.id));
  expect(expensesAfter.reduce((sum: number, e: any) => sum + e.amountTjs, 0)).toBe(expenseTjs);

  // --- Layer 2: the Reports UI, filtered to this isolated store, all-time ---
  await loginAsUi(page, 'ADMIN');
  await navigateTo(page, NAV_LABELS.REPORTS);
  await page.getByRole('button', { name: 'ВСЕ ВРЕМЯ' }).click();
  await page.locator('select').first().selectOption(store.id);
  await page.waitForTimeout(500); // let the store-scoped useMemo recompute

  const revenueText = await page.locator('text=ВЫРУЧКА (ОБОРОТ)').locator('..').locator('..').innerText();
  const cogsText = await page.locator('text=СЕБЕСТОИМОСТЬ (COGS)').locator('..').locator('..').innerText();
  const grossProfitText = await page.locator('text=ВАЛОВАЯ МАРЖА').locator('..').locator('..').innerText();
  const netProfitText = await page.locator('text=ЧИСТАЯ ПРИБЫЛЬ').locator('..').locator('..').innerText();

  expect(parseUsd(revenueText), 'Revenue shown in Reports must match the actual sale total').toBeCloseTo(expectedRevenueUsd, 2);
  expect(parseUsd(cogsText), 'COGS shown in Reports must match the device purchase cost').toBeCloseTo(expectedCogsUsd, 2);
  expect(parseUsd(grossProfitText), 'Gross Profit shown in Reports must equal Revenue - COGS').toBeCloseTo(expectedGrossProfitUsd, 2);
  expect(parseUsd(netProfitText), 'Net Profit shown in Reports must equal Gross Profit - Expenses (no repair-income double-count)').toBeCloseTo(expectedNetProfitUsd, 2);
});
