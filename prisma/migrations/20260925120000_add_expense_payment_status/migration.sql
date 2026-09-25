ALTER TABLE "expenses" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PAID';
ALTER TABLE "expenses" ADD COLUMN "paidAt" TIMESTAMP(3);
-- Every existing row was created under the old behavior, where an expense was always
-- treated as settled at creation — keep them PAID.
UPDATE "expenses" SET "paidAt" = "createdAt" WHERE "paidAt" IS NULL;
