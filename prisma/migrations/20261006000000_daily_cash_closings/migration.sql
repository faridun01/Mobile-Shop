-- CreateTable
CREATE TABLE "daily_cash_closings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "closedByUserId" TEXT NOT NULL,
    "closedByName" TEXT NOT NULL,
    "openingCashTjs" DECIMAL(14,2) NOT NULL,
    "openingCashUsd" DECIMAL(14,2) NOT NULL,
    "salesCashTjs" DECIMAL(14,2) NOT NULL,
    "salesCashUsd" DECIMAL(14,2) NOT NULL,
    "salesCardTjs" DECIMAL(14,2) NOT NULL,
    "expensesCashTjs" DECIMAL(14,2) NOT NULL,
    "expensesCashUsd" DECIMAL(14,2) NOT NULL,
    "refundsCashTjs" DECIMAL(14,2) NOT NULL,
    "refundsCashUsd" DECIMAL(14,2) NOT NULL,
    "collectionsCashTjs" DECIMAL(14,2) NOT NULL,
    "collectionsCashUsd" DECIMAL(14,2) NOT NULL,
    "expectedCashTjs" DECIMAL(14,2) NOT NULL,
    "expectedCashUsd" DECIMAL(14,2) NOT NULL,
    "actualCashTjs" DECIMAL(14,2) NOT NULL,
    "actualCashUsd" DECIMAL(14,2) NOT NULL,
    "differenceTjs" DECIMAL(14,2) NOT NULL,
    "differenceUsd" DECIMAL(14,2) NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_cash_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_cash_closings_storeId_businessDate_key" ON "daily_cash_closings"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "daily_cash_closings_storeId_createdAt_idx" ON "daily_cash_closings"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "daily_cash_closings_businessDate_idx" ON "daily_cash_closings"("businessDate");

-- AddForeignKey
ALTER TABLE "daily_cash_closings" ADD CONSTRAINT "daily_cash_closings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
