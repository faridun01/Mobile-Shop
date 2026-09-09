-- Backfills existing repair tickets' new USD snapshot columns from exchange rate history,
-- same COALESCE-to-nearest-prior-rate approach as the 20260901090000 migration used for
-- every other financial table — estimatedCostUsd priced at intake (createdAt), finalCostUsd
-- and exchangeRate priced at the ticket's last update (when the final cost was actually set).

UPDATE "repair_tickets" AS target
SET "exchangeRate" = COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5)
WHERE "exchangeRate" IS NULL;

UPDATE "repair_tickets" AS target
SET "estimatedCostUsd" = ROUND(target."estimatedCostTjs" / COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5), 2)
WHERE "estimatedCostTjs" IS NOT NULL AND "estimatedCostUsd" IS NULL;

UPDATE "repair_tickets" AS target
SET "finalCostUsd" = ROUND(target."finalCostTjs" / COALESCE((
  SELECT rate FROM "exchange_rates"
  WHERE date <= to_char(target."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ORDER BY date DESC LIMIT 1
), 9.5), 2)
WHERE "finalCostTjs" IS NOT NULL AND "finalCostUsd" IS NULL;
