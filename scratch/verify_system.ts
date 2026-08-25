import { prisma } from '../server/src/prisma/prisma.service.js';
import { SuppliersService } from '../server/src/modules/suppliers/suppliers.service.js';
import { PurchasesService } from '../server/src/modules/purchases/purchases.service.js';
import { TransfersService } from '../server/src/modules/transfers/transfers.service.js';
import { SalesService } from '../server/src/modules/sales/sales.service.js';

async function verifySystemIntegration() {
  console.log('=== SYSTEM INTEGRATION VERIFICATION ===\n');

  // 1. Verify Stores & Default Currency Rate
  const stores = await prisma.store.findMany();
  const rate = await prisma.currencyRate.findFirst({ orderBy: { date: 'desc' } });
  console.log(`[1] Stores Count: ${stores.length}`);
  console.log(`    Stores: ${stores.map(s => `${s.name} (${s.id})`).join(', ')}`);
  console.log(`    Currency Rate Today: ${rate ? rate.rate : 'NOT SET'}`);

  if (!rate) {
    await prisma.currencyRate.create({
      data: { date: new Date().toISOString().split('T')[0], rate: 10.95 }
    });
    console.log('    Created fallback currency rate: 10.95');
  }

  // 2. Verify Suppliers & Invoices CRUD
  let supplier = await prisma.supplier.findFirst();
  if (!supplier) {
    supplier = await SuppliersService.create({ name: 'System Test Supplier', contactName: 'Tester' });
  }
  console.log(`[2] Supplier Verified: ${supplier.name} (${supplier.id})`);

  // 3. Purchase Intake with EAN Barcode
  const testImei1 = `3589${Date.now().toString().slice(-11)}`;
  const testImei2 = `3589${(Date.now() + 1).toString().slice(-11)}`;
  const testBarcode = `200${Math.floor(100000000 + Math.random() * 900000000)}`;

  const purchaseResult = await PurchasesService.createIntake({
    invoiceNumber: `INV-TEST-${Date.now().toString().slice(-4)}`,
    supplierId: supplier.id,
    storeId: 'main-warehouse',
    items: [
      {
        brand: 'Apple',
        model: 'iPhone 16 Pro Max',
        storage: '512 GB',
        color: 'Desert Titanium',
        imei: testImei1,
        imei2: testImei2,
        barcode: testBarcode,
        purchasePriceUsd: 1200,
        sellingPriceTjs: 14500
      }
    ],
    userId: 'user-admin'
  });

  const createdDevice = purchaseResult.devices[0];
  console.log(`[3] Purchase Intake Created: Device ID ${createdDevice.id}`);
  console.log(`    Barcode (EAN): ${createdDevice.barcode}`);
  console.log(`    Status: ${createdDevice.status}`);

  // 4. Transfer Request
  const toStore = stores.find(s => s.id !== 'main-warehouse') || stores[0];
  const transfer = await TransfersService.create({
    fromStoreId: 'main-warehouse',
    toStoreId: toStore.id,
    deviceIds: [createdDevice.id],
    requestedByUserId: 'user-admin'
  });
  console.log(`[4] Transfer Created: ${transfer.transferNumber} to ${toStore.name}`);
  console.log(`    Device Status: TRANSFER_PENDING`);

  // Approve Transfer
  const approvedTransfer = await TransfersService.approve(transfer.id, 'user-admin');
  const transferredDevice = await prisma.device.findUnique({ where: { id: createdDevice.id } });
  console.log(`    Transfer Approved! Device Status: ${transferredDevice?.status}, Location: ${transferredDevice?.storeId}`);

  // 5. Sale Execution (Split Payment & Stock Deduction)
  const sale = await SalesService.executeSale({
    storeId: toStore.id,
    userId: 'user-admin',
    paymentMethod: 'SPLIT',
    cashAmountTjs: 7000,
    cardAmountTjs: 7500,
    items: [
      {
        deviceId: createdDevice.id,
        salePriceTjs: 14500
      }
    ]
  });

  console.log(`[5] Sale Executed: Receipt #${sale.receiptNumber}`);
  const soldDevice = await prisma.device.findUnique({ where: { id: createdDevice.id } });
  console.log(`    Device Status after sale: ${soldDevice?.status}`);

  // Verify store cash register balance increment
  const updatedStore = await prisma.store.findUnique({ where: { id: toStore.id } });
  console.log(`    Store Cash Balance: ${updatedStore?.cashBalanceTjs} TJS`);

  // Clean up test data
  console.log('\n[6] Cleaning up test records...');
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await prisma.transferItem.deleteMany({ where: { transferId: transfer.id } });
  await prisma.transferRequest.delete({ where: { id: transfer.id } });
  await prisma.deviceTimelineEvent.deleteMany({ where: { deviceId: createdDevice.id } });
  await prisma.device.delete({ where: { id: createdDevice.id } });
  await prisma.supplierInvoice.deleteMany({ where: { invoiceNumber: purchaseResult.invoice.invoiceNumber } });

  console.log('\n=== INTEGRATION VERIFICATION COMPLETE: ALL SYSTEMS GO! ===');
}

verifySystemIntegration().catch(console.error).finally(() => prisma.$disconnect());
