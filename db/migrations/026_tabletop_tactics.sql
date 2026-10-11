CREATE TABLE IF NOT EXISTS vtt_unit_tactics (
 token_id uuid PRIMARY KEY REFERENCES vtt_tokens(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1,
 state jsonb NOT NULL DEFAULT '{}'
);
