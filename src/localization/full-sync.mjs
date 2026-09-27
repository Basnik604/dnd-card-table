import 'dotenv/config';
import postgres from 'postgres';
import { translateRussian, flushTranslationCacheSync, translationCacheStats, looksEnglishForTranslation } from './translation-engine.mjs';

const DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL)throw new Error('DATABASE_URL is missing');
const sql=postgres(DATABASE_URL,{max:1,idle_timeout:10});

function collectStrings(value,out,{prefix='generic'}={}){
  if(value==null)return;
  if(typeof value==='string'){
    const text=value.trim();
    if(text&&looksEnglishForTranslation(text))out.push({text,context:prefix});
    return;
  }
  if(Array.isArray(value)){for(const item of value)collectStrings(item,out,{prefix});return;}
  if(typeof value==='object')for(const [key,val] of Object.entries(value))collectStrings(val,out,{prefix:`${prefix}:${key}`});
}

async function querySafe(strings,fn){
  try{const rows=await fn();for(const row of rows)collectStrings(row,strings,{prefix:'db'});return rows.length;}
  catch(error){console.warn('Localization scan skipped one optional source:',error?.message||String(error));return 0;}
}

export async function gatherDatabaseStrings(db=sql){
  const items=[];
  let rows=0;
  const content=await db`
    SELECT ce.name_en,ce.description_en,ce.ruleset,ce.entity_type::text AS entity_type,
           cs.name AS source_name,
           c.creature_type,c.size,c.alignment,c.languages,
           s.school,s.casting_time,s.range_text,s.duration,s.components,s.material,s.higher_levels_en,s.classes,
           i.item_kind,i.category,i.subcategory,i.rarity,i.attunement_detail,i.damage_type,i.mastery,i.base_item_name,
           co.mechanics AS condition_mechanics
    FROM content_entities ce
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    LEFT JOIN creatures c ON c.entity_id=ce.id
    LEFT JOIN spells s ON s.entity_id=ce.id
    LEFT JOIN items i ON i.entity_id=ce.id
    LEFT JOIN conditions co ON co.entity_id=ce.id
    WHERE cs.enabled=true
  `;
  rows+=content.length;
  for(const row of content){
    items.push({text:row.name_en,context:'entity-name',kind:row.entity_type,ruleset:row.ruleset});
    for(const [key,val] of Object.entries(row)){
      if(['name_en','ruleset','entity_type'].includes(key))continue;
      collectStrings(val,items,{prefix:`entity:${row.entity_type}:${key}`});
    }
  }

  const actions=await db`SELECT action_type,name_en,description_en,raw_data FROM entity_actions`;
  rows+=actions.length;
  for(const row of actions){
    if(row.name_en)items.push({text:row.name_en,context:'entity-action-name'});
    if(row.action_type)collectStrings(row.action_type,items,{prefix:'entity-action-type'});
    if(row.description_en)collectStrings(row.description_en,items,{prefix:'prose'});
    if(row.raw_data)collectStrings(row.raw_data,items,{prefix:'entity-action-data'});
  }
  const traits=await db`SELECT trait_type,name_en,description_en,mechanics,raw_data FROM entity_traits`;
  rows+=traits.length;
  for(const row of traits){
    if(row.name_en)items.push({text:row.name_en,context:'entity-trait-name'});
    if(row.trait_type)collectStrings(row.trait_type,items,{prefix:'entity-trait-type'});
    if(row.description_en)collectStrings(row.description_en,items,{prefix:'prose'});
    if(row.mechanics)collectStrings(row.mechanics,items,{prefix:'entity-trait-mechanics'});
    if(row.raw_data)collectStrings(row.raw_data,items,{prefix:'entity-trait-data'});
  }

  const builder=await db`
    SELECT ce.name_en,ce.description_en,ce.ruleset,cc.content_kind,cc.category,cc.summary,cc.traits,
           cc.proficiencies,cc.choices,cc.prerequisites,cc.starting_equipment,cc.spellcasting,cc.progression
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true
  `;
  rows+=builder.length;
  for(const row of builder){
    items.push({text:row.name_en,context:'entity-name',kind:row.content_kind,ruleset:row.ruleset});
    for(const [key,val] of Object.entries(row)){
      if(['name_en','ruleset','content_kind'].includes(key))continue;
      collectStrings(val,items,{prefix:`builder:${row.content_kind}:${key}`});
    }
  }

  rows+=await querySafe(items,()=>db`SELECT title_en,description_en,card_data,actions FROM card_templates`);
  return {items,rows};
}

function dedupe(items){
  const seen=new Set(),out=[];
  for(const item of items){
    const text=String(item?.text??'').trim();
    if(!text||!looksEnglishForTranslation(text))continue;
    const key=[item.context||'generic',item.kind||'',item.ruleset||'',text].join('\u0001');
    if(seen.has(key))continue;seen.add(key);out.push({...item,text});
  }
  return out;
}

export async function syncDatabaseLocalization(db=sql,{limit=Infinity,progress=true}={}){
  const {items,rows}=await gatherDatabaseStrings(db);
  const unique=dedupe(items).slice(0,Number.isFinite(Number(limit))?Number(limit):undefined);
  let done=0,failed=0;
  const started=Date.now();
  if(progress)console.log(`RU localization: ${unique.length} unique strings from ${rows} database rows.`);
  for(const item of unique){
    try{await translateRussian(item.text,item);}
    catch(error){failed++;console.warn(`\nTranslation failed: ${item.text.slice(0,90)}`,error?.message||String(error));}
    done++;
    if(progress&&(done===unique.length||done%25===0)){
      const seconds=Math.max(1,(Date.now()-started)/1000);
      process.stdout.write(`\rTranslated/cached ${done}/${unique.length} · ${Math.round(done/seconds)} strings/s · failures ${failed}   `);
    }
  }
  if(progress)process.stdout.write('\n');
  flushTranslationCacheSync();
  return {rows,unique:unique.length,done,failed,cache:translationCacheStats()};
}

async function main(){
  const arg=process.argv.find(x=>x.startsWith('--limit='));
  const limit=arg?Number(arg.split('=')[1]):Infinity;
  const result=await syncDatabaseLocalization(sql,{limit,progress:true});
  console.log('RU localization complete:',result);
  await sql.end({timeout:2});
}

if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\','/'))){
  main().catch(async error=>{console.error(error);try{await sql.end({timeout:1});}catch{}process.exitCode=1;});
}
