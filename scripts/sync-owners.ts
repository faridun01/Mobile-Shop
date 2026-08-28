import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { name: true } });
  const partnerUser = await prisma.user.findFirst({ where: { role: 'PARTNER' }, select: { name: true } });

  const adminName = adminUser?.name || 'Далер';
  const partnerName = partnerUser?.name || 'Рустам';

  const owners = await prisma.owner.findMany({ orderBy: { createdAt: 'asc' } });

  if (owners.length === 0) {
    await prisma.owner.createMany({
      data: [
        { id: 'owner-admin', name: adminName, profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
        { id: 'owner-partner', name: partnerName, profitSharePercent: 50, capitalBalanceUsd: 0, totalAccruedProfitUsd: 0, totalPaidProfitUsd: 0, totalReinvestedUsd: 0, availableProfitUsd: 0 },
      ],
    });
    console.log(`✅ Created 2 default owners: ${adminName} (50%) & ${partnerName} (50%)`);
  } else {
    // Update existing generic owner names to real admin & partner names
    if (owners[0]) {
      await prisma.owner.update({
        where: { id: owners[0].id },
        data: { name: adminName }
      });
    }
    if (owners[1]) {
      await prisma.owner.update({
        where: { id: owners[1].id },
        data: { name: partnerName }
      });
    }
    console.log(`✅ Updated existing owner names in DB to Admin: "${adminName}" & Partner: "${partnerName}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
