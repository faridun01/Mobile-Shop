-- Add a database-level uniqueness guarantee for the second (dual-SIM) IMEI.
-- Nullable @unique in Prisma maps to a Postgres partial-style unique index that
-- allows unlimited NULLs while rejecting any duplicate non-null value.
DROP INDEX IF EXISTS "devices_imei2_idx";
CREATE UNIQUE INDEX "devices_imei2_key" ON "devices"("imei2");
