-- Crown Ember: profile-picture storage
-- Safe to run repeatedly.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data bytea;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version timestamptz NOT NULL DEFAULT now();
