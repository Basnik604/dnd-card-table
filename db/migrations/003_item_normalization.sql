-- v0.3.2 richer item normalization for card-ready weapon/armor/magic item data.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_type TEXT,
  ADD COLUMN IF NOT EXISTS weapon_category TEXT,
  ADD COLUMN IF NOT EXISTS damage_dice TEXT,
  ADD COLUMN IF NOT EXISTS versatile_damage_dice TEXT,
  ADD COLUMN IF NOT EXISTS damage_type TEXT,
  ADD COLUMN IF NOT EXISTS normal_range INTEGER,
  ADD COLUMN IF NOT EXISTS long_range INTEGER,
  ADD COLUMN IF NOT EXISTS mastery TEXT,
  ADD COLUMN IF NOT EXISTS armor_class_base INTEGER,
  ADD COLUMN IF NOT EXISTS dex_bonus_mode TEXT,
  ADD COLUMN IF NOT EXISTS max_dex_bonus INTEGER,
  ADD COLUMN IF NOT EXISTS strength_requirement INTEGER,
  ADD COLUMN IF NOT EXISTS stealth_disadvantage BOOLEAN,
  ADD COLUMN IF NOT EXISTS magic_bonus SMALLINT,
  ADD COLUMN IF NOT EXISTS consumable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS base_item_name TEXT,
  ADD COLUMN IF NOT EXISTS charges JSONB,
  ADD COLUMN IF NOT EXISTS detail_source JSONB,
  ADD COLUMN IF NOT EXISTS normalization_version SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_weapon_category ON items(weapon_category);
CREATE INDEX IF NOT EXISTS idx_items_magic_bonus ON items(magic_bonus);
