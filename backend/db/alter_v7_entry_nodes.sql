-- v7: multiple entry points per object
-- Replaces the single object.nav_node_id with a many-to-many table.
-- The old column is kept for backwards-compatibility but is no longer used
-- by the routing service or the editor API.

CREATE TABLE object_entry_node (
    id          SERIAL  PRIMARY KEY,
    object_id   INTEGER NOT NULL REFERENCES object(id)   ON DELETE CASCADE,
    nav_node_id INTEGER NOT NULL REFERENCES nav_node(id) ON DELETE CASCADE,
    UNIQUE (object_id, nav_node_id)
);

-- Migrate existing single-entry data
INSERT INTO object_entry_node (object_id, nav_node_id)
SELECT id, nav_node_id
FROM object
WHERE nav_node_id IS NOT NULL;
