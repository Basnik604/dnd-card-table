-- v0.5 Character Engine foundation.

CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  class_name TEXT,
  species TEXT,
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),

  hp_current INTEGER NOT NULL DEFAULT 10 CHECK (hp_current >= 0),
  hp_max INTEGER NOT NULL DEFAULT 10 CHECK (hp_max > 0),
  temp_hp INTEGER NOT NULL DEFAULT 0 CHECK (temp_hp >= 0),
  armor_class SMALLINT NOT NULL DEFAULT 10 CHECK (armor_class BETWEEN 1 AND 50),

  strength SMALLINT NOT NULL DEFAULT 10 CHECK (strength BETWEEN 1 AND 30),
  dexterity SMALLINT NOT NULL DEFAULT 10 CHECK (dexterity BETWEEN 1 AND 30),
  constitution SMALLINT NOT NULL DEFAULT 10 CHECK (constitution BETWEEN 1 AND 30),
  intelligence SMALLINT NOT NULL DEFAULT 10 CHECK (intelligence BETWEEN 1 AND 30),
  wisdom SMALLINT NOT NULL DEFAULT 10 CHECK (wisdom BETWEEN 1 AND 30),
  charisma SMALLINT NOT NULL DEFAULT 10 CHECK (charisma BETWEEN 1 AND 30),

  proficiency_bonus SMALLINT NOT NULL DEFAULT 2,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
