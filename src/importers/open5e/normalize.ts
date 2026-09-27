import type { Open5eCreature, Open5eNamedBlock } from "../../types/open5e.js";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function externalKey(c: Open5eCreature): string {
  return String(c.key ?? c.slug ?? slugify(c.name));
}

export function description(c: Open5eCreature): string | null {
  return String(c.desc ?? c.description ?? "").trim() || null;
}

export function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(textValue)
      .filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ") : null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    // Open5e display helpers are preferable to dumping nested serializer data.
    for (const key of ["as_string", "display", "display_name", "name", "label", "value", "key", "slug"]) {
      if (key in record) {
        const result = textValue(record[key]);
        if (result) return result;
      }
    }
  }

  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["score", "value", "total", "bonus", "decimal"]) {
      if (key in record) {
        const result = numberValue(record[key]);
        if (result !== null) return result;
      }
    }
  }
  return null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function abilityScore(c: Open5eCreature, full: string, short: string): number | null {
  const direct = numberValue(c[full]);
  if (direct !== null) return direct;

  const grouped = objectRecord(c.ability_scores);
  if (!grouped) return null;

  for (const key of [full, short, short.toUpperCase()]) {
    if (key in grouped) {
      const result = numberValue(grouped[key]);
      if (result !== null) return result;
    }
  }
  return null;
}

function normalizeSpeed(value: unknown): Record<string, unknown> {
  const record = objectRecord(value);
  if (!record) return {};

  const unitRaw = textValue(record.unit) ?? "feet";
  const unit = unitRaw.toLowerCase().startsWith("foot") || unitRaw.toLowerCase().startsWith("feet") ? "ft" : unitRaw;
  const result: Record<string, unknown> = {};

  for (const key of ["walk", "fly", "swim", "burrow", "climb"]) {
    const n = numberValue(record[key]);
    if (n !== null) result[key] = n;
  }
  if (record.hover === true) result.hover = true;
  if (Object.keys(result).length) result.unit = unit;

  // If Open5e changes shape again, retain a useful display string when present.
  const display = textValue(record.as_string ?? record.display);
  if (display) result.as_string = display;
  return result;
}

function normalizeTextList(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];

  if (typeof value === "string") {
    return value.split(",").map(v => v.trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map(textValue).filter((v): v is string => Boolean(v));
  }

  const record = objectRecord(value);
  if (record) {
    const display = textValue(record.as_string ?? record.display);
    if (display) return [display];

    for (const key of ["data", "values", "items"]) {
      if (key in record) {
        const nested = normalizeTextList(record[key]);
        if (nested.length) return nested;
      }
    }

    const direct = textValue(record);
    return direct ? [direct] : [];
  }

  const direct = textValue(value);
  return direct ? [direct] : [];
}

function normalizeBonusObject(value: unknown): Record<string, number> {
  const record = objectRecord(value);
  if (!record) return {};
  const result: Record<string, number> = {};

  for (const [key, raw] of Object.entries(record)) {
    const n = numberValue(raw);
    if (n !== null) result[key] = n;
  }
  return result;
}

function normalizeSavingThrows(c: Open5eCreature): Record<string, number> {
  const fromGrouped = normalizeBonusObject(c.saving_throws);
  const result: Record<string, number> = { ...fromGrouped };

  const map: Array<[string, unknown]> = [
    ["strength", c.saving_throw_strength],
    ["dexterity", c.saving_throw_dexterity],
    ["constitution", c.saving_throw_constitution],
    ["intelligence", c.saving_throw_intelligence],
    ["wisdom", c.saving_throw_wisdom],
    ["charisma", c.saving_throw_charisma]
  ];
  for (const [key, raw] of map) {
    const n = numberValue(raw);
    if (n !== null) result[key] = n;
  }
  return result;
}

function normalizeSkills(c: Open5eCreature): Record<string, number> {
  return {
    ...normalizeBonusObject(c.skills),
    ...normalizeBonusObject(c.skill_bonuses),
    ...normalizeBonusObject(c.skill_bonuses_all)
  };
}

