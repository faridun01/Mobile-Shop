import { chromium } from 'playwright';
const shotDir = 'C:/Users/user/AppData/Local/Temp/claude/c--Users-user-OneDrive-Desktop-Mobile-Shop/b9945b56-b5c2-456a-8053-43bacaf05eaf/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[type="password"]', { timeout: 20000 });
const inputs = await page.locator('input').all();
await inputs[0].fill('admin');
await page.locator('input[type="password"]').fill('admin123');
await page.click('button[type="submit"], button:has-text("Войти")');
await page.waitForTimeout(1500);

await page.locator('text="Бонусы"').last().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${shotDir}/01-bonuses-page.png`, fullPage: true });

// open the create-bonus modal (look for a button that opens it)
const newBtn = page.locator('button:has-text("Новый бонус"), button:has-text("Регистрация бонуса"), button:has-text("Добавить бонус")').first();
console.log('new bonus button found:', await newBtn.count());
if (await newBtn.count() > 0) {
  await newBtn.click();
  await page.waitForTimeout(600);
}
await page.screenshot({ path: `${shotDir}/02-modal-opened.png`, fullPage: true });

const brandInput = page.locator('input[placeholder="Apple"]');
const modelInput = page.locator('input[placeholder="iPhone 16"]');
console.log('brand input value (should be empty):', await brandInput.inputValue().catch(() => 'NOT FOUND'));
console.log('model input value (should be empty):', await modelInput.inputValue().catch(() => 'NOT FOUND'));

console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();
