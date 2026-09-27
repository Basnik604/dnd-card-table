import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { sql } from "../db/client.js";

type J = Record<string, any>;

const EQUIPMENT_URL =
  "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Equipment.json";
const MAGIC_URL =
  "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Magic-Items.json";

function normName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[’‘`´]/g, "'")
    .replace(/\+/g, " plus ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tagPart(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return s || null;
}

function n(value: unknown): number | null {
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}

function names(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((x: any) => cleanText(x?.name ?? x)).filter(Boolean) as string[];
}

function costObj(source: J): J | null {
  const c = source?.cost;
  if (!c || typeof c !== "object") return null;
  const quantity = n(c.quantity ?? c.amount ?? c.value);
  const unit = cleanText(c.unit ?? c.currency);
  return quantity === null ? null : { quantity, ...(unit ? { unit } : {}) };
}

function moneyText(c: J | null): string {
  if (!c) return "";
  return `${c.quantity}${c.unit ? ` ${String(c.unit).toUpperCase()}` : ""}`;
}

function rangeText(normal: number | null, long: number | null): string {
  if (normal === null) return "";
  return long !== null ? `${normal}/${long} ft.` : `${normal} ft.`;
}

const W = (category:string, damage:string, damageType:string, mastery:string, properties:string[]=[], versatile:string|null=null, normal:number|null=null, long:number|null=null) =>
  ({ category, damage, damageType, mastery, properties, versatile, normal, long });

/* Official SRD 5.2.1 weapon table, pp. 90-91.  This table intentionally
   contains the mechanical fields most likely to break gameplay. */
const OFFICIAL_WEAPONS = Object.fromEntries([
  ["Club", W("Simple Melee","1d4","Bludgeoning","Slow",["Light"])],
  ["Dagger", W("Simple Melee","1d4","Piercing","Nick",["Finesse","Light","Thrown"],null,20,60)],
  ["Greatclub", W("Simple Melee","1d8","Bludgeoning","Push",["Two-Handed"])],
  ["Handaxe", W("Simple Melee","1d6","Slashing","Vex",["Light","Thrown"],null,20,60)],
  ["Javelin", W("Simple Melee","1d6","Piercing","Slow",["Thrown"],null,30,120)],
  ["Light Hammer", W("Simple Melee","1d4","Bludgeoning","Nick",["Light","Thrown"],null,20,60)],
  ["Mace", W("Simple Melee","1d6","Bludgeoning","Sap",[])],
  ["Quarterstaff", W("Simple Melee","1d6","Bludgeoning","Topple",["Versatile"],"1d8")],
  ["Sickle", W("Simple Melee","1d4","Slashing","Nick",["Light"])],
  ["Spear", W("Simple Melee","1d6","Piercing","Sap",["Thrown","Versatile"],"1d8",20,60)],
  ["Dart", W("Simple Ranged","1d4","Piercing","Vex",["Finesse","Thrown"],null,20,60)],
  ["Light Crossbow", W("Simple Ranged","1d8","Piercing","Slow",["Ammunition","Loading","Two-Handed"],null,80,320)],
  ["Shortbow", W("Simple Ranged","1d6","Piercing","Vex",["Ammunition","Two-Handed"],null,80,320)],
  ["Sling", W("Simple Ranged","1d4","Bludgeoning","Slow",["Ammunition"],null,30,120)],
  ["Battleaxe", W("Martial Melee","1d8","Slashing","Topple",["Versatile"],"1d10")],
  ["Flail", W("Martial Melee","1d8","Bludgeoning","Sap",[])],
  ["Glaive", W("Martial Melee","1d10","Slashing","Graze",["Heavy","Reach","Two-Handed"])],
  ["Greataxe", W("Martial Melee","1d12","Slashing","Cleave",["Heavy","Two-Handed"])],
  ["Greatsword", W("Martial Melee","2d6","Slashing","Graze",["Heavy","Two-Handed"])],
  ["Halberd", W("Martial Melee","1d10","Slashing","Cleave",["Heavy","Reach","Two-Handed"])],
  ["Lance", W("Martial Melee","1d10","Piercing","Topple",["Heavy","Reach","Two-Handed"])],
  ["Longsword", W("Martial Melee","1d8","Slashing","Sap",["Versatile"],"1d10")],
  ["Maul", W("Martial Melee","2d6","Bludgeoning","Topple",["Heavy","Two-Handed"])],
  ["Morningstar", W("Martial Melee","1d8","Piercing","Sap",[])],
  ["Pike", W("Martial Melee","1d10","Piercing","Push",["Heavy","Reach","Two-Handed"])],
  ["Rapier", W("Martial Melee","1d8","Piercing","Vex",["Finesse"])],
  ["Scimitar", W("Martial Melee","1d6","Slashing","Nick",["Finesse","Light"])],
  ["Shortsword", W("Martial Melee","1d6","Piercing","Vex",["Finesse","Light"])],
  ["Trident", W("Martial Melee","1d8","Piercing","Topple",["Thrown","Versatile"],"1d10",20,60)],
  ["Warhammer", W("Martial Melee","1d8","Bludgeoning","Push",["Versatile"],"1d10")],
  ["War Pick", W("Martial Melee","1d8","Piercing","Sap",["Versatile"],"1d10")],
  ["Whip", W("Martial Melee","1d4","Slashing","Slow",["Finesse","Reach"])],
  ["Blowgun", W("Martial Ranged","1","Piercing","Vex",["Ammunition","Loading"],null,25,100)],
  ["Hand Crossbow", W("Martial Ranged","1d6","Piercing","Vex",["Ammunition","Light","Loading"],null,30,120)],
  ["Heavy Crossbow", W("Martial Ranged","1d10","Piercing","Push",["Ammunition","Heavy","Loading","Two-Handed"],null,100,400)],
  ["Longbow", W("Martial Ranged","1d8","Piercing","Slow",["Ammunition","Heavy","Two-Handed"],null,150,600)],
  ["Musket", W("Martial Ranged","1d12","Piercing","Slow",["Ammunition","Loading","Two-Handed"],null,40,120)],
  ["Pistol", W("Martial Ranged","1d10","Piercing","Vex",["Ammunition","Loading"],null,30,90)]
].map(([name,data]) => [normName(name), data])) as Record<string, J>;

const A = (category:string, ac:number, dexMode:"full"|"capped"|"none", maxDex:number|null, strength:number|null, stealth:boolean, don:string, doff:string) =>
  ({ category, ac, dexMode, maxDex, strength, stealth, don, doff });

/* Official SRD 5.2.1 armor table, p. 91. */
const OFFICIAL_ARMOR = Object.fromEntries([
  ["Padded Armor", A("Light",11,"full",null,null,true,"1 minute","1 minute")],
  ["Leather Armor", A("Light",11,"full",null,null,false,"1 minute","1 minute")],
  ["Studded Leather Armor", A("Light",12,"full",null,null,false,"1 minute","1 minute")],
  ["Hide Armor", A("Medium",12,"capped",2,null,false,"5 minutes","1 minute")],
  ["Chain Shirt", A("Medium",13,"capped",2,null,false,"5 minutes","1 minute")],
  ["Scale Mail", A("Medium",14,"capped",2,null,true,"5 minutes","1 minute")],
  ["Breastplate", A("Medium",14,"capped",2,null,false,"5 minutes","1 minute")],
  ["Half Plate Armor", A("Medium",15,"capped",2,null,true,"5 minutes","1 minute")],
  ["Ring Mail", A("Heavy",14,"none",0,null,true,"10 minutes","5 minutes")],
  ["Chain Mail", A("Heavy",16,"none",0,13,true,"10 minutes","5 minutes")],
  ["Splint Armor", A("Heavy",17,"none",0,15,true,"10 minutes","5 minutes")],
  ["Plate Armor", A("Heavy",18,"none",0,15,true,"10 minutes","5 minutes")],
  ["Shield", A("Shield",2,"none",0,null,false,"Utilize action","Utilize action")]
].map(([name,data]) => [normName(name), data])) as Record<string, J>;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "dnd-card-table-item-audit/0.14" }
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function equipmentCategories(s: J): string[] {
  return names(s?.equipment_categories);
}

function weaponGroup(cats: string[]): string | null {
  const h = cats.join(" ").toLowerCase();
  const tier = h.includes("martial") ? "Martial" : h.includes("simple") ? "Simple" : null;
  const mode = h.includes("ranged") ? "Ranged" : h.includes("melee") ? "Melee" : null;
  if (tier && mode) return `${tier} ${mode}`;
  if (tier) return tier;
  return null;
}

function specialSubcategory(cats: string[], excluded: RegExp): string | null {
  return cats.find(x => !excluded.test(x.toLowerCase())) ?? null;
}

function inferEquipmentType(s: J): string {
  const cats = equipmentCategories(s);
  const h = cats.join(" ").toLowerCase();
  if (h.includes("ammunition")) return "ammunition";
  if (h.includes("armor")) {
    if (normName(s?.name) === "shield") return "shield";
    return "armor";
  }
  if (h.includes("weapons")) return "weapon";
  if (h.includes("tools") || h.includes("instruments")) return "tool";
  return "gear";
}

function deriveEquipment(s: J): J {
  const type = inferEquipmentType(s);
  const cats = equipmentCategories(s);
  const group = weaponGroup(cats);
  const damageDice = cleanText(s?.damage?.damage_dice);
  const damageType = cleanText(s?.damage?.damage_type?.name);
  const versatile = cleanText(s?.two_handed_damage?.damage_dice);
  const props = names(s?.properties);
  const mastery = cleanText(s?.mastery?.name);
  const normal = n(s?.range?.normal);
  const long = n(s?.range?.long);
  const ac = n(s?.armor_class?.base);
  const dexAllowed = s?.armor_class?.dex_bonus;
  const maxBonus = n(s?.armor_class?.max_bonus);
  let dexMode: string | null = null;
  let maxDex: number | null = null;
  if (type === "armor") {
    if (dexAllowed === false) { dexMode = "none"; maxDex = 0; }
    else if (maxBonus !== null) { dexMode = "capped"; maxDex = maxBonus; }
    else if (dexAllowed === true) { dexMode = "full"; }
  } else if (type === "shield") {
    dexMode = "none"; maxDex = 0;
  }

  let category: string | null;
  let subcategory: string | null;
  if (type === "weapon") {
    category = "Weapon"; subcategory = group;
  } else if (type === "armor") {
    const armorCat = cats.find(x => /light armor|medium armor|heavy armor/i.test(x));
    category = armorCat ? armorCat.replace(/\s+Armor$/i,"") : "Armor";
    subcategory = "Armor";
  } else if (type === "shield") {
    category = "Shield"; subcategory = "Armor";
  } else if (type === "tool") {
    category = "Tool";
    subcategory = specialSubcategory(cats, /tools?|instruments?/i);
  } else if (type === "ammunition") {
    category = "Ammunition";
    subcategory = null;
  } else {
    category = "Adventuring Gear";
    subcategory = specialSubcategory(cats, /adventuring gear/i);
  }

  const canonicalData: J = {
    source_index: s?.index ?? null,
    equipment_categories: cats,
    ability: s?.ability?.name ?? null,
    utilize: Array.isArray(s?.utilize) ? s.utilize : [],
    craft: names(s?.craft),
    contents: Array.isArray(s?.contents) ? s.contents.map((x:any) => ({
      name: x?.item?.name ?? null, quantity: x?.quantity ?? null
    })) : [],
    storage: s?.storage?.name ?? null,
    quantity: s?.quantity ?? null,
    ammunition: s?.ammunition?.name ?? null,
    don_time: s?.don_time ?? null,
    doff_time: s?.doff_time ?? null,
    image: s?.image ?? null,
    url: s?.url ?? null
  };

  return {
    itemType: type,
    category,
    subcategory,
    weaponCategory: type === "weapon" ? group : null,
    damageDice,
    versatileDamageDice: versatile,
    damageType,
    normalRange: normal,
    longRange: long,
    mastery,
    armorClassBase: ac,
    dexBonusMode: dexMode,
    maxDexBonus: maxDex,
    strengthRequirement: n(s?.str_minimum) || null,
    stealthDisadvantage: typeof s?.stealth_disadvantage === "boolean" ? s.stealth_disadvantage : null,
    properties: props,
    cost: costObj(s),
    weight: n(s?.weight),
    consumable: type === "ammunition" || /potion|scroll/i.test(String(s?.name ?? "")),
    canonicalData
  };
}

function applyOfficial(name: string, c: J): { canonical:J, official:boolean } {
  const key = normName(name);
  const w = OFFICIAL_WEAPONS[key];
  if (w) {
    return {
      official: true,
      canonical: {
        ...c,
        itemType: "weapon",
        category: "Weapon",
        subcategory: w.category,
        weaponCategory: w.category,
        damageDice: w.damage,
        damageType: w.damageType,
        versatileDamageDice: w.versatile,
        normalRange: w.normal,
        longRange: w.long,
        mastery: w.mastery,
        properties: w.properties,
        canonicalData: { ...(c.canonicalData ?? {}), official_srd_5_2_1: w }
      }
    };
  }
  const a = OFFICIAL_ARMOR[key];
  if (a) {
    return {
      official: true,
      canonical: {
        ...c,
        itemType: a.category === "Shield" ? "shield" : "armor",
        category: a.category,
        subcategory: "Armor",
        weaponCategory: null,
        damageDice: null,
        versatileDamageDice: null,
        damageType: null,
        normalRange: null,
        longRange: null,
        mastery: null,
        armorClassBase: a.ac,
        dexBonusMode: a.dexMode,
        maxDexBonus: a.maxDex,
        strengthRequirement: a.strength,
        stealthDisadvantage: a.stealth,
        canonicalData: {
          ...(c.canonicalData ?? {}),
          don_time: a.don,
          doff_time: a.doff,
          official_srd_5_2_1: a
        }
      }
    };
  }
  return { official: false, canonical: c };
}

const STANDARD_BASE_ITEMS = new Set([
  ...Object.keys(OFFICIAL_WEAPONS),
  ...Object.keys(OFFICIAL_ARMOR)
]);

function baseItemFromMagic(name: string, desc: string): string | null {
  const whole = normName(`${name} ${desc.split("\n")[0] ?? ""}`);
  let best: string | null = null;
  for (const key of STANDARD_BASE_ITEMS) {
    if (whole.includes(key) && (!best || key.length > best.length)) best = key;
  }
  if (!best) return null;
  const title = [...Object.entries(OFFICIAL_WEAPONS), ...Object.entries(OFFICIAL_ARMOR)]
    .find(([k]) => k === best)?.[0];
  /* The map key is normalized, so reconstruct from source text only when exact
     standard identity can be inferred later by title matching. */
  const candidates = [
    "Padded Armor","Leather Armor","Studded Leather Armor","Hide Armor","Chain Shirt",
    "Scale Mail","Breastplate","Half Plate Armor","Ring Mail","Chain Mail","Splint Armor",
    "Plate Armor","Shield","Club","Dagger","Greatclub","Handaxe","Javelin","Light Hammer",
    "Mace","Quarterstaff","Sickle","Spear","Dart","Light Crossbow","Shortbow","Sling",
    "Battleaxe","Flail","Glaive","Greataxe","Greatsword","Halberd","Lance","Longsword",
    "Maul","Morningstar","Pike","Rapier","Scimitar","Shortsword","Trident","Warhammer",
    "War Pick","Whip","Blowgun","Hand Crossbow","Heavy Crossbow","Longbow","Musket","Pistol"
  ];
  return candidates.find(x => normName(x) === best) ?? null;
}

function magicBonus(name: string): number | null {
  const m = name.match(/(?:^|[\s,(])\+([123])(?:\b|[),\s])/);
  return m ? Number(m[1]) : null;
}

function deriveMagic(s: J): J {
  const name = cleanText(s?.name) ?? "";
  const desc = cleanText(s?.desc) ?? "";
  const eq = cleanText(s?.equipment_category?.name) ?? "Magic Item";
  const base = baseItemFromMagic(name, desc);
  const baseKey = base ? normName(base) : null;
  const armorBase = baseKey ? OFFICIAL_ARMOR[baseKey] : null;
  const weaponBase = baseKey ? OFFICIAL_WEAPONS[baseKey] : null;
  const isAmmo = /ammunition/i.test(eq) || /ammunition/i.test(name);
  const consumable = /potion|scroll/i.test(eq) || /potion|scroll/i.test(name) || isAmmo;

  let itemType = "magic_item";
  if (isAmmo) itemType = "magic_ammunition";
  else if (armorBase) itemType = armorBase.category === "Shield" ? "magic_armor" : "magic_armor";
  else if (weaponBase) itemType = "magic_weapon";

  return {
    itemType,
    category: eq,
    subcategory: null,
    rarity: cleanText(s?.rarity?.name),
    requiresAttunement: Boolean(s?.attunement),
    attunementDetail: s?.attunement ? "Required" : null,
    consumable,
    baseItemName: base,
    magicBonus: magicBonus(name),
    description: desc || null,
    armorClassBase: armorBase ? armorBase.ac : null,
    dexBonusMode: armorBase ? armorBase.dexMode : null,
    maxDexBonus: armorBase ? armorBase.maxDex : null,
    strengthRequirement: armorBase ? armorBase.strength : null,
    stealthDisadvantage: armorBase ? armorBase.stealth : null,
    damageDice: weaponBase ? weaponBase.damage : null,
    versatileDamageDice: weaponBase ? weaponBase.versatile : null,
    damageType: weaponBase ? weaponBase.damageType : null,
    normalRange: weaponBase ? weaponBase.normal : null,
    longRange: weaponBase ? weaponBase.long : null,
    mastery: weaponBase ? weaponBase.mastery : null,
    weaponCategory: weaponBase ? weaponBase.category : null,
    properties: weaponBase ? weaponBase.properties : [],
    canonicalData: {
      source_index: s?.index ?? null,
      equipment_category: eq,
      variants: Array.isArray(s?.variants) ? s.variants : [],
      variant: Boolean(s?.variant),
      image: s?.image ?? null,
      url: s?.url ?? null,
      ...(base ? { base_item: base } : {})
    }
  };
}

function generatedEquipmentDescription(name: string, c: J, s: J): string {
  const provided = cleanText(s?.description);
  if (provided) return provided;

  if (c.itemType === "weapon") {
    const bits = [
      c.weaponCategory ? `${c.weaponCategory} weapon.` : "Weapon.",
      c.damageDice && c.damageType ? `Damage: ${c.damageDice} ${c.damageType}.` : null,
      c.normalRange !== null ? `Range: ${rangeText(c.normalRange,c.longRange)}.` : null,
      c.versatileDamageDice ? `Versatile: ${c.versatileDamageDice}.` : null,
      c.properties?.length ? `Properties: ${c.properties.join(", ")}.` : null,
      c.mastery ? `Mastery: ${c.mastery}.` : null
    ].filter(Boolean);
    return bits.join(" ");
  }

  if (c.itemType === "armor" || c.itemType === "shield") {
    const ac = c.itemType === "shield"
      ? `AC bonus: +${c.armorClassBase ?? 2}.`
      : `Base AC: ${c.armorClassBase ?? "—"}${c.dexBonusMode==="full"?" + Dexterity modifier":c.dexBonusMode==="capped"?` + Dexterity modifier (max +${c.maxDexBonus ?? 2})`:""}.`;
    const bits = [
      c.itemType === "shield" ? "Shield." : `${c.category} armor.`,
      ac,
      c.strengthRequirement ? `Strength ${c.strengthRequirement} required to avoid the speed penalty.` : null,
      c.stealthDisadvantage ? "Disadvantage on Dexterity (Stealth) checks." : null,
      c.canonicalData?.don_time ? `Don: ${c.canonicalData.don_time}.` : null,
      c.canonicalData?.doff_time ? `Doff: ${c.canonicalData.doff_time}.` : null
    ].filter(Boolean);
    return bits.join(" ");
  }

  if (c.itemType === "tool") {
    const bits = [
      c.subcategory ? `${c.subcategory}.` : "Tool.",
      c.canonicalData?.ability ? `Ability: ${c.canonicalData.ability}.` : null,
      c.canonicalData?.utilize?.length
        ? `Utilize: ${c.canonicalData.utilize.map((u:any) => {
            const dc = u?.dc?.dc_value ? ` (DC ${u.dc.dc_value})` : "";
            return `${u?.name ?? "Use"}${dc}`;
          }).join("; ")}.`
        : null,
      c.canonicalData?.craft?.length ? `Craft: ${c.canonicalData.craft.join(", ")}.` : null
    ].filter(Boolean);
    return bits.join(" ");
  }

  if (c.canonicalData?.contents?.length) {
    return `${name} contains: ${c.canonicalData.contents.map((x:any) =>
      `${x.quantity && x.quantity !== 1 ? `${x.quantity} × ` : ""}${x.name}`
    ).join(", ")}.`;
  }

  if (c.canonicalData?.quantity && c.canonicalData?.storage) {
    return `Ammunition supplied in quantities of ${c.canonicalData.quantity}; stored in ${c.canonicalData.storage}.`;
  }

  return cleanText(s?.description) ?? `${name}.`;
}

function comparable(v: any): string {
  if (v === undefined) return "undefined";
  return JSON.stringify(v);
}

function changedFields(row: J, c: J): string[] {
  const map: Record<string,string> = {
    item_type:"itemType", category:"category", subcategory:"subcategory",
    weapon_category:"weaponCategory", damage_dice:"damageDice",
    versatile_damage_dice:"versatileDamageDice", damage_type:"damageType",
    normal_range:"normalRange", long_range:"longRange", mastery:"mastery",
    armor_class_base:"armorClassBase", dex_bonus_mode:"dexBonusMode",
    max_dex_bonus:"maxDexBonus", strength_requirement:"strengthRequirement",
    stealth_disadvantage:"stealthDisadvantage", rarity:"rarity",
    requires_attunement:"requiresAttunement", magic_bonus:"magicBonus",
    base_item_name:"baseItemName", consumable:"consumable"
  };
  return Object.entries(map)
    .filter(([db,k]) => k in c && comparable(row[db] ?? null) !== comparable(c[k] ?? null))
    .map(([db]) => db);
}

function itemTypeLabel(type:string): string {
  const labels:Record<string,string> = {
    weapon:"Weapon", armor:"Armor", shield:"Shield", ammunition:"Ammunition",
    magic_weapon:"Magic Weapon", magic_armor:"Magic Armor",
    magic_ammunition:"Magic Ammunition", consumable:"Consumable",
    tool:"Tool", gear:"Adventuring Gear", magic_item:"Magic Item"
  };
  return labels[type] ?? "Item";
}

function cardActions(c:J, description:string): J[] {
  if (["weapon","magic_weapon"].includes(c.itemType) && c.damageDice) {
    const a:J[] = [{
      name:"Roll base damage", kind:"damage",
      description:"Base weapon damage.", formula:String(c.damageDice)
    }];
    if (c.versatileDamageDice) a.push({
      name:"Roll versatile damage", kind:"damage",
      description:"Versatile base weapon damage.", formula:String(c.versatileDamageDice)
    });
    return a;
  }
  if (["armor","magic_armor","shield"].includes(c.itemType)) {
    return [{name:"Equip",kind:"equip",description:"Equip this item on a character.",formula:null}];
  }
  if (c.consumable) {
    return [{name:"Use",kind:"use",description,formula:null}];
  }
  return [];
}

async function replaceCanonicalTags(entityId:string, c:J, itemKind:string) {
  await sql`
    DELETE FROM entity_tags
    WHERE entity_id=${entityId}
      AND (
        tag LIKE 'category:%'
        OR tag LIKE 'subcategory:%'
        OR tag LIKE 'detail:%'
        OR tag LIKE 'item-type:%'
        OR tag LIKE 'weapon-category:%'
        OR tag LIKE 'mastery:%'
        OR tag LIKE 'rarity:%'
        OR tag LIKE 'property:%'
      )
  `;
  const tags = [
    "item",
    itemKind === "magic_item" ? "magic-item" : "equipment",
    `item-type:${tagPart(c.itemType)}`,
    c.category ? `category:${tagPart(c.category)}` : null,
    c.subcategory ? `subcategory:${tagPart(c.subcategory)}` : null,
    c.weaponCategory ? `weapon-category:${tagPart(c.weaponCategory)}` : null,
    c.mastery ? `mastery:${tagPart(c.mastery)}` : null,
    c.rarity ? `rarity:${tagPart(c.rarity)}` : null,
    ...(Array.isArray(c.properties) ? c.properties.map((p:string) => `property:${tagPart(p)}`) : [])
  ].filter(Boolean) as string[];
  for (const tag of [...new Set(tags)]) {
    await sql`INSERT INTO entity_tags(entity_id,tag) VALUES(${entityId},${tag}) ON CONFLICT DO NOTHING`;
  }
}

async function refreshCard(entityId:string, name:string, description:string, c:J) {
  const existing = await sql`
    SELECT id::text,data FROM card_templates
    WHERE source_entity_id=${entityId}
    LIMIT 1
  `;
  if (!existing.length) return false;
  const oldData = existing[0].data && typeof existing[0].data==="object" ? existing[0].data : {};
  const data = {
    ...oldData,
    itemType:c.itemType,
    category:c.category,
    weaponCategory:c.weaponCategory,
    rarity:c.rarity ?? oldData.rarity ?? null,
    attunement:c.requiresAttunement ?? false,
    cost:c.cost ?? oldData.cost ?? null,
    weight:c.weight ?? oldData.weight ?? null,
    damageDice:c.damageDice ?? null,
    versatileDamageDice:c.versatileDamageDice ?? null,
    damageType:c.damageType ?? null,
    range:c.normalRange !== null && c.normalRange !== undefined
      ? rangeText(c.normalRange,c.longRange ?? null) : null,
    mastery:c.mastery ?? null,
    armorClass:c.armorClassBase ?? null,
    dexBonusMode:c.dexBonusMode ?? null,
    maxDexBonus:c.maxDexBonus ?? null,
    strengthRequirement:c.strengthRequirement ?? null,
    stealthDisadvantage:c.stealthDisadvantage ?? null,
    magicBonus:c.magicBonus ?? null,
    consumable:Boolean(c.consumable),
    properties:c.properties ?? [],
    baseItem:c.baseItemName ?? null,
    canonical:c.canonicalData ?? null
  };
  await sql`
    UPDATE card_templates
    SET card_type=${c.itemType},
        subtitle_en=${[itemTypeLabel(c.itemType),c.rarity].filter(Boolean).join(" · ")},
        description_en=${description},
        data=${sql.json(data)},
        actions=${sql.json(cardActions(c,description))},
        updated_at=NOW()
    WHERE id=${existing[0].id}
  `;
  return true;
}

async function main() {
  console.log("Fetching independent structured SRD 2024 reference datasets...");
  const [equipmentRaw, magicRaw] = await Promise.all([
    fetchJson(EQUIPMENT_URL),
    fetchJson(MAGIC_URL)
  ]);
  if (!Array.isArray(equipmentRaw) || !Array.isArray(magicRaw)) {
    throw new Error("Reference source returned an unexpected shape.");
  }

  const equipmentMap = new Map(equipmentRaw.map((x:J) => [normName(x.name), x]));
  const magicMap = new Map(magicRaw.map((x:J) => [normName(x.name), x]));

  const rows = await sql`
    SELECT ce.id::text,ce.name_en,ce.description_en,ce.raw_source,
           cs.provider,cs.document_key,
           i.*
    FROM items i
    JOIN content_entities ce ON ce.id=i.entity_id
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    ORDER BY i.item_kind,ce.name_en
  `;

  const report:J = {
    generated_at:new Date().toISOString(),
    total:rows.length,
    equipment:0,
    magic_items:0,
    matched:0,
    official_three_source:0,
    corrected:0,
    card_templates_refreshed:0,
    unmatched:[],
    corrected_items:[],
    sources:{
      imported:"Open5e srd-2024 / current local DB",
      structured_equipment:EQUIPMENT_URL,
      structured_magic_items:MAGIC_URL,
      official:"D&D SRD v5.2.1 weapon/armor tables (embedded canonical mechanical table)"
    }
  };

  for (const row of rows) {
    const kind = String(row.item_kind);
    if (kind === "magic_item") report.magic_items++;
    else report.equipment++;

    const key = normName(row.name_en);
    const source = kind === "magic_item" ? magicMap.get(key) : equipmentMap.get(key);

    if (!source) {
      report.unmatched.push({
        name:row.name_en,
        kind,
        current_type:row.item_type,
        note:"No exact normalized-name match in independent 5e-bits SRD 2024 dataset; record left unchanged."
      });
      await sql`
        UPDATE items SET
          audit_status='open5e-only',
          audit_sources=${sql.json([{
            provider:row.provider ?? "open5e",
            document:row.document_key ?? "srd-2024"
          }])},
          audited_at=NOW()
        WHERE entity_id=${row.id}
      `;
      continue;
    }

    report.matched++;
    let c:J;
    let official = false;
    let description:string;

    if (kind === "magic_item") {
      c = deriveMagic(source);
      description = c.description || row.description_en || `${row.name_en}.`;
    } else {
      const derived = deriveEquipment(source);
      const applied = applyOfficial(row.name_en,derived);
      c = applied.canonical;
      official = applied.official;
      if (official) report.official_three_source++;
      description = generatedEquipmentDescription(row.name_en,c,source);
      c.cost = c.cost ?? row.cost ?? null;
      c.weight = c.weight ?? (row.weight == null ? null : Number(row.weight));
    }

    const changed = changedFields(row,c);
    const descriptionChanged = cleanText(row.description_en) !== cleanText(description);
    if (changed.length || descriptionChanged) {
      report.corrected++;
      report.corrected_items.push({
        name:row.name_en,
        kind,
        fields:[...changed,...(descriptionChanged?["description_en"]:[])],
        verification:official ? "3-source" : "2-source"
      });
    }

    const auditSources = [
      {
        provider:row.provider ?? "open5e",
        document:row.document_key ?? "srd-2024",
        role:"original import"
      },
      {
        provider:"5e-bits/5e-database",
        document:"2024 SRD structured data",
        key:source.index ?? null,
        role:"independent structured cross-check"
      },
      ...(official ? [{
        provider:"Wizards of the Coast / D&D Beyond",
        document:"SRD v5.2.1",
        role:"official weapon/armor mechanical table"
      }] : [])
    ];

    const status = official ? "verified-3-source" : "verified-2-source";

    await sql.begin(async tx => {
      await tx`
        UPDATE items SET
          category=${c.category ?? null},
          subcategory=${c.subcategory ?? null},
          rarity=${c.rarity ?? row.rarity ?? null},
          requires_attunement=${c.requiresAttunement ?? row.requires_attunement ?? false},
          attunement_detail=${c.attunementDetail ?? null},
          cost=${c.cost !== undefined && c.cost !== null ? tx.json(c.cost) : row.cost},
          weight=${c.weight ?? row.weight ?? null},
          damage=${c.damageDice || c.damageType ? tx.json({
            damage_dice:c.damageDice ?? null,
            damage_type:c.damageType ?? null
          }) : null},
          armor=${c.armorClassBase !== undefined && c.armorClassBase !== null ? tx.json({
            base:c.armorClassBase,
            dex_bonus:c.dexBonusMode==="full" || c.dexBonusMode==="capped",
            max_bonus:c.maxDexBonus ?? null
          }) : null},
          properties=${tx.json(c.properties ?? [])},
          item_type=${c.itemType},
          weapon_category=${c.weaponCategory ?? null},
          damage_dice=${c.damageDice ?? null},
          versatile_damage_dice=${c.versatileDamageDice ?? null},
          damage_type=${c.damageType ?? null},
          normal_range=${c.normalRange ?? null},
          long_range=${c.longRange ?? null},
          mastery=${c.mastery ?? null},
          armor_class_base=${c.armorClassBase ?? null},
          dex_bonus_mode=${c.dexBonusMode ?? null},
          max_dex_bonus=${c.maxDexBonus ?? null},
          strength_requirement=${c.strengthRequirement ?? null},
          stealth_disadvantage=${c.stealthDisadvantage ?? null},
          magic_bonus=${c.magicBonus ?? row.magic_bonus ?? null},
          consumable=${Boolean(c.consumable)},
          base_item_name=${c.baseItemName ?? null},
          canonical_data=${tx.json(c.canonicalData ?? {})},
          audit_sources=${tx.json(auditSources)},
          audit_status=${status},
          audited_at=NOW(),
          normalization_version=4
        WHERE entity_id=${row.id}
      `;
      await tx`
        UPDATE content_entities SET
          description_en=${description},
          updated_at=NOW()
        WHERE id=${row.id}
      `;
    });

    await replaceCanonicalTags(row.id,c,kind);
    if (await refreshCard(row.id,row.name_en,description,c)) report.card_templates_refreshed++;
  }

  report.unmatched_count = report.unmatched.length;
  report.coverage_percent = report.total ? Number(((report.matched/report.total)*100).toFixed(2)) : 0;

  await writeFile("item-audit-report.json",JSON.stringify(report,null,2),"utf8");

  console.log("");
  console.log("=== ITEM LIBRARY AUDIT COMPLETE ===");
  console.log(`Total local items: ${report.total}`);
  console.log(`Equipment: ${report.equipment}`);
  console.log(`Magic items: ${report.magic_items}`);
  console.log(`Matched independent SRD dataset: ${report.matched} (${report.coverage_percent}%)`);
  console.log(`Official SRD weapon/armor 3-source checks: ${report.official_three_source}`);
  console.log(`Records corrected/enriched: ${report.corrected}`);
  console.log(`Existing cards refreshed: ${report.card_templates_refreshed}`);
  console.log(`Unmatched / preserved as-is: ${report.unmatched_count}`);
  console.log("Detailed report: item-audit-report.json");
  if (report.unmatched_count) {
    console.log("");
    console.log("Unmatched entries were NOT guessed or overwritten.");
    console.log("Share item-audit-report.json if you want the remaining names reconciled manually.");
  }
}

try {
  await main();
} finally {
  await sql.end();
}
