import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing all transactional data while preserving employees and stores...');

  // Delete in strict foreign key dependency order
  await prisma.deviceTimelineEvent.deleteMany();
  await prisma.transferItem.deleteMany();
  await prisma.transferRequest.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.repairStatusHistory.deleteMany();
  await prisma.repairTicket.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.quarterClosure.deleteMany();
  await prisma.supplierBonusDevice.deleteMany();
  await prisma.supplierBonus.deleteMany();
  await prisma.supplierPaymentAllocation.deleteMany();
  await prisma.supplierPayment.deleteMany();
  await prisma.invoiceGroup.deleteMany();

  // Nullify invoice references in Device before deleting invoices & devices
  await prisma.device.updateMany({ data: { purchaseInvoiceId: null } });
  await prisma.supplierInvoice.deleteMany();
  await prisma.supplier.deleteMany();

  await prisma.device.deleteMany();
  await prisma.ownerTransaction.deleteMany();
  await prisma.owner.deleteMany();

  // Reset store cash register balances to 0 TJS
  await prisma.store.updateMany({
    data: { cashBalanceTjs: 0 }
  });

  const userCount = await prisma.user.count();
  const storeCount = await prisma.store.count();

  console.log(`\n==================================================`);
  console.log(`✅ ALL TEST/TRANSACTION DATA CLEARED!`);
  console.log(`👥 Preserved Employees (${userCount}):`);
  const users = await prisma.user.findMany({ select: { login: true, name: true, role: true } });
  users.forEach(u => console.log(`   - ${u.name} (@${u.login}) [${u.role}]`));
  console.log(`🏪 Preserved Stores (${storeCount})`);
  console.log(`==================================================\n`);
}

main()
  .catch((e) => {
    console.error('Error clearing data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
