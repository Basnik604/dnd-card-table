import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const migrationHash=text=>createHash('sha256').update(text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trimEnd()+'\n').digest('hex');
const order=name=>{const p=name.split('_')[0];return Number(p.slice(0,3))+Number('0.'+(p.slice(3)||'0'));};
export async function migrationFiles(directory){const names=(await readdir(directory)).filter(n=>/^\d{3,}_.*\.sql$/i.test(n)).sort((a,b)=>order(a)-order(b)||a.localeCompare(b));return Promise.all(names.map(async name=>{const text=await readFile(path.join(directory,name),'utf8');return {name,text,checksum:migrationHash(text)};}));}
const markers={
 '0.31.2':[['content_entities','entity_type'],['characters','hp_current'],['characters','portrait_bytes'],['characters','feature_choices'],['characters','xp'],['items','normalization_version'],['character_content','mechanics'],['character_spell_slots','current_slots']],
 '0.35.5':[['vtt_scenes','map_bytes'],['vtt_tokens','art_variant'],['vtt_tokens','icon_color'],['vtt_combat','fight_id'],['vtt_token_vitals','hp_current'],['vtt_unit_tactics','state'],['vtt_battle_actions','payload'],['vtt_effects','state']]
};
async function history(db){const [r]=await db`SELECT to_regclass('public.app_migrations') AS name`;return r.name?db`SELECT name,checksum FROM app_migrations ORDER BY name`:[];}
function validateHistory(rows,files){for(const r of rows){const f=files.find(f=>f.name===r.name);if(!f)throw Error('Database is newer than this application: '+r.name);if(f.checksum!==r.checksum)throw Error('Applied migration was modified: '+r.name);}}
async function ledger(db){await db`CREATE TABLE IF NOT EXISTS app_migrations(name text PRIMARY KEY,checksum text NOT NULL,adopted boolean NOT NULL DEFAULT false,applied_at timestamptz NOT NULL DEFAULT NOW())`;}
export async function adoptMigrations(sql,files,version){
 if(!markers[version])throw Error('Supported adoption versions: 0.31.2, 0.35.5');
 return sql.begin(async db=>{await db`SELECT pg_advisory_xact_lock(360036)`;if((await history(db)).length)throw Error('Migration history already exists. Use db:migrate.');
  const required=[...markers['0.31.2'],...(version==='0.35.5'?markers['0.35.5']:[])];for(const [table,column]of required){const rows=await db`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} AND column_name=${column}`;if(!rows.length)throw Error('Existing schema does not match '+version+': '+table+'.'+column);}
  await ledger(db);const adopted=files.filter(f=>order(f.name)<(version==='0.35.5'?29:18));for(const f of adopted)await db`INSERT INTO app_migrations(name,checksum,adopted) VALUES(${f.name},${f.checksum},true)`;return adopted.map(f=>f.name);
 });
}
export async function runMigrations(sql,files,{dryRun=false}={}){
 const rows=await history(sql);validateHistory(rows,files);const [existing]=await sql`SELECT to_regclass('public.characters') AS name`;if(!rows.length&&existing.name)throw Error('Existing database has no migration history. Back it up, then run db:adopt -- --from=0.31.2 or --from=0.35.5.');
 const pending=files.filter(f=>!rows.some(r=>r.name===f.name));if(dryRun)return pending.map(f=>f.name);
 for(const f of pending)await sql.begin(async db=>{await db`SELECT pg_advisory_xact_lock(360036)`;await ledger(db);const fresh=await history(db);validateHistory(fresh,files);if(fresh.some(r=>r.name===f.name))return;await db.unsafe(f.text);await db`INSERT INTO app_migrations(name,checksum) VALUES(${f.name},${f.checksum})`;});
 return pending.map(f=>f.name);
}
