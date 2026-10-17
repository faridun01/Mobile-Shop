-- A counted surplus goes into the register as the store owners' income; their shares are kept for reversal.
ALTER TABLE "daily_cash_closings" ADD COLUMN "surplusOwnerAllocations" JSONB;
