ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS ac_mode TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_ac_mode_check;
ALTER TABLE characters
  ADD CONSTRAINT characters_ac_mode_check
  CHECK (ac_mode IN ('manual','auto'));

ALTER TABLE character_resources
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS auto_managed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS short_rest_gain INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_character_resources_source_key
  ON character_resources(character_id, source_key)
  WHERE source_key IS NOT NULL;
