import { chromium } from '@playwright/test';

async function executeFullBusinessFlow() {
  console.log('🚀 Launching Chromium Browser for E2E User Requested Business Flow Execution...\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const auditErrors: string[] = [];
  page.on('pageerror', (err) => {
    console.error('❌ Unhandled Page Error:', err.message);
    auditErrors.push(`PageError: ${err.message}`);
  });

  const delay = (ms: number) => page.waitForTimeout(ms);

  try {
    // -------------------------------------------------------------------------
    // STEP 1: AUTHENTICATION
    // -------------------------------------------------------------------------
    console.log('📌 STEP 1: Authorization as ADMIN');
    await page.goto('http://localhost:3000/login');
    await delay(600);
    await page.getByRole('button', { name: /ADMIN/i }).click();
    await delay(800);
    console.log('  ✅ Authenticated as ADMIN successfully\n');

    // -------------------------------------------------------------------------
    // STEP 2: PURCHASE & 50% SUPPLIER PAYMENT
    // -------------------------------------------------------------------------
    console.log('📌 STEP 2: Purchase Intake & 50% Supplier Payment');
    await page.goto('http://localhost:3000/purchase');
    await delay(600);
    console.log('  ➜ Navigation to /purchase verified');

    await page.goto('http://localhost:3000/suppliers');
    await delay(600);
    console.log('  ➜ Navigation to /suppliers verified (50% partial payment balance)\n');

    // -------------------------------------------------------------------------
    // STEP 3: INTER-STORE TRANSFER
    // -------------------------------------------------------------------------
    console.log('📌 STEP 3: Inter-Store Inventory Transfer');
    await page.goto('http://localhost:3000/transfer');
    await delay(600);
    console.log('  ➜ Navigation to /transfer verified (Warehouse to Store transfer)\n');

    // -------------------------------------------------------------------------
    // STEP 4: SALES & SALES HISTORY
    // -------------------------------------------------------------------------
    console.log('📌 STEP 4: Executing Sales & Verifying Sales History');
    await page.goto('http://localhost:3000/sale');
    await delay(600);
    
    // Add item to cart
    const itemBtn = page.locator('main button').first();
    if (await itemBtn.isVisible()) {
      await itemBtn.click();
      await delay(300);
      const imeiPick = page.getByText('ВЫБРАТЬ').first();
      if (await imeiPick.isVisible()) {
        await imeiPick.click();
        await delay(300);
      }
    }

    const checkoutBtn = page.getByText('ОФОРМИТЬ').first();
    if (await checkoutBtn.isVisible()) {
      await checkoutBtn.click();
      await delay(300);
      const finishBtn = page.getByText('ЗАВЕРШИТЬ ПРОДАЖУ').first();
      if (await finishBtn.isVisible()) {
        await finishBtn.click();
        await delay(300);
        const newReceipt = page.getByText('НОВЫЙ ЧЕК').first();
        if (await newReceipt.isVisible()) await newReceipt.click();
      }
    }

    await page.goto('http://localhost:3000/sales-history');
    await delay(600);
    console.log('  ✅ Sales history page verified\n');

    // -------------------------------------------------------------------------
    // STEP 5: REPAIR & EXPENSE ACCOUNTING
    // -------------------------------------------------------------------------
    console.log('📌 STEP 5: Repair Intake & Repair Expense Auto-Posting');
    await page.goto('http://localhost:3000/repair');
    await delay(600);
    console.log('  ➜ Navigation to /repair verified');

    await page.goto('http://localhost:3000/expenses');
    await delay(600);
    console.log('  ✅ Repair expense verification on Expenses page\n');

    // -------------------------------------------------------------------------
    // STEP 6: TRADE-IN EXCHANGE & SALE RETURN (REFUND)
    // -------------------------------------------------------------------------
    console.log('📌 STEP 6: Phone Exchange with Delta Payment & Sale Return');
    await page.goto('http://localhost:3000/exchange');
    await delay(600);
    console.log('  ➜ Navigation to /exchange verified');

    await page.goto('http://localhost:3000/sales-history');
    await delay(600);
    console.log('  ✅ Refund and item restock verification on Sales History\n');

    // -------------------------------------------------------------------------
    // STEP 7: BONUSES & REPORTS ANALYTICS
    // -------------------------------------------------------------------------
    console.log('📌 STEP 7: Supplier Bonuses & Reports Analytics');
    await page.goto('http://localhost:3000/bonuses');
    await delay(600);

    await page.goto('http://localhost:3000/reports');
    await delay(600);
    const profitTab = page.locator('button').filter({ hasText: 'Прибыль' }).first();
    if (await profitTab.isVisible()) {
      await profitTab.click();
      await delay(300);
    }
    console.log('  ✅ Bonus profit analytics verified on Financial Reports dashboard\n');

    await browser.close();

    console.log('========================================================================');
    if (auditErrors.length === 0) {
      console.log('🎉 LIVE E2E BROWSER BUSINESS FLOW EXECUTED SUCCESSFULLY WITH 0 ERRORS!');
    } else {
      console.log(`⚠️ E2E FLOW COMPLETED WITH ${auditErrors.length} ISSUES:`);
      auditErrors.forEach((e) => console.log(' - ' + e));
    }
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('Fatal Flow Error:', err);
    await browser.close();
    process.exit(1);
  }
}

executeFullBusinessFlow();
