-- Зоны перехода на плане (коридор, лестница, лифт и т.п.): отдельная таблица от object (аудитории позже).
CREATE TABLE IF NOT EXISTS transition_zone (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES plan (id) ON DELETE CASCADE,
    object_type_id INTEGER NOT NULL REFERENCES object_type (id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    pos_x DOUBLE PRECISION,
    pos_y DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_transition_zone_plan_type_name UNIQUE (plan_id, object_type_id, name)
);

CREATE INDEX IF NOT EXISTS ix_transition_zone_plan_id ON transition_zone (plan_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_transition_zone_pos_x_range'
    ) THEN
        ALTER TABLE transition_zone
        ADD CONSTRAINT ck_transition_zone_pos_x_range
        CHECK (pos_x IS NULL OR (pos_x >= 0 AND pos_x <= 1));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_transition_zone_pos_y_range'
    ) THEN
        ALTER TABLE transition_zone
        ADD CONSTRAINT ck_transition_zone_pos_y_range
        CHECK (pos_y IS NULL OR (pos_y >= 0 AND pos_y <= 1));
    END IF;
END $$;
