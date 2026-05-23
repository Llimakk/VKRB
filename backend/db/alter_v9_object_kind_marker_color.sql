-- Marker color per object_kind (plan dots, legend, zone cards).

ALTER TABLE object_kind ADD COLUMN IF NOT EXISTS marker_color VARCHAR(7);

-- Named transition-zone / room kinds (match frontend CSS variables).
UPDATE object_kind SET marker_color = '#5b21b6'
WHERE marker_color IS NULL AND lower(trim(name)) LIKE '%коридор%';

UPDATE object_kind SET marker_color = '#e65100'
WHERE marker_color IS NULL AND lower(trim(name)) LIKE '%лестниц%';

UPDATE object_kind SET marker_color = '#2e7d32'
WHERE marker_color IS NULL AND lower(trim(name)) LIKE '%лифт%';

UPDATE object_kind SET marker_color = '#64b5f6'
WHERE marker_color IS NULL AND (
  lower(trim(name)) LIKE '%помещен%' OR lower(trim(name)) = 'room'
);

-- Remaining transition-zone kinds: assign from palette (by id order).
-- Palette slots (exclude reserved above): #7b1fa2, #c2185b, #00838f, #6d4c41, #5d4037, #455a64, #ad1457, #6a1b9a
UPDATE object_kind k
SET marker_color = sub.color
FROM (
  SELECT
    ok.id,
    (ARRAY[
      '#7b1fa2', '#c2185b', '#00838f', '#6d4c41',
      '#5d4037', '#455a64', '#ad1457', '#6a1b9a'
    ])[1 + (row_number() OVER (ORDER BY ok.id) - 1) % 8] AS color
  FROM object_kind ok
  JOIN object_type ot ON ot.id = ok.object_type_id
  WHERE ok.marker_color IS NULL
    AND (
      lower(trim(ot.name)) IN ('зона перехода', 'transition_zone', 'transition zone')
      OR lower(trim(ot.name)) LIKE '%коридор%'
      OR lower(trim(ot.name)) LIKE '%лестниц%'
      OR lower(trim(ot.name)) LIKE '%лифт%'
      OR lower(trim(ot.name)) LIKE '%переход%'
    )
    AND NOT (lower(trim(ok.name)) LIKE '%помещен%' OR lower(trim(ok.name)) = 'room')
) sub
WHERE k.id = sub.id;
