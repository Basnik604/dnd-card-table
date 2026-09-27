import { arrayValue, booleanValue, numberValue, pick, type GenericRecord } from "./common.js";
import { textValue } from "./normalize.js";

function obj(value: unknown): GenericRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as GenericRecord
    : null;
}

function deep(record: GenericRecord, ...paths: string[]): unknown {
  for (const path of paths) {
    let current: unknown = record;
    let ok = true;
    for (const part of path.split(".")) {
      const currentObj = obj(current);
      if (!currentObj || !(part in currentObj)) {
        ok = false;
        break;
      }
      current = currentObj[part];
    }
    if (ok && current !== undefined && current !== null) return current;
  }
  return undefined;
}

function text(record: GenericRecord, ...paths: string[]): string | null {
  return textValue(deep(record, ...paths));
}

function num(record: GenericRecord, ...paths: string[]): number | null {
  return numberValue(deep(record, ...paths));
}

function bool(record: GenericRecord, ...paths: string[]): boolean | null {
  const value = deep(record, ...paths);
  if (value === undefined || value === null || value === "") return null;
  return booleanValue(value);
}

function textList(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    return value.split(/[,;]/).map(v => v.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap(textList).filter(Boolean);
  }
  const asText = textValue(value);
  return asText ? [asText] : [];
}

function normalizeCategory(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}


function referenceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => textValue(v)).filter((v): v is string => Boolean(v));
}

function equipmentCategoryNames(record: GenericRecord): string[] {
  return referenceNames(deep(record, "equipment_categories", "categories"));
}

function categoryFromEquipmentCategories(record: GenericRecord): { category: string | null; subcategory: string | null } {
  const names = equipmentCategoryNames(record);
  const h = names.join(" ").toLowerCase();

  if (h.includes("armor")) {
    const specific = names.find(n => /^(light|medium|heavy) armor$/i.test(n));
    return { category: specific ? specific.replace(/\s+armor$/i, "") : "Armor", subcategory: "Armor" };
  }
  if (h.includes("weapons")) {
    return { category: "Weapon", subcategory: null };
  }
  if (h.includes("ammunition")) return { category: "Ammunition", subcategory: null };
  if (h.includes("tools") || h.includes("instruments")) {
    const specific = names.find(n => !/tools?|instruments?/i.test(n));
    return { category: "Tool", subcategory: specific ?? null };
  }
  if (names.length) {
    const specific = names.find(n => !/^adventuring gear$/i.test(n));
    return { category: "Adventuring Gear", subcategory: specific ?? null };
  }
  return { category: null, subcategory: null };
}

function weaponCategoryFromEquipmentCategories(record: GenericRecord): string | null {
  const names = equipmentCategoryNames(record);
  const h = names.join(" ").toLowerCase();
  const tier = h.includes("martial") ? "Martial" : h.includes("simple") ? "Simple" : null;
  const mode = h.includes("ranged") ? "Ranged" : h.includes("melee") ? "Melee" : null;
  if (tier && mode) return `${tier} ${mode}`;
  return tier;
}

function inferMagicBonus(record: GenericRecord): number | null {
  for (const path of [
    "magic_bonus", "bonus", "weapon_bonus", "attack_bonus", "damage_bonus",
    "bonus_attack", "bonus_damage", "modifier"
  ]) {
    const n = num(record, path);
    if (n !== null && Math.abs(n) <= 10) return n;
  }

  const name = textValue(record.name) ?? "";
  const match = name.match(/\(\s*\+(\d+)\s*\)|(?:^|\s)\+(\d+)(?:\s|$)/);
  if (match) return Number(match[1] ?? match[2]);
  return null;
}

