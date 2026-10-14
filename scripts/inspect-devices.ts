import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  const devs = await prisma.device.findMany({
    where: { brand: { in: ['Honor', 'Redmi', 'itel'], mode: 'insensitive' } },
    select: { id: true, storeId: true, status: true, brand: true, model: true, ram: true, storage: true, color: true, purchasePriceUsd: true, costBasisUsd: true }
  });
  console.log('Found Honor/Redmi/itel:', devs.length);
  for (const d of devs) {
    console.log(d.brand, '|', d.model, '| RAM:', d.ram, '| Storage:', d.storage, '| Color:', d.color, '| Price:', d.purchasePriceUsd);
  }
  const allBrands = await prisma.device.groupBy({ by: ['brand'], _count: { id: true } });
  console.log('All brands in DB:', allBrands);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
