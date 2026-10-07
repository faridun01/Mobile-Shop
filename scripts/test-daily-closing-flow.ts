import { prisma } from '../server/src/prisma/prisma.service';
import { DailyClosingService } from '../server/src/modules/finance/daily-closing.service';
import { D } from '../server/src/common/decimal';

async function main() {
  console.log('--- TESTING DAILY CLOSING DISCREPANCY & REOPEN FLOW ---');

  // 1. Get an admin user
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', active: true },
  });
  if (!admin) throw new Error('No admin user found');
  console.log(`Found admin user: ${admin.name} (${admin.id})`);

  // 2. Target store: store-sadbarg
  const store = await prisma.store.findUnique({
    where: { id: 'store-sadbarg' },
  });
  if (!store) throw new Error('Store store-sadbarg not found');
  console.log(`Found store: ${store.name} (${store.id})`);

  // 3. Clean up any existing closing for today
  await prisma.dailyCashClosing.deleteMany({
    where: { storeId: store.id },
  });

  // 4. Test getSummary before closing
  const summaryBefore = await DailyClosingService.getSummary(store.id);
  console.log('Summary before closing:', {
    storeName: summaryBefore.storeName,
    businessDate: summaryBefore.businessDate,
    alreadyClosed: summaryBefore.alreadyClosed,
    expectedCashTjs: summaryBefore.expectedCashTjs,
  });
  if (summaryBefore.alreadyClosed) throw new Error('Expected alreadyClosed to be false');

  // 5. Test closeDay with discrepancy (+100 TJS)
  const actualCashTjs = D(summaryBefore.expectedCashTjs).plus(100).toNumber();
  console.log(`Submitting closing with actualCashTjs = ${actualCashTjs} (discrepancy +100 TJS)...`);

  const closing = await DailyClosingService.closeDay(admin.id, {
    storeId: store.id,
    businessDate: summaryBefore.businessDate,
    actualCashTjs,
    actualCashUsd: 0,
    comment: 'Излишек в кассе +100 TJS проверка фиксации',
  });

  console.log('Closing committed successfully:', {
    id: closing.id,
    storeId: closing.storeId,
    closedByName: closing.closedByName,
    actualCashTjs: closing.actualCashTjs.toString(),
    expectedCashTjs: closing.expectedCashTjs.toString(),
    differenceTjs: closing.differenceTjs.toString(),
  });

  if (D(closing.differenceTjs).toNumber() !== 100) {
    throw new Error(`Expected differenceTjs to be 100, got ${closing.differenceTjs}`);
  }

  // 6. Test getSummary after closing
  const summaryAfter = await DailyClosingService.getSummary(store.id);
  console.log('Summary after closing:', {
    alreadyClosed: summaryAfter.alreadyClosed,
    actualCashTjs: summaryAfter.closing?.actualCashTjs?.toString(),
    differenceTjs: summaryAfter.closing?.differenceTjs?.toString(),
  });

  if (!summaryAfter.alreadyClosed) throw new Error('Expected alreadyClosed to be true');
  if (D(summaryAfter.closing.differenceTjs).toNumber() !== 100) {
    throw new Error('Discrepancy was not preserved in closing summary!');
  }

  // 7. Test delete / reopen closing
  console.log('Testing reopening shift (DailyClosingService.delete)...');
  await DailyClosingService.delete(closing.id, admin.id);

  const summaryReopened = await DailyClosingService.getSummary(store.id);
  console.log('Summary after reopening:', {
    alreadyClosed: summaryReopened.alreadyClosed,
  });

  if (summaryReopened.alreadyClosed) {
    throw new Error('Expected alreadyClosed to be false after deletion!');
  }

  console.log('✅ ALL DAILY CLOSING CHECKS PASSED PERFECTLY!');
}

main()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
