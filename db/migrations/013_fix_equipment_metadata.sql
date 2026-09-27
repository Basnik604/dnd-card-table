-- v0.13.2: Reclassify SRD items using strong evidence only.
-- The previous repair treated placeholder values such as 0 / "None" as real
-- weapon or armor metadata, which could turn Packs/Pouches/Tools into equipment.

UPDATE items i
SET item_type = CASE
  WHEN i.item_type IN ('ammunition','magic_ammunition') THEN i.item_type

  WHEN (
    LOWER(ce.name_en) LIKE '%shield%'
    OR LOWER(COALESCE(i.category,'')) LIKE '%shield%'
    OR LOWER(COALESCE(i.subcategory,'')) LIKE '%shield%'
  )
  AND COALESCE(i.armor_class_base,0) > 0
    THEN 'shield'

  WHEN COALESCE(i.armor_class_base,0) > 0
    THEN CASE WHEN i.item_kind='magic_item' THEN 'magic_armor' ELSE 'armor' END

  WHEN COALESCE(i.damage_dice,'') ~* '^[[:space:]]*[0-9]+[[:space:]]*d[[:space:]]*[0-9]+'
    OR LOWER(COALESCE(i.weapon_category,'')) ~ '(simple|martial)'
    THEN CASE WHEN i.item_kind='magic_item' THEN 'magic_weapon' ELSE 'weapon' END

  WHEN LOWER(
    COALESCE(ce.name_en,'') || ' ' ||
    COALESCE(i.category,'') || ' ' ||
    COALESCE(i.subcategory,'')
  ) ~ '(tools?|supplies|instrument|artisan)'
    THEN 'tool'

  WHEN COALESCE(i.consumable,FALSE)=TRUE
    THEN 'consumable'

  WHEN i.item_kind='magic_item'
    THEN 'magic_item'

  ELSE 'gear'
END
FROM content_entities ce
WHERE i.entity_id=ce.id;

-- Every generated item card follows the repaired canonical item type.
UPDATE card_templates ct
SET
  card_type=i.item_type,
  subtitle_en=CASE i.item_type
    WHEN 'weapon' THEN 'Weapon'
    WHEN 'armor' THEN 'Armor'
    WHEN 'shield' THEN 'Shield'
    WHEN 'tool' THEN 'Tool'
    WHEN 'consumable' THEN 'Consumable'
    WHEN 'magic_weapon' THEN 'Magic Weapon'
    WHEN 'magic_armor' THEN 'Magic Armor'
    WHEN 'ammunition' THEN 'Ammunition'
    WHEN 'magic_ammunition' THEN 'Magic Ammunition'
    WHEN 'magic_item' THEN 'Magic Item'
    ELSE 'Adventuring Gear'
  END,
  data=jsonb_set(COALESCE(ct.data,'{}'::jsonb),'{itemType}',to_jsonb(i.item_type),TRUE),
  updated_at=NOW()
FROM items i
WHERE ct.source_entity_id=i.entity_id;

-- If an ordinary Pack/Pouch/Tool was equipped while misclassified,
-- safely remove only that invalid equipment flag.
UPDATE card_instances ci
SET
  state=COALESCE(ci.state,'{}'::jsonb) || '{"equipped":false}'::jsonb,
  updated_at=NOW()
FROM card_templates ct
WHERE ci.template_id=ct.id
  AND ct.card_type NOT IN ('weapon','magic_weapon','armor','magic_armor','shield')
  AND COALESCE((ci.state->>'equipped')::boolean,FALSE)=TRUE;
