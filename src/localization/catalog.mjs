import { makeManifest } from './core.mjs';

const FIELDS = {
  character_content: ['summary','prerequisites','proficiencies','choices','starting_equipment','spellcasting','progression','traits'],
  spells: ['school','casting_time','range_text','duration','components','material','higher_levels_en','classes'],
  creatures: ['size','creature_type','subtype','alignment','languages','senses','damage_vulnerabilities','damage_resistances','damage_immunities','condition_immunities'],
  items: ['category','subcategory','rarity','attunement_detail','properties','weapon_category','damage_type','mastery','base_item_name','canonical_data'],
  conditions: ['mechanics'],
  entity_actions: ['name_en','description_en','action_type'],
  entity_traits: ['name_en','description_en','trait_type']
};

export async function readCatalog(sql) {
  // No character, campaign, player-note, image, secret or connection fields are read.
  const rows = await sql`SELECT ce.id::text, ce.external_key, ce.slug, ce.ruleset,
    ce.entity_type::text AS kind, ce.name_en, ce.description_en,
    cs.document_key AS source, cs.provider
    FROM content_entities ce JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true ORDER BY cs.document_key,ce.entity_type,ce.name_en`;
  const entities = rows.map(r => ({
    id: r.id, key: [r.provider, r.source, r.external_key || r.slug].join(':'),
    name: r.name_en, ruleset: r.ruleset, kind: r.kind, source: r.source,
    fields: { name_en: r.name_en, description_en: r.description_en }
  }));
  const byId = new Map(entities.map(e => [e.id, e]));
  const columns = await sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'`;
  for (const [table, fields] of Object.entries(FIELDS)) {
    const known = new Set(columns.filter(c => c.table_name === table).map(c => c.column_name));
    const selected = fields.filter(f => known.has(f));
    if (!known.has('entity_id') || !selected.length) continue;
    // Identifiers come solely from the constant allowlist above.
    const children = await sql.unsafe(`SELECT entity_id::text, ${selected.map(f => '"' + f + '"').join(',')} FROM "${table}"`);
    for (const child of children) {
      const entity = byId.get(child.entity_id);
      if (!entity) continue;
      const { entity_id, ...data } = child;
      (entity.fields[table] ||= []).push(data);
    }
  }
  return makeManifest(entities);
}
