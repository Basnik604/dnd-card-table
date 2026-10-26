CREATE TABLE IF NOT EXISTS vtt_combat (
 scene_id uuid PRIMARY KEY REFERENCES vtt_scenes(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1,
 entries jsonb NOT NULL DEFAULT '[]',
 active_token_id uuid,
 round integer NOT NULL DEFAULT 0 CHECK (round >= 0),
 updated_at timestamptz NOT NULL DEFAULT NOW()
);
