-- v0.4 Card Engine foundation: templates, instances, and dice roll log.

CREATE TABLE IF NOT EXISTS card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES content_entities(id) ON DELETE SET NULL,
  card_type TEXT NOT NULL,
  name_en TEXT NOT NULL,
  subtitle_en TEXT,
  description_en TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_card_templates_source_entity
  ON card_templates(source_entity_id)
  WHERE source_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_templates_type ON card_templates(card_type);
CREATE INDEX IF NOT EXISTS idx_card_templates_name ON card_templates(name_en);

CREATE TABLE IF NOT EXISTS card_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL DEFAULT 'world',
  owner_ref TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_instances_template ON card_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_card_instances_owner ON card_instances(owner_type, owner_ref);

CREATE TABLE IF NOT EXISTS roll_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT,
  formula TEXT NOT NULL,
  total INTEGER NOT NULL,
  detail JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_roll_log_created_at ON roll_log(created_at DESC);
