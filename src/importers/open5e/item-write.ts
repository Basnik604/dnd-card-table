import { sql } from "../../db/client.js";
import { normalizeItem, propertyNames } from "./item-normalize.js";
import type { GenericRecord } from "./common.js";

export async function writeNormalizedItem(args: {
  entityId: string;
  record: GenericRecord;
  itemKind: "equipment" | "magic_item";
  detailSource?: GenericRecord | null;
}) {
  const n = normalizeItem(args.record, args.itemKind);
  const propNames = propertyNames(n.properties);

  await sql`
    INSERT INTO items (
      entity_id, item_kind, category, subcategory, rarity,
      requires_attunement, attunement_detail, cost, weight,
      damage, armor, properties, mechanics,
      item_type, weapon_category, damage_dice, versatile_damage_dice,
      damage_type, normal_range, long_range, mastery,
      armor_class_base, dex_bonus_mode, max_dex_bonus,
      strength_requirement, stealth_disadvantage,
      magic_bonus, consumable, base_item_name, charges,
      detail_source, normalization_version
    )
    VALUES (
      ${args.entityId}, ${args.itemKind}, ${n.category}, ${n.subcategory}, ${n.rarity},
      ${n.requiresAttunement}, ${n.attunementDetail},
      ${n.cost === null ? null : sql.json(n.cost as any)}, ${n.weight},
      ${n.damage === null ? null : sql.json(n.damage as any)},
      ${n.armor === null ? null : sql.json(n.armor as any)},
      ${sql.json(n.properties as any)}, ${sql.json(args.record as any)},
      ${n.itemType}, ${n.weaponCategory}, ${n.damageDice}, ${n.versatileDamageDice},
      ${n.damageType}, ${n.normalRange}, ${n.longRange}, ${n.mastery},
      ${n.armorClassBase}, ${n.dexBonusMode}, ${n.maxDexBonus},
      ${n.strengthRequirement}, ${n.stealthDisadvantage},
      ${n.magicBonus}, ${n.consumable}, ${n.baseItemName},
      ${n.charges === null ? null : sql.json(n.charges as any)},
      ${args.detailSource ? sql.json(args.detailSource as any) : null},
      4
    )
    ON CONFLICT (entity_id)
    DO UPDATE SET
      item_kind = EXCLUDED.item_kind,
      category = COALESCE(EXCLUDED.category, items.category),
      subcategory = COALESCE(EXCLUDED.subcategory, items.subcategory),
      rarity = COALESCE(EXCLUDED.rarity, items.rarity),
      requires_attunement = EXCLUDED.requires_attunement,
      attunement_detail = COALESCE(EXCLUDED.attunement_detail, items.attunement_detail),
      cost = COALESCE(EXCLUDED.cost, items.cost),
      weight = COALESCE(EXCLUDED.weight, items.weight),
      damage = COALESCE(EXCLUDED.damage, items.damage),
      armor = COALESCE(EXCLUDED.armor, items.armor),
      properties = CASE WHEN jsonb_array_length(EXCLUDED.properties) > 0 THEN EXCLUDED.properties ELSE items.properties END,
      mechanics = EXCLUDED.mechanics,
      item_type = COALESCE(EXCLUDED.item_type, items.item_type),
      weapon_category = COALESCE(EXCLUDED.weapon_category, items.weapon_category),
      damage_dice = COALESCE(EXCLUDED.damage_dice, items.damage_dice),
      versatile_damage_dice = COALESCE(EXCLUDED.versatile_damage_dice, items.versatile_damage_dice),
      damage_type = COALESCE(EXCLUDED.damage_type, items.damage_type),
      normal_range = COALESCE(EXCLUDED.normal_range, items.normal_range),
      long_range = COALESCE(EXCLUDED.long_range, items.long_range),
      mastery = COALESCE(EXCLUDED.mastery, items.mastery),
      armor_class_base = COALESCE(EXCLUDED.armor_class_base, items.armor_class_base),
      dex_bonus_mode = COALESCE(EXCLUDED.dex_bonus_mode, items.dex_bonus_mode),
      max_dex_bonus = COALESCE(EXCLUDED.max_dex_bonus, items.max_dex_bonus),
      strength_requirement = COALESCE(EXCLUDED.strength_requirement, items.strength_requirement),
      stealth_disadvantage = COALESCE(EXCLUDED.stealth_disadvantage, items.stealth_disadvantage),
      magic_bonus = COALESCE(EXCLUDED.magic_bonus, items.magic_bonus),
      consumable = EXCLUDED.consumable OR items.consumable,
      base_item_name = COALESCE(EXCLUDED.base_item_name, items.base_item_name),
      charges = COALESCE(EXCLUDED.charges, items.charges),
      detail_source = COALESCE(EXCLUDED.detail_source, items.detail_source),
      normalization_version = 4
  `;

  return { normalized: n, propertyNames: propNames };
}
