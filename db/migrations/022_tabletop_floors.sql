ALTER TABLE vtt_locations ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE TABLE IF NOT EXISTS vtt_token_positions (
  token_id uuid NOT NULL REFERENCES vtt_tokens(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES vtt_scenes(id) ON DELETE CASCADE,
  x numeric NOT NULL,
  y numeric NOT NULL,
  ordinal integer,
  PRIMARY KEY (token_id,scene_id)
);
CREATE INDEX IF NOT EXISTS vtt_token_positions_scene_idx ON vtt_token_positions(scene_id);
