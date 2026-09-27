ALTER TABLE characters ADD COLUMN IF NOT EXISTS subclass_name TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS background_name TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS origin_feat TEXT;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS skill_proficiencies JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS tool_proficiencies JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS saving_throw_proficiencies JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS builder_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS currency_gp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_characters_background_name ON characters(background_name);
CREATE INDEX IF NOT EXISTS idx_characters_subclass_name ON characters(subclass_name);
