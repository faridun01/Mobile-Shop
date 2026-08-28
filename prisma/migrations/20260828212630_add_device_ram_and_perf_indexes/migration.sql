-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "ram" TEXT;

-- AlterTable
ALTER TABLE "invoice_groups" ADD COLUMN     "ram" TEXT;

-- CreateIndex
CREATE INDEX "expenses_storeId_createdAt_idx" ON "expenses"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "expenses_createdAt_idx" ON "expenses"("createdAt");

-- CreateIndex
CREATE INDEX "invoice_groups_invoiceId_idx" ON "invoice_groups"("invoiceId");

-- CreateIndex
CREATE INDEX "owner_transactions_ownerId_createdAt_idx" ON "owner_transactions"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_deviceId_idx" ON "sale_items"("deviceId");

-- CreateIndex
CREATE INDEX "supplier_invoices_supplierId_idx" ON "supplier_invoices"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_invoices_storeId_idx" ON "supplier_invoices"("storeId");

-- CreateIndex
CREATE INDEX "transfer_items_transferId_idx" ON "transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "transfer_items_deviceId_idx" ON "transfer_items"("deviceId");

-- CreateIndex
CREATE INDEX "transfer_requests_fromStoreId_idx" ON "transfer_requests"("fromStoreId");

-- CreateIndex
CREATE INDEX "transfer_requests_toStoreId_idx" ON "transfer_requests"("toStoreId");
