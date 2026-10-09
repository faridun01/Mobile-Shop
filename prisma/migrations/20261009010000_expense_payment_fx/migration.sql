-- Exchange-rate result of an expense paid at a later rate than it was registered at.
ALTER TABLE "expenses" ADD COLUMN "paymentFxUsd" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Expenses already re-stated at payment: the payment wrote a journal entry with
-- registered − paid dollars ("Пересчёт расхода по курсу дня оплаты ...").
UPDATE "expenses" e
SET "paymentFxUsd" = r.fx
FROM (
  SELECT "referenceId", SUM("amountUsd") AS fx
  FROM "ledger_entries"
  WHERE "description" LIKE 'Пересчёт расхода по курсу дня оплаты%' AND "referenceId" IS NOT NULL AND "amountUsd" IS NOT NULL
  GROUP BY "referenceId"
) r
WHERE e."id" = r."referenceId";
