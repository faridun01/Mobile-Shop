import { prisma } from '../server/src/prisma/prisma.service';
import { getBusinessDateKey } from '../server/src/common/business-date';

async function main() {
  const todayKey = getBusinessDateKey();
  console.log('Today business date key:', todayKey);
  const rates = await prisma.exchangeRate.findMany();
  console.log('All rates in DB:', JSON.stringify(rates, null, 2));
  const todayRate = await prisma.exchangeRate.findUnique({ where: { date: todayKey } });
  console.log('Today rate in DB:', todayRate);
  await prisma.$disconnect();
}

main();
