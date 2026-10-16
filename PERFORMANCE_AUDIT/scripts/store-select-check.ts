// /devices, /sales and /repairs as the client sees them (after the mappers), for an admin and a
// seller, so the old and the new server code can be compared; also whether a store's cash
// balance still travels inside the rows.
//   npx tsx PERFORMANCE_AUDIT/scripts/store-select-check.ts <label>  → PERFORMANCE_AUDIT/data/store-select-<label>.json
import fs from 'node:fs';
import { perfDatabaseUrl, assertPerfDb } from './perf-env';

process.env.DATABASE_URL = perfDatabaseUrl();
const { prisma } = await import('../../server/src/prisma/prisma.service');
await assertPerfDb(prisma);
const { app } = await import('../../server/src/app');
const { AuthService } = await import('../../server/src/auth/auth.service');
const { mapDevice, mapSale, mapRepair, buildNameLookup } = await import('../../src/api/mappers');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
const users = await prisma.user.findMany();
const names = buildNameLookup(users);
const admin = users.find((u) => u.role === 'ADMIN')!;
// A seller of a store that has phones and sales.
const busy = await prisma.sale.groupBy({ by: ['storeId'], _count: { _all: true }, orderBy: { _count: { storeId: 'desc' } } });
const seller = busy.map((b) => users.find((u) => u.role === 'SELLER' && u.storeId === b.storeId)).find(Boolean)!;
const out: Record<string, unknown> = {};
for (const [who, u] of [['admin', admin], ['seller', seller]] as const) {
  const token = await AuthService.createSession({ userId: u.id, login: u.login, role: u.role, storeId: u.storeId }, u.password);
  const endpoints: [string, (row: any) => unknown][] = [['/devices?excludeSold=true', (d) => mapDevice(d)], ['/sales?limit=500', (s) => mapSale(s, names)], ['/repairs?limit=500', (r) => mapRepair(r, names)]];
  for (const [ep, map] of endpoints) {
    const text = await (await fetch(base + ep, { headers: { Authorization: `Bearer ${token}` } })).text();
    out[`${who} ${ep}`] = (JSON.parse(text) as any[]).map(map);
    out[`${who} ${ep} bytes`] = Buffer.byteLength(text);
    out[`${who} ${ep} cashBalanceInRows`] = text.includes('cashBalanceUsd');
  }
}
server.close();
await prisma.$disconnect();
fs.writeFileSync(`PERFORMANCE_AUDIT/data/store-select-${process.argv[2]}.json`, JSON.stringify(out));
