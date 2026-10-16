-- "devices_imei_idx" duplicated the unique index "devices_imei_key" on the same column: every
-- IMEI lookup uses the unique one, and the copy only slowed down writes. Uniqueness is unchanged.
DROP INDEX IF EXISTS "devices_imei_idx";
