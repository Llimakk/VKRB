-- Room marker color lives on object_type (not per room kind).

ALTER TABLE object_type ADD COLUMN IF NOT EXISTS marker_color VARCHAR(7);

UPDATE object_type SET marker_color = '#64b5f6'
WHERE marker_color IS NULL
  AND (
    lower(trim(name)) LIKE '%помещен%'
    OR lower(trim(name)) = 'room'
  );

-- Room kinds do not use per-kind colors.
UPDATE object_kind ok
SET marker_color = NULL
FROM object_type ot
WHERE ot.id = ok.object_type_id
  AND (
    lower(trim(ot.name)) LIKE '%помещен%'
    OR lower(trim(ot.name)) = 'room'
  );
