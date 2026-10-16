// Every report (all periods × all stores, with the event rows) computed by the current code on
// perf_test, written as JSON so two versions of the code can be compared byte for byte.
//   npx tsx PERFORMANCE_AUDIT/scripts/report-equivalence.ts <label>  → PERFORMANCE_AUDIT/data/reports-<label>.json
import fs from 'node:fs';
import { perfDatabaseUrl, assertPerfDb } from './perf-env';

process.env.DATABASE_URL = perfDatabaseUrl();
const { computeReportsSummary } = await import('../../server/src/modules/reports/reports.service');
const { prisma } = await import('../../server/src/prisma/prisma.service');
const { moneyJson } = await import('../../server/src/common/decimal');
await assertPerfDb(prisma);
const stores = [undefined, ...(await prisma.store.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((s) => s.id)];
const periods: Record<string, unknown>[] = [{ period: 'ALL' }, { period: 'TODAY' }, { period: 'MONTH' },
  ...['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month) => ({ period: 'SPECIFIC_MONTH', month }))];
const out: Record<string, unknown> = {};
let ms = 0;
for (const p of periods) for (const storeId of stores) {
  const t = performance.now();
  out[JSON.stringify({ ...p, storeId })] = moneyJson(await computeReportsSummary({ ...p, storeId, includeEvents: true } as any));
  ms += performance.now() - t;
}
fs.writeFileSync(`PERFORMANCE_AUDIT/data/reports-${process.argv[2]}.json`, JSON.stringify(out));
console.log(`${Object.keys(out).length} отчётов, ${Math.round(ms)} мс`);
await prisma.$disconnect();
