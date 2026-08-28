import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { invoiceNumber: 'INV-AUDIT-1749' },
    include: { groups: true }
  });
  console.log('Invoice:', JSON.stringify(invoice, null, 2));

  const allDevices = await prisma.device.findMany({
    where: {
      OR: [
        { purchaseInvoiceId: invoice?.id },
        { invoiceNumber: 'INV-AUDIT-1749' }
      ]
    }
  });
  console.log('Devices found:', JSON.stringify(allDevices, null, 2));

  const stores = await prisma.store.findMany();
  console.log('Stores:', JSON.stringify(stores, null, 2));
}

main().finally(() => prisma.$disconnect());
