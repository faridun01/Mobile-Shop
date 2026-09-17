import type { TransactionClient } from '../../prisma/prisma.service';

/**
 * Atomically issues the next sequential number for a document prefix + calendar year
 * (e.g. "CR-2026-000001"). A single INSERT ... ON CONFLICT DO UPDATE ... RETURNING —
 * Postgres's standard atomic upsert idiom — so concurrent requests can never receive
 * the same number without needing an optimistic-retry loop.
 *
 * Deliberately NOT a `WITH ins AS (INSERT ...) UPDATE ... RETURNING` CTE: Postgres
 * runs every data-modifying statement inside one WITH clause against the *same*
 * snapshot, so a later statement in the WITH can never see rows an earlier sibling
 * just inserted — on the very first call for a brand-new key, the UPDATE would look
 * for a row that (from its snapshot's point of view) doesn't exist yet and silently
 * affect zero rows. A single INSERT/upsert statement has no such split.
 */
export async function nextTransactionNumber(tx: TransactionClient, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<{ issued: number }[]>`
    INSERT INTO document_sequences ("key", "nextValue") VALUES (${key}, 2)
    ON CONFLICT ("key") DO UPDATE SET "nextValue" = document_sequences."nextValue" + 1
    RETURNING "nextValue" - 1 AS issued;
  `;
  const issued = rows[0]?.issued;
  if (issued === undefined) throw new Error('Не удалось сгенерировать номер документа');
  return `${prefix}-${year}-${String(issued).padStart(6, '0')}`;
}
