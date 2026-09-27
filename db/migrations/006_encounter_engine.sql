-- v0.6 Combat / Encounter Engine.

CREATE TABLE IF NOT EXISTS encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','active','ended')),
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  current_turn_index INTEGER NOT NULL DEFAULT 0 CHECK (current_turn_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encounter_combatants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  combatant_type TEXT NOT NULL CHECK (combatant_type IN ('character','creature')),
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES content_entities(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  initiative INTEGER,
  hp_current INTEGER NOT NULL CHECK (hp_current >= 0),
  hp_max INTEGER NOT NULL CHECK (hp_max > 0),
  armor_class INTEGER NOT NULL DEFAULT 10,
  dexterity SMALLINT NOT NULL DEFAULT 10,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (combatant_type='character' AND character_id IS NOT NULL) OR
    (combatant_type='creature' AND entity_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_encounter_combatants_encounter
  ON encounter_combatants(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_combatants_turn
  ON encounter_combatants(encounter_id, initiative DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_encounter_character_once
  ON encounter_combatants(encounter_id, character_id)
  WHERE character_id IS NOT NULL;
