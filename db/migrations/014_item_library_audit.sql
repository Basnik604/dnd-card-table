ALTER TABLE items
  ADD COLUMN IF NOT EXISTS canonical_data JSONB,
  ADD COLUMN IF NOT EXISTS audit_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audit_status TEXT,
  ADD COLUMN IF NOT EXISTS audited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_items_audit_status ON items(audit_status);
