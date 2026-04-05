-- v6: Add node_type to nav_node, distance/weight to nav_edge,
--     nav_node_id (entry point) to object.

ALTER TABLE nav_node
    ADD COLUMN IF NOT EXISTS node_type VARCHAR(50) NOT NULL DEFAULT 'room';

ALTER TABLE nav_edge
    ADD COLUMN IF NOT EXISTS distance FLOAT NOT NULL DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS weight   FLOAT NOT NULL DEFAULT 1.0;

ALTER TABLE "object"
    ADD COLUMN IF NOT EXISTS nav_node_id INTEGER REFERENCES nav_node(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_object_nav_node ON "object"(nav_node_id);
