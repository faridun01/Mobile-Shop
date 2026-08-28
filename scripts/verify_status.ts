import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({ select: { id: true, name: true, address: true } });
  const users = await prisma.user.findMany({ select: { id: true, name: true, login: true, role: true, storeId: true } });
  const devices = await prisma.device.findMany({ select: { id: true, imei: true, brand: true, model: true, status: true, storeId: true } });
  const sales = await prisma.sale.findMany({ include: { saleItems: true, exchangeEvents: true } });
  const repairs = await prisma.repairTicket.findMany();
  const expenses = await prisma.expense.findMany();

  console.log('=== STORES ===');
  console.log(JSON.stringify(stores, null, 2));

  console.log('=== USERS ===');
  console.log(JSON.stringify(users, null, 2));

  console.log('=== DEVICES ===');
  console.log(JSON.stringify(devices, null, 2));

  console.log('=== SALES ===');
  console.log(JSON.stringify(sales, null, 2));

  console.log('=== REPAIRS ===');
  console.log(JSON.stringify(repairs, null, 2));

  console.log('=== EXPENSES ===');
  console.log(JSON.stringify(expenses, null, 2));
}

main().finally(() => prisma.$disconnect());
