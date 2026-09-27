import test from 'node:test';
import assert from 'node:assert/strict';
import {subclassActionDefinitions as definitions,subclassResourceDefinitions,useSubclassAction,renderSubclassActionPanel} from '../src/web/subclass-actions.mjs';
import {subclassFixture} from './helpers/subclass-fixture.mjs';
import {translateText} from '../src/web/assets/i18n-core.mjs';
const monk=(level=6)=>({class_name:'Monk',subclass_name:'Warrior of the Open Hand',wisdom:16,level});
const bard=(level=3)=>({class_name:'Bard',subclass_name:'College of Lore',charisma:16,level});
const warlock=(level=6)=>({class_name:'Warlock',subclass_name:'Fiend Patron',charisma:16,level});
const fixed=(total=5)=>formula=>({total,formula,dice:[{sides:Number(formula.match(/d(\d+)/)?.[1]||10),value:5}],parts:['test roll']});

test('subclass actions enforce class, level, and explicit 2024 provenance',()=>{
  assert.equal(definitions(monk(5)).length,0);assert.equal(definitions(warlock(2)).length,0);assert.equal(definitions(bard(2)).length,0);
  assert.equal(definitions(warlock(3)).length,1);assert.equal(definitions(warlock(6)).length,2);
  assert.equal(definitions({...warlock(),subclass_name:'Archfey Patron'}).length,0);
  assert.equal(definitions({...monk(),class_name:'Fighter'}).length,0);
  for(const ruleset of ['dnd5e-2014','a5e'])for(const type of ['class','subclass'])assert.deepEqual(definitions({...bard(),builder_meta:{content_sources:{[type]:{ruleset}}}}),[]);
});
test('dice and daily uses scale with level and actual ability modifiers',()=>{
  assert.deepEqual([6,11,17].map(l=>definitions(monk(l))[0].formula),['1d8+3','1d10+3','1d12+3']);
  assert.deepEqual([3,5,10,15].map(l=>definitions(bard(l))[0].formula),['1d6','1d8','1d10','1d12']);
  assert.equal(subclassResourceDefinitions({...monk(),wisdom:6})[0].max,1);
  assert.equal(subclassResourceDefinitions({...warlock(),charisma:6})[0].max,1);
  assert.equal(definitions({...monk(),wisdom:6})[0].formula,'1d8-2');
  assert.equal(definitions({...warlock(3),charisma:2})[0].amount,1);
  assert.deepEqual(subclassResourceDefinitions(bard()),[],'Cutting Words shares existing inspiration');
});
test('Russian cards translate labels, show recovery guidance, and keep canonical form values',()=>{
  const c={...warlock(),id:'hero'};
  const html=renderSubclassActionPanel(c,[],s=>translateText(s,'ru'));
  assert.match(html,/Удача тёмного/);assert.match(html,/Нужен продолжительный отдых/);
  assert.match(html,/data-roll-label="Удача тёмного"/);
  assert.match(html,/name="action" value="subclass_action"/);
  assert.match(html,/name="effect" value="dark_luck"/);
  assert.match(html,/name="confirmed" value="yes" required/);
  assert.match(html,/data-spend-resource disabled/);
  assert.doesNotMatch(html,/Dark One|No uses left|Triggering roll/);
  assert.match(renderSubclassActionPanel({...c,name:'<script>alert(1)</script>'},[]),/subclass-actions-panel/);
});

