-- Repair broad "gear/item" classifications when structured fields clearly
-- identify a weapon, armor, or shield. This preserves all other gear.

UPDATE items i
SET item_type='shield'
FROM content_entities ce
WHERE i.entity_id=ce.id
  AND COALESCE(i.item_type,'') IN ('','gear','item','armor')
  AND i.armor_class_base IS NOT NULL
  AND (
    LOWER(ce.name_en) LIKE '%shield%'
    OR LOWER(COALESCE(i.category,'')) LIKE '%shield%'
    OR LOWER(COALESCE(i.subcategory,'')) LIKE '%shield%'
  );

UPDATE items
SET item_type='weapon'
WHERE COALESCE(item_type,'') IN ('','gear','item')
  AND damage_dice IS NOT NULL
  AND BTRIM(damage_dice) <> '';

UPDATE items
SET item_type='weapon'
WHERE COALESCE(item_type,'') IN ('','gear','item')
  AND weapon_category IS NOT NULL
  AND BTRIM(weapon_category) <> '';

UPDATE items
SET item_type='armor'
WHERE COALESCE(item_type,'') IN ('','gear','item')
  AND armor_class_base IS NOT NULL;

-- Bring existing generated card templates in sync with repaired source items.
UPDATE card_templates ct
SET
  card_type=i.item_type,
  subtitle_en=CASE i.item_type
    WHEN 'weapon' THEN 'Weapon'
    WHEN 'armor' THEN 'Armor'
    WHEN 'shield' THEN 'Shield'
    WHEN 'magic_weapon' THEN 'Magic Weapon'
    WHEN 'magic_armor' THEN 'Magic Armor'
    ELSE ct.subtitle_en
  END,
  data=jsonb_set(COALESCE(ct.data,'{}'::jsonb),'{itemType}',to_jsonb(i.item_type),TRUE),
  updated_at=NOW()
FROM items i
WHERE ct.source_entity_id=i.entity_id
  AND i.item_type IN ('weapon','armor','shield','magic_weapon','magic_armor')
  AND (
    COALESCE(ct.card_type,'') IN ('','gear','item')
    OR COALESCE(ct.data->>'itemType','') IN ('','gear','item')
  );
