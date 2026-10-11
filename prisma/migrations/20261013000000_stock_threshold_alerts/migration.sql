-- Minimum-stock alerts: remember that a model's stock reached its minimum and the admin was told.
ALTER TABLE "stock_thresholds" ADD COLUMN "belowMinimum" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "alertedAt" TIMESTAMP(3);