function normalizeSenses(c: Open5eCreature): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const source = objectRecord(c.senses);
  if (source) {
    const display = textValue(source.as_string ?? source.display);
    if (display) result.as_string = display;
    for (const [k, v] of Object.entries(source)) {
      if (["as_string", "display"].includes(k)) continue;
      if (v !== null && v !== undefined && v !== "") result[k] = v;
    }
  } else {
    const display = textValue(c.senses);
    if (display) result.as_string = display;
  }

  const ranges: Array<[string, unknown]> = [
    ["darkvision", c.darkvision_range],
    ["blindsight", c.blindsight_range],
    ["tremorsense", c.tremorsense_range],
    ["truesight", c.truesight_range],
    ["normal_sight", c.normal_sight_range],
    ["telepathy", c.telepathy_range]
  ];
  for (const [key, raw] of ranges) {
    const n = numberValue(raw);
    if (n !== null) result[key] = n;
  }
  if (typeof c.passive_perception === "number") result.passive_perception = c.passive_perception;
  return result;
}

function numericCR(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (typeof value === "string") {
    if (value.includes("/")) {
      const [a, b] = value.split("/").map(Number);
      return b ? a / b : null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["decimal", "value", "challenge_rating", "rating", "name", "key"]) {
      if (key in record) {
        const result = numericCR(record[key]);
        if (result !== null) return result;
      }
    }
  }

  return null;
}

export function normalizeCreature(c: Open5eCreature) {
  return {
    size: textValue(c.size),
    creature_type: textValue(c.type),
    subtype: textValue(c.subtype),
    alignment: textValue(c.alignment),

    armor_class: c.armor_class ?? c.ac ?? [],
    hit_points: c.hit_points ?? null,
    hit_dice: c.hit_dice ?? null,

    speed: normalizeSpeed(c.speed),

    strength: abilityScore(c, "strength", "str"),
    dexterity: abilityScore(c, "dexterity", "dex"),
    constitution: abilityScore(c, "constitution", "con"),
    intelligence: abilityScore(c, "intelligence", "int"),
    wisdom: abilityScore(c, "wisdom", "wis"),
    charisma: abilityScore(c, "charisma", "cha"),

    saving_throws: normalizeSavingThrows(c),
    skills: normalizeSkills(c),

    damage_vulnerabilities: normalizeTextList(c.damage_vulnerabilities),
    damage_resistances: normalizeTextList(c.damage_resistances),
    damage_immunities: normalizeTextList(c.damage_immunities),
    condition_immunities: normalizeTextList(c.condition_immunities),

    senses: normalizeSenses(c),
    languages: normalizeTextList(c.languages),

    challenge_rating:
      numericCR(c.challenge_rating_decimal) ??
      numericCR(c.challenge_rating),

    proficiency_bonus: c.proficiency_bonus ?? null,
    experience_points: c.experience_points ?? c.xp ?? null
  };
}

export function collectTraits(c: Open5eCreature): Open5eNamedBlock[] {
  return [
    ...(Array.isArray(c.traits) ? c.traits : []),
    ...(Array.isArray(c.special_abilities) ? c.special_abilities : [])
  ];
}

export function collectActions(c: Open5eCreature) {
  const groups: Array<[string, Open5eNamedBlock[] | undefined]> = [
    ["action", c.actions],
    ["bonus_action", c.bonus_actions],
    ["reaction", c.reactions],
    ["legendary_action", c.legendary_actions]
  ];

  return groups.flatMap(([type, entries]) =>
    (Array.isArray(entries) ? entries : []).map((entry, index) => ({
      type,
      index,
      entry
    }))
  );
}

export function blockName(block: Open5eNamedBlock): string {
  return String(block.name ?? "Unnamed");
}

export function blockDescription(block: Open5eNamedBlock): string | null {
  return String(block.desc ?? block.description ?? "").trim() || null;
}
