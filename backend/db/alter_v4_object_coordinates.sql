ALTER TABLE object
ADD COLUMN IF NOT EXISTS pos_x DOUBLE PRECISION;

ALTER TABLE object
ADD COLUMN IF NOT EXISTS pos_y DOUBLE PRECISION;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_object_pos_x_range'
    ) THEN
        ALTER TABLE object
        ADD CONSTRAINT ck_object_pos_x_range
        CHECK (pos_x IS NULL OR (pos_x >= 0 AND pos_x <= 1));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_object_pos_y_range'
    ) THEN
        ALTER TABLE object
        ADD CONSTRAINT ck_object_pos_y_range
        CHECK (pos_y IS NULL OR (pos_y >= 0 AND pos_y <= 1));
    END IF;
END $$;
