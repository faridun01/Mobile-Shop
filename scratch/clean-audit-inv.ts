import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  await prisma.invoiceGroup.deleteMany({
    where: { invoice: { invoiceNumber: { startsWith: 'INV-AUDIT-' } } }
  });
  await prisma.supplierInvoice.deleteMany({
    where: { invoiceNumber: { startsWith: 'INV-AUDIT-' } }
  });
  console.log('✅ Cleaned all orphaned test invoices (INV-AUDIT-*)');
}

main().finally(() => prisma.$disconnect());
