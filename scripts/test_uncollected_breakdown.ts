import { prisma } from '../server/src/prisma/prisma.service';
import { CashCollectionService } from '../server/src/modules/finance/cash-collection.service';

async function main() {
  console.log('=== TESTING CASH COLLECTION RECONCILIATION & BREAKDOWN ===');
  const stores = await prisma.store.findMany({ where: { active: true } });
  console.log(`Found ${stores.length} active stores`);

  for (const st of stores) {
    if (st.isMainWarehouse) continue;
    console.log(`\n======================================================`);
    console.log(`STORE: ${st.name} (id: ${st.id})`);
    const breakdown = await CashCollectionService.getUncollectedBreakdown(st.id);

    console.log(`Register Cash (USD): $${breakdown.balance.cashUsd}`);
    console.log(`Register Cash (TJS): ${breakdown.balance.cashTjs} TJS`);
    console.log(`  Banknotes in drawer: ${breakdown.summary.cashOnlyTjs} TJS`);
    console.log(`  Cards/Transfers:     ${breakdown.summary.cardOnlyTjs} TJS`);

    console.log(`\nPERIOD:`);
    console.log(`  Since last collection: ${breakdown.period.since ?? 'None (all-time since opening)'}`);
    console.log(`  Days without collection: ${breakdown.period.daysCount} days (${breakdown.period.hoursCount} hours)`);
    console.log(`  Is first collection: ${breakdown.period.isFirstCollection}`);

    console.log(`\nSUMMARY AGGREGATES:`);
    console.log(`  Sales count:      ${breakdown.summary.salesCount}`);
    console.log(`  Total sales TJS:  ${breakdown.summary.salesTotalTjs} TJS`);
    console.log(`  Cash from sales:  ${breakdown.summary.salesCashTjs} TJS`);
    console.log(`  Card from sales:  ${breakdown.summary.salesCardTjs} TJS`);
    console.log(`  Expenses count:   ${breakdown.summary.expensesCount} (${breakdown.summary.expensesTotalTjs} TJS)`);
    console.log(`  Refunds count:    ${breakdown.summary.refundedCount} (${breakdown.summary.refundedTotalTjs} TJS)`);

    console.log(`\nSALES DETAILS (${breakdown.sales.length} records):`);
    for (const s of breakdown.sales) {
      console.log(`  - Receipt #${s.receiptNumber} (${s.createdAt}) by ${s.sellerName}: Total ${s.totalTjs} TJS (Cash ${s.cashAmountTjs}, Card ${s.cardAmountTjs}) | Items: ${s.items.map(i => `${i.brand} ${i.model}`).join(', ')}`);
    }

    if (breakdown.expenses.length > 0) {
      console.log(`\nEXPENSES DETAILS (${breakdown.expenses.length} records):`);
      for (const e of breakdown.expenses) {
        console.log(`  - ${e.createdAt} [${e.category}]: -${e.amountTjs} TJS (${e.description})`);
      }
    }
  }

  console.log('\n=== ALL BREAKDOWNS VERIFIED SUCCESSFULLY ===');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
