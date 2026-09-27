import crypto from "node:crypto";
import { sql } from "../../db/client.js";
import type { PaginatedResponse } from "../../types/open5e.js";
import { slugify, textValue } from "./normalize.js";

export const BASE_URL =
  process.env.OPEN5E_BASE_URL ?? "https://api.open5e.com/v2";
export const DOCUMENT_KEY =
  process.env.OPEN5E_DOCUMENT_KEY ?? "srd-2024";
export const RULESET = "dnd5e-2024";
export const SOURCE_NAME = "System Reference Document 5.2";

export type GenericRecord = Record<string, unknown>;
export type ImportStatus = "created" | "updated" | "unchanged";

export function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "dnd-card-table/0.2"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Open5e request failed: ${response.status} ${response.statusText} - ${url}`
    );
  }

  return response.json() as Promise<T>;
}

export async function ensureSource(): Promise<string> {
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

  return String(rows[0].id);
}

export function recordName(record: GenericRecord): string {
  return textValue(record.name) ?? textValue(record.title) ?? "Unnamed";
}

export function recordDescription(record: GenericRecord): string | null {
  return (
    textValue(record.desc) ??
    textValue(record.description) ??
    textValue(record.text) ??
    null
  );
}

export function recordExternalKey(record: GenericRecord): string {
  const name = recordName(record);
  return String(record.key ?? record.slug ?? slugify(name));
}

export function recordSlug(record: GenericRecord): string {
  return String(record.slug ?? slugify(recordName(record)));
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object") {
    const rec = value as GenericRecord;
    for (const key of ["value", "amount", "number", "decimal"]) {
      if (key in rec) {
        const n = numberValue(rec[key]);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

export function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "yes", "y", "1", "required"].includes(normalized);
  }
  return false;
}

export function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

export function pick(record: GenericRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

export async function getExisting(
  sourceId: string,
  entityType: string,
  externalKey: string
) {
  return sql`
    SELECT
      ce.id,
      ce.source_hash,
      EXISTS (
        SELECT 1 FROM entity_tags et WHERE et.entity_id = ce.id
      ) AS import_complete
    FROM content_entities ce
    WHERE ce.source_id = ${sourceId}
      AND ce.entity_type = ${entityType}
      AND ce.external_key = ${externalKey}
    LIMIT 1
  `;
}

export async function upsertBaseEntity(args: {
  sourceId: string;
  entityType: "spell" | "item" | "condition" | "feature" | "rule";
  record: GenericRecord;
  hash: string;
}): Promise<{ entityId: string; existed: boolean }> {
  const { sourceId, entityType, record, hash } = args;
  const externalKey = recordExternalKey(record);

  const rows = await sql`
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
      ${entityType},
      ${sourceId},
      ${externalKey},
      ${recordSlug(record)},
      ${RULESET},
      ${recordName(record)},
      ${recordDescription(record)},
      ${sql.json(record as any)},
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

  return { entityId: String(rows[0].id), existed: false };
}

export async function replaceTags(entityId: string, tags: Iterable<string>) {
  await sql`DELETE FROM entity_tags WHERE entity_id = ${entityId}`;
  for (const tag of new Set(tags)) {
    if (!tag) continue;
    await sql`
      INSERT INTO entity_tags(entity_id, tag)
      VALUES (${entityId}, ${tag})
      ON CONFLICT DO NOTHING
    `;
  }
}

export async function runPagedImport(args: {
  endpoint: string;
  entityType: string;
  label: string;
  importOne: (sourceId: string, record: GenericRecord) => Promise<ImportStatus>;
}) {
  const sourceId = await ensureSource();
  const runRows = await sql`
    INSERT INTO import_runs(source_id, entity_type, status)
    VALUES (${sourceId}, ${args.entityType}, 'running')
    RETURNING id
  `;
  const runId = String(runRows[0].id);

  let discovered = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const errors: Array<{ key?: string; name?: string; error: string }> = [];

  let url: string | null =
    `${BASE_URL}/${args.endpoint}/?document__key__in=${encodeURIComponent(DOCUMENT_KEY)}&limit=100`;

  try {
    while (url) {
      const page = await fetchJson<PaginatedResponse<GenericRecord>>(url);
      discovered += page.results.length;
      console.log(`Fetched ${page.results.length} ${args.label} (${discovered} total)`);

      for (const record of page.results) {
        try {
          const status = await args.importOne(sourceId, record);
          if (status === "created") created++;
          if (status === "updated") updated++;
          if (status === "unchanged") unchanged++;
        } catch (error) {
          failed++;
          errors.push({
            key: recordExternalKey(record),
            name: recordName(record),
            error: error instanceof Error ? error.message : String(error)
          });
          console.error(`Failed: ${recordName(record)}`, error);
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

    console.log({ discovered, created, updated, unchanged, failed });
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
