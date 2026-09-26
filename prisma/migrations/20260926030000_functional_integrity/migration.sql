BEGIN;
CREATE TABLE operation_requests (
  key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One namespace for both IMEI slots. Existing duplicates deliberately stop migration
-- for manual reconciliation; silently deleting inventory is never appropriate.
CREATE TABLE device_identifiers (
  identifier TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX device_identifiers_device_idx ON device_identifiers(device_id);
INSERT INTO device_identifiers(identifier, device_id)
SELECT imei, id FROM devices
UNION ALL SELECT imei2, id FROM devices WHERE imei2 IS NOT NULL;

CREATE FUNCTION sync_device_identifiers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM device_identifiers WHERE device_id = NEW.id;
  INSERT INTO device_identifiers(identifier, device_id) VALUES (NEW.imei, NEW.id);
  IF NEW.imei2 IS NOT NULL THEN
    INSERT INTO device_identifiers(identifier, device_id) VALUES (NEW.imei2, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER device_identifiers_sync AFTER INSERT OR UPDATE OF imei, imei2 ON devices
FOR EACH ROW EXECUTE FUNCTION sync_device_identifiers();
COMMIT;
