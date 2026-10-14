import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  const sales = await prisma.sale.findMany({
    where: { storeId: 'store-tsum' },
    include: { saleItems: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('TSUM Sales count:', sales.length);
  for (const s of sales) {
    const totalCostUsd = s.saleItems.reduce((acc, it) => acc + Number(it.costBasisUsd || it.purchaseCostUsd), 0);
    const profitUsd = Number(s.totalUsd) - totalCostUsd;
    console.log(`Receipt #${s.receiptNumber} (${s.createdAt.toISOString().slice(0, 10)}): Status=${s.status}, TotalTJS=${s.totalTjs}, TotalUSD=${s.totalUsd}, CostUSD=${totalCostUsd}, ProfitUSD=${profitUsd}`);
    for (const it of s.saleItems) {
      console.log(`   - ${it.brand} ${it.model}: salePriceTJS=${it.salePriceTjs}, salePriceUSD=${it.salePriceUsd}, costUSD=${it.costBasisUsd}`);
    }
  }

  // Also check expenses for TSUM
  const expenses = await prisma.expense.findMany({
    where: { storeId: 'store-tsum' },
  });
  console.log('\nTSUM Expenses:', expenses);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
