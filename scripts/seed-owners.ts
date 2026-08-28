import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.owner.findMany();
  if (existing.length === 0) {
    await prisma.owner.createMany({
      data: [
        { name: 'Владелец #1', profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
        { name: 'Владелец #2', profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
      ],
    });
    console.log('Successfully created default owners in PostgreSQL database!');
  } else {
    console.log('Owners already exist:', existing.length);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
