import { D, moneyJson } from '../server/src/common/decimal';
import 'dotenv/config';
import assert from './lib/decimal-assert';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// Checks scripts/fix-legacy-exchanges.ts on its own schema of a local database: exchanges booked
// the old way (phone back at the trade-in value, its sale profit kept) are recalculated once.
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Use a local test database');
const schema = `refund_share_test_fix_exchange_${Date.now()}_${process.pid}`;
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.href;
process.env.SEED_TEST_DATA = 'true';
const db = new PrismaClient();
let disconnectService: (() => Promise<void>) | undefined;

const run = (...args: string[]) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/fix-legacy-exchanges.ts', ...args], { env: process.env, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
};

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
  const { allocateOwnerProfit } = await import('../server/src/modules/sales/profit');
  await setTodayRate(10, 'user-admin');
  await OwnersService.updateProfitShares([{ ownerId: 'owner-admin', sharePercent: 50 }, { ownerId: 'owner-partner', sharePercent: 50 }], 'user-admin');

  const balances = async () => Promise.all(['owner-admin', 'owner-partner'].map(async (id) => D((await prisma.owner.findUniqueOrThrow({ where: { id } })).availableProfitUsd)));
  const cost = async (id: string) => D((await prisma.device.findUniqueOrThrow({ where: { id } })).costBasisUsd);
  let n = 0;
  const device = () => prisma.device.create({ data: {
    imei: `990000000100${String(++n).padStart(3, '0')}`, brand: 'Test', model: 'Legacy exchange', storage: '128GB', color: 'Black',
    status: 'STORE_STOCK', storeId: 'store-siyoma', purchasePriceUsd: D(100), costBasisUsd: D(100),
  } });

  // $200 sale of a $100 phone, exchanged for a $250 phone (cost $100) with a $150 trade-in credit,
  // then rewritten to what the old code booked: phone back at $150, owners got only the $150
  // replacement margin. The new rule books $150 − $100 margin + $50 withheld = $100, i.e. −$50.
  const legacyExchange = async () => {
    const item = await device();
    const sale = await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin', items: [{ deviceId: item.id, salePriceTjs: D(2000) }], paymentMethod: 'CASH' });
    await ExchangesService.process({ saleId: sale.id, returnedImei: item.imei, returnedBrand: 'Test', returnedModel: 'Legacy exchange',
      exchangeInValueTjs: D(1500), replacementDeviceId: (await device()).id, newPriceTjs: D(2500), processedByUserId: 'user-admin', paymentMethod: 'CASH' });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { targetId: sale.id, action: 'EXCHANGE' } });
    const { returnedCostBasisAfterUsd: _after, replacementProfitUsd, ownerProfitAllocations, ...rest } = log.financialDetails as Record<string, any>;
    const oldAllocations = allocateOwnerProfit(replacementProfitUsd, [{ id: 'owner-admin', profitSharePercent: 50 }, { id: 'owner-partner', profitSharePercent: 50 }]);
    for (const row of ownerProfitAllocations as { ownerId: string; amountUsd: number }[]) {
      const old = oldAllocations.find((a) => a.ownerId === row.ownerId)?.amountUsd ?? 0;
      await prisma.owner.update({ where: { id: row.ownerId }, data: { availableProfitUsd: { increment: D(old).minus(row.amountUsd) }, totalAccruedProfitUsd: { increment: D(old).minus(row.amountUsd) } } });
    }
    await prisma.auditLog.update({ where: { id: log.id }, data: { financialDetails: moneyJson({ ...rest, exchangeProfitUsd: replacementProfitUsd, ownerProfitAllocations: oldAllocations }) } });
    await prisma.device.update({ where: { id: item.id }, data: { costBasisUsd: D(150) } });
    return { sale, item };
  };

  const onShelf = await legacyExchange();
  const resold = await legacyExchange();
  await SalesService.executeSale({ storeId: 'store-siyoma', userId: 'user-admin', items: [{ deviceId: resold.item.id, salePriceTjs: D(1800) }], paymentMethod: 'CASH' });
  const refunded = await legacyExchange();
  await RefundService.refund({ saleId: refunded.sale.id, reason: 'Test', refundAmountTjs: D(3000), penaltyFeeTjs: 0, paymentMethod: 'CASH', refundedByUserId: 'user-admin' });

  const before = await balances();
  const dry = run();
  assert(dry.includes(`Чек #${onShelf.sale.receiptNumber} `) && dry.includes('прибыль −$50.00') && dry.includes('Обменов к пересчёту: 1, пропущено: 2'), dry);
  assert.deepEqual(await balances(), before);
  assert.equal(await cost(onShelf.item.id), 150);
  console.log('PASS: dry run lists the on-shelf exchange (−$50), skips the resold and refunded ones, changes nothing');

  const applied = run('--apply');
  assert(applied.includes('Обменов пересчитано: 1'), applied);
  assert.deepEqual(await balances(), before.map((b) => b.minus(25)));
  assert.equal(await cost(onShelf.item.id), 100);
  assert.equal(await cost(resold.item.id), 150);
  assert.equal(await cost(refunded.item.id), 100);
  const fixedLog = (await prisma.auditLog.findFirstOrThrow({ where: { targetId: onShelf.sale.id, action: 'EXCHANGE' } })).financialDetails as Record<string, unknown>;
  assert.equal(fixedLog.exchangeProfitUsd, 100);
  assert.equal(fixedLog.returnedCostBasisAfterUsd, 100);
  console.log('PASS: apply returns the phone to its $100 cost and books −$50 at 50/50; exchange profit is now $100');

  assert(run('--apply').includes('Исправлять нечего'));
  assert.deepEqual(await balances(), before.map((b) => b.minus(25)));
  console.log('PASS: a second run changes nothing');

  const checks = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-owner-balances.ts'], { env: process.env, encoding: 'utf8', timeout: 120000 });
  const ownerPart = checks.stdout.split('Сверка капитала')[0];
  assert(!ownerPart.includes('FAIL'), ownerPart + checks.stderr);
  console.log('PASS: owner balance check stays clean');

  // A refund of the recalculated receipt reverses exactly what is booked and leaves the phone at cost.
  const preRefund = await balances();
  await RefundService.refund({ saleId: onShelf.sale.id, reason: 'Test', refundAmountTjs: D(3000), penaltyFeeTjs: 0, paymentMethod: 'CASH', refundedByUserId: 'user-admin' });
  assert.deepEqual(await balances(), preRefund.map((b) => b.minus(100)));
  assert.equal(await cost(onShelf.item.id), 100);
  console.log('PASS: refunding the recalculated receipt reverses $200 ($100 sale + $100 exchange); phone stays at $100');
} finally {
  await disconnectService?.();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
  console.log('Temporary test schema removed');
}
