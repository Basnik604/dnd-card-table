import "dotenv/config";
import { sql } from "../../db/client.js";
import {
  recordExternalKey,
  replaceTags,
  runPagedImport,
  stableHash,
  type GenericRecord,
  type ImportStatus,
  upsertBaseEntity
} from "./common.js";
import { writeNormalizedItem } from "./item-write.js";

async function importMagicItem(sourceId: string, record: GenericRecord): Promise<ImportStatus> {
  const sourceKey = recordExternalKey(record);
  const externalKey = `magicitem:${sourceKey}`;
  const synthetic = { ...record, key: externalKey };
  const hash = stableHash(record);

  const existing = await sql`
    SELECT ce.id, ce.source_hash,
      EXISTS (SELECT 1 FROM entity_tags et WHERE et.entity_id = ce.id) AS import_complete,
      COALESCE(i.normalization_version, 0)::int AS normalization_version
    FROM content_entities ce
    LEFT JOIN items i ON i.entity_id = ce.id
    WHERE ce.source_id = ${sourceId}
      AND ce.entity_type = 'item'
      AND ce.external_key = ${externalKey}
    LIMIT 1
  `;

  if (
    existing.length && existing[0].source_hash === hash &&
    existing[0].import_complete === true && existing[0].normalization_version >= 2
  ) return "unchanged";

  const { entityId } = await upsertBaseEntity({ sourceId, entityType: "item", record: synthetic, hash });
  const { normalized, propertyNames } = await writeNormalizedItem({ entityId, record, itemKind: "magic_item" });

  const tags = ["item", "magic-item", `item-type:${normalized.itemType}`];
  if (normalized.category) tags.push(`category:${normalized.category.toLowerCase()}`);
  if (normalized.rarity) tags.push(`rarity:${normalized.rarity.toLowerCase()}`);
  if (normalized.requiresAttunement) tags.push("attunement");
  if (normalized.magicBonus !== null) tags.push(`magic-bonus:+${normalized.magicBonus}`);
  if (normalized.consumable) tags.push("consumable");
  for (const prop of propertyNames) tags.push(`property:${prop.toLowerCase()}`);
  await replaceTags(entityId, tags);

  return existing.length ? "updated" : "created";
}

await runPagedImport({
  endpoint: "magicitems",
  entityType: "item",
  label: "magic items",
  importOne: importMagicItem
});
