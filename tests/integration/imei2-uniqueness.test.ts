import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../server/src/prisma/prisma.service';

/**
 * Proves the *database-level* uniqueness guarantee on Device.imei2 added on
 * 2026-08-25 (migration `imei2_unique_constraint`) — not just the application-level
 * duplicate check in the purchase/bonus routes, which is TOCTOU-racy under
 * concurrent requests. This test talks to Prisma directly, bypassing the API's
 * app-level pre-check entirely, so a pass here means Postgres itself is the
 * backstop.
 *
 * Business semantics confirmed before adding the constraint: imei2 is a real
 * hardware identifier (a dual-SIM phone's second modem), so no two devices
 * should ever share one — but most devices have no second slot, so the column
 * must remain freely nullable. A nullable-but-@unique field maps to Postgres's
 * default unique-index behavior (unlimited NULLs, no duplicate non-null values),
 * which is exactly this shape.
 */

const createdDeviceIds: string[] = [];

async function makeDevice(imei: string, imei2: string | null) {
  const store = await prisma.store.findFirst();
  if (!store) throw new Error('No store found — run prisma/seed.ts first');
  const device = await prisma.device.create({
    data: { imei, imei2, brand: 'Test', model: 'Test', storage: '1GB', color: 'x', purchasePriceUsd: 1, costBasisUsd: 1, storeId: store.id },
  });
  createdDeviceIds.push(device.id);
  return device;
}

afterAll(async () => {
  if (createdDeviceIds.length) {
    await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
  }
});

describe('Device.imei2 database-level uniqueness', () => {
  it('rejects a second device with a duplicate non-null imei2 at the DB layer', async () => {
    const sharedImei2 = `DBTEST-IMEI2-${Date.now()}`;
    await makeDevice(`DBTEST-A-${Date.now()}`, sharedImei2);

    await expect(makeDevice(`DBTEST-B-${Date.now()}`, sharedImei2)).rejects.toThrow();
  });

  it('allows multiple devices with a null imei2 to coexist', async () => {
    const a = await makeDevice(`DBTEST-NULL-A-${Date.now()}`, null);
    const b = await makeDevice(`DBTEST-NULL-B-${Date.now()}`, null);
    expect(a.id).not.toBe(b.id);
  });
});
