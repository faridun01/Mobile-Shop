-- AlterTable: add nullable first so existing rows can be backfilled from their device
ALTER TABLE "transfer_items" ADD COLUMN "brand" TEXT;

-- Backfill: transfer items always reference a real device, so its brand is always known
UPDATE "transfer_items" ti
SET "brand" = d."brand"
FROM "devices" d
WHERE d."id" = ti."deviceId";

-- Enforce NOT NULL now that every existing row has a value
ALTER TABLE "transfer_items" ALTER COLUMN "brand" SET NOT NULL;
