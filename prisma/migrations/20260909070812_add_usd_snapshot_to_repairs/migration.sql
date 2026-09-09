-- AlterTable
ALTER TABLE "repair_tickets" ADD COLUMN     "estimatedCostUsd" DECIMAL(14,2),
ADD COLUMN     "exchangeRate" DECIMAL(10,4),
ADD COLUMN     "finalCostUsd" DECIMAL(14,2);
