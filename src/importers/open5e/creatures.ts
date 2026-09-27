import "dotenv/config";
import crypto from "node:crypto";
import { sql } from "../../db/client.js";
import type {
  Open5eCreature,
  PaginatedResponse
} from "../../types/open5e.js";
import {
  blockDescription,
  blockName,
  collectActions,
  collectTraits,
  description,
  externalKey,
  normalizeCreature,
  slugify
} from "./normalize.js";

const BASE_URL =
  process.env.OPEN5E_BASE_URL ?? "https://api.open5e.com/v2";
const DOCUMENT_KEY =
  process.env.OPEN5E_DOCUMENT_KEY ?? "srd-2024";

const RULESET = "dnd5e-2024";
const SOURCE_NAME = "System Reference Document 5.2";

function stableHash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "dnd-card-table/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Open5e request failed: ${response.status} ${response.statusText} - ${url}`
    );
  }

  return response.json() as Promise<T>;
}

async function ensureSource(): Promise<string> {
  const rows = await sql`
    INSERT INTO content_sources (
      provider,
      document_key,
      name,
      ruleset,
      license_code,
      license_url,
      attribution_text,
      api_base_url
    )
    VALUES (
      'open5e',
      ${DOCUMENT_KEY},
      ${SOURCE_NAME},
      ${RULESET},
      'CC-BY-4.0',
      'https://creativecommons.org/licenses/by/4.0/',
      'D&D System Reference Document 5.2 content. Open5e used as structured API source.',
      ${BASE_URL}
    )
    ON CONFLICT (provider, document_key)
    DO UPDATE SET
      name = EXCLUDED.name,
      ruleset = EXCLUDED.ruleset,
      api_base_url = EXCLUDED.api_base_url
    RETURNING id
  `;

  return rows[0].id;
}

async function upsertCreature(
  sourceId: string,
  creature: Open5eCreature
): Promise<"created" | "updated" | "unchanged"> {
  const extKey = externalKey(creature);
  const hash = stableHash(creature);

  const existing = await sql`
    SELECT
      ce.id,
      ce.source_hash,
      EXISTS (
        SELECT 1
        FROM entity_tags et
        WHERE et.entity_id = ce.id
      ) AS import_complete,
      (
        c.entity_id IS NULL OR
        (c.strength IS NULL AND c.dexterity IS NULL AND c.constitution IS NULL
         AND c.intelligence IS NULL AND c.wisdom IS NULL AND c.charisma IS NULL)
      ) AS needs_normalization_repair
    FROM content_entities ce
    LEFT JOIN creatures c ON c.entity_id = ce.id
    WHERE ce.source_id = ${sourceId}
      AND ce.entity_type = 'creature'
      AND ce.external_key = ${extKey}
    LIMIT 1
  `;

  // A previous importer version could fail after writing the entity but before
  // writing its tags. Do not treat such partially imported rows as complete.
  if (
    existing.length &&
    existing[0].source_hash === hash &&
    existing[0].import_complete === true &&
    existing[0].needs_normalization_repair !== true
  ) {
    return "unchanged";
  }

  const entityRows = await sql`
    INSERT INTO content_entities (
      entity_type,
      source_id,
      external_key,
      slug,
      ruleset,
      name_en,
      description_en,
      raw_source,
      source_hash,
      imported_at,
      updated_at
    )
    VALUES (
      'creature',
      ${sourceId},
      ${extKey},
      ${String(creature.slug ?? slugify(creature.name))},
      ${RULESET},
      ${creature.name},
      ${description(creature)},
      ${sql.json(creature as any)},
      ${hash},
      NOW(),
      NOW()
    )
    ON CONFLICT (source_id, entity_type, external_key)
    DO UPDATE SET
      slug = EXCLUDED.slug,
      name_en = EXCLUDED.name_en,
      description_en = EXCLUDED.description_en,
      raw_source = EXCLUDED.raw_source,
      source_hash = EXCLUDED.source_hash,
      imported_at = NOW(),
      updated_at = NOW()
    RETURNING id
  `;

  const entityId = entityRows[0].id;
  const c = normalizeCreature(creature);

  await sql`
    INSERT INTO creatures (
      entity_id,
      size,
      creature_type,
      subtype,
      alignment,
      armor_class,
      hit_points,
      hit_dice,
      speed,
      strength,
      dexterity,
      constitution,
      intelligence,
      wisdom,
      charisma,
      saving_throws,
      skills,
      damage_vulnerabilities,
      damage_resistances,
      damage_immunities,
      condition_immunities,
      senses,
      languages,
      challenge_rating,
      proficiency_bonus,
      experience_points
    )
    VALUES (
      ${entityId},
      ${c.size},
      ${c.creature_type},
      ${c.subtype},
      ${c.alignment},
      ${sql.json(c.armor_class as any)},
      ${c.hit_points},
      ${c.hit_dice},
      ${sql.json(c.speed as any)},
      ${c.strength},
      ${c.dexterity},
      ${c.constitution},
      ${c.intelligence},
      ${c.wisdom},
      ${c.charisma},
      ${sql.json(c.saving_throws as any)},
      ${sql.json(c.skills as any)},
      ${sql.json(c.damage_vulnerabilities as any)},
      ${sql.json(c.damage_resistances as any)},
      ${sql.json(c.damage_immunities as any)},
      ${sql.json(c.condition_immunities as any)},
      ${sql.json(c.senses as any)},
      ${sql.json(c.languages as any)},
      ${c.challenge_rating},
      ${c.proficiency_bonus},
      ${c.experience_points}
    )
    ON CONFLICT (entity_id)
    DO UPDATE SET
      size = EXCLUDED.size,
      creature_type = EXCLUDED.creature_type,
      subtype = EXCLUDED.subtype,
      alignment = EXCLUDED.alignment,
      armor_class = EXCLUDED.armor_class,
      hit_points = EXCLUDED.hit_points,
      hit_dice = EXCLUDED.hit_dice,
      speed = EXCLUDED.speed,
      strength = EXCLUDED.strength,
      dexterity = EXCLUDED.dexterity,
      constitution = EXCLUDED.constitution,
      intelligence = EXCLUDED.intelligence,
      wisdom = EXCLUDED.wisdom,
      charisma = EXCLUDED.charisma,
      saving_throws = EXCLUDED.saving_throws,
      skills = EXCLUDED.skills,
      damage_vulnerabilities = EXCLUDED.damage_vulnerabilities,
      damage_resistances = EXCLUDED.damage_resistances,
      damage_immunities = EXCLUDED.damage_immunities,
      condition_immunities = EXCLUDED.condition_immunities,
      senses = EXCLUDED.senses,
      languages = EXCLUDED.languages,
      challenge_rating = EXCLUDED.challenge_rating,
      proficiency_bonus = EXCLUDED.proficiency_bonus,
      experience_points = EXCLUDED.experience_points
  `;

  await sql`DELETE FROM entity_actions WHERE entity_id = ${entityId}`;
  await sql`DELETE FROM entity_traits WHERE entity_id = ${entityId}`;
  await sql`DELETE FROM entity_tags WHERE entity_id = ${entityId}`;

  const traits = collectTraits(creature);
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    await sql`
      INSERT INTO entity_traits (
        entity_id,
        trait_type,
        name_en,
        description_en,
        raw_data,
        sort_order
      )
      VALUES (
        ${entityId},
        'trait',
        ${blockName(trait)},
        ${blockDescription(trait)},
        ${sql.json(trait as any)},
        ${i}
      )
    `;
  }

  const actions = collectActions(creature);
  for (const action of actions) {
    await sql`
      INSERT INTO entity_actions (
        entity_id,
        action_type,
        name_en,
        description_en,
        raw_data,
        sort_order
      )
      VALUES (
        ${entityId},
        ${action.type},
        ${blockName(action.entry)},
        ${blockDescription(action.entry)},
        ${sql.json(action.entry as any)},
        ${action.index}
      )
    `;
  }

  const tags = new Set<string>([
    "creature",
    `ruleset:${RULESET}`,
    `source:${DOCUMENT_KEY}`
  ]);

  if (c.creature_type) tags.add(`type:${c.creature_type.toLowerCase()}`);
  if (c.size) tags.add(`size:${c.size.toLowerCase()}`);
  if (c.challenge_rating !== null) tags.add(`cr:${c.challenge_rating}`);

  for (const tag of tags) {
    await sql`
      INSERT INTO entity_tags(entity_id, tag)
      VALUES (${entityId}, ${tag})
      ON CONFLICT DO NOTHING
    `;
  }

  return existing.length ? "updated" : "created";
}

