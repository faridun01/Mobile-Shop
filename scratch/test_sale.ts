import { prisma } from '../server/src/prisma/prisma.service.js';
import { SalesService } from '../server/src/modules/sales/sales.service.js';

async function testSale() {
  const store = await prisma.store.findFirst();
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const device = await prisma.device.findFirst({ where: { status: { in: ['MAIN_WAREHOUSE', 'STORE_STOCK'] } } });

  console.log('Store:', store?.id);
  console.log('Admin:', adminUser?.id);
  console.log('Device:', device?.id, device?.brand, device?.model, device?.status);

  if (!store || !adminUser || !device) {
    console.log('Not enough test data');
    return;
  }

  const sale = await SalesService.executeSale({
    storeId: device.storeId,
    userId: adminUser.id,
    paymentMethod: 'CASH',
    items: [
      { deviceId: device.id, salePriceTjs: 10000 }
    ]
  });

  console.log('Sale Executed Successfully! Receipt #', sale.receiptNumber);

  // Clean up test sale
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await prisma.device.update({ where: { id: device.id }, data: { status: device.status } });
}

testSale().catch(console.error).finally(() => prisma.$disconnect());
