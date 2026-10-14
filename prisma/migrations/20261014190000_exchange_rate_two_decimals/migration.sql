-- The USD/TJS rate is set with at most 2 decimals (e.g. 10.50). Refuse to run, rather than round
-- silently, if a rate with more decimals was ever stored.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "exchange_rates" WHERE "rate" <> round("rate", 2)) THEN
    RAISE EXCEPTION 'exchange_rates содержит курс с более чем 2 знаками после запятой. Исправьте эти курсы перед миграцией.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "exchange_rates" ALTER COLUMN "rate" SET DATA TYPE DECIMAL(10,2);
