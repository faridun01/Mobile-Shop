import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// This regression suite always creates its own schema on a local database.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_${Date.now()}_${process.pid}`;
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
  const { SalesService } = await import('../server/src/modules/sales/sales.service');
  const { RefundService } = await import('../server/src/modules/sales/refund.service');
  const { ExchangesService } = await import('../server/src/modules/exchanges/exchanges.service');
  const { OwnersService } = await import('../server/src/modules/owners/owners.service');
  const { setTodayRate } = await import('../server/src/modules/exchange-rate/exchange-rate.service');
  await setTodayRate(10, 'user-admin');

  const shares = (a: number) => OwnersService.updateProfitShares([
    { ownerId: 'owner-admin', sharePercent: a },
    { ownerId: 'owner-partner', sharePercent: 100 - a },
  ], 'user-admin');
  const balances = async () => Promise.all(['owner-admin', 'owner-partner'].map(async (id) => {
    const owner = await prisma.owner.findUniqueOrThrow({ where: { id } });
    return { accrued: owner.totalAccruedProfitUsd, available: owner.availableProfitUsd };
  }));
  let deviceNumber = 0;
  const device = () => prisma.device.create({ data: {
    imei: `990000000000${String(++deviceNumber).padStart(3, '0')}`,
    brand: 'Test', model: 'Refund regression', storage: '128GB', color: 'Black',
    status: 'STORE_STOCK', storeId: 'store-siyoma', purchasePriceUsd: 100, costBasisUsd: 100,
  } });
  const makeSale = async () => {
    const item = await device();
    const sale = await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin',
      items: [{ deviceId: item.id, salePriceTjs: 2000 }], paymentMethod: 'CASH' });
    return { sale, item };
  };
  const refund = (saleId: string, total = 2000, penalty = 0) => RefundService.refund({
    saleId, reason: 'Regression test', refundAmountTjs: total - penalty, penaltyFeeTjs: penalty,
    paymentMethod: 'CASH', refundedByUserId: 'user-admin',
  });

  await shares(60);
  const first = await makeSale();
  assert.deepEqual(await balances(), [{ accrued: 60, available: 60 }, { accrued: 40, available: 40 }]);
  await shares(50);
  await refund(first.sale.id);
  assert.deepEqual(await balances(), [{ accrued: 0, available: 0 }, { accrued: 0, available: 0 }]);
  await assert.rejects(refund(first.sale.id), /уже был возвращён/);
  console.log('PASS: 60/40 sale -> 50/50 shares -> full refund restores both balances; duplicate rejected');

  await shares(60);
  const exchanged = await makeSale();
  await shares(50);
  const replacement = await device();
  await ExchangesService.process({ saleId: exchanged.sale.id,
    returnedImei: exchanged.item.imei, returnedBrand: 'Test', returnedModel: 'Refund regression',
    exchangeInValueTjs: 2000, replacementDeviceId: replacement.id, newPriceTjs: 2500,
    processedByUserId: 'user-admin', paymentMethod: 'CASH' });
  assert.deepEqual(await balances(), [{ accrued: 135, available: 135 }, { accrued: 115, available: 115 }]);
  await shares(20);
  await refund(exchanged.sale.id, 2500);
  assert.deepEqual(await balances(), [{ accrued: 0, available: 0 }, { accrued: 0, available: 0 }]);
  console.log('PASS: original sale and exchange allocations reversed after two share changes');

  await shares(60);
  const penalized = await makeSale();
  await shares(50);
  await refund(penalized.sale.id, 2000, 100);
  assert.deepEqual(await balances(), [{ accrued: 5, available: 5 }, { accrued: 5, available: 5 }]);
  console.log('PASS: only the new penalty is allocated at current 50/50 shares');

  const legacy = await makeSale();
  await prisma.auditLog.updateMany({ where: { targetId: legacy.sale.id, action: 'SALE' },
    data: { financialDetails: { recognizedProfitUsd: 100 } } });
  const before = await balances();
  const cash = (await prisma.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceTjs;
  await assert.rejects(refund(legacy.sale.id), /исходное распределение/);
  assert.deepEqual(await balances(), before);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: 'store-siyoma' } })).cashBalanceTjs, cash);
  assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: legacy.item.id } })).status, 'SOLD');
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: legacy.sale.id } })).status, 'COMPLETED');
  console.log('PASS: missing historical allocation leaves sale, stock, cash and owner balances unchanged');
} finally {
  await disconnectService?.();
  await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Temporary regression schema removed');
}
