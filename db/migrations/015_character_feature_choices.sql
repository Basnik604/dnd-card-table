ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS weapon_masteries JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expertise_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_choices JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE characters
SET weapon_masteries='[]'::jsonb
WHERE weapon_masteries IS NULL;

UPDATE characters
SET expertise_skills='[]'::jsonb
WHERE expertise_skills IS NULL;

UPDATE characters
SET feature_choices='{}'::jsonb
WHERE feature_choices IS NULL;
