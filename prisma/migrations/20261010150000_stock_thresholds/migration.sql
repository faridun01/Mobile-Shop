-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_thresholds" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_thresholds_storeId_brand_model_storage_key" ON "stock_thresholds"("storeId", "brand", "model", "storage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_thresholds_storeId_idx" ON "stock_thresholds"("storeId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_thresholds_storeId_fkey'
    ) THEN
        ALTER TABLE "stock_thresholds" ADD CONSTRAINT "stock_thresholds_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
