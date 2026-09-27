ALTER TABLE vtt_tokens ADD COLUMN IF NOT EXISTS icon_color text
  CHECK (icon_color ~ '^#[0-9a-fA-F]{6}$');
-- Preserve the previous type colors when upgrading existing tokens.
UPDATE vtt_tokens SET icon_color=CASE icon_type
  WHEN 'character' THEN '#80bce7' WHEN 'npc' THEN '#d9c796'
  WHEN 'undead' THEN '#91d573' WHEN 'beast' THEN '#d3a35a'
  WHEN 'dragon' THEN '#dd8971' WHEN 'construct' THEN '#a6bdc9'
  WHEN 'aberration' THEN '#c294e6' WHEN 'celestial' THEN '#f3de8b'
  WHEN 'elemental' THEN '#6fcde1' WHEN 'fey' THEN '#b5d780'
  WHEN 'fiend' THEN '#e67474' WHEN 'giant' THEN '#cead8a'
  WHEN 'humanoid' THEN '#d4b690' WHEN 'monstrosity' THEN '#b894d5'
  WHEN 'ooze' THEN '#9dbf54' WHEN 'plant' THEN '#78bf87'
  ELSE '#c8d2dc' END WHERE icon_color IS NULL;
ALTER TABLE vtt_tokens ALTER COLUMN icon_color SET DEFAULT '#c8d2dc';
ALTER TABLE vtt_tokens ALTER COLUMN icon_color SET NOT NULL;
