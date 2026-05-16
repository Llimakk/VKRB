-- Помещения привязаны к зонам перехода «коридор».
ALTER TABLE object
    ADD COLUMN IF NOT EXISTS transition_zone_id INTEGER NULL
        REFERENCES transition_zone (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_object_transition_zone_id ON object (transition_zone_id);
