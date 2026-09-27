import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {inspectCharacterContent,repairCharacterContent,repairSummary} from '../src/maintenance/character-content.mjs';
import {builderDatabaseError} from '../src/web/database-errors.mjs';
import {tabletopSql} from './helpers/tabletop-fixture.mjs';
import {serverFunctions} from './helpers/server-functions.mjs';

async function fixture(fn) {
  const db=new PGlite(),sql=tabletopSql(db);
  try {
    await db.exec(readFileSync(new URL('./fixtures/builder-schema.sql',import.meta.url),'utf8'));
    const [{id:source}]=await sql`INSERT INTO content_sources(provider,document_key,name,ruleset) VALUES ('open5e','srd-2024','SRD 5.2','dnd5e-2024') RETURNING id`;
    const ids=[];
    for(const kind of ['class','subclass','species','background','feat']) {
      const raw={name:'Sample '+kind,document:{key:'srd-2024',name:'SRD 5.2',gamesystem:{key:'5e-2024'}},features:[{name:'A feature',desc:'Saved source text'}],traits:[{name:'A trait'}]};
      const [{id}]=await sql`INSERT INTO content_entities(entity_type,source_id,external_key,slug,ruleset,name_en,raw_source) VALUES (${kind},${source},${kind},${kind},'dnd5e-2024',${raw.name},${sql.json(raw)}) RETURNING id`;
      ids.push(id);
    }
    await fn({db,sql,ids});
  } finally {await db.close();}
}
test('reproduces missing relation and restores normalized data offline, preserving source IDs and characters',()=>fixture(async({db,sql,ids})=>{
  await db.exec('DROP TABLE character_content; CREATE TABLE characters(id int PRIMARY KEY,name text,class_entity_id uuid REFERENCES content_entities(id));');
  await sql`INSERT INTO characters VALUES (1,'Персонаж',${ids[0]})`;
  const {builderDataStats}=serverFunctions(['builderDataStats'],{sql});
  await assert.rejects(builderDataStats(),e=>e.code==='42P01'&&e.message.includes('character_content'));
  const state=await inspectCharacterContent(sql);assert.equal(state.tableExists,false);assert.equal(state.recoverable,5);
  assert.equal((await sql`SELECT to_regclass('character_content') AS name`)[0].name,null);
  assert.equal(JSON.stringify(repairSummary(state)).includes('raw_source'),false);
  const before=await sql`SELECT * FROM content_entities ORDER BY id`;
  const result=await repairCharacterContent(sql);assert.equal(result.restored,5);assert.equal(result.existing,5);
  assert.equal((await builderDataStats()).total,5);assert.equal((await builderDataStats()).subclasses,1);
  assert.deepEqual(await sql`SELECT * FROM content_entities ORDER BY id`,before);
  assert.equal((await sql`SELECT class_entity_id FROM characters`)[0].class_entity_id,ids[0]);
  assert.equal((await sql`SELECT traits FROM character_content WHERE entity_id=${ids[0]}`)[0].traits[0].name,'A feature');
  const snapshot=await sql`SELECT * FROM character_content ORDER BY entity_id`;
  assert.equal((await repairCharacterContent(sql)).restored,0);
  assert.deepEqual(await sql`SELECT * FROM character_content ORDER BY entity_id`,snapshot);
}));
test('fills only missing catalog rows and preserves manual edits in existing rows',()=>fixture(async({sql,ids})=>{
  await sql`INSERT INTO character_content(entity_id,content_kind,traits) VALUES (${ids[0]},'class','[{"name":"My edit"}]')`;
  const before=await sql`SELECT * FROM character_content WHERE entity_id=${ids[0]}`;
  assert.equal((await repairCharacterContent(sql)).restored,4);
  assert.deepEqual(await sql`SELECT * FROM character_content WHERE entity_id=${ids[0]}`,before);
}));
test('refuses an empty or wrong database without creating an empty substitute catalog',()=>fixture(async({db,sql})=>{
  await db.exec('DROP TABLE character_content; DELETE FROM content_entities;');
  await assert.rejects(repairCharacterContent(sql),/не найдены сохранённые/);
  assert.equal((await sql`SELECT to_regclass('character_content') AS name`)[0].name,null);
  await db.exec('DROP TABLE content_entities CASCADE;');
  assert.equal((await inspectCharacterContent(sql)).canRepair,false);
}));
test('missing or unsupported saved source stops the entire recovery before writes',()=>fixture(async({db,sql,ids})=>{
  await db.exec('DROP TABLE character_content;');
  await sql`UPDATE content_entities SET raw_source=NULL WHERE id=${ids[1]}`;
  const state=await inspectCharacterContent(sql);assert.equal(state.unrecoverable,1);assert.equal(state.recoverable,4);
  await assert.rejects(repairCharacterContent(sql),/нет пригодного/);
  assert.equal((await sql`SELECT to_regclass('character_content') AS name`)[0].name,null);
}));
test('a database rejection rolls back every recovered row',()=>fixture(async({db,sql})=>{
  await db.exec("ALTER TABLE character_content ADD CONSTRAINT test_reject_background CHECK (content_kind <> 'background');");
  await assert.rejects(repairCharacterContent(sql),e=>e.code==='23514');
  assert.equal(Number((await sql`SELECT COUNT(*) AS count FROM character_content`)[0].count),0);
}));
test('does not shadow a catalog hidden in another schema',()=>fixture(async({db,sql})=>{
  await db.exec('CREATE SCHEMA archive; ALTER TABLE character_content SET SCHEMA archive;');
  const state=await inspectCharacterContent(sql);assert.equal(state.canRepair,false);assert.match(state.reason,/другой схеме/);
  await assert.rejects(repairCharacterContent(sql),/другой схеме/);
  assert.equal((await sql`SELECT to_regclass('public.character_content') AS name`)[0].name,null);
}));
test('missing builder table has a specific recovery response without hiding unrelated SQL errors',()=>{
  const error={code:'42P01',message:'relation "character_content" does not exist'};
  assert.equal(builderDatabaseError(error).status,503);
  assert.match(builderDatabaseError(error).content,/npm.cmd run db:repair:character-content/);
  assert.match(builderDatabaseError(error,'en').title,/Builder data/);
  assert.equal(builderDatabaseError({code:'42P01',message:'relation "characters" does not exist'}),null);
  assert.equal(builderDatabaseError({...error,code:'42501'}),null);
});
