import { prisma } from '../server/src/prisma/prisma.service.js';

async function checkInvoices() {
  const invoices = await prisma.supplierInvoice.findMany({
    include: { devices: true }
  });
  console.log('--- ALL INVOICES & DEVICES ---');
  for (const inv of invoices) {
    console.log(`Invoice: ${inv.invoiceNumber} (ID: ${inv.id})`);
    for (const dev of inv.devices) {
      console.log(`  Device: ${dev.brand} ${dev.model} | IMEI: ${dev.imei} | Barcode: "${dev.barcode}"`);
    }
  }
}

checkInvoices().catch(console.error).finally(() => prisma.$disconnect());
