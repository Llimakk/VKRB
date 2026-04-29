-- v8: add GPS coordinates to nav_node (nullable, for exit/entrance nodes)
ALTER TABLE nav_node ADD COLUMN lat REAL;
ALTER TABLE nav_node ADD COLUMN lon REAL;
