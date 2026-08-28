import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const owners = await prisma.owner.findMany({ orderBy: { createdAt: 'asc' } });

  if (owners.length >= 2) {
    await prisma.owner.update({
      where: { id: owners[0].id },
      data: {
        name: 'Далер',
        profitSharePercent: 50,
      },
    });

    await prisma.owner.update({
      where: { id: owners[1].id },
      data: {
        name: 'Дилшод',
        profitSharePercent: 50,
      },
    });

    console.log('Successfully updated partners: Далер (50%) and Дилшод (50%)');
  } else {
    await prisma.owner.deleteMany();
    await prisma.owner.createMany({
      data: [
        { name: 'Далер', profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
        { name: 'Дилшод', profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
      ],
    });
    console.log('Created partner records for Далер and Дилшод.');
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
