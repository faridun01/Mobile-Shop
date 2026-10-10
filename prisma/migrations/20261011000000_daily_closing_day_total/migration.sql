-- A shift closing is now the day's own total (cash and bank); bank takings are kept in USD too.
-- NULL marks closings made under the previous carry-over rules.
ALTER TABLE "daily_cash_closings" ADD COLUMN "salesCardUsd" DECIMAL(14,2);
