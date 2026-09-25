import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  const inv = await prisma.supplierInvoice.count();
  const dev = await prisma.device.count();
  const sal = await prisma.sale.count();
  const exp = await prisma.expense.count();
  console.log({ invoices: inv, devices: dev, sales: sal, expenses: exp });
  await prisma.$disconnect();
}

main();
