// The performance runs use their own database, perf_test, on the local Postgres. Nothing here can
// reach the working database: the URL is rebuilt with that name and checked before any use.
import 'dotenv/config';

export const PERF_DB = 'perf_test';

export function perfDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Замеры только на локальной базе');
  url.pathname = `/${PERF_DB}`;
  url.searchParams.set('schema', 'public');
  return url.href;
}

export async function assertPerfDb(client: { $queryRawUnsafe: (q: string) => Promise<unknown> }) {
  const rows = (await client.$queryRawUnsafe('SELECT current_database() AS db')) as { db: string }[];
  if (rows[0]?.db !== PERF_DB) throw new Error(`СТОП: подключено к «${rows[0]?.db}», а не к ${PERF_DB}`);
}
