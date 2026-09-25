import { prisma } from '../server/src/prisma/prisma.service';

async function main() {
  let supplier = await prisma.supplier.findFirst();
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: { name: 'China Tech Direct' }
    });
  }

  // Invoice 1 in September 2026 (current month)
  const invSept = await prisma.supplierInvoice.create({
    data: {
      invoiceNumber: 'INV-2026-09-001',
      supplierId: supplier.id,
      date: new Date('2026-09-15T10:00:00.000Z'),
      totalAmountUsd: 1500,
      paidAmountUsd: 1500,
      exchangeRate: 9.5,
      devicesCount: 2,
      isStorePurchase: false,
    }
  });

  // Invoice 2 in August 2026 (previous month)
  const invAug = await prisma.supplierInvoice.create({
    data: {
      invoiceNumber: 'INV-2026-08-001',
      supplierId: supplier.id,
      date: new Date('2026-08-20T10:00:00.000Z'),
      totalAmountUsd: 2200,
      paidAmountUsd: 0,
      exchangeRate: 9.3,
      devicesCount: 3,
      isStorePurchase: false,
    }
  });

  // Invoice 3 in July 2026
  const invJuly = await prisma.supplierInvoice.create({
    data: {
      invoiceNumber: 'INV-2026-07-001',
      supplierId: supplier.id,
      date: new Date('2026-07-10T10:00:00.000Z'),
      totalAmountUsd: 3100,
      paidAmountUsd: 3100,
      exchangeRate: 9.2,
      devicesCount: 4,
      isStorePurchase: false,
    }
  });

  console.log('Created sample invoices:', {
    sept: invSept.invoiceNumber,
    aug: invAug.invoiceNumber,
    july: invJuly.invoiceNumber,
  });

  await prisma.$disconnect();
}

main();
