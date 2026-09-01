-- Every financial operation keeps the rate that was active when it was created.
-- Historical rows are backfilled from the closest known rate on or before their
-- operation date; 9.5 is used only when the legacy database has no rate history.

ALTER TABLE "exchange_events" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "supplier_invoices" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "supplier_payments" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "customer_payments" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "supplier_bonuses" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "owner_transactions" ADD COLUMN "exchangeRate" DOUBLE PRECISION;

UPDATE "exchange_events" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target.date AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5);

UPDATE "supplier_invoices" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target.date AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5);

UPDATE "supplier_payments" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5);

UPDATE "customer_payments" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5);

UPDATE "supplier_bonuses" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5);

UPDATE "owner_transactions" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5);

-- Existing core records already have snapshot columns, but older rows may be NULL.
UPDATE "sales" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5)
WHERE "exchangeRate" IS NULL;

UPDATE "expenses" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5)
WHERE "exchangeRate" IS NULL;

UPDATE "ledger_entries" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5)
WHERE "exchangeRate" IS NULL
  AND ("amountTjs" IS NOT NULL OR "amountUsd" IS NOT NULL);

ALTER TABLE "exchange_events" ALTER COLUMN "exchangeRate" SET NOT NULL;
ALTER TABLE "supplier_invoices" ALTER COLUMN "exchangeRate" SET NOT NULL;
ALTER TABLE "supplier_payments" ALTER COLUMN "exchangeRate" SET NOT NULL;
ALTER TABLE "customer_payments" ALTER COLUMN "exchangeRate" SET NOT NULL;
ALTER TABLE "supplier_bonuses" ALTER COLUMN "exchangeRate" SET NOT NULL;
ALTER TABLE "owner_transactions" ALTER COLUMN "exchangeRate" SET NOT NULL;
