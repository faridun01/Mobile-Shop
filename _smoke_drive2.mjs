import { chromium } from 'playwright';

const shotDir = 'C:/Users/user/AppData/Local/Temp/claude/c--Users-user-OneDrive-Desktop-Mobile-Shop/02b6c8b8-83fa-4089-891c-29a4435a0a38/scratchpad';
const pages = [
  ['sales-history', 'SalesHistoryPage'],
  ['purchase', 'PurchasePage'],
  ['exchange', 'ExchangePage'],
  ['repair', 'RepairPage'],
  ['suppliers', 'SuppliersPage'],
  ['bonuses', 'BonusesPage'],
  ['expenses', 'ExpensesPage'],
  ['owners', 'OwnersPage'],
  ['employees', 'EmployeesPage'],
  ['reports', 'ReportsPage'],
  ['audit-log', 'AuditLogPage'],
  ['notifications', 'NotificationsPage'],
  ['settings', 'SettingsPage'],
];

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[${page.url()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[${page.url()}] PAGEERROR: ${err.message}`));

// login first
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.locator('input').nth(0).fill('admin');
await page.locator('input[type="password"]').fill('admin123');
await page.locator('button[type="submit"], button:has-text("Войти")').first().click();
await page.waitForTimeout(1500);

for (const [route, name] of pages) {
  await page.goto(`http://localhost:3000/${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shotDir}/p-${route}.png` });
  console.log(`visited /${route} (${name})`);
}

console.log('--- Console/page errors across all pages ---');
console.log(errors.length ? errors.join('\n') : '(none)');

await browser.close();
