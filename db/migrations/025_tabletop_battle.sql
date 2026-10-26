CREATE TABLE IF NOT EXISTS vtt_token_vitals (
 token_id uuid PRIMARY KEY REFERENCES vtt_tokens(id) ON DELETE CASCADE,
 hp_current integer NOT NULL DEFAULT 1 CHECK (hp_current >= 0),
 hp_max integer NOT NULL DEFAULT 1 CHECK (hp_max > 0),
 temp_hp integer NOT NULL DEFAULT 0 CHECK (temp_hp >= 0),
 armor_class integer NOT NULL DEFAULT 10 CHECK (armor_class BETWEEN 1 AND 50),
 revision integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS vtt_battle_actions (
 id uuid PRIMARY KEY,
 scene_id uuid NOT NULL REFERENCES vtt_scenes(id) ON DELETE CASCADE,
 actor_token_id uuid NOT NULL REFERENCES vtt_tokens(id) ON DELETE CASCADE,
 combat_revision integer NOT NULL,
 payload jsonb NOT NULL,
 result jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','cancelled')),
 created_at timestamptz NOT NULL DEFAULT NOW(),
 applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS vtt_battle_actions_scene ON vtt_battle_actions(scene_id,created_at);
