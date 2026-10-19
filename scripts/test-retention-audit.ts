import assert from 'node:assert/strict';
import { withDisposableApi } from './lib/disposable-api';
import { requireAuditDatabase } from './lib/audit-database';

requireAuditDatabase();

await withDisposableApi('retention', async ({ db, env, call }) => {
  assert(new URL(env.DATABASE_URL!).searchParams.get('schema')!.startsWith('audit_fixes_retention_'));
  process.env.DATABASE_URL = env.DATABASE_URL;
  const { RetentionService } = await import('../server/src/modules/maintenance/retention.service');
  const { prisma } = await import('../server/src/prisma/prisma.service');
  const day = 86400000;
  const now = Date.now();
  try {
    await db.authSession.createMany({ data: [
      { id: 'old-expired', userId: 'user-admin', expiresAt: new Date(now - 8 * day) },
      { id: 'old-revoked', userId: 'user-admin', expiresAt: new Date(now + day), revokedAt: new Date(now - 8 * day) },
      { id: 'recent-expired', userId: 'user-admin', expiresAt: new Date(now - day) },
      { id: 'active', userId: 'user-admin', expiresAt: new Date(now + day) },
    ] });
    await db.operationRequest.createMany({ data: [
      { key: 'old', fingerprint: 'test', result: {}, createdAt: new Date(now - 4 * day) },
      { key: 'recent', fingerprint: 'test', result: {}, createdAt: new Date(now - 2 * day) },
    ] });
    const before = { stores: await db.store.count(), owners: await db.owner.count(), audit: await db.auditLog.count() };
    const result = await RetentionService.cleanupOldRecords();
    assert.equal(result.deletedSessions, 2); assert.equal(result.deletedOperations, 1);
    assert(await db.authSession.findUnique({ where: { id: 'active' } }));
    assert(await db.authSession.findUnique({ where: { id: 'recent-expired' } }));
    assert(await db.operationRequest.findUnique({ where: { key: 'recent' } }));
    assert.equal((await call('GET', '/stores')).status, 200, 'Live admin session survives cleanup');
    assert.deepEqual({ stores: await db.store.count(), owners: await db.owner.count(), audit: await db.auditLog.count() }, before);
    assert.deepEqual(await RetentionService.cleanupOldRecords(), { deletedSessions: 0, deletedOperations: 0 });
    console.log('PASS retention: old expired/revoked sessions and old request keys removed; recent keys, active session and business rows preserved; repeat is harmless');
  } finally { await prisma.$disconnect(); }
});
