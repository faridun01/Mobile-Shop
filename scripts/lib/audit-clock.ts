import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

/** Test-only clock: app Date and DB default timestamps advance together in an isolated schema. */
export async function installAuditClock(db: PrismaClient, schema: string) {
  assert(/^audit_fixes_[a-z0-9_]+$/.test(schema));
  const RealDate = Date;
  let instant = RealDate.UTC(2026, 6, 1, 7);
  const quote = (name: string) => { assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)); return `"${name}"`; };
  const ns = quote(schema);
  await db.$executeRawUnsafe(`CREATE TABLE ${ns}._audit_clock (instant timestamptz NOT NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO ${ns}._audit_clock VALUES ($1)`, new RealDate(instant));
  const columns = await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=$1 AND column_default ~* 'CURRENT_TIMESTAMP|now\\(' AND data_type LIKE 'timestamp%' AND table_name <> '_prisma_migrations'`, schema);
  const tables = new Map<string, string[]>();
  for (const c of columns) tables.set(c.table_name, [...(tables.get(c.table_name) ?? []), c.column_name]);
  let i = 0;
  for (const [table, fields] of tables) {
    const fn = `${ns}.audit_clock_${i++}`;
    await db.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${fields.map(f => `NEW.${quote(f)} := (SELECT instant FROM ${ns}._audit_clock);`).join(' ')} RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER audit_clock BEFORE INSERT ON ${ns}.${quote(table)} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  }
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args) { return args.length ? Reflect.construct(target, args) : new RealDate(instant); },
    apply() { return new RealDate(instant).toString(); },
    get(target, property) { return property === 'now' ? () => instant : Reflect.get(target, property); },
  }) as DateConstructor;
  return {
    async day(day: number) {
      instant = RealDate.UTC(2026, 6, 1 + day, 7);
      await db.$executeRawUnsafe(`UPDATE ${ns}._audit_clock SET instant=$1`, new RealDate(instant));
    },
    restore() { globalThis.Date = RealDate; },
    timestampTables: tables.size,
  };
}
