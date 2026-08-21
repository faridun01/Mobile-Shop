import { test, expect } from '@playwright/test';

test.describe('Mobile Shop POS Checkout Flow', () => {
  test('authenticates user and loads POS Sale Page', async ({ page }) => {
    await page.goto('http://localhost:3000/sale');
    await expect(page).toHaveTitle(/Mobile/i);
    await expect(page.locator('text=СИСТЕМА: АКТИВНА')).toBeVisible();
  });
});