function inferItemType(args: {
  record: GenericRecord;
  itemKind: string;
  category: string | null;
  subcategory: string | null;
}): string {
  const { record, itemKind, category, subcategory } = args;
  const name = (textValue(record.name) ?? "").toLowerCase();
  const haystack = [category, subcategory, text(record, "type", "item_type", "equipment_category")]
    .filter(Boolean).join(" ").toLowerCase();
  const magic = itemKind === "magic_item";

  const cats = equipmentCategoryNames(record).join(" ").toLowerCase();
  if (/ammunition/.test(cats) || /ammunition/.test(haystack) || /ammunition/.test(name)) return magic ? "magic_ammunition" : "ammunition";
  if ((/shield/.test(cats) || /shield/.test(haystack) || /^shield\b/.test(name)) && num(record, "armor_class.base", "base_ac", "ac") !== null) return magic ? "magic_armor" : "shield";
  if (/armor/.test(cats) || /armor|armour/.test(haystack)) return magic ? "magic_armor" : "armor";
  if (/weapons/.test(cats) || /weapon/.test(haystack) || text(record, "damage.damage_dice")) return magic ? "magic_weapon" : "weapon";
  if (/potion|scroll|consumable/.test(haystack) || /^(potion|scroll)\b/.test(name)) return "consumable";
  if (/tool/.test(haystack)) return "tool";
  if (magic) return "magic_item";
  return "gear";
}

function inferDexMode(category: string | null, record: GenericRecord): { mode: string | null; max: number | null } {
  const explicitMax = num(record, "max_dex_bonus", "max_dexterity_bonus", "armor.max_dex_bonus", "armor_class.max_bonus");
  const explicitAllowed = bool(record, "dex_bonus", "dexterity_bonus", "add_dexterity_modifier", "armor.dex_bonus", "armor_class.dex_bonus");
  if (explicitMax !== null) return { mode: "capped", max: explicitMax };
  if (explicitAllowed === false) return { mode: "none", max: 0 };
  if (explicitAllowed === true) return { mode: "full", max: null };

  const c = (category ?? "").toLowerCase();
  if (c.includes("heavy")) return { mode: "none", max: 0 };
  if (c.includes("medium")) return { mode: "capped", max: 2 };
  if (c.includes("light")) return { mode: "full", max: null };
  return { mode: null, max: null };
}

function normalizeCharges(record: GenericRecord): GenericRecord | null {
  const raw = deep(record, "charges", "charge", "uses", "resources.charges");
  if (raw && typeof raw === "object") return raw as GenericRecord;

  const max = num(record, "max_charges", "charges_max", "uses_max");
  const recharge = text(record, "recharge", "recharge_text", "charges_recharge");
  if (max === null && !recharge) return null;
  return { ...(max !== null ? { max } : {}), ...(recharge ? { recharge } : {}) };
}

export type NormalizedItem = {
  category: string | null;
  subcategory: string | null;
  rarity: string | null;
  requiresAttunement: boolean;
  attunementDetail: string | null;
  cost: unknown;
  weight: number | null;
  damage: unknown;
  armor: unknown;
  properties: unknown[];
  itemType: string;
  weaponCategory: string | null;
  damageDice: string | null;
  versatileDamageDice: string | null;
  damageType: string | null;
  normalRange: number | null;
  longRange: number | null;
  mastery: string | null;
  armorClassBase: number | null;
  dexBonusMode: string | null;
  maxDexBonus: number | null;
  strengthRequirement: number | null;
  stealthDisadvantage: boolean | null;
  magicBonus: number | null;
  consumable: boolean;
  baseItemName: string | null;
  charges: GenericRecord | null;
};

