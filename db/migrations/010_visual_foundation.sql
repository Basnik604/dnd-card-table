ALTER TABLE characters ADD COLUMN IF NOT EXISTS portrait_bytes BYTEA;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS portrait_mime TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS portrait_name TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS sheet_layout TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_sheet_layout_check;
ALTER TABLE characters ADD CONSTRAINT characters_sheet_layout_check
  CHECK (sheet_layout IN ('standard','compact','illustrated'));

ALTER TABLE content_entities ADD COLUMN IF NOT EXISTS image_bytes BYTEA;
ALTER TABLE content_entities ADD COLUMN IF NOT EXISTS image_mime TEXT;
ALTER TABLE content_entities ADD COLUMN IF NOT EXISTS image_name TEXT;

ALTER TABLE card_templates ADD COLUMN IF NOT EXISTS image_bytes BYTEA;
ALTER TABLE card_templates ADD COLUMN IF NOT EXISTS image_mime TEXT;
ALTER TABLE card_templates ADD COLUMN IF NOT EXISTS image_name TEXT;
