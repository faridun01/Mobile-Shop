import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const url = readFileSync(process.argv[2], 'utf-8').trim();
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const stores = await prisma.store.findMany({ where: { name: { contains: 'Сиёма' } } });
  console.log('=== Stores matching "Сиёма" ===');
  for (const s of stores) {
    console.log(JSON.stringify(s, null, 2));
  }

  for (const s of stores) {
    const [deviceCount, salesCount, repairsCount, expensesCount, transfersFrom, transfersTo, purchaseInvoices, users] = await Promise.all([
      prisma.device.count({ where: { storeId: s.id } }),
      prisma.sale.count({ where: { storeId: s.id } }),
      prisma.repairTicket.count({ where: { storeId: s.id } }),
      prisma.expense.count({ where: { storeId: s.id } }),
      prisma.transferRequest.count({ where: { fromStoreId: s.id } }),
      prisma.transferRequest.count({ where: { toStoreId: s.id } }),
      prisma.supplierInvoice.count({ where: { storeId: s.id } }),
      prisma.user.count({ where: { storeId: s.id } }),
    ]);
    console.log(`\n--- Store ${s.id} (${s.name}) related record counts ---`);
    console.log({ deviceCount, salesCount, repairsCount, expensesCount, transfersFrom, transfersTo, purchaseInvoices, users });
  }

  const allStores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
  console.log('\n=== All stores in production ===');
  console.log(allStores.map((s) => ({ id: s.id, name: s.name, cash: s.cashBalanceTjs, main: s.isMainWarehouse, active: s.active })));
}

main().finally(() => prisma.$disconnect());
