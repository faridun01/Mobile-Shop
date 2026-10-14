import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, isMainWarehouse: true, cashBalanceUsd: true, active: true },
  });
  console.log('Stores count:', stores.length);
  for (const s of stores) {
    console.log(` - [${s.id}] ${s.name} (isMain: ${s.isMainWarehouse}, cash: ${s.cashBalanceUsd} USD)`);
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true, storeId: true, login: true },
  });
  console.log('\nUsers count:', users.length);
  for (const u of users) {
    console.log(` - [${u.login}] ${u.name} (role: ${u.role}, store: ${u.storeId})`);
  }

  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, totalDebtUsd: true },
  });
  console.log('\nSuppliers count:', suppliers.length);
  for (const sup of suppliers) {
    console.log(` - [${sup.id}] ${sup.name} (debt: ${sup.totalDebtUsd})`);
  }

  const rates = await prisma.exchangeRate.findMany({
    orderBy: { date: 'desc' },
    take: 5,
  });
  console.log('\nRecent rates:', rates);

  const thresholds = await prisma.stockThreshold.findMany();
  console.log('\nStock thresholds count:', thresholds.length);

  const deviceCount = await prisma.device.count();
  const saleCount = await prisma.sale.count();
  const transferCount = await prisma.transferRequest.count();
  const refundCount = await prisma.sale.count({ where: { status: 'REFUNDED' } });
  const exchangeCount = await prisma.exchangeEvent.count();
  const closings = await prisma.dailyCashClosing.findMany();
  console.log('\nClosings detail:', closings);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
