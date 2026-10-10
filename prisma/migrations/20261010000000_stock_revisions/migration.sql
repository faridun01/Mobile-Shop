-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_revisions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "totalExpected" INTEGER NOT NULL,
    "totalChecked" INTEGER NOT NULL,
    "totalMissing" INTEGER NOT NULL,
    "totalSurplus" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "missingDevices" JSONB,
    "surplusDevices" JSONB,
    "checkedImeis" JSONB,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_revisions_storeId_createdAt_idx" ON "stock_revisions"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_revisions_createdAt_idx" ON "stock_revisions"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_revisions_storeId_fkey'
    ) THEN
        ALTER TABLE "stock_revisions" ADD CONSTRAINT "stock_revisions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_revisions_userId_fkey'
    ) THEN
        ALTER TABLE "stock_revisions" ADD CONSTRAINT "stock_revisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
