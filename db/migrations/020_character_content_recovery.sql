-- Used by the explicit, offline repair command. Never resets existing data.
CREATE TABLE IF NOT EXISTS public.character_content (
  entity_id UUID PRIMARY KEY REFERENCES public.content_entities(id) ON DELETE CASCADE,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('class','subclass','species','background','feat')),
  category TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
  proficiencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  choices JSONB NOT NULL DEFAULT '{}'::jsonb,
  starting_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  spellcasting JSONB NOT NULL DEFAULT '{}'::jsonb,
  progression JSONB NOT NULL DEFAULT '{}'::jsonb,
  traits JSONB NOT NULL DEFAULT '[]'::jsonb,
  mechanics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_character_content_kind ON public.character_content(content_kind);
CREATE INDEX IF NOT EXISTS idx_character_content_category ON public.character_content(category);
