import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { readCatalog } from '../src/localization/catalog.mjs';

test('database export reads real normalized content but no characters or connection secrets',async()=>{
  const db=new PGlite();
  try{
    await db.exec(await readFile(new URL('./fixtures/builder-schema.sql',import.meta.url),'utf8'));
    await db.exec(`CREATE TABLE characters (name text, notes text); INSERT INTO characters VALUES ('PrivatePlayer','PrivateCampaignNote');`);
    const source=(await db.query(`INSERT INTO content_sources(provider,document_key,name,ruleset) VALUES ('open5e','srd-2024','SRD 5.2','dnd5e-2024') RETURNING id`)).rows[0].id;
    const entity=(await db.query(`INSERT INTO content_entities(entity_type,source_id,slug,name_en,description_en,ruleset,external_key) VALUES ('class',$1,'druid','Druid','Choose 2 skills.','dnd5e-2024','srd-2024_druid') RETURNING id`,[source])).rows[0].id;
    await db.query(`INSERT INTO character_content(entity_id,content_kind,traits) VALUES ($1,'class',$2)`,[entity,JSON.stringify([{name:'Wild Shape',description:'Regain 1 use.'}])]);
    const sql=async(strings,...values)=>(await db.query(strings.reduce((s,part,i)=>s+(i?'$'+i:'')+part,''),values)).rows;
    sql.unsafe=async text=>(await db.query(text)).rows;
    const manifest=await readCatalog(sql);
    assert.equal(manifest.entityCount,1);
    assert.ok(manifest.segments.some(s=>s.text==='Regain 1 use.'));
    assert.ok(manifest.segments.every(s=>s.ruleset==='dnd5e-2024'));
    assert.ok(!JSON.stringify(manifest).includes('Private'));
    assert.ok(!JSON.stringify(manifest).includes(source));
  }finally{await db.close();}
});
