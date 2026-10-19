import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { withDisposableApi } from './lib/disposable-api';
import { auditOutput } from './lib/audit-output';
import { requireAuditDatabase } from './lib/audit-database';

requireAuditDatabase();

const routes: Array<{ method: string; url: string }> = JSON.parse(readFileSync('output/ui-backend-audit/contracts.json', 'utf8')).routes;
const publicRoutes = new Set(['GET /health', 'POST /auth/login']);
const checks: Array<{ method: string; url: string; status: number }> = [];
await withDisposableApi('authmatrix', async ({ db, call, login }) => {
  for (const route of routes) {
    if (publicRoutes.has(`${route.method} ${route.url}`)) continue;
    const path = route.url.replaceAll('{param}', 'payout').replace(/:[A-Za-z0-9_]+/g, 'audit-missing');
    for (const token of ['', 'invalid-token']) {
      const r = await call(route.method, path, route.method === 'GET' ? undefined : {}, { token });
      assert.equal(r.status, 401, `${route.method} ${path}: ${JSON.stringify(r)}`);
      assert(!JSON.stringify(r.data).match(/Prisma|SELECT |stack|node_modules/));
      checks.push({ ...route, status: r.status });
    }
  }
  const seller = await login('ahmad', 'seller123');
  for (const [method, path] of [['GET', '/owners'], ['GET', '/suppliers'], ['POST', '/users'], ['GET', '/reports/summary?period=ALL'], ['POST', '/owners/owner-admin/investment'], ['POST', '/stores']]) {
    const r = await call(method, path, method === 'GET' ? undefined : {}, { token: seller });
    assert.equal(r.status, 403, `${method} ${path}`);
    checks.push({ method, url: path, status: r.status });
  }
  const colleagues = await call('GET', '/users', undefined, { token: seller });
  assert.equal(colleagues.status, 200);
  assert(colleagues.data.every((u: any) => u.role === 'ADMIN' || u.storeId === 'store-siyoma'));
  assert(colleagues.data.every((u: any) => !('password' in u) && !('baseSalaryTjs' in u) && !('salesCommissionPercent' in u)));
  const partner = await login('partner', 'partner123');
  const privateNotice = await db.notification.create({ data: { title: 'Проверка доступа', message: 'Только ADMIN', targetUserId: 'user-partner', targetRole: 'ADMIN' } });
  const ownNotice = await db.notification.create({ data: { title: 'Проверка доступа', message: 'Партнёру', targetUserId: 'user-partner', targetRole: 'PARTNER' } });
  for (const path of ['/notifications', '/notifications?view=history']) {
    const r = await call('GET', path, undefined, { token: partner });
    assert.equal(r.status, 200);
    const notices = Array.isArray(r.data) ? r.data : r.data.items;
    assert(!notices.some((n: any) => n.id === privateNotice.id), 'Partner must satisfy BOTH recipient and role restrictions');
    assert(notices.some((n: any) => n.id === ownNotice.id), 'Correctly addressed partner notification remains visible');
  }
  assert.equal((await call('PATCH', `/notifications/${privateNotice.id}/read`, undefined, { token: partner })).status, 404);
  assert.equal((await call('PATCH', `/notifications/${privateNotice.id}/resolve`, undefined, { token: partner })).status, 404);
  assert.equal((await call('PATCH', `/notifications/${ownNotice.id}/read`, undefined, { token: partner })).status, 200);
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: privateNotice.id } })).read, false);
});
writeFileSync(`${auditOutput}/auth-matrix.json`, JSON.stringify(checks, null, 2));
console.log(`PASS ${checks.length} auth checks: every inventoried private route rejects absent/invalid token; six admin functions reject seller`);
