import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEPT_STORE_IDS = ['main-warehouse', 'store-siyoma'];
const KEPT_USER_IDS = ['user-admin', 'user-partner', 'user-ahmad', 'user-farhod'];

async function main() {
  console.log('Starting cleanup of test data...');

  // Find test stores
  const testStores = await prisma.store.findMany({
    where: {
      OR: [
        { id: { notIn: KEPT_STORE_IDS } },
        { name: { startsWith: 'RBAC' } },
        { name: { startsWith: 'Recon' } },
        { name: { startsWith: 'E2E' } },
        { name: { contains: 'Test' } },
      ],
    },
  });

  const testStoreIds = testStores.map(s => s.id);
  console.log(`Found ${testStores.length} test stores to delete:`, testStores.map(s => s.name));

  // Find test users
  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { id: { notIn: KEPT_USER_IDS } },
        { login: { startsWith: 'rbac' } },
        { login: { startsWith: 'e2e' } },
        { name: { startsWith: 'RBAC' } },
        { name: { startsWith: 'E2E' } },
        { name: { contains: 'Test' } },
      ],
    },
  });

  const testUserIds = testUsers.map(u => u.id);
  console.log(`Found ${testUsers.length} test users to delete:`, testUsers.map(u => u.name));

  // 1. Delete audit logs for test users
  const deletedAuditLogs = await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: testUserIds } },
        { storeName: { in: testStores.map(s => s.name) } },
      ],
    },
  });
  console.log(`Deleted ${deletedAuditLogs.count} audit logs.`);

  // 2. Delete notifications for test users
  const deletedNotifications = await prisma.notification.deleteMany({
    where: {
      targetUserId: { in: testUserIds },
    },
  });
  console.log(`Deleted ${deletedNotifications.count} notifications.`);

  // 3. Delete expenses for test stores or created by test users
  const deletedExpenses = await prisma.expense.deleteMany({
    where: {
      OR: [
        { storeId: { in: testStoreIds } },
        { createdByUserId: { in: testUserIds } },
        { employeeId: { in: testUserIds } },
      ],
    },
  });
  console.log(`Deleted ${deletedExpenses.count} expenses.`);

  // 4. Delete repair tickets for test stores or users
  const testRepairTickets = await prisma.repairTicket.findMany({
    where: {
      OR: [
        { storeId: { in: testStoreIds } },
        { userId: { in: testUserIds } },
      ],
    },
    select: { id: true },
  });
  const testRepairTicketIds = testRepairTickets.map(r => r.id);

  if (testRepairTicketIds.length > 0) {
    await prisma.repairStatusHistory.deleteMany({
      where: { ticketId: { in: testRepairTicketIds } },
    });
    const deletedRepairs = await prisma.repairTicket.deleteMany({
      where: { id: { in: testRepairTicketIds } },
    });
    console.log(`Deleted ${deletedRepairs.count} repair tickets.`);
  }

  // 5. Delete sales and sale items for test stores or users
  const testSales = await prisma.sale.findMany({
    where: {
      OR: [
        { storeId: { in: testStoreIds } },
        { userId: { in: testUserIds } },
      ],
    },
    select: { id: true },
  });
  const testSaleIds = testSales.map(s => s.id);

  if (testSaleIds.length > 0) {
    await prisma.exchangeEvent.deleteMany({
      where: { saleId: { in: testSaleIds } },
    });
    await prisma.saleItem.deleteMany({
      where: { saleId: { in: testSaleIds } },
    });
    const deletedSales = await prisma.sale.deleteMany({
      where: { id: { in: testSaleIds } },
    });
    console.log(`Deleted ${deletedSales.count} sales.`);
  }

  // 6. Delete transfer requests involving test stores or users
  const testTransfers = await prisma.transferRequest.findMany({
    where: {
      OR: [
        { fromStoreId: { in: testStoreIds } },
        { toStoreId: { in: testStoreIds } },
        { requestedByUserId: { in: testUserIds } },
        { approvedByUserId: { in: testUserIds } },
      ],
    },
    select: { id: true },
  });
  const testTransferIds = testTransfers.map(t => t.id);

  if (testTransferIds.length > 0) {
    await prisma.transferItem.deleteMany({
      where: { transferId: { in: testTransferIds } },
    });
    const deletedTransfers = await prisma.transferRequest.deleteMany({
      where: { id: { in: testTransferIds } },
    });
    console.log(`Deleted ${deletedTransfers.count} transfer requests.`);
  }

  // 7. Handle devices in test stores
  const deletedDevices = await prisma.device.deleteMany({
    where: {
      storeId: { in: testStoreIds },
    },
  });
  console.log(`Deleted ${deletedDevices.count} devices attached to test stores.`);

  // 8. Delete supplier invoices linked to test stores
  const deletedInvoices = await prisma.supplierInvoice.deleteMany({
    where: {
      storeId: { in: testStoreIds },
    },
  });
  console.log(`Deleted ${deletedInvoices.count} supplier invoices attached to test stores.`);

  // 9. Delete test users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      id: { in: testUserIds },
    },
  });
  console.log(`Deleted ${deletedUsers.count} test users.`);

  // 10. Delete test stores
  const deletedStores = await prisma.store.deleteMany({
    where: {
      id: { in: testStoreIds },
    },
  });
  console.log(`Deleted ${deletedStores.count} test stores.`);

  console.log('Test data cleanup completed successfully!');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error during cleanup:', e);
  await prisma.$disconnect();
  process.exit(1);
});
