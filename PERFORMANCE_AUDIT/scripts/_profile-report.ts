// CPU profile of the heaviest report request, plus how many SQL queries it runs and how long they take.
//   npx tsx --cpu-prof --cpu-prof-dir=PERFORMANCE_AUDIT/data/prof PERFORMANCE_AUDIT/scripts/_profile-report.ts
import fs from 'node:fs';
import { perfDatabaseUrl } from './perf-env';

process.env.DATABASE_URL = perfDatabaseUrl();
const { app } = await import('../../server/src/app');
const { prisma } = await import('../../server/src/prisma/prisma.service');
const queries: { ms: number; q: string }[] = [];
(prisma as any).$on?.('query', (e: { duration: number; query: string }) => queries.push({ ms: e.duration, q: e.query }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
const pw = JSON.parse(fs.readFileSync('PERFORMANCE_AUDIT/data/.perf-login.json', 'utf8')).admin;
const token = (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'admin', password: pw }) })).json() as { token: string }).token;
for (const ep of (process.env.EPS || '/reports/summary?period=ALL&events=1').split(',')) {
  await fetch(base + ep, { headers: { Authorization: `Bearer ${token}` } });
  queries.length = 0;
  const t = performance.now();
  for (let i = 0; i < 5; i++) await (await fetch(base + ep, { headers: { Authorization: `Bearer ${token}` } })).text();
  const total = (performance.now() - t) / 5;
  const sqlMs = queries.reduce((s, q) => s + q.ms, 0) / 5;
  console.log(`${ep}: ${total.toFixed(0)} мс на запрос, SQL-запросов ${Math.round(queries.length / 5)}, суммарно в SQL ${sqlMs.toFixed(0)} мс`);
  const top = [...queries].sort((a, b) => b.ms - a.ms).slice(0, 5);
  for (const q of top) console.log(`   ${q.ms} мс  ${q.q.replace(/\s+/g, ' ').slice(0, 150)}`);
}
server.close();
await prisma.$disconnect();
