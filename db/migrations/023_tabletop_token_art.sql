ALTER TABLE vtt_tokens ADD COLUMN IF NOT EXISTS art_id text;
-- A floor may assign a new visible number; the artwork variant stays stable.
ALTER TABLE vtt_tokens ADD COLUMN IF NOT EXISTS art_variant integer;
UPDATE vtt_tokens SET art_variant=GREATEST(0,COALESCE(ordinal,1)-1) WHERE art_variant IS NULL;
ALTER TABLE vtt_tokens ALTER COLUMN art_variant SET DEFAULT 0;
ALTER TABLE vtt_tokens ALTER COLUMN art_variant SET NOT NULL;
ALTER TABLE vtt_tokens DROP CONSTRAINT IF EXISTS vtt_tokens_image_mode_check;
ALTER TABLE vtt_tokens ADD CONSTRAINT vtt_tokens_image_mode_check
  CHECK (image_mode IN ('auto','custom','icon','catalog'));
