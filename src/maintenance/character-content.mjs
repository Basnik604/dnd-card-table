import {readFileSync} from 'node:fs';
import {normalizeBuilderRecord} from '../shared/builder-content.mjs';

const schema=readFileSync(new URL('../../db/migrations/020_character_content_recovery.sql',import.meta.url),'utf8');
const fail=message=>{throw new Error(message);};
const columns=['entity_id','content_kind','category','summary','prerequisites','proficiencies','choices','starting_equipment','spellcasting','progression','traits','mechanics','updated_at'];

export async function inspectCharacterContent(sql) {
  const [connection]=await sql`SELECT current_database() AS database, current_schema() AS schema, current_schemas(false) AS schemas`;
  const relations=await sql`SELECT n.nspname AS schema,c.relname AS name,c.oid::text AS oid,pg_table_is_visible(c.oid) AS visible
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname IN ('content_entities','content_sources','character_content') AND c.relkind IN ('r','p','v','m')`;
  const result={database:connection.database,schema:connection.schema,tableExists:false,existing:0,candidates:0,recoverable:0,unrecoverable:0,canRepair:false,reason:null,rows:[]};
  for(const name of ['content_entities','content_sources']) {
    const row=relations.find(r=>r.name===name&&r.schema==='public'&&r.visible);
    if(!row) {result.reason='Основные таблицы каталога недоступны в public. Проверьте прежний DATABASE_URL в .env и настройки схемы; эта команда не создаёт новую базу.';return result;}
  }
  const catalogTables=relations.filter(r=>r.name==='character_content');
  const table=catalogTables.find(r=>r.schema==='public'&&r.visible);
  if(catalogTables.length&&!table){result.reason='character_content существует в другой схеме или скрыта search_path. Восстановите прежние настройки подключения; новая таблица не будет создана поверх другой схемы.';return result;}
  if(!connection.schemas.includes('public')||connection.schema!=='public') {result.reason='Текущая схема отличается от public. Проверьте настройки подключения и search_path перед восстановлением.';return result;}
  result.tableExists=!!table;
  if(table) {
    const known=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='character_content'`;
    if(columns.some(name=>!known.some(c=>c.column_name===name))) {result.reason='Структура character_content отличается от ожидаемой. Нужна проверка прежних миграций; существующая таблица не изменена.';return result;}
    result.existing=Number((await sql`SELECT COUNT(*) AS count FROM public.character_content`)[0].count);
  }
  const rows=await sql`SELECT ce.id::text,ce.entity_type::text AS kind,ce.raw_source,
    cs.provider,cs.document_key,cs.name AS source_name,cs.ruleset
    FROM public.content_entities ce LEFT JOIN public.content_sources cs ON cs.id=ce.source_id
    WHERE ce.entity_type::text IN ('class','subclass','species','background','feat') ORDER BY ce.id`;
  const existing=table?new Set((await sql`SELECT entity_id::text FROM public.character_content`).map(row=>row.entity_id)):new Set();
  result.rows=rows.filter(row=>!existing.has(row.id));
  result.candidates=result.rows.length;
  const valid=row=>row.provider==='open5e'&&row.raw_source&&typeof row.raw_source==='object'&&!Array.isArray(row.raw_source)&&typeof (row.raw_source.name??row.raw_source.title)==='string'&&String(row.raw_source.name??row.raw_source.title).trim().length>0;
  result.recoverable=result.rows.filter(valid).length;
  result.unrecoverable=result.candidates-result.recoverable;
  if(result.unrecoverable) result.reason='У части записей нет пригодного сохранённого исходника Open5e. Автоматическое восстановление остановлено; понадобится резервная копия или отдельный импорт после проверки базы.';
  else if(!table&&!result.candidates) result.reason='В этой базе не найдены сохранённые классы, виды, предыстории и черты. Проверьте прежний .env; пустая таблица не будет выдаваться за восстановленный каталог.';
  else result.canRepair=true;
  return result;
}

export function repairSummary(state) {
  const {rows,...summary}=state;return summary;
}

export async function repairCharacterContent(sql) {
  return sql.begin(async tx=>{
    // Serialize this repair and keep imported source records stable throughout.
    await tx`SELECT pg_advisory_xact_lock(303001)`;
    const state=await inspectCharacterContent(tx);
    if(!state.canRepair)fail(state.reason);
    if(state.tableExists&&!state.candidates)return {...repairSummary(state),restored:0};
    await tx.unsafe('LOCK TABLE public.content_entities, public.content_sources IN SHARE MODE');
    const fresh=await inspectCharacterContent(tx);
    if(!fresh.canRepair)fail(fresh.reason);
    if(fresh.tableExists) await tx.unsafe('LOCK TABLE public.character_content IN SHARE ROW EXCLUSIVE MODE');
    else await tx.unsafe(schema);
    let restored=0;
    for(const row of fresh.rows) {
      const record={...row.raw_source};
      if(!record.document||typeof record.document!=='object') record.document={key:row.document_key,name:row.source_name,gamesystem:{key:row.ruleset==='dnd5e-2024'?'5e-2024':row.ruleset==='dnd5e-2014'?'5e-2014':row.ruleset}};
      const n=normalizeBuilderRecord(row.kind,record);
      const inserted=await tx`INSERT INTO public.character_content
        (entity_id,content_kind,category,summary,prerequisites,proficiencies,choices,starting_equipment,spellcasting,progression,traits,mechanics)
        VALUES (${row.id},${row.kind},${n.category},${tx.json(n.summary)},${tx.json(n.prerequisites)},${tx.json(n.proficiencies)},${tx.json(n.choices)},${tx.json(n.starting_equipment)},${tx.json(n.spellcasting)},${tx.json(n.progression)},${tx.json(n.traits)},${tx.json(row.raw_source)})
        ON CONFLICT(entity_id) DO NOTHING RETURNING entity_id`;
      restored+=inserted.length;
    }
    return {...repairSummary(await inspectCharacterContent(tx)),restored};
  });
}
