// GET /transfers as the client sees it (after mapTransfer), for an admin and for a seller, with the
// full history and with the 180-day window. Runs on perf_test; `prepare` first makes part of the
// history old (and one old transfer still pending) so the window has something to leave out.
//   npx tsx PERFORMANCE_AUDIT/scripts/transfers-check.ts prepare
//   npx tsx PERFORMANCE_AUDIT/scripts/transfers-check.ts <label>  → PERFORMANCE_AUDIT/data/transfers-<label>.json
import fs from 'node:fs';
import { perfDatabaseUrl, assertPerfDb } from './perf-env';

process.env.DATABASE_URL = perfDatabaseUrl();
const { prisma } = await import('../../server/src/prisma/prisma.service');
await assertPerfDb(prisma);

if (process.argv[2] === 'prepare') {
  const all = await prisma.transferRequest.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
  // Every third transfer goes 200-400 days back; the first of them is still waiting for approval.
  const old = all.filter((_, i) => i % 3 === 0);
  for (const [i, t] of old.entries()) {
    await prisma.transferRequest.update({
      where: { id: t.id },
      data: { requestedAt: new Date(Date.now() - (200 + i * 15) * 86400000), ...(i === 0 ? { status: 'PENDING_APPROVAL' } : {}) },
    });
  }
  console.log(`перемещений ${all.length}, сделано старыми ${old.length} (одно ожидает одобрения)`);
  await prisma.$disconnect();
  process.exit(0);
}

const { app } = await import('../../server/src/app');
const { AuthService } = await import('../../server/src/auth/auth.service');
const { mapTransfer, buildNameLookup } = await import('../../src/api/mappers');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;

const users = await prisma.user.findMany();
const names = buildNameLookup(users);
const admin = users.find((u) => u.role === 'ADMIN')!;
// A seller of a store that has transfers.
const touchedStores = new Set((await prisma.transferRequest.findMany({ select: { fromStoreId: true, toStoreId: true } })).flatMap((t) => [t.fromStoreId, t.toStoreId]));
const seller = users.find((u) => u.role === 'SELLER' && u.storeId && touchedStores.has(u.storeId))!;
const tokenOf = (u: typeof admin) => AuthService.createSession({ userId: u.id, login: u.login, role: u.role, storeId: u.storeId }, u.password);

// The same paging the client does (src/api/pagination.ts).
async function fetchAll(token: string, endpoint: string) {
  const records = new Map<string, any>();
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: '200', ...(cursor ? { cursor } : {}) });
    const r = await fetch(`${base}${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${endpoint}: ${r.status} ${await r.text()}`);
    const page = await r.json() as any[];
    for (const row of page) records.set(row.id, row);
    if (page.length < 200) break;
    cursor = page.at(-1).id;
  }
  return [...records.values()];
}

const since = new Date(Date.now() - 180 * 86400000).toISOString();
const out: Record<string, unknown> = {};
for (const [who, user] of [['admin', admin], ['seller', seller]] as const) {
  const token = await tokenOf(user);
  const full = await fetchAll(token, '/transfers');
  out[`${who}:full`] = full.map((t) => mapTransfer(t, names));
  out[`${who}:fullBytes`] = Buffer.byteLength(JSON.stringify(full));
  if (process.argv[2] !== 'old') {
    const recent = await fetchAll(token, `/transfers?since=${encodeURIComponent(since)}`);
    out[`${who}:recent`] = recent.map((t) => mapTransfer(t, names));
    out[`${who}:recentBytes`] = Buffer.byteLength(JSON.stringify(recent));
    // The window must be exactly: requested within 180 days, or still pending.
    const expected = full.filter((t) => new Date(t.requestedAt) >= new Date(since) || t.status === 'PENDING_APPROVAL').map((t) => t.id).sort();
    const got = recent.map((t) => t.id).sort();
    out[`${who}:windowCorrect`] = JSON.stringify(expected) === JSON.stringify(got);
    out[`${who}:counts`] = { full: full.length, recent: recent.length, pendingOld: recent.filter((t) => t.status === 'PENDING_APPROVAL' && new Date(t.requestedAt) < new Date(since)).length };
    const bad = await fetch(`${base}/transfers?since=not-a-date`, { headers: { Authorization: `Bearer ${token}` } });
    out[`${who}:badSince`] = bad.status;
  }
}
server.close();
await prisma.$disconnect();
fs.writeFileSync(`PERFORMANCE_AUDIT/data/transfers-${process.argv[2]}.json`, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) if (!k.endsWith(':full') && !k.endsWith(':recent')) console.log(k, JSON.stringify(v));
