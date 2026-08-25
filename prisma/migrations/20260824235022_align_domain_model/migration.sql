-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARTNER', 'SELLER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('MAIN_WAREHOUSE', 'STORE_STOCK', 'SOLD', 'IN_STOCK_AFTER_EXCHANGE', 'IN_REPAIR', 'TRANSFER_PENDING');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('ACCEPTED', 'IN_PROGRESS', 'READY', 'ISSUED', 'DIAGNOSTICS', 'IN_REPAIR', 'DELIVERED', 'UNREPAIRABLE');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'SPLIT');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'EXCHANGED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BonusType" AS ENUM ('FREE_DEVICES', 'CASH_DISCOUNT');

-- CreateEnum
CREATE TYPE "OwnerTransactionType" AS ENUM ('INVESTMENT', 'WITHDRAWAL', 'PROFIT_PAYOUT', 'REINVEST');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('SALE', 'CASH_SALE', 'CARD_SALE', 'PURCHASE', 'EXPENSE', 'SALARY', 'SUPPLIER_PAYMENT', 'OWNER_INVESTMENT', 'OWNER_CAPITAL_WITHDRAWAL', 'OWNER_PROFIT_PAYOUT', 'OWNER_REINVESTMENT', 'EXCHANGE_SETTLEMENT', 'SUPPLIER_BONUS', 'TRANSFER', 'REFUND');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isMainWarehouse" BOOLEAN NOT NULL DEFAULT false,
    "cashBalanceTjs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SELLER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT,
    "baseSalaryTjs" DOUBLE PRECISION,
    "salesCommissionPercent" DOUBLE PRECISION,
    "pin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "imei2" TEXT,
    "serialNumber" TEXT,
    "barcode" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'MAIN_WAREHOUSE',
    "storeId" TEXT NOT NULL,
    "purchasePriceUsd" DOUBLE PRECISION NOT NULL,
    "costBasisUsd" DOUBLE PRECISION NOT NULL,
    "retailPriceTjs" DOUBLE PRECISION,
    "receivedDate" TIMESTAMP(3),
    "isBonus" BOOLEAN NOT NULL DEFAULT false,
    "bonusCampaign" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "purchaseInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_timeline_events" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "storeName" TEXT,
    "priceTjs" DOUBLE PRECISION,
    "priceUsd" DOUBLE PRECISION,

    CONSTRAINT "device_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "receiptNumber" SERIAL NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerName" TEXT,
    "totalTjs" DOUBLE PRECISION NOT NULL,
    "totalUsd" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "cashAmountTjs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cardAmountTjs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeTradeInCreditTjs" DOUBLE PRECISION,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "hasBelowCostItem" BOOLEAN NOT NULL DEFAULT false,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundedByUserId" TEXT,
    "penaltyFeeTjs" DOUBLE PRECISION,
    "penaltyFeeUsd" DOUBLE PRECISION,
    "actualRefundAmountTjs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "imei2" TEXT,
    "salePriceTjs" DOUBLE PRECISION NOT NULL,
    "salePriceUsd" DOUBLE PRECISION NOT NULL,
    "purchaseCostUsd" DOUBLE PRECISION NOT NULL,
    "costBasisUsd" DOUBLE PRECISION NOT NULL,
    "isBelowCost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_events" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedDeviceId" TEXT NOT NULL,
    "returnedImei" TEXT NOT NULL,
    "returnedModel" TEXT NOT NULL,
    "exchangeInValueTjs" DOUBLE PRECISION NOT NULL,
    "exchangeInValueUsd" DOUBLE PRECISION NOT NULL,
    "replacementDeviceId" TEXT NOT NULL,
    "replacementImei" TEXT NOT NULL,
    "replacementModel" TEXT NOT NULL,
    "newPriceTjs" DOUBLE PRECISION NOT NULL,
    "newPriceUsd" DOUBLE PRECISION NOT NULL,
    "differenceTjs" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod",
    "cashAmountTjs" DOUBLE PRECISION,
    "cardAmountTjs" DOUBLE PRECISION,
    "processedByUserId" TEXT NOT NULL,

    CONSTRAINT "exchange_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "contactPerson" TEXT,
    "totalPurchasedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaidUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDebtUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmountUsd" DOUBLE PRECISION NOT NULL,
    "paidAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "devicesCount" INTEGER NOT NULL DEFAULT 0,
    "isStorePurchase" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_groups" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchasePriceUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "invoice_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "sourceAccount" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmountUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bonuses" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "campaignTitle" TEXT,
    "bonusType" "BonusType" NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "status" TEXT,
    "dateReceived" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bonus_devices" (
    "id" TEXT NOT NULL,
    "bonusId" TEXT NOT NULL,
    "deviceId" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "costBasisUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "supplier_bonus_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "fromStoreId" TEXT NOT NULL,
    "toStoreId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "model" TEXT NOT NULL,

    CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" SERIAL NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "imei" TEXT NOT NULL,
    "imei2" TEXT,
    "barcode" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT,
    "color" TEXT,
    "saleReceiptNumber" INTEGER,
    "saleDate" TIMESTAMP(3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "prepaymentTjs" DOUBLE PRECISION,
    "problemDescription" TEXT NOT NULL,
    "visualCondition" TEXT,
    "equipmentPackage" TEXT,
    "comment" TEXT,
    "status" "RepairStatus" NOT NULL DEFAULT 'ACCEPTED',
    "estimatedCostTjs" DOUBLE PRECISION,
    "finalCostTjs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_status_history" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "RepairStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "repair_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountTjs" DOUBLE PRECISION NOT NULL,
    "amountUsd" DOUBLE PRECISION,
    "exchangeRate" DOUBLE PRECISION,
    "targetType" TEXT NOT NULL DEFAULT 'STORE',
    "storeId" TEXT,
    "sourceAccount" TEXT,
    "comment" TEXT,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "paidFromCashRegister" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "isEmployeeAdvance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profitSharePercent" DOUBLE PRECISION NOT NULL,
    "capitalBalanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAccruedProfitUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaidProfitUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReinvestedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availableProfitUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_transactions" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "OwnerTransactionType" NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "sourceOrDestination" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarter_closures" (
    "id" TEXT NOT NULL,
    "quarterName" TEXT NOT NULL,
    "closedByUserId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarter_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetRoute" TEXT,
    "targetRole" "Role",
    "targetUserId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "storeName" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "financialDetails" JSONB,
    "imei" TEXT,
    "receiptNumber" INTEGER,
    "targetId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountTjs" DOUBLE PRECISION,
    "amountUsd" DOUBLE PRECISION,
    "exchangeRate" DOUBLE PRECISION,
    "storeId" TEXT,
    "storeName" TEXT,
    "userName" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "devices_imei_key" ON "devices"("imei");

-- CreateIndex
CREATE INDEX "devices_imei_idx" ON "devices"("imei");

-- CreateIndex
CREATE INDEX "devices_imei2_idx" ON "devices"("imei2");

-- CreateIndex
CREATE INDEX "devices_storeId_status_idx" ON "devices"("storeId", "status");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE INDEX "device_timeline_events_deviceId_idx" ON "device_timeline_events"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_receiptNumber_key" ON "sales"("receiptNumber");

-- CreateIndex
CREATE INDEX "sales_storeId_createdAt_idx" ON "sales"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_transferNumber_key" ON "transfer_requests"("transferNumber");

-- CreateIndex
CREATE UNIQUE INDEX "repair_tickets_ticketNumber_key" ON "repair_tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "repair_tickets_storeId_status_idx" ON "repair_tickets"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_date_key" ON "exchange_rates"("date");

-- CreateIndex
CREATE INDEX "notifications_targetUserId_read_idx" ON "notifications"("targetUserId", "read");

-- CreateIndex
CREATE INDEX "notifications_targetRole_read_idx" ON "notifications"("targetRole", "read");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_createdAt_idx" ON "ledger_entries"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_timeline_events" ADD CONSTRAINT "device_timeline_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_events" ADD CONSTRAINT "exchange_events_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_groups" ADD CONSTRAINT "invoice_groups_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bonuses" ADD CONSTRAINT "supplier_bonuses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bonus_devices" ADD CONSTRAINT "supplier_bonus_devices_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "supplier_bonuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_fromStoreId_fkey" FOREIGN KEY ("fromStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_tickets" ADD CONSTRAINT "repair_tickets_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_status_history" ADD CONSTRAINT "repair_status_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "repair_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_transactions" ADD CONSTRAINT "owner_transactions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
