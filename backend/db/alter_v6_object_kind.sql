-- Stage A: add object_kind and bind existing rows.

CREATE TABLE IF NOT EXISTS object_kind (
    id SERIAL PRIMARY KEY,
    object_type_id INTEGER NOT NULL REFERENCES object_type (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    CONSTRAINT uq_object_kind_type_name UNIQUE (object_type_id, name)
);

-- Default kind per existing type (type-name duplicate).
INSERT INTO object_kind (object_type_id, name)
SELECT ot.id, ot.name
FROM object_type ot
ON CONFLICT (object_type_id, name) DO NOTHING;

ALTER TABLE object
ADD COLUMN IF NOT EXISTS object_kind_id INTEGER;

UPDATE object o
SET object_kind_id = ok.id
FROM object_kind ok
WHERE ok.object_type_id = o.object_type_id
  AND ok.name = (
      SELECT ot.name
      FROM object_type ot
      WHERE ot.id = o.object_type_id
  )
  AND o.object_kind_id IS NULL;

ALTER TABLE object
ALTER COLUMN object_kind_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_object_object_kind'
    ) THEN
        ALTER TABLE object
        ADD CONSTRAINT fk_object_object_kind
        FOREIGN KEY (object_kind_id) REFERENCES object_kind (id) ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE transition_zone
ADD COLUMN IF NOT EXISTS object_kind_id INTEGER;

UPDATE transition_zone tz
SET object_kind_id = ok.id
FROM object_kind ok
WHERE ok.object_type_id = tz.object_type_id
  AND ok.name = (
      SELECT ot.name
      FROM object_type ot
      WHERE ot.id = tz.object_type_id
  )
  AND tz.object_kind_id IS NULL;

ALTER TABLE transition_zone
ALTER COLUMN object_kind_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_transition_zone_object_kind'
    ) THEN
        ALTER TABLE transition_zone
        ADD CONSTRAINT fk_transition_zone_object_kind
        FOREIGN KEY (object_kind_id) REFERENCES object_kind (id) ON DELETE RESTRICT;
    END IF;
END $$;
