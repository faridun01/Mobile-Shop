/*
  Warnings:

  - Added the required column `balanceCurrency` to the `financial_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LedgerCurrency" AS ENUM ('TJS', 'USD');

-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN     "balanceCurrency" "LedgerCurrency" NOT NULL;
