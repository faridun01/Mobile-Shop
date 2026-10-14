-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "returnCreditTjs" DECIMAL(14,2),
ADD COLUMN     "returnCreditUsd" DECIMAL(14,2),
ADD COLUMN     "returnId" TEXT,
ADD COLUMN     "returnWithheldTjs" DECIMAL(14,2),
ADD COLUMN     "returnWithheldUsd" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "exchangeTradeInCreditUsd" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "exchangeRate" DECIMAL(10,2) NOT NULL,
    "bookedUsd" DECIMAL(14,2) NOT NULL,
    "fxUsd" DECIMAL(14,2) NOT NULL,
    "withheldTjs" DECIMAL(14,2) NOT NULL,
    "withheldUsd" DECIMAL(14,2) NOT NULL,
    "creditTjs" DECIMAL(14,2) NOT NULL,
    "creditUsd" DECIMAL(14,2) NOT NULL,
    "payoutTjs" DECIMAL(14,2) NOT NULL,
    "payoutUsd" DECIMAL(14,2) NOT NULL,
    "payoutMethod" TEXT,
    "exchangeSaleId" TEXT,
    "ownerProfitAllocations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_exchangeSaleId_key" ON "sale_returns"("exchangeSaleId");

-- CreateIndex
CREATE INDEX "sale_returns_saleId_idx" ON "sale_returns"("saleId");

-- CreateIndex
CREATE INDEX "sale_returns_storeId_createdAt_idx" ON "sale_returns"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "sale_returns_createdAt_idx" ON "sale_returns"("createdAt");

-- CreateIndex
CREATE INDEX "sale_items_returnId_idx" ON "sale_items"("returnId");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_exchangeSaleId_fkey" FOREIGN KEY ("exchangeSaleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

