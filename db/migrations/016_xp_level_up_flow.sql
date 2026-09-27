CREATE TABLE IF NOT EXISTS character_level_history (
  id BIGSERIAL PRIMARY KEY,
  character_id TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_level_history_character
  ON character_level_history(character_id, id DESC);

-- Existing higher-level characters created before the XP progression UI may
-- have XP=0. Bring XP up only to the minimum for their current level.
UPDATE characters
SET xp = GREATEST(
  COALESCE(xp,0),
  CASE level
    WHEN 1 THEN 0
    WHEN 2 THEN 300
    WHEN 3 THEN 900
    WHEN 4 THEN 2700
    WHEN 5 THEN 6500
    WHEN 6 THEN 14000
    WHEN 7 THEN 23000
    WHEN 8 THEN 34000
    WHEN 9 THEN 48000
    WHEN 10 THEN 64000
    WHEN 11 THEN 85000
    WHEN 12 THEN 100000
    WHEN 13 THEN 120000
    WHEN 14 THEN 140000
    WHEN 15 THEN 165000
    WHEN 16 THEN 195000
    WHEN 17 THEN 225000
    WHEN 18 THEN 265000
    WHEN 19 THEN 305000
    WHEN 20 THEN 355000
    ELSE 0
  END
);
