import {subclassControlResources} from "../../src/web/subclass-controls.mjs";
import {PGlite} from '@electric-sql/pglite';
import {serverFunctions} from './server-functions.mjs';
import {subclassResourceDefinitions} from '../../src/web/subclass-actions.mjs';
export function sqlAdapter(db){
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
  sql.json=value=>JSON.stringify(value);
  sql.begin=callback=>db.transaction(tx=>callback(sqlAdapter(tx)));
  return sql;
}
export async function subclassFixture(){
  const db=new PGlite(),sql=sqlAdapter(db);
  await db.exec(`CREATE TABLE characters(id text PRIMARY KEY,name text,class_name text,subclass_name text,level int,
    charisma int,wisdom int,strength int,proficiency_bonus int,hp_current int,hp_max int,temp_hp int,feature_choices jsonb,builder_meta jsonb,updated_at timestamptz);
    CREATE TABLE character_resources(id serial PRIMARY KEY,character_id text,source_key text,current_value int CHECK(current_value>=0),max_value int,recharge text,short_rest_gain int DEFAULT 0,updated_at timestamptz,UNIQUE(character_id,source_key));
    CREATE TABLE character_spell_slots(character_id text,current_slots int,max_slots int,recharge text);
    CREATE TABLE encounter_combatants(character_id text,hp_current int,hp_max int,updated_at timestamptz);
    CREATE TABLE roll_log(label text,formula text,total int,detail jsonb);`);
  const {automaticResourceDefinitions}=serverFunctions(['abilityModifier','automaticResourceDefinitions'],{subclassResourceDefinitions,subclassControlResources});
  const {restCharacter}=serverFunctions(['restCharacter'],{sql});
  const create=async(overrides={})=>{
    const c={id:'hero',name:'Hero',class_name:'Warlock',subclass_name:'Fiend Patron',level:6,charisma:16,wisdom:16,strength:18,proficiency_bonus:5,hp_current:10,hp_max:30,temp_hp:0,
      feature_choices:{keep:'original',concentration:{name:'Bless'}},builder_meta:{content_sources:{subclass:{ruleset:'dnd5e-2024'}}},...overrides};
    await sql`INSERT INTO characters VALUES(${c.id},${c.name},${c.class_name},${c.subclass_name},${c.level},${c.charisma},${c.wisdom},${c.strength},${c.proficiency_bonus},${c.hp_current},${c.hp_max},${c.temp_hp},${sql.json(c.feature_choices)},${sql.json(c.builder_meta)},NOW())`;
    for(const r of automaticResourceDefinitions(c))await sql`INSERT INTO character_resources(character_id,source_key,current_value,max_value,recharge,short_rest_gain) VALUES(${c.id},${r.key},${r.max},${r.max},${r.recharge},${r.shortGain})`;
    await sql`INSERT INTO encounter_combatants VALUES(${c.id},${c.hp_current},${c.hp_max},NOW())`;
    return c;
  };
  const character=async(id='hero')=>(await sql`SELECT * FROM characters WHERE id=${id}`)[0];
  const resources=(id='hero')=>sql`SELECT * FROM character_resources WHERE character_id=${id}`;
  return {db,sql,create,character,resources,restCharacter};
}
