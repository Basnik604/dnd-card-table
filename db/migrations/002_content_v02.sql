-- v0.2 content schema: spells, items, conditions + safer entity uniqueness.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_entities_source_id_external_key_key'
  ) THEN
    ALTER TABLE content_entities
      DROP CONSTRAINT content_entities_source_id_external_key_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'content_entities_source_type_external_key_key'
  ) THEN
    ALTER TABLE content_entities
      ADD CONSTRAINT content_entities_source_type_external_key_key
      UNIQUE (source_id, entity_type, external_key);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS spells (
  entity_id UUID PRIMARY KEY
    REFERENCES content_entities(id) ON DELETE CASCADE,

  level SMALLINT NOT NULL DEFAULT 0,
  school TEXT,
  casting_time TEXT,
  range_text TEXT,
  duration TEXT,
  ritual BOOLEAN NOT NULL DEFAULT FALSE,
  concentration BOOLEAN NOT NULL DEFAULT FALSE,

  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  material TEXT,

  attack_type TEXT,
  saving_throw_ability TEXT,
  damage JSONB,
  area_of_effect JSONB,
  higher_levels_en TEXT,
  classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  mechanics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_spells_level ON spells(level);
CREATE INDEX IF NOT EXISTS idx_spells_school ON spells(school);

CREATE TABLE IF NOT EXISTS items (
  entity_id UUID PRIMARY KEY
    REFERENCES content_entities(id) ON DELETE CASCADE,

  item_kind TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  rarity TEXT,

  requires_attunement BOOLEAN NOT NULL DEFAULT FALSE,
  attunement_detail TEXT,

  cost JSONB,
  weight NUMERIC(12,3),
  damage JSONB,
  armor JSONB,
  properties JSONB NOT NULL DEFAULT '[]'::jsonb,
  mechanics JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_items_kind ON items(item_kind);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity);

CREATE TABLE IF NOT EXISTS conditions (
  entity_id UUID PRIMARY KEY
    REFERENCES content_entities(id) ON DELETE CASCADE,
  mechanics JSONB NOT NULL DEFAULT '{}'::jsonb
);
