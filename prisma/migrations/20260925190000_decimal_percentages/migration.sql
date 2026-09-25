ALTER TABLE "users" ALTER COLUMN "salesCommissionPercent" TYPE DECIMAL(7,4) USING "salesCommissionPercent"::numeric;
ALTER TABLE "owners" ALTER COLUMN "profitSharePercent" TYPE DECIMAL(7,4) USING "profitSharePercent"::numeric;
