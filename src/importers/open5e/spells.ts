import "dotenv/config";
import { sql } from "../../db/client.js";
import { textValue } from "./normalize.js";
import {
  arrayValue,
  booleanValue,
  getExisting,
  numberValue,
  pick,
  recordExternalKey,
  replaceTags,
  runPagedImport,
  stableHash,
  type GenericRecord,
  type ImportStatus,
  upsertBaseEntity
} from "./common.js";

async function importSpell(sourceId: string, record: GenericRecord): Promise<ImportStatus> {
  const extKey = recordExternalKey(record);
  const hash = stableHash(record);
  const existing = await getExisting(sourceId, "spell", extKey);

  if (
    existing.length &&
    existing[0].source_hash === hash &&
    existing[0].import_complete === true
  ) {
    return "unchanged";
  }

  const { entityId } = await upsertBaseEntity({
    sourceId,
    entityType: "spell",
    record,
    hash
  });

  const level = numberValue(pick(record, "level", "spell_level")) ?? 0;
  const school = textValue(pick(record, "school", "spell_school"));
  const castingTime = textValue(pick(record, "casting_time", "castingTime"));
  const rangeText = textValue(pick(record, "range", "range_text", "spell_range"));
  const duration = textValue(pick(record, "duration"));
  const ritual = booleanValue(pick(record, "ritual", "is_ritual"));
  const concentration = booleanValue(pick(record, "concentration", "requires_concentration"));
  const components = arrayValue(pick(record, "components", "component"));
  const material = textValue(pick(record, "material", "material_component"));
  const attackType = textValue(pick(record, "attack_type", "attack"));
  const savingThrow = textValue(pick(record, "saving_throw_ability", "saving_throw", "save"));
  const damage = pick(record, "damage", "damage_at_slot_level", "damage_at_character_level") ?? null;
  const area = pick(record, "area_of_effect", "area", "aoe") ?? null;
  const higher = textValue(pick(record, "higher_levels", "higher_level", "at_higher_levels"));
  const classes = arrayValue(pick(record, "classes", "class_list", "spell_lists"));

  await sql`
    INSERT INTO spells (
      entity_id, level, school, casting_time, range_text, duration,
      ritual, concentration, components, material, attack_type,
      saving_throw_ability, damage, area_of_effect, higher_levels_en,
      classes, mechanics
    )
    VALUES (
      ${entityId}, ${level}, ${school}, ${castingTime}, ${rangeText}, ${duration},
      ${ritual}, ${concentration}, ${sql.json(components as any)}, ${material}, ${attackType},
      ${savingThrow}, ${damage === null ? null : sql.json(damage as any)},
      ${area === null ? null : sql.json(area as any)}, ${higher},
      ${sql.json(classes as any)}, ${sql.json(record as any)}
    )
    ON CONFLICT (entity_id)
    DO UPDATE SET
      level = EXCLUDED.level,
      school = EXCLUDED.school,
      casting_time = EXCLUDED.casting_time,
      range_text = EXCLUDED.range_text,
      duration = EXCLUDED.duration,
      ritual = EXCLUDED.ritual,
      concentration = EXCLUDED.concentration,
      components = EXCLUDED.components,
      material = EXCLUDED.material,
      attack_type = EXCLUDED.attack_type,
      saving_throw_ability = EXCLUDED.saving_throw_ability,
      damage = EXCLUDED.damage,
      area_of_effect = EXCLUDED.area_of_effect,
      higher_levels_en = EXCLUDED.higher_levels_en,
      classes = EXCLUDED.classes,
      mechanics = EXCLUDED.mechanics
  `;

  const tags = ["spell", `level:${level}`];
  if (school) tags.push(`school:${school.toLowerCase()}`);
  if (ritual) tags.push("ritual");
  if (concentration) tags.push("concentration");
  await replaceTags(entityId, tags);

  return existing.length ? "updated" : "created";
}

await runPagedImport({
  endpoint: "spells",
  entityType: "spell",
  label: "spells",
  importOne: importSpell
});
