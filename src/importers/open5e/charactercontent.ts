import "dotenv/config";
import crypto from "node:crypto";
import { sql } from "../../db/client.js";
import {
  classifyClassRecord,
  dedupeGuidedRows,
  normalizeBuilderRecord,
  recordKey,
  recordName,
  rulesetForDocument,
  slugify,
  textValue
} from "../../shared/builder-content.mjs";

const BASE_URL=(process.env.OPEN5E_BASE_URL ?? "https://api.open5e.com/v2").replace(/\/$/,"");
const USER_AGENT="dnd-card-table/0.20.1";

type Rec=Record<string,any>;
type Page={next?:string|null;results?:Rec[];count?:number};

const RESOURCE_TYPES=[
  {endpoint:"classes",label:"classes and subclasses"},
  {endpoint:"species",label:"species"},
  {endpoint:"backgrounds",label:"backgrounds"},
  {endpoint:"feats",label:"feats"}
] as const;

const KNOWN_2024_CLASSES=new Set([
  "Barbarian","Bard","Cleric","Druid","Fighter","Monk",
  "Paladin","Ranger","Rogue","Sorcerer","Warlock","Wizard"
]);

const LICENSES:Record<string,{code:string;url:string}>={
  "cc-by-40":{code:"CC-BY-4.0",url:"https://creativecommons.org/licenses/by/4.0/"},
  "ogl-10a":{code:"OGL-1.0a",url:"https://opengamingfoundation.org/ogl.html"},
  "cc0":{code:"CC0-1.0",url:"https://creativecommons.org/publicdomain/zero/1.0/"}
};

