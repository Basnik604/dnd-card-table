ALTER TYPE content_entity_type ADD VALUE IF NOT EXISTS 'class';
ALTER TYPE content_entity_type ADD VALUE IF NOT EXISTS 'species';
ALTER TYPE content_entity_type ADD VALUE IF NOT EXISTS 'background';
ALTER TYPE content_entity_type ADD VALUE IF NOT EXISTS 'feat';

CREATE TABLE IF NOT EXISTS character_content (
  entity_id UUID PRIMARY KEY REFERENCES content_entities(id) ON DELETE CASCADE,
  content_kind TEXT NOT NULL,
  category TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
  proficiencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  choices JSONB NOT NULL DEFAULT '{}'::jsonb,
  starting_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  spellcasting JSONB NOT NULL DEFAULT '{}'::jsonb,
  progression JSONB NOT NULL DEFAULT '{}'::jsonb,
  traits JSONB NOT NULL DEFAULT '[]'::jsonb,
  mechanics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (content_kind IN ('class','species','background','feat'))
);

CREATE INDEX IF NOT EXISTS idx_character_content_kind ON character_content(content_kind);
CREATE INDEX IF NOT EXISTS idx_character_content_category ON character_content(category);