test('subclass SQL actions persist effects, share resources, and roll back on failure',async t=>{
 const f=await subclassFixture();
 try{
  await t.test('blessing does not stack temporary HP or lower a larger existing buffer',async()=>{
    await f.create({id:'fiend',temp_hp:20});
    let r=await useSubclassAction(f.sql,'fiend',{effect:'dark_blessing',confirmed:'yes'});
    assert.equal(r.effects.tempHp,20);assert.equal(r.total,9);
    await f.sql`UPDATE characters SET temp_hp=1 WHERE id='fiend'`;
    r=await useSubclassAction(f.sql,'fiend',{effect:'dark_blessing',confirmed:'yes'});
    assert.equal(r.effects.tempHp,9);assert.equal((await f.character('fiend')).hp_current,10);
    assert.equal((await f.resources('fiend')).find(r=>r.source_key.endsWith('dark-luck')).current_value,3);
    assert.deepEqual((await f.character('fiend')).feature_choices,{keep:'original',concentration:{name:'Bless'}});
  });
  await t.test('invalid triggers, wrong class and unsupported rolls do not spend uses',async()=>{
    for(const form of [{effect:'dark_luck',roll_type:'ability'},{effect:'dark_luck',confirmed:'yes',roll_type:'attack'},{effect:'wholeness'}])await assert.rejects(()=>useSubclassAction(f.sql,'fiend',form));
    assert.equal((await f.resources('fiend')).find(r=>r.source_key.endsWith('dark-luck')).current_value,3);
    await f.create({...bard(),id:'legacy',builder_meta:{content_sources:{subclass:{ruleset:'dnd5e-2014'}}}});
    await assert.rejects(()=>useSubclassAction(f.sql,'legacy',{effect:'cutting_words',roll_type:'attack',confirmed:'yes'}),/not available/);
  });
  await t.test('luck exhausts exactly, rejects further use, and recovers only on a long rest',async()=>{
    const form={effect:'dark_luck',roll_type:'save',confirmed:'yes'};
    for(let n=2;n>=0;n--){const r=await useSubclassAction(f.sql,'fiend',form,fixed(7));assert.equal(r.effects.resource.current,n);assert.equal(r.total,7);}
    await assert.rejects(()=>useSubclassAction(f.sql,'fiend',form),/No uses/);
    await f.restCharacter('fiend','short');assert.equal((await f.resources('fiend')).find(r=>r.source_key.endsWith('dark-luck')).current_value,0);
    await f.restCharacter('fiend','long');assert.equal((await f.resources('fiend')).find(r=>r.source_key.endsWith('dark-luck')).current_value,3);
  });
  await t.test('Wholeness updates HP and linked encounters, preserves other state and respects minimum healing',async()=>{
    await f.create({...monk(),id:'monk',hp_current:28});
    const r=await useSubclassAction(f.sql,'monk',{effect:'wholeness'},fixed(12));
    assert.deepEqual(r.effects.hp,{current:30,max:30});assert.match(r.outcome,/Regained 2 HP/);
    assert.equal((await f.sql`SELECT hp_current FROM encounter_combatants WHERE character_id='monk'`)[0].hp_current,30);
    assert.equal((await f.character('monk')).feature_choices.concentration.name,'Bless');
    await assert.rejects(()=>useSubclassAction(f.sql,'monk',{effect:'wholeness'}),/already full/);
    assert.equal((await f.resources('monk')).find(r=>r.source_key.endsWith('wholeness')).current_value,2);
    await f.sql`UPDATE characters SET hp_current=10 WHERE id='monk'`;
    const minimum=await useSubclassAction(f.sql,'monk',{effect:'wholeness'},fixed(-1));assert.equal(minimum.total,1);assert.equal(minimum.effects.hp.current,11);
    await f.restCharacter('monk','short');assert.equal((await f.resources('monk')).find(r=>r.source_key.endsWith('wholeness')).current_value,1);
    await f.restCharacter('monk','long');assert.equal((await f.resources('monk')).find(r=>r.source_key.endsWith('wholeness')).current_value,3);
  });
  await t.test('Cutting Words shares inspiration and follows its level-dependent rest recovery',async()=>{
    for(const level of [3,5]){
      const id='bard'+level;await f.create({...bard(level),id});
      const result=await useSubclassAction(f.sql,id,{effect:'cutting_words',roll_type:'attack',confirmed:'yes'},fixed(4));
      assert.equal(result.effects.resource.key,'class:bard:bardic-inspiration');assert.equal(result.effects.resource.current,2);
      await f.restCharacter(id,'short');assert.equal((await f.resources(id))[0].current_value,level===3?2:3);
    }
  });
  await t.test('failure after spending rolls back resource, HP and roll log together',async()=>{
    await f.create({...monk(),id:'rollback'});
    await f.db.exec("ALTER TABLE roll_log ADD CONSTRAINT fail_healing CHECK(label NOT LIKE '%Wholeness%') NOT VALID");
    await assert.rejects(()=>useSubclassAction(f.sql,'rollback',{effect:'wholeness'},fixed(8)));
    assert.equal((await f.character('rollback')).hp_current,10);
    assert.equal((await f.resources('rollback')).find(r=>r.source_key.endsWith('wholeness')).current_value,3);
    assert.equal((await f.sql`SELECT hp_current FROM encounter_combatants WHERE character_id='rollback'`)[0].hp_current,10);
  });
 }finally{await f.db.close();}
});
