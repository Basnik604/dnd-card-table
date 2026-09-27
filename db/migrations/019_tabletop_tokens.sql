CREATE TABLE IF NOT EXISTS vtt_tokens (
  id uuid PRIMARY KEY,
  scene_id uuid NOT NULL,
  session_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('character','creature','npc')),
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES content_entities(id) ON DELETE SET NULL,
  owner_principal_id text,
  name varchar(120) NOT NULL,
  ordinal integer,
  icon_type text NOT NULL DEFAULT 'npc',
  relation text NOT NULL DEFAULT 'neutral' CHECK (relation IN ('friendly','neutral','hostile')),
  border_color text NOT NULL DEFAULT '#d4b16a',
  size_cells numeric NOT NULL DEFAULT 1 CHECK (size_cells IN (0.5,1,2,3,4)),
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  image_mode text NOT NULL DEFAULT 'auto' CHECK (image_mode IN ('auto','custom','icon')),
  image_bytes bytea,
  image_mime text,
  image_revision integer NOT NULL DEFAULT 1,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY (scene_id,session_id) REFERENCES vtt_scenes(id,session_id) ON DELETE CASCADE,
  UNIQUE (scene_id,character_id)
);
CREATE INDEX IF NOT EXISTS vtt_tokens_scene_idx ON vtt_tokens(scene_id);
CREATE TABLE IF NOT EXISTS vtt_token_counters (
  scene_id uuid NOT NULL REFERENCES vtt_scenes(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  last_number integer NOT NULL,
  PRIMARY KEY (scene_id,source_key)
);
