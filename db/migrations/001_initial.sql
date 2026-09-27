CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE content_entity_type AS ENUM (
    'creature',
    'spell',
    'item',
    'condition',
    'feature',
    'rule'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_content_entities_type
  ON content_entities(entity_type);

CREATE INDEX IF NOT EXISTS idx_content_entities_name
  ON content_entities USING GIN (to_tsvector('english', name_en));

CREATE TABLE IF NOT EXISTS creatures (
  entity_id UUID PRIMARY KEY
    REFERENCES content_entities(id) ON DELETE CASCADE,

  size TEXT,
  creature_type TEXT,
  subtype TEXT,
  alignment TEXT,

  armor_class JSONB NOT NULL DEFAULT '[]'::jsonb,

  hit_points INTEGER,
  hit_dice TEXT,

  speed JSONB NOT NULL DEFAULT '{}'::jsonb,

  strength SMALLINT,
  dexterity SMALLINT,
  constitution SMALLINT,
  intelligence SMALLINT,
  wisdom SMALLINT,
  charisma SMALLINT,

  saving_throws JSONB NOT NULL DEFAULT '{}'::jsonb,
  skills JSONB NOT NULL DEFAULT '{}'::jsonb,

  damage_vulnerabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  damage_resistances JSONB NOT NULL DEFAULT '[]'::jsonb,
  damage_immunities JSONB NOT NULL DEFAULT '[]'::jsonb,
  condition_immunities JSONB NOT NULL DEFAULT '[]'::jsonb,

  senses JSONB NOT NULL DEFAULT '{}'::jsonb,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,

  challenge_rating NUMERIC(6,2),
  proficiency_bonus SMALLINT,
  experience_points INTEGER
);

CREATE TABLE IF NOT EXISTS entity_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL
    REFERENCES content_entities(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_en TEXT,

  attack_bonus INTEGER,
  attack_type TEXT,
  reach TEXT,
  range_data JSONB,
  damage JSONB,
  dc JSONB,
  recharge JSONB,

  raw_data JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_entity_actions_entity
  ON entity_actions(entity_id);

CREATE TABLE IF NOT EXISTS entity_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL
    REFERENCES content_entities(id) ON DELETE CASCADE,

  trait_type TEXT NOT NULL DEFAULT 'trait',
  name_en TEXT NOT NULL,
  description_en TEXT,
  mechanics JSONB,
  raw_data JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_entity_traits_entity
  ON entity_traits(entity_id);

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_id UUID NOT NULL
    REFERENCES content_entities(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(entity_id, tag)
);

CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  locale TEXT NOT NULL,
  field_name TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  translation_source TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(object_type, object_id, locale, field_name)
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
