-- v0.29: independent of character/catalog tables. Applied transactionally on
-- the first tabletop request; IF NOT EXISTS makes subsequent starts harmless.
CREATE TABLE IF NOT EXISTS vtt_sessions (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  owner_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vtt_session_members (
  session_id uuid NOT NULL REFERENCES vtt_sessions(id) ON DELETE CASCADE,
  principal_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('gm','player')),
  PRIMARY KEY (session_id, principal_id)
);
CREATE TABLE IF NOT EXISTS vtt_locations (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES vtt_sessions(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (id, session_id)
);
CREATE TABLE IF NOT EXISTS vtt_scenes (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  location_id uuid NOT NULL,
  name varchar(120) NOT NULL DEFAULT 'Ground floor',
  sort_order integer NOT NULL DEFAULT 0,
  grid jsonb NOT NULL DEFAULT '{"cellSize":70,"offsetX":0,"offsetY":0,"opacity":0.45,"color":"#ffffff","visible":true,"distance":5,"unit":"ft"}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  map_bytes bytea,
  map_mime text CHECK (map_mime IN ('image/png','image/jpeg','image/webp')),
  map_name varchar(180),
  map_width integer,
  map_height integer,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY (location_id, session_id) REFERENCES vtt_locations(id, session_id) ON DELETE CASCADE,
  UNIQUE (id, session_id),
  UNIQUE (location_id, sort_order)
);
CREATE INDEX IF NOT EXISTS vtt_members_principal_idx ON vtt_session_members(principal_id);
CREATE INDEX IF NOT EXISTS vtt_locations_session_idx ON vtt_locations(session_id);
CREATE INDEX IF NOT EXISTS vtt_scenes_session_idx ON vtt_scenes(session_id);
