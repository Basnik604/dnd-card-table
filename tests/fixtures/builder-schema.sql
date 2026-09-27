-- Relevant tables copied from migrations 001 and 007, with 0071 subclass support.
CREATE TYPE content_entity_type AS ENUM ('class','subclass','species','background','feat');
CREATE TABLE IF NOT EXISTS content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  document_key TEXT NOT NULL,
  name TEXT NOT NULL,
  ruleset TEXT NOT NULL,
  license_code TEXT,
  license_url TEXT,
  attribution_text TEXT,
  api_base_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, document_key)
);
CREATE TABLE IF NOT EXISTS content_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type content_entity_type NOT NULL,
  source_id UUID REFERENCES content_sources(id),
  external_key TEXT,
  slug TEXT NOT NULL,
  ruleset TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_en TEXT,
  raw_source JSONB,
  source_hash TEXT,
  imported_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, external_key)
);
CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id UUID NOT NULL
    REFERENCES content_entities(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(entity_id, tag)
);
CREATE TABLE IF NOT EXISTS import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES content_sources(id),
  entity_type TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  discovered INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  unchanged INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb
);
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
  CHECK (content_kind IN ('class','subclass','species','background','feat'))
);

CREATE INDEX IF NOT EXISTS idx_character_content_kind ON character_content(content_kind);
CREATE INDEX IF NOT EXISTS idx_character_content_category ON character_content(category);
