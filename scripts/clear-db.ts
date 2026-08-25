import { prisma } from '../server/src/prisma/prisma.service.js';

async function clearTestData() {
  console.log('Cleaning up database test data...');

  await prisma.$transaction(async (tx) => {
    // 1. Devices & Timelines
    await tx.deviceTimelineEvent.deleteMany({});
    await tx.saleItem.deleteMany({});
    await tx.exchangeEvent.deleteMany({});
    await tx.sale.deleteMany({});
    await tx.transferItem.deleteMany({});
    await tx.transferRequest.deleteMany({});
    await tx.repairStatusHistory.deleteMany({});
    await tx.repairTicket.deleteMany({});
    await tx.supplierBonusDevice.deleteMany({});
    await tx.supplierBonus.deleteMany({});
    await tx.supplierPaymentAllocation.deleteMany({});
    await tx.supplierPayment.deleteMany({});
    await tx.invoiceGroup.deleteMany({});
    await tx.device.deleteMany({});
    await tx.supplierInvoice.deleteMany({});
    await tx.supplier.deleteMany({});

    // 2. Financial & Audit Logs
    await tx.expense.deleteMany({});
    await tx.ownerTransaction.deleteMany({});
    await tx.owner.deleteMany({});
    await tx.ledgerEntry.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.quarterClosure.deleteMany({});

    // 3. Reset Store Cash Balances to 0
    await tx.store.updateMany({
      data: { cashBalanceTjs: 0 },
    });

    // 4. Re-create default suppliers if none exist
    await tx.supplier.createMany({
      data: [
        { id: 'sup-dubai', name: 'Dubai Mobile', phone: '+971 4 123 4567', contactPerson: 'Ахмед' },
        { id: 'sup-china', name: 'China Tech', phone: '+86 20 8888 9999', contactPerson: 'Ли' },
      ],
      skipDuplicates: true,
    });
  });

  const remainingUsers = await prisma.user.count();
  const remainingStores = await prisma.store.count();
  const remainingDevices = await prisma.device.count();
  const remainingSales = await prisma.sale.count();
  const remainingSuppliers = await prisma.supplier.count();

  console.log('DATABASE PURGE COMPLETE!');
  console.log(`Users remaining: ${remainingUsers}`);
  console.log(`Stores remaining: ${remainingStores}`);
  console.log(`Devices remaining: ${remainingDevices}`);
  console.log(`Sales remaining: ${remainingSales}`);
  console.log(`Suppliers remaining: ${remainingSuppliers}`);
}

clearTestData()
  .catch((e) => {
    console.error('Error during database purge:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
