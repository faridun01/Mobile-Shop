-- A shift closed with less money than expected books the shortage as a store expense; the
-- closing keeps a link to it so reopening the shift cancels that expense.
ALTER TABLE "daily_cash_closings" ADD COLUMN "shortageExpenseId" TEXT;
CREATE UNIQUE INDEX "daily_cash_closings_shortageExpenseId_key" ON "daily_cash_closings"("shortageExpenseId");
