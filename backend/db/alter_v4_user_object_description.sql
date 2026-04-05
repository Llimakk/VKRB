-- v4: Add User table and description column on Object.
-- Apply once to an existing database.

CREATE TABLE IF NOT EXISTS "user" (
    id               SERIAL PRIMARY KEY,
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    email            VARCHAR(255) NOT NULL UNIQUE,
    hashed_password  VARCHAR(255) NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE "object" ADD COLUMN IF NOT EXISTS description TEXT;
