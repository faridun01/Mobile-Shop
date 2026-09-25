import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const owners = await p.owner.findMany();
  console.log('Owners:', JSON.stringify(owners, null, 2));
  const txCount = await p.ownerTransaction.count();
  console.log('Owner transactions count:', txCount);
  const sales = await p.sale.count();
  console.log('Sales count:', sales);
  const expenses = await p.expense.count();
  console.log('Expenses count:', expenses);
}
main().finally(() => p.$disconnect());
