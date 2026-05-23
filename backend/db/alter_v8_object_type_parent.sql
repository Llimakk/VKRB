-- Parent type FK for object_type hierarchy:
-- campus (NULL) -> building -> structure -> floor -> transition_zone -> room

ALTER TABLE object_type
  ADD COLUMN IF NOT EXISTS parent_object_type_id INTEGER
  REFERENCES object_type (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ix_object_type_parent
  ON object_type (parent_object_type_id);

-- Backfill by name (Russian labels; adjust if your DB uses other names).
UPDATE object_type SET parent_object_type_id = NULL
WHERE lower(trim(name)) LIKE '%кампус%' OR lower(trim(name)) = 'campus';

UPDATE object_type b
SET parent_object_type_id = c.id
FROM object_type c
WHERE (lower(trim(b.name)) LIKE '%корпус%' OR lower(trim(b.name)) = 'building')
  AND (lower(trim(c.name)) LIKE '%кампус%' OR lower(trim(c.name)) = 'campus')
  AND b.id <> c.id;

UPDATE object_type s
SET parent_object_type_id = b.id
FROM object_type b
WHERE (lower(trim(s.name)) LIKE '%строен%' OR lower(trim(s.name)) = 'structure')
  AND (lower(trim(b.name)) LIKE '%корпус%' OR lower(trim(b.name)) = 'building')
  AND s.id <> b.id;

UPDATE object_type f
SET parent_object_type_id = s.id
FROM object_type s
WHERE (lower(trim(f.name)) LIKE '%этаж%' OR lower(trim(f.name)) = 'floor')
  AND (lower(trim(s.name)) LIKE '%строен%' OR lower(trim(s.name)) = 'structure')
  AND f.id <> s.id;

UPDATE object_type z
SET parent_object_type_id = f.id
FROM object_type f
WHERE (
    lower(trim(z.name)) IN ('зона перехода', 'transition_zone', 'transition zone')
    OR lower(trim(z.name)) LIKE '%коридор%'
    OR lower(trim(z.name)) LIKE '%лестниц%'
    OR lower(trim(z.name)) LIKE '%лифт%'
    OR lower(trim(z.name)) LIKE '%переход%'
  )
  AND (lower(trim(f.name)) LIKE '%этаж%' OR lower(trim(f.name)) = 'floor')
  AND z.id <> f.id;

UPDATE object_type r
SET parent_object_type_id = z.id
FROM object_type z
WHERE (
    lower(trim(r.name)) LIKE '%помещен%'
    OR lower(trim(r.name)) = 'room'
  )
  AND (
    lower(trim(z.name)) IN ('зона перехода', 'transition_zone', 'transition zone')
    OR lower(trim(z.name)) LIKE '%коридор%'
    OR lower(trim(z.name)) LIKE '%лестниц%'
    OR lower(trim(z.name)) LIKE '%лифт%'
    OR lower(trim(z.name)) LIKE '%переход%'
  )
  AND r.id <> z.id
  AND NOT (
    lower(trim(r.name)) LIKE '%коридор%'
    OR lower(trim(r.name)) LIKE '%лестниц%'
    OR lower(trim(r.name)) LIKE '%лифт%'
    OR lower(trim(r.name)) LIKE '%переход%'
  );
