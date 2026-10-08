-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "email" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushSubscription" JSONB;

-- AlterTable
ALTER TABLE "daily_cash_closings" ADD COLUMN     "exchangeRate" DECIMAL(10,4),
ADD COLUMN     "otherCashTjs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCashUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