function stableHash(value:unknown){
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function descriptionOf(record:Rec){
  return textValue(record.desc) ?? textValue(record.description) ?? textValue(record.text);
}

function embeddedDocument(record:Rec):Rec{
  const value=record?.document;
  if(value&&typeof value==="object")return value;
  return {key:String(record?.document_key||record?.source?.key||"unknown-source")};
}

async function requestPage(url:string):Promise<Page>{
  const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":USER_AGENT}});
  if(!response.ok)throw new Error(`Open5e ${response.status} ${response.statusText}: ${url}`);
  return await response.json() as Page;
}

async function fetchAll(endpoint:string){
  const results:Rec[]=[];
  let next:string|null=`${BASE_URL}/${endpoint}/?limit=100`;
  while(next){
    const page=await requestPage(next);
    results.push(...(page.results??[]));
    next=page.next?new URL(page.next,BASE_URL).toString():null;
  }
  return results;
}

function licenseMetadata(document:Rec){
  const licenses=Array.isArray(document?.licenses)?document.licenses:[];
  const known=licenses.map((entry:Rec)=>LICENSES[String(entry?.key||"")]).filter(Boolean);
  return {
    code:known.map(entry=>entry.code).join(" + ") || licenses.map((entry:Rec)=>textValue(entry?.name)).filter(Boolean).join(" + ") || null,
    url:known[0]?.url ?? textValue(document?.permalink)
  };
}

async function ensureSource(document:Rec){
  const key=String(document?.key||"unknown-source");
  const name=String(document?.name||document?.display_name||key);
  const ruleset=rulesetForDocument(document);
  const publisher=textValue(document?.publisher)||"Unknown publisher";
  const license=licenseMetadata(document);
  const attribution=`${name} by ${publisher}. Structured data imported from Open5e.`;
  const rows=await sql`
    INSERT INTO content_sources(
      provider,document_key,name,ruleset,license_code,license_url,
      attribution_text,api_base_url,enabled
    ) VALUES(
      'open5e',${key},${name},${ruleset},${license.code},${license.url},
      ${attribution},${BASE_URL},true
    )
    ON CONFLICT(provider,document_key)
    DO UPDATE SET
      name=EXCLUDED.name,ruleset=EXCLUDED.ruleset,
      license_code=EXCLUDED.license_code,license_url=EXCLUDED.license_url,
      attribution_text=EXCLUDED.attribution_text,api_base_url=EXCLUDED.api_base_url,
      enabled=true
    RETURNING id::text
  `;
  return rows[0].id as string;
}

async function repairLegacySubclassRows(sourceId:string,records:Rec[]){
  for(const record of records.filter(row=>classifyClassRecord(row)==="subclass")){
    const key=recordKey(record);
    const wrong=await sql`
      SELECT id::text FROM content_entities
      WHERE source_id=${sourceId} AND entity_type::text='class' AND external_key=${key}
      LIMIT 1
    `;
    if(!wrong.length)continue;

    const existing=await sql`
      SELECT id::text FROM content_entities
      WHERE source_id=${sourceId} AND entity_type::text='subclass' AND external_key=${key}
      LIMIT 1
    `;
    if(existing.length){
      await sql`DELETE FROM content_entities WHERE id=${wrong[0].id}`;
      continue;
    }
    await sql`
      UPDATE content_entities
      SET entity_type='subclass'::content_entity_type,updated_at=NOW()
      WHERE id=${wrong[0].id}
    `;
    await sql`
      UPDATE character_content
      SET content_kind='subclass',category='Subclass',updated_at=NOW()
      WHERE entity_id=${wrong[0].id}
    `;
  }
}

async function upsert(sourceId:string,document:Rec,kind:string,record:Rec){
  return sql.begin(async transaction=>writeRecord(transaction,sourceId,document,kind,record));
}

async function writeRecord(sql:any,sourceId:string,document:Rec,kind:string,record:Rec){
  const key=recordKey(record);
  const ruleset=rulesetForDocument(document);
  const hash=stableHash(record);
  const old=await sql`
    SELECT id::text,source_hash FROM content_entities
    WHERE source_id=${sourceId} AND entity_type::text=${kind} AND external_key=${key}
    LIMIT 1
  `;

  const normalized=normalizeBuilderRecord(kind,record);
  let rows=await sql`
    INSERT INTO content_entities(
      entity_type,source_id,external_key,slug,ruleset,
      name_en,description_en,raw_source,source_hash,imported_at,updated_at
    ) VALUES(
      ${kind}::content_entity_type,${sourceId},${key},${String(record.slug||slugify(recordName(record)))},${ruleset},
      ${recordName(record)},${descriptionOf(record)},${sql.json(record)},${hash},NOW(),NOW()
    )
    ON CONFLICT DO NOTHING
    RETURNING id::text
  `;
  // Releases used both (source_id, external_key) and
  // (source_id, entity_type, external_key) unique keys. Do not assume either.
  if(!rows.length){
    rows=await sql`
      UPDATE content_entities SET
        slug=${String(record.slug||slugify(recordName(record)))},ruleset=${ruleset},
        name_en=${recordName(record)},description_en=${descriptionOf(record)},
        raw_source=${sql.json(record)},source_hash=${hash},imported_at=NOW(),updated_at=NOW()
      WHERE source_id=${sourceId} AND entity_type::text=${kind} AND external_key=${key}
      RETURNING id::text
    `;
  }
  if(rows.length!==1)throw new Error(`Cannot resolve unique entity: ${document.key}/${kind}/${key}. Check conflicting source keys.`);
  const entityId=rows[0].id as string;

  await sql`
    INSERT INTO character_content(
      entity_id,content_kind,category,summary,prerequisites,proficiencies,
      choices,starting_equipment,spellcasting,progression,traits,mechanics,updated_at
    ) VALUES(
      ${entityId},${kind},${normalized.category},${sql.json(normalized.summary)},
      ${sql.json(normalized.prerequisites)},${sql.json(normalized.proficiencies)},
      ${sql.json(normalized.choices)},${sql.json(normalized.starting_equipment)},
      ${sql.json(normalized.spellcasting)},${sql.json(normalized.progression)},
      ${sql.json(normalized.traits)},${sql.json(record)},NOW()
    )
    ON CONFLICT(entity_id)
    DO UPDATE SET
      content_kind=EXCLUDED.content_kind,category=EXCLUDED.category,summary=EXCLUDED.summary,
      prerequisites=EXCLUDED.prerequisites,proficiencies=EXCLUDED.proficiencies,
      choices=EXCLUDED.choices,starting_equipment=EXCLUDED.starting_equipment,
      spellcasting=EXCLUDED.spellcasting,progression=EXCLUDED.progression,
      traits=EXCLUDED.traits,mechanics=EXCLUDED.mechanics,updated_at=NOW()
  `;

  await sql`DELETE FROM entity_tags WHERE entity_id=${entityId}`;
  const tags=new Set([
    `builder:${kind}`,
    `ruleset:${ruleset}`,
    `source:${document.key}`,
    normalized.category?`category:${String(normalized.category).toLowerCase()}`:""
  ].filter(Boolean));
  for(const tag of tags){
    await sql`INSERT INTO entity_tags(entity_id,tag) VALUES(${entityId},${tag}) ON CONFLICT DO NOTHING`;
  }
  return old.length?(old[0].source_hash===hash?"renormalized":"updated"):"created";
}

async function importGroup(sourceId:string,document:Rec,kind:string,records:Rec[]){
  const run=await sql`
    INSERT INTO import_runs(source_id,entity_type,status)
    VALUES(${sourceId},${kind},'running')
    RETURNING id::text
  `;
  const counts={created:0,updated:0,renormalized:0,failed:0};
  const errors:Rec[]=[];
  for(const record of records){
    try{
      const status=await upsert(sourceId,document,kind,record) as keyof typeof counts;
      counts[status]++;
    }catch(error){
      counts.failed++;
      const cause=error as any;
      const detail={key:recordKey(record),name:recordName(record),error:error instanceof Error?error.message:String(error),code:cause?.code??null};
      errors.push(detail);
      if(counts.failed<=3)console.error("Record import failed:",{source:document.key,kind,...detail});
    }
  }
  await sql`
    UPDATE import_runs SET
      finished_at=NOW(),status=${counts.failed?'completed_with_errors':'completed'},
      discovered=${records.length},created=${counts.created},
      updated=${counts.updated+counts.renormalized},unchanged=0,failed=${counts.failed},
      errors=${sql.json(errors)}
    WHERE id=${run[0].id}
  `;
  console.log({source:document.key,kind,discovered:records.length,...counts});
  if(counts.failed)throw new Error(`${counts.failed} ${kind} rows failed for ${document.key}`);
}

function guidedAudit(recordsByKind:Record<string,Rec[]>){
  const rows=(kind:string)=>(recordsByKind[kind]??[]).map(record=>{
    const normalized=normalizeBuilderRecord(kind,record);
    return {
      name_en:recordName(record),
      summary:normalized.summary,
      source_key:normalized.summary.source_key,
      ruleset:normalized.summary.ruleset
    };
  });
  return {
    classes:rows("class").filter(row=>row.source_key==="srd-2024"&&KNOWN_2024_CLASSES.has(row.name_en)).length,
    subclasses:dedupeGuidedRows(rows("subclass"),"subclass").length,
    species:dedupeGuidedRows(rows("species"),"species").length,
    backgrounds:dedupeGuidedRows(rows("background"),"background").length,
    feats:dedupeGuidedRows(rows("feat"),"feat").length
  };
}

let failed=false;
try{
  const documents=await fetchAll("documents");
  const documentsByKey=new Map(documents.map(document=>[String(document.key),document]));
  const resources=await Promise.all(RESOURCE_TYPES.map(async def=>{
    const records=await fetchAll(def.endpoint);
    console.log(`Fetched ${records.length} ${def.label} from /${def.endpoint}`);
    return {def,records};
  }));

  const recordsByKind:Record<string,Rec[]>={class:[],subclass:[],species:[],background:[],feat:[]};
  for(const {def,records} of resources){
    if(def.endpoint==="classes"){
      for(const record of records)recordsByKind[classifyClassRecord(record)].push(record);
    }else{
      const kind=def.endpoint==="species"?"species":def.endpoint==="backgrounds"?"background":"feat";
      recordsByKind[kind].push(...records);
    }
  }

  const groups=new Map<string,{document:Rec;byKind:Map<string,Rec[]>}>();
  for(const [kind,records] of Object.entries(recordsByKind)){
    for(const record of records){
      const embedded=embeddedDocument(record);
      const key=String(embedded.key||"unknown-source");
      const document={...embedded,...(documentsByKey.get(key)||{}),key};
      if(!groups.has(key))groups.set(key,{document,byKind:new Map()});
      const byKind=groups.get(key)!.byKind;
      if(!byKind.has(kind))byKind.set(kind,[]);
      byKind.get(kind)!.push(record);
    }
  }

  for(const [sourceKey,{document,byKind}] of groups){
    const sourceId=await ensureSource(document);
    if(sourceKey==="srd-2024")await repairLegacySubclassRows(sourceId,byKind.get("subclass")??[]);
    for(const kind of ["class","subclass","species","background","feat"]){
      const records=byKind.get(kind)??[];
      if(!records.length)continue;
      try{await importGroup(sourceId,document,kind,records);}
      catch(error){failed=true;console.error(error);}
    }
  }

  console.log("Downloaded catalog candidates (not a database count):",guidedAudit(recordsByKind));
  const saved=await sql`
    SELECT e.name_en,e.ruleset,s.document_key AS source_key,c.content_kind,c.summary
    FROM character_content c JOIN content_entities e ON e.id=c.entity_id
    JOIN content_sources s ON s.id=e.source_id
    WHERE s.provider='open5e' AND s.enabled=true
  `;
  const byKind=(kind:string)=>saved.filter(row=>row.content_kind===kind);
  console.log("Saved Builder Data totals:",Object.fromEntries(
    ["class","subclass","species","background","feat"].map(kind=>[kind,byKind(kind).length])
  ));
  console.log("Guided Builder compatible unique choices saved in database:",{
    classes:byKind("class").filter(row=>row.source_key==="srd-2024"&&KNOWN_2024_CLASSES.has(row.name_en)).length,
    subclasses:dedupeGuidedRows(byKind("subclass"),"subclass").length,
    species:dedupeGuidedRows(byKind("species"),"species").length,
    backgrounds:dedupeGuidedRows(byKind("background"),"background").length,
    feats:dedupeGuidedRows(byKind("feat"),"feat").length
  });
  if(failed)console.error("Character content import incomplete. See Record import failed above; saved totals may contain only previous data.");
  else console.log("Character content import completed successfully.");
}catch(error){
  failed=true;
  console.error("Character content import failed:",error);
}finally{
  await sql.end();
}

if(failed)process.exitCode=1;