async function main() {
  const sourceId = await ensureSource();

  const runRows = await sql`
    INSERT INTO import_runs(source_id, entity_type, status)
    VALUES (${sourceId}, 'creature', 'running')
    RETURNING id
  `;
  const runId = runRows[0].id;

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let discovered = 0;
  const errors: Array<{ key?: string; name?: string; error: string }> = [];

  let url: string | null =
    `${BASE_URL}/creatures/?document__key__in=${encodeURIComponent(DOCUMENT_KEY)}&limit=100`;

  try {
    while (url) {
      const page: PaginatedResponse<Open5eCreature> =
        await fetchJson<PaginatedResponse<Open5eCreature>>(url);

      discovered += page.results.length;
      console.log(`Fetched ${page.results.length} creatures (${discovered} total)`);

      for (const creature of page.results) {
        try {
          const status = await upsertCreature(sourceId, creature);
          if (status === "created") created++;
          if (status === "updated") updated++;
          if (status === "unchanged") unchanged++;
        } catch (error) {
          failed++;
          errors.push({
            key: creature.key,
            name: creature.name,
            error: error instanceof Error ? error.message : String(error)
          });
          console.error(`Failed: ${creature.name}`, error);
        }
      }

      url = page.next ?? null;
    }

    await sql`
      UPDATE import_runs
      SET
        finished_at = NOW(),
        status = 'completed',
        discovered = ${discovered},
        created = ${created},
        updated = ${updated},
        unchanged = ${unchanged},
        failed = ${failed},
        errors = ${sql.json(errors)}
      WHERE id = ${runId}
    `;

    console.log({
      discovered,
      created,
      updated,
      unchanged,
      failed
    });
  } catch (error) {
    await sql`
      UPDATE import_runs
      SET
        finished_at = NOW(),
        status = 'failed',
        discovered = ${discovered},
        created = ${created},
        updated = ${updated},
        unchanged = ${unchanged},
        failed = ${failed + 1},
        errors = ${sql.json([
          ...errors,
          { error: error instanceof Error ? error.message : String(error) }
        ])}
      WHERE id = ${runId}
    `;

    throw error;
  } finally {
    await sql.end();
  }
}

await main();
