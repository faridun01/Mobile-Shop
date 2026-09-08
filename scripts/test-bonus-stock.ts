import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `bonus_stock_test_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
const db = new PrismaClient();
let disconnectService: (() => Promise<void>) | undefined;
await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
try {
  for (const args of [
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['--import', 'dotenv/config', '--import', 'tsx', 'prisma/seed.ts'],
  ]) {
    const result = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const { prisma } = await import('../server/src/prisma/prisma.service');
  disconnectService = () => prisma.$disconnect();
  const { SuppliersService } = await import('../server/src/modules/suppliers/suppliers.service');
  const { SalesService } = await import('../server/src/modules/sales/sales.service');
  const { RefundService } = await import('../server/src/modules/sales/refund.service');
  const { computeReportsSummary } = await import('../server/src/modules/reports/reports.service');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  await setTodayRate(10, 'user-admin');
  await SuppliersService.createBonus({
    supplierId: 'sup-dubai', bonusType: 'FREE_DEVICES', destinationStoreId: 'store-siyoma',
    createdByUserId: 'user-admin', freeDevices: [1, 2].map((n) => ({
      brand: 'Test', model: 'Gift', storage: '128GB', color: 'Black', imei: `99000000000000${n}`, costBasisUsd: 0,
    })),
  });
  const summary = () => computeReportsSummary({ period: 'ALL', storeId: 'store-siyoma' });
  assert.equal((await summary()).periodFreeDeviceBonusesReceived, 2);
  assert.equal((await summary()).freeDeviceBonusesInStock, 2);
  const devices = await prisma.device.findMany({ where: { isBonus: true }, orderBy: { imei: 'asc' } });
  const sales = [];
  for (let index = 0; index < devices.length; index++) {
    sales.push(await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin',
      paymentMethod: 'CASH', items: [{ deviceId: devices[index].id, salePriceTjs: 1000 }] }));
    assert.equal((await summary()).freeDeviceBonusesInStock, 1 - index);
  }
  console.log('PASS: two phones in one bonus count as 2; selling them changes stock 2 -> 1 -> 0');
  await RefundService.refund({ saleId: sales[0].id, reason: 'Test return', refundAmountTjs: 1000,
    paymentMethod: 'CASH', refundedByUserId: 'user-admin' });
  assert.equal((await summary()).freeDeviceBonusesInStock, 1);
  console.log('PASS: refunded gift returns to stock');
  const oldPeriod = await computeReportsSummary({ period: 'SPECIFIC_MONTH', month: '2000-01', storeId: 'store-siyoma' });
  assert.equal(oldPeriod.freeDeviceBonusesInStock, 1);
  assert.equal(oldPeriod.periodFreeDeviceBonusesReceived, 0);
  assert.equal((await computeReportsSummary({ period: 'ALL', storeId: 'main-warehouse' })).freeDeviceBonusesInStock, 0);
  console.log('PASS: remaining stock respects store filter and ignores reporting period');
} finally {
  await disconnectService?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Temporary test schema removed');
}
