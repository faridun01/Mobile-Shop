-- Exchange-rate result of customer debt repayments, booked to the owners of the sale's store.
ALTER TABLE "customer_payments" ADD COLUMN "fxGainUsd" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "customer_payments" ADD COLUMN "ownerProfitAllocations" JSONB;
ALTER TABLE "customer_payment_allocations" ADD COLUMN "bookedAmountUsd" DECIMAL(14,2);
ALTER TABLE "customer_payment_allocations" ADD COLUMN "fxGainUsd" DECIMAL(14,2) NOT NULL DEFAULT 0;
