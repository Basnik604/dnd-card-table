import { sql } from "../../db/client.js";
import {
  BASE_URL,
  DOCUMENT_KEY,
  ensureSource,
  fetchJson,
  recordExternalKey,
  recordName,
  type GenericRecord
} from "./common.js";
import type { PaginatedResponse } from "../../types/open5e.js";
import { normalizeItem, propertyNames } from "./item-normalize.js";

async function findEntity(sourceId: string, record: GenericRecord) {
  const key = recordExternalKey(record);
  let rows = await sql`
    SELECT ce.id, i.item_kind
    FROM content_entities ce
    LEFT JOIN items i ON i.entity_id = ce.id
    WHERE ce.source_id = ${sourceId}
      AND ce.entity_type = 'item'
      AND ce.external_key = ${key}
    LIMIT 1
  `;
  if (rows.length) return rows[0];

  rows = await sql`
    SELECT ce.id, i.item_kind
    FROM content_entities ce
    LEFT JOIN items i ON i.entity_id = ce.id
    WHERE ce.source_id = ${sourceId}
      AND ce.entity_type = 'item'
      AND lower(ce.name_en) = lower(${recordName(record)})
    ORDER BY CASE WHEN i.item_kind = 'equipment' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function addTags(entityId: string, tags: string[]) {
  for (const tag of new Set(tags.filter(Boolean))) {
    await sql`
      INSERT INTO entity_tags(entity_id, tag)
      VALUES (${entityId}, ${tag})
      ON CONFLICT DO NOTHING
    `;
  }
}

export async function runItemDetailImport(args: {
  endpoint: "weapons" | "armor";
  label: string;
  detailType: "weapon" | "armor";
}) {
  const sourceId = await ensureSource();
  const runRows = await sql`
    INSERT INTO import_runs(source_id, entity_type, status)
    VALUES (${sourceId}, ${`item:${args.detailType}`}, 'running')
    RETURNING id
  `;
  const runId = String(runRows[0].id);

  let discovered = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ name?: string; error: string }> = [];
  let url: string | null = `${BASE_URL}/${args.endpoint}/?document__key__in=${encodeURIComponent(DOCUMENT_KEY)}&limit=100`;

  try {
    while (url) {
      const page = await fetchJson<PaginatedResponse<GenericRecord>>(url);
      discovered += page.results.length;
      console.log(`Fetched ${page.results.length} ${args.label} (${discovered} total)`);

      for (const record of page.results) {
        try {
          const match = await findEntity(sourceId, record);
          if (!match) {
            skipped++;
            console.warn(`No matching generic item for ${recordName(record)}; skipped detail enrichment.`);
            continue;
          }

          const itemKind = match.item_kind === "magic_item" ? "magic_item" : "equipment";
          const n = normalizeItem(record, itemKind);

          await sql`
            UPDATE items SET
              item_type = COALESCE(${n.itemType}, item_type),
              category = COALESCE(${n.category}, category),
              subcategory = COALESCE(${n.subcategory}, subcategory),
              weapon_category = COALESCE(${n.weaponCategory}, weapon_category),
              damage = COALESCE(${n.damage === null ? null : sql.json(n.damage as any)}, damage),
              armor = COALESCE(${n.armor === null ? null : sql.json(n.armor as any)}, armor),
              properties = CASE WHEN ${n.properties.length} > 0 THEN ${sql.json(n.properties as any)} ELSE properties END,
              damage_dice = COALESCE(${n.damageDice}, damage_dice),
              versatile_damage_dice = COALESCE(${n.versatileDamageDice}, versatile_damage_dice),
              damage_type = COALESCE(${n.damageType}, damage_type),
              normal_range = COALESCE(${n.normalRange}, normal_range),
              long_range = COALESCE(${n.longRange}, long_range),
              mastery = COALESCE(${n.mastery}, mastery),
              armor_class_base = COALESCE(${n.armorClassBase}, armor_class_base),
              dex_bonus_mode = COALESCE(${n.dexBonusMode}, dex_bonus_mode),
              max_dex_bonus = COALESCE(${n.maxDexBonus}, max_dex_bonus),
              strength_requirement = COALESCE(${n.strengthRequirement}, strength_requirement),
              stealth_disadvantage = COALESCE(${n.stealthDisadvantage}, stealth_disadvantage),
              detail_source = ${sql.json(record as any)},
              normalization_version = 2
            WHERE entity_id = ${match.id}
          `;

          const props = propertyNames(n.properties);
          await addTags(String(match.id), [
            `detail:${args.detailType}`,
            ...(n.mastery ? [`mastery:${n.mastery.toLowerCase()}`] : []),
            ...props.map(p => `property:${p.toLowerCase()}`)
          ]);
          updated++;
        } catch (error) {
          failed++;
          errors.push({
            name: recordName(record),
            error: error instanceof Error ? error.message : String(error)
          });
          console.error(`Failed detail enrichment: ${recordName(record)}`, error);
        }
      }

      url = page.next ?? null;
    }

    await sql`
      UPDATE import_runs SET
        finished_at = NOW(), status = 'completed', discovered = ${discovered},
        created = 0, updated = ${updated}, unchanged = ${skipped}, failed = ${failed},
        errors = ${sql.json(errors)}
      WHERE id = ${runId}
    `;
    console.log({ discovered, updated, skipped, failed });
  } catch (error) {
    await sql`
      UPDATE import_runs SET finished_at = NOW(), status = 'failed',
        discovered = ${discovered}, updated = ${updated}, unchanged = ${skipped},
        failed = ${failed + 1}, errors = ${sql.json(errors)}
      WHERE id = ${runId}
    `;
    throw error;
  } finally {
    await sql.end();
  }
}
