-- «Главный счёт» is removed: supplier payments now always come from a cash register
-- (usually «Касса Главный склад», where partner capital lives). The account row is only
-- deactivated, never deleted — its past transactions stay in the journal for audit.
UPDATE "financial_accounts" SET "active" = false WHERE "type" = 'MAIN';
