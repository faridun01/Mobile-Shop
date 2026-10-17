-- Tablets are serialized devices like phones (their SN lives in imei/imei2); accessories are
-- counted by quantity in receipt batches, each with its own unit cost.

-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('PHONE', 'TABLET');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "category" "DeviceCategory" NOT NULL DEFAULT 'PHONE',
ADD COLUMN     "connectivity" TEXT,
ADD COLUMN     "screenSize" TEXT,
ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "category" "DeviceCategory" NOT NULL DEFAULT 'PHONE';

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "category" "DeviceCategory" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ram" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "connectivity" TEXT NOT NULL DEFAULT '',
    "screenSize" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_products" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "attributes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accessory_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_batches" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "supplierId" TEXT,
    "quantityReceived" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "unitCostUsd" DECIMAL(14,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accessory_batches_quantity_check" CHECK ("quantityReceived" > 0 AND "quantityRemaining" >= 0 AND "quantityRemaining" <= "quantityReceived" AND "quantityReserved" >= 0 AND "quantityReserved" <= "quantityRemaining"),
    CONSTRAINT "accessory_batches_cost_check" CHECK ("unitCostUsd" >= 0)
);

-- CreateTable
CREATE TABLE "sale_accessory_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "unitPriceTjs" DECIMAL(14,2) NOT NULL,
    "salePriceTjs" DECIMAL(14,2) NOT NULL,
    "salePriceUsd" DECIMAL(14,2) NOT NULL,
    "costUsd" DECIMAL(14,2) NOT NULL,
    "allocations" JSONB NOT NULL,
    "isBelowCost" BOOLEAN NOT NULL DEFAULT false,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "returnedPriceTjs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returnedPriceUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returnedCostUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_accessory_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_accessory_items_quantity_check" CHECK ("quantity" > 0 AND "returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity")
);

-- AlterTable
ALTER TABLE "sale_returns" ADD COLUMN "accessoryLines" JSONB;

-- CreateTable
CREATE TABLE "transfer_accessory_lines" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "allocations" JSONB NOT NULL,

    CONSTRAINT "transfer_accessory_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transfer_accessory_lines_quantity_check" CHECK ("quantity" > 0)
);

-- CreateIndex
CREATE INDEX "sale_accessory_items_saleId_idx" ON "sale_accessory_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_accessory_items_productId_idx" ON "sale_accessory_items"("productId");

-- CreateIndex
CREATE INDEX "transfer_accessory_lines_transferId_idx" ON "transfer_accessory_lines"("transferId");

-- CreateIndex
CREATE INDEX "transfer_accessory_lines_productId_idx" ON "transfer_accessory_lines"("productId");

-- AddForeignKey
ALTER TABLE "sale_accessory_items" ADD CONSTRAINT "sale_accessory_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_accessory_items" ADD CONSTRAINT "sale_accessory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "accessory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_accessory_lines" ADD CONSTRAINT "transfer_accessory_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_accessory_lines" ADD CONSTRAINT "transfer_accessory_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "accessory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "product_variants_category_brand_idx" ON "product_variants"("category", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_category_brand_model_ram_storage_color_con_key" ON "product_variants"("category", "brand", "model", "ram", "storage", "color", "connectivity", "screenSize");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_products_barcode_key" ON "accessory_products"("barcode");

-- CreateIndex
CREATE INDEX "accessory_products_brand_idx" ON "accessory_products"("brand");

-- CreateIndex
CREATE INDEX "accessory_products_category_idx" ON "accessory_products"("category");

-- CreateIndex
CREATE INDEX "accessory_batches_productId_storeId_receivedAt_idx" ON "accessory_batches"("productId", "storeId", "receivedAt");

-- CreateIndex
CREATE INDEX "accessory_batches_storeId_idx" ON "accessory_batches"("storeId");

-- CreateIndex
CREATE INDEX "accessory_batches_purchaseInvoiceId_idx" ON "accessory_batches"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "devices_category_idx" ON "devices"("category");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_batches" ADD CONSTRAINT "accessory_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "accessory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_batches" ADD CONSTRAINT "accessory_batches_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_batches" ADD CONSTRAINT "accessory_batches_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_batches" ADD CONSTRAINT "accessory_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
