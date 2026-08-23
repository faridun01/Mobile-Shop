import { test, expect } from '@playwright/test';

test.describe('Mobile Shop Complete E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Collect console errors
    page.on('pageerror', (exception) => {
      console.error(`Page error: ${exception}`);
    });
  });

  test('Login and navigate through all pages, executing operations', async ({ page }) => {
    // 1. Visit Login page
    await page.goto('http://localhost:3000/login');
    await expect(page.getByText('MOBILE SHOP OS')).toBeVisible();

    // Click Admin quick access preset
    await page.getByRole('button', { name: /ADMIN/i }).click();

    // 2. Verify redirected to /sale
    await expect(page).toHaveURL(/.*sale/);
    await expect(page.getByText('СИСТЕМА: АКТИВНА')).toBeVisible();

    // 3. Test Sale / POS (/sale)
    await page.goto('http://localhost:3000/sale');
    await expect(page.getByText('ТЕРМИНАЛ ПРОДАЖ')).toBeVisible();
    
    // Add product to cart if products exist
    const productCard = page.locator('.grid > div').first();
    if (await productCard.isVisible()) {
      await productCard.click();
    }

    // 4. Sales History (/sales-history)
    await page.goto('http://localhost:3000/sales-history');
    await expect(page.getByText('ИСТОРИЯ ПРОДАЖ')).toBeVisible();
    await page.waitForTimeout(500);

    // 5. Inventory (/inventory)
    await page.goto('http://localhost:3000/inventory');
    await expect(page.getByText('СКЛАДСКОЙ УЧЕТ')).toBeVisible();
    // Test category filter buttons
    const filterBtn = page.getByRole('button', { name: /ТЕЛЕФОНЫ/i }).first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
    }
    await page.waitForTimeout(500);

    // 6. Purchase (/purchase)
    await page.goto('http://localhost:3000/purchase');
    await expect(page.getByText('ЗАКУПКА ТОВАРА')).toBeVisible();
    await page.waitForTimeout(500);

    // 7. Transfer (/transfer)
    await page.goto('http://localhost:3000/transfer');
    await expect(page.getByText('ПЕРЕМЕЩЕНИЕ ТОВАРОВ')).toBeVisible();
    await page.waitForTimeout(500);

    // 8. Exchange (/exchange)
    await page.goto('http://localhost:3000/exchange');
    await expect(page.getByText('ОБМЕН / TRADE-IN')).toBeVisible();
    await page.waitForTimeout(500);

    // 9. Repair (/repair)
    await page.goto('http://localhost:3000/repair');
    await expect(page.getByText('РЕМОНТ И СЕРВИС')).toBeVisible();
    await page.waitForTimeout(500);

    // 10. Suppliers (/suppliers)
    await page.goto('http://localhost:3000/suppliers');
    await expect(page.getByText('ПОСТАВЩИКИ')).toBeVisible();
    await page.waitForTimeout(500);

    // 11. Bonuses (/bonuses)
    await page.goto('http://localhost:3000/bonuses');
    await expect(page.getByText('БОНУСЫ И МОТИВАЦИЯ')).toBeVisible();
    await page.waitForTimeout(500);

    // 12. Expenses (/expenses)
    await page.goto('http://localhost:3000/expenses');
    await expect(page.getByText('УЧЕТ РАСХОДОВ')).toBeVisible();
    await page.waitForTimeout(500);

    // 13. Owners (/owners)
    await page.goto('http://localhost:3000/owners');
    await expect(page.getByText('УЧРЕДИТЕЛИИ И ДИВИДЕНДЫ')).toBeVisible();
    await page.waitForTimeout(500);

    // 14. Employees (/employees)
    await page.goto('http://localhost:3000/employees');
    await expect(page.getByText('СОТРУДНИКИ И ДОСТУПЫ')).toBeVisible();
    await page.waitForTimeout(500);

    // 15. Reports (/reports)
    await page.goto('http://localhost:3000/reports');
    await expect(page.getByText('АНАЛИТИКА И ОТЧЕТЫ')).toBeVisible();
    await page.waitForTimeout(500);

    // 16. Audit Log (/audit-log)
    await page.goto('http://localhost:3000/audit-log');
    await expect(page.getByText('ЖУРНАЛ ДЕЙСТВИЙ')).toBeVisible();
    await page.waitForTimeout(500);

    // 17. Settings (/settings)
    await page.goto('http://localhost:3000/settings');
    await expect(page.getByText('НАСТРОЙКИ СИСТЕМЫ')).toBeVisible();
    await page.waitForTimeout(500);

    // 18. Notifications (/notifications)
    await page.goto('http://localhost:3000/notifications');
    await expect(page.getByText('УВЕДОМЛЕНИЯ СИСТЕМЫ')).toBeVisible();
    await page.waitForTimeout(500);
  });
});