export function normalizeItem(record: GenericRecord, itemKind: string): NormalizedItem {
  const categorySet = categoryFromEquipmentCategories(record);
  const category = categorySet.category ?? normalizeCategory(textValue(pick(record, "category", "item_category", "equipment_category", "type")));
  const subcategory = categorySet.subcategory ?? normalizeCategory(textValue(pick(record, "subcategory", "sub_category", "armor_category")));
  const rarity = textValue(pick(record, "rarity", "item_rarity"));
  const attunementDetail = textValue(pick(record, "attunement_detail", "attunement"));
  const requiresAttunement = booleanValue(pick(record, "requires_attunement", "attunement_required")) ||
    Boolean(attunementDetail && !["false", "none", "no", "not required"].includes(attunementDetail.toLowerCase()));

  const rawDamage = deep(record, "damage", "damage_dice", "weapon.damage") ?? null;
  const rawArmor = deep(record, "armor", "armor_class", "ac") ?? null;
  const properties = arrayValue(deep(record, "properties", "weapon_properties", "property", "traits"));

  const weaponCategory = weaponCategoryFromEquipmentCategories(record) ?? normalizeCategory(text(record,
    "weapon_category", "weapon.category", "weapon_type"
  ));

  let damageDice = text(record,
    "damage_dice", "damage.dice", "damage.damage_dice", "damage.one_handed",
    "one_handed_damage", "damage_one_handed", "base_damage_dice"
  );
  if (!damageDice && typeof rawDamage === "string" && /\d+d\d+/i.test(rawDamage)) damageDice = rawDamage;

  const versatileDamageDice = text(record,
    "versatile_damage_dice", "versatile_damage", "damage.versatile",
    "damage.two_handed", "two_handed_damage.damage_dice", "two_handed_damage", "damage_two_handed"
  );

  const damageType = text(record,
    "damage_type.name", "damage_type", "damage.damage_type.name", "damage.type.name", "damage.type", "weapon.damage_type.name"
  );

  const normalRange = num(record,
    "normal_range", "range.normal", "range.normal_range", "range.short", "weapon_range"
  );
  const longRange = num(record,
    "long_range", "range.long", "range.long_range", "range.maximum"
  );

  const mastery = text(record,
    "mastery.name", "mastery", "mastery_property.name", "mastery_property",
    "weapon_mastery.name", "weapon_mastery"
  );

  const armorClassBase = num(record,
    "base_ac", "armor_class.base", "armor_class", "ac.base", "ac", "armor.base_ac"
  );

  const dex = inferDexMode(subcategory ?? category, record);
  const strengthRequirement = num(record,
    "strength_requirement", "str_minimum", "minimum_strength", "armor.strength_requirement"
  );
  const stealthDisadvantage = bool(record,
    "stealth_disadvantage", "disadvantage_on_stealth", "armor.stealth_disadvantage"
  );

  const magicBonus = inferMagicBonus(record);
  const name = (textValue(record.name) ?? "").toLowerCase();
  const itemType = inferItemType({ record, itemKind, category, subcategory });
  const explicitConsumable = bool(record, "consumable", "is_consumable", "consumed_on_use");
  const inferredConsumable = ["consumable", "ammunition", "magic_ammunition"].includes(itemType) ||
    /potion|scroll|ammunition/.test(name);
  const consumable = explicitConsumable ?? inferredConsumable;

  const baseItemName = text(record,
    "base_item.name", "base_item", "item.name", "item", "base_weapon.name", "base_armor.name"
  );

  return {
    category,
    subcategory,
    rarity,
    requiresAttunement,
    attunementDetail,
    cost: deep(record, "cost", "price") ?? null,
    weight: num(record, "weight", "weight_lb", "weight_lbs"),
    damage: rawDamage,
    armor: rawArmor,
    properties,
    itemType,
    weaponCategory,
    damageDice,
    versatileDamageDice,
    damageType,
    normalRange,
    longRange,
    mastery,
    armorClassBase,
    dexBonusMode: dex.mode,
    maxDexBonus: dex.max,
    strengthRequirement,
    stealthDisadvantage,
    magicBonus,
    consumable,
    baseItemName,
    charges: normalizeCharges(record)
  };
}

export function propertyNames(properties: unknown[]): string[] {
  return properties.flatMap(textList).filter(Boolean);
}
