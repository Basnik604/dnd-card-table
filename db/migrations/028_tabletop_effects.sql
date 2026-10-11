CREATE TABLE IF NOT EXISTS vtt_effects (
 id uuid PRIMARY KEY,
 scene_id uuid NOT NULL REFERENCES vtt_scenes(id) ON DELETE CASCADE,
 owner_token_id uuid NOT NULL REFERENCES vtt_tokens(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1,
 state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vtt_effects_scene ON vtt_effects(scene_id);
