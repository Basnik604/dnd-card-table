ALTER TABLE character_spells
  ADD COLUMN IF NOT EXISTS always_prepared BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_key TEXT;

CREATE INDEX IF NOT EXISTS idx_character_spells_source_key
  ON character_spells(character_id, source_key)
  WHERE source_key IS NOT NULL;
