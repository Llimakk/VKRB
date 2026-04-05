-- v5: Navigation graph tables + plan editor fields + object polygon geometry.
-- Apply once to an existing database.

-- Physical dimensions and editor settings on plan
ALTER TABLE plan
    ADD COLUMN IF NOT EXISTS real_width     FLOAT,
    ADD COLUMN IF NOT EXISTS real_height    FLOAT,
    ADD COLUMN IF NOT EXISTS resolution     FLOAT,
    ADD COLUMN IF NOT EXISTS editor_settings JSONB;

-- Polygon geometry on object (room outline drawn in the editor)
ALTER TABLE "object"
    ADD COLUMN IF NOT EXISTS polygon_points JSONB;

-- Navigation graph nodes
CREATE TABLE IF NOT EXISTS nav_node (
    id       SERIAL PRIMARY KEY,
    plan_id  INTEGER NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    x        FLOAT   NOT NULL,
    y        FLOAT   NOT NULL,
    name     VARCHAR(255)
);

-- Navigation graph edges (undirected: enforced by app-level ordering)
CREATE TABLE IF NOT EXISTS nav_edge (
    id           SERIAL PRIMARY KEY,
    from_node_id INTEGER NOT NULL REFERENCES nav_node(id) ON DELETE CASCADE,
    to_node_id   INTEGER NOT NULL REFERENCES nav_node(id) ON DELETE CASCADE,
    CONSTRAINT uq_nav_edge_pair UNIQUE (from_node_id, to_node_id)
);

CREATE INDEX IF NOT EXISTS idx_nav_node_plan ON nav_node(plan_id);
CREATE INDEX IF NOT EXISTS idx_nav_edge_from ON nav_edge(from_node_id);
CREATE INDEX IF NOT EXISTS idx_nav_edge_to   ON nav_edge(to_node_id);
