-- Accessories received into a store by scanning (store receipts) and counted in a stock revision.

-- CreateTable
CREATE TABLE "store_receipt_accessory_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "allocations" JSONB NOT NULL,

    CONSTRAINT "store_receipt_accessory_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_receipt_accessory_lines_quantity_check" CHECK ("quantity" > 0)
);

-- CreateIndex
CREATE INDEX "store_receipt_accessory_lines_receiptId_idx" ON "store_receipt_accessory_lines"("receiptId");

-- CreateIndex
CREATE INDEX "store_receipt_accessory_lines_productId_idx" ON "store_receipt_accessory_lines"("productId");

-- AddForeignKey
ALTER TABLE "store_receipt_accessory_lines" ADD CONSTRAINT "store_receipt_accessory_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "store_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_receipt_accessory_lines" ADD CONSTRAINT "store_receipt_accessory_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "accessory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "stock_revisions" ADD COLUMN "accessoryLines" JSONB;
