CREATE TABLE IF NOT EXISTS character_spells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  spell_entity_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  prepared BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, spell_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_character_spells_character
  ON character_spells(character_id);

CREATE TABLE IF NOT EXISTS character_spell_slots (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot_level SMALLINT NOT NULL CHECK (slot_level BETWEEN 1 AND 9),
  max_slots SMALLINT NOT NULL DEFAULT 0 CHECK (max_slots >= 0),
  current_slots SMALLINT NOT NULL DEFAULT 0 CHECK (current_slots >= 0),
  recharge TEXT NOT NULL DEFAULT 'long' CHECK (recharge IN ('short','long')),
  PRIMARY KEY(character_id, slot_level)
);

CREATE TABLE IF NOT EXISTS character_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  condition_entity_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, condition_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_character_conditions_character
  ON character_conditions(character_id);

CREATE TABLE IF NOT EXISTS character_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  max_value INTEGER NOT NULL DEFAULT 0 CHECK (max_value >= 0),
  recharge TEXT NOT NULL DEFAULT 'long' CHECK (recharge IN ('short','long','none')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_resources_character
  ON character_resources(character_id);
