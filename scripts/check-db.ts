import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const stores = await prisma.store.count();
  const suppliers = await prisma.supplier.count();
  const invoices = await prisma.supplierInvoice.count();
  const devices = await prisma.device.count();
  const sales = await prisma.sale.count();
  const owners = await prisma.owner.findMany();

  console.log('=== DB DATA COUNT ===');
  console.log('Users:', users);
  console.log('Stores:', stores);
  console.log('Suppliers:', suppliers);
  console.log('Invoices:', invoices);
  console.log('Devices:', devices);
  console.log('Sales:', sales);
  console.log('Owners:', JSON.stringify(owners, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
