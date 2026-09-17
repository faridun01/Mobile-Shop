CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Existing JWTs have no session record and require a fresh login after deployment.
ALTER TABLE "expenses" ADD COLUMN "ownerProfitAllocations" JSONB;
ALTER TABLE "supplier_bonuses" ADD COLUMN "ownerProfitAllocations" JSONB;
-- Never infer historical allocations from today's shares: legacy records need reconciliation.
