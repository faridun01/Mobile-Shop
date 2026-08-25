import { prisma } from '../server/src/prisma/prisma.service.js';

async function testPrismaCreate() {
  const supplier = await prisma.supplier.findFirst();
  const store = await prisma.store.findFirst();

  if (!supplier || !store) return;

  const testBarcode = '777888999000';
  const testImei = '888777666555444';

  const invoice = await prisma.supplierInvoice.create({
    data: {
      invoiceNumber: 'TEST-INV-999',
      supplierId: supplier.id,
      date: new Date(),
      totalAmountUsd: 500,
      devicesCount: 1,
      isStorePurchase: true,
      storeId: store.id,
    }
  });

  const createdDevices = await prisma.device.createManyAndReturn({
    data: [
      {
        imei: testImei,
        barcode: testBarcode,
        brand: 'Apple',
        model: 'Test Phone',
        storage: '128 GB',
        color: 'Black',
        purchasePriceUsd: 500,
        costBasisUsd: 500,
        status: 'MAIN_WAREHOUSE',
        storeId: store.id,
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceNumber: invoice.invoiceNumber,
        purchaseInvoiceId: invoice.id,
      }
    ]
  });

  console.log('Created Devices from Prisma:', createdDevices);

  const foundDevice = await prisma.device.findUnique({ where: { id: createdDevices[0].id } });
  console.log('Found Device from DB findUnique:', foundDevice);

  // Clean up
  await prisma.device.deleteMany({ where: { purchaseInvoiceId: invoice.id } });
  await prisma.supplierInvoice.delete({ where: { id: invoice.id } });
}

testPrismaCreate().catch(console.error).finally(() => prisma.$disconnect());
