import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import * as normalization from '../src/shared/builder-content.mjs';

// Execute the production importer functions against PostgreSQL, without its
// network/download entry point. This adapter only converts tagged parameters.
function sqlAdapter(db){
  const sql=async (strings,...values)=>{
    const query=strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,'');
    return (await db.query(query,values)).rows;
  };
  sql.json=value=>JSON.stringify(value);
  sql.begin=callback=>db.transaction(tx=>callback(sqlAdapter(tx)));
  return sql;
}
function importer(sql,logger=console){
  const source=readFileSync(new URL('../src/importers/open5e/charactercontent.ts',import.meta.url),'utf8');
  const functions=source.split('\nlet failed=false;')[0].replace(/^import[\s\S]*?;\n/gm,'');
  return new Function('sql','crypto','console',...Object.keys(normalization),
    stripTypeScriptTypes(functions)+'\nreturn {upsert,ensureSource,importGroup};'
  )(sql,crypto,logger,...Object.values(normalization));
}
const document={key:'srd-2024',name:'Test SRD',gamesystem:{key:'5e-2024'},publisher:{name:'Test'},licenses:[]};

test('failed download import reports saved database totals and exits unsuccessfully',async()=>{
  const db=new PGlite();
  try{
    await db.exec(readFileSync(new URL('./fixtures/builder-schema.sql',import.meta.url),'utf8'));
    await db.exec("ALTER TABLE character_content ADD CONSTRAINT reject_species CHECK (content_kind <> 'species')");
    const sql=sqlAdapter(db);
    sql.end=async()=>{};
    const output=[];
    const logger={log(...args){output.push(args);},error(...args){output.push(args);}};
    const processState={env:{},exitCode:0};
    const resources={documents:[document],classes:[],feats:[],
      species:[{key:'elf',name:'Elf',document}],
      backgrounds:[{key:'acolyte',name:'Acolyte',document}]};
    const fetchPage=async url=>({ok:true,json:async()=>({
      results:resources[new URL(url).pathname.split('/').filter(Boolean).at(-1)],next:null
    })});
    const source=readFileSync(new URL('../src/importers/open5e/charactercontent.ts',import.meta.url),'utf8')
      .replace(/^import[\s\S]*?;\n/gm,'');
    const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
    await new AsyncFunction('sql','crypto','console','fetch','process',...Object.keys(normalization),
      stripTypeScriptTypes(source))(sql,crypto,logger,fetchPage,processState,...Object.values(normalization));
    assert.equal(processState.exitCode,1);
    const saved=output.find(row=>row[0]==='Saved Builder Data totals:')[1];
    assert.equal(saved.species,0);
    assert.equal(saved.background,1);
    const candidates=output.find(row=>row[0]==='Downloaded catalog candidates (not a database count):')[1];
    assert.equal(candidates.species,1);
    assert.ok(output.some(row=>row[0]==='Record import failed:'&&row[1].code==='23514'));
    assert.ok(!output.some(row=>row[0]==='Character content import completed successfully.'));
  }finally{await db.close();}
});

for(const key of ['source_id, external_key','source_id, entity_type, external_key']){
  test('PostgreSQL import lifecycle with UNIQUE('+key+')',async()=>{
    const db=new PGlite();
    try{
      const schema=readFileSync(new URL('./fixtures/builder-schema.sql',import.meta.url),'utf8')
        .replace('UNIQUE(source_id, external_key)','UNIQUE('+key+')');
      await db.exec(schema);
      const errors=[];
      const sql=sqlAdapter(db);
      const api=importer(sql,{log(){},error(...args){errors.push(args);}});
      const sourceId=await api.ensureSource(document);
      if(key.includes('entity_type')){
        // Reproduces the v0.20 failure before testing the repaired writer.
        await assert.rejects(db.query(`INSERT INTO content_entities
          (entity_type,source_id,external_key,slug,ruleset,name_en)
          VALUES ('class',$1,'broken','broken','dnd5e-2024','Broken')
          ON CONFLICT(source_id,external_key) DO NOTHING`,[sourceId]),
          error=>error.code==='42P10');
      }
      for(const kind of ['class','subclass','species','background','feat']){
        const record={key:kind+'-sample',name:'Sample '+kind,document};
        assert.equal(await api.upsert(sourceId,document,kind,record),'created');
        const [{id}]=await sql`SELECT id FROM content_entities WHERE external_key=${record.key}`;
        assert.equal(await api.upsert(sourceId,document,kind,record),'renormalized');
        assert.equal(await api.upsert(sourceId,document,kind,{...record,name:'Updated '+kind}),'updated');
        const rows=await sql`SELECT e.id,e.name_en,c.content_kind FROM content_entities e
          JOIN character_content c ON c.entity_id=e.id WHERE e.external_key=${record.key}`;
        assert.equal(rows.length,1);
        assert.equal(rows[0].id,id);
        assert.equal(rows[0].name_en,'Updated '+kind);
        assert.equal(rows[0].content_kind,kind);
      }
      // Force a later-table failure: entity changes must roll back too.
      await db.exec("ALTER TABLE character_content ADD CONSTRAINT reject_background CHECK (content_kind <> 'background') NOT VALID");
      const existing={key:'background-sample',name:'Must not persist',document};
      await assert.rejects(api.upsert(sourceId,document,'background',existing),error=>error.code==='23514');
      const [unchanged]=await sql`SELECT name_en FROM content_entities WHERE external_key='background-sample'`;
      assert.equal(unchanged.name_en,'Updated background');
      await assert.rejects(api.importGroup(sourceId,document,'background',[
        {key:'new-failed-background',name:'New failing record',document}
      ]),/1 background rows failed/);
      assert.equal((await sql`SELECT id FROM content_entities WHERE external_key='new-failed-background'`).length,0);
      const [run]=await sql`SELECT failed,status,errors FROM import_runs`;
      assert.equal(run.failed,1);
      assert.equal(run.status,'completed_with_errors');
      assert.equal(run.errors[0].code,'23514');
      assert.equal(errors[0][0],'Record import failed:');
      assert.equal(errors[0][1].key,'new-failed-background');
      assert.equal(errors[0][1].code,'23514');
      assert.equal((await sql`SELECT id FROM content_entities`).length,5);
    }finally{await db.close();}
  });
}
