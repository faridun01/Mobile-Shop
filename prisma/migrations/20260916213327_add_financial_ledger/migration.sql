-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'BANK', 'MAIN', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'SUPPLIER_PAYMENT', 'OWNER_DEPOSIT', 'OWNER_WITHDRAWAL', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinancialDirection" AS ENUM ('IN', 'OUT', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "FinancialTransactionStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('SUPPLIER', 'CUSTOMER', 'EMPLOYEE', 'OWNER', 'OTHER');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT;

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "storeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "openingBalanceTjs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingBalanceUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceTjs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "parentId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "transactionNumber" TEXT NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "direction" "FinancialDirection" NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "destinationAccountId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(10,4),
    "amountTjs" DECIMAL(14,2) NOT NULL,
    "amountUsd" DECIMAL(14,2) NOT NULL,
    "categoryId" TEXT,
    "counterpartyType" "CounterpartyType",
    "counterpartyId" TEXT,
    "counterpartyName" TEXT,
    "shopId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reversedTransactionId" TEXT,
    "description" TEXT NOT NULL,
    "comment" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "key" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_storeId_key" ON "financial_accounts"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_transactionNumber_key" ON "financial_transactions"("transactionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_reversedTransactionId_key" ON "financial_transactions"("reversedTransactionId");

-- CreateIndex
CREATE INDEX "financial_transactions_transactionDate_idx" ON "financial_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "financial_transactions_accountId_idx" ON "financial_transactions"("accountId");

-- CreateIndex
CREATE INDEX "financial_transactions_shopId_idx" ON "financial_transactions"("shopId");

-- CreateIndex
CREATE INDEX "financial_transactions_sourceType_sourceId_idx" ON "financial_transactions"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "financial_transactions_categoryId_idx" ON "financial_transactions"("categoryId");

-- CreateIndex
CREATE INDEX "financial_transactions_counterpartyType_counterpartyId_idx" ON "financial_transactions"("counterpartyType", "counterpartyId");

-- CreateIndex
CREATE INDEX "financial_transactions_status_idx" ON "financial_transactions"("status");

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
