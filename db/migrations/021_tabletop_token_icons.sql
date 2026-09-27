ALTER TABLE vtt_tokens
  ADD COLUMN IF NOT EXISTS icon_color text NOT NULL DEFAULT '#8ed8ff';
