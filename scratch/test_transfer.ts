import { prisma } from '../server/src/prisma/prisma.service.js';
import { TransfersService } from '../server/src/modules/transfers/transfers.service.js';

async function testTransfer() {
  const fromStore = await prisma.store.findFirst({ where: { isMainWarehouse: true } });
  const toStore = await prisma.store.findFirst({ where: { isMainWarehouse: false } });
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const device = await prisma.device.findFirst({ where: { storeId: fromStore?.id, status: 'MAIN_WAREHOUSE' } });

  console.log('From Store:', fromStore?.id);
  console.log('To Store:', toStore?.id);
  console.log('User:', adminUser?.id);
  console.log('Device:', device?.id);

  if (!fromStore || !toStore || !adminUser || !device) {
    console.log('Not enough data to create transfer, but stores exist.');
    return;
  }

  const result = await TransfersService.create({
    fromStoreId: fromStore.id,
    toStoreId: toStore.id,
    deviceIds: [device.id],
    requestedByUserId: adminUser.id,
  });

  console.log('Transfer Created Successfully:', result.transferNumber);

  // Clean up
  await prisma.deviceTimelineEvent.deleteMany({ where: { deviceId: device.id, type: 'TRANSFER_REQUEST' } });
  await prisma.transferItem.deleteMany({ where: { transferId: result.id } });
  await prisma.transferRequest.delete({ where: { id: result.id } });
  await prisma.device.update({ where: { id: device.id }, data: { status: 'MAIN_WAREHOUSE' } });
}

testTransfer().catch(console.error).finally(() => prisma.$disconnect());
