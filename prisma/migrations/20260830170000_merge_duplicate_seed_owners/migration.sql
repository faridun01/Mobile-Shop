-- A legacy production database can already have two UUID-based owner profiles.
-- Older seed logic upserted owner-admin/owner-partner by ID, creating two more
-- profiles beside them. Merge those seed duplicates into the profiles linked to
-- the real ADMIN/PARTNER accounts, then remove the duplicates.

DO $$
DECLARE
    canonical_id TEXT;
BEGIN
    SELECT o.id
      INTO canonical_id
      FROM "owners" o
      JOIN "users" u ON u.id = o."userId"
     WHERE u.role = 'ADMIN'
     ORDER BY u."createdAt", o."createdAt"
     LIMIT 1;

    IF canonical_id IS NOT NULL
       AND canonical_id <> 'owner-admin'
       AND EXISTS (SELECT 1 FROM "owners" WHERE id = 'owner-admin') THEN
        UPDATE "owner_transactions"
           SET "ownerId" = canonical_id
         WHERE "ownerId" = 'owner-admin';

        UPDATE "owners" target
           SET "capitalBalanceUsd" = target."capitalBalanceUsd" + duplicate."capitalBalanceUsd",
               "totalAccruedProfitUsd" = GREATEST(target."totalAccruedProfitUsd", duplicate."totalAccruedProfitUsd"),
               "totalPaidProfitUsd" = target."totalPaidProfitUsd" + duplicate."totalPaidProfitUsd",
               "totalReinvestedUsd" = target."totalReinvestedUsd" + duplicate."totalReinvestedUsd",
               "availableProfitUsd" = GREATEST(target."totalAccruedProfitUsd", duplicate."totalAccruedProfitUsd")
                                      - target."totalPaidProfitUsd" - duplicate."totalPaidProfitUsd"
                                      - target."totalReinvestedUsd" - duplicate."totalReinvestedUsd"
          FROM "owners" duplicate
         WHERE target.id = canonical_id
           AND duplicate.id = 'owner-admin';

        DELETE FROM "owners" WHERE id = 'owner-admin';
    END IF;
END $$;

DO $$
DECLARE
    canonical_id TEXT;
BEGIN
    SELECT o.id
      INTO canonical_id
      FROM "owners" o
      JOIN "users" u ON u.id = o."userId"
     WHERE u.role = 'PARTNER'
     ORDER BY u."createdAt", o."createdAt"
     LIMIT 1;

    IF canonical_id IS NOT NULL
       AND canonical_id <> 'owner-partner'
       AND EXISTS (SELECT 1 FROM "owners" WHERE id = 'owner-partner') THEN
        UPDATE "owner_transactions"
           SET "ownerId" = canonical_id
         WHERE "ownerId" = 'owner-partner';

        UPDATE "owners" target
           SET "capitalBalanceUsd" = target."capitalBalanceUsd" + duplicate."capitalBalanceUsd",
               "totalAccruedProfitUsd" = GREATEST(target."totalAccruedProfitUsd", duplicate."totalAccruedProfitUsd"),
               "totalPaidProfitUsd" = target."totalPaidProfitUsd" + duplicate."totalPaidProfitUsd",
               "totalReinvestedUsd" = target."totalReinvestedUsd" + duplicate."totalReinvestedUsd",
               "availableProfitUsd" = GREATEST(target."totalAccruedProfitUsd", duplicate."totalAccruedProfitUsd")
                                      - target."totalPaidProfitUsd" - duplicate."totalPaidProfitUsd"
                                      - target."totalReinvestedUsd" - duplicate."totalReinvestedUsd"
          FROM "owners" duplicate
         WHERE target.id = canonical_id
           AND duplicate.id = 'owner-partner';

        DELETE FROM "owners" WHERE id = 'owner-partner';
    END IF;
END $$;
