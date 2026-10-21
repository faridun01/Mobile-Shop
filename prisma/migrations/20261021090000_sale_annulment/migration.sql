ALTER TABLE "sales"
  ADD COLUMN "annulledAt" TIMESTAMP(3),
  ADD COLUMN "annulledByUserId" TEXT;

CREATE INDEX "sales_annulled_idx" ON "sales" ("annulledAt") WHERE "annulledAt" IS NOT NULL;
