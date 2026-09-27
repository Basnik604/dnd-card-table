import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {subclassFixture} from './helpers/subclass-fixture.mjs';
import {subclassActionDefinitions,useSubclassAction,renderSubclassActionPanel} from '../src/web/subclass-actions.mjs';
import {subclassControlProfile,subclassControlResources,dragonWingsActive,renderSubclassControls,useSubclassControl} from '../src/web/subclass-controls.mjs';
import {translateText} from '../src/web/assets/i18n-core.mjs';
const sorcerer=(level=14)=>({class_name:'Sorcerer',subclass_name:'Draconic Sorcery',level});
const berserker=(level=14)=>({class_name:'Barbarian',subclass_name:'Path of the Berserker',level,strength:18,proficiency_bonus:5});
const wings='subclass:draconic:dragon-wings',points='class:sorcerer:sorcery-points';
const presence='subclass:berserker:intimidating-presence',rage='class:barbarian:rage';

test('second-wave subclass features enforce levels, provenance and current class',()=>{
 for(const c of [sorcerer(13),berserker(13),{...sorcerer(),class_name:'Wizard'}, {...berserker(),subclass_name:'Path of the Zealot'}])assert.equal(subclassControlProfile(c),null);
 for(const ruleset of ['dnd5e-2014','a5e']){
  const c={...sorcerer(),builder_meta:{content_sources:{subclass:{ruleset}}}};
  assert.deepEqual(subclassControlResources(c),[]);assert.equal(dragonWingsActive({...c,feature_choices:{dragon_wings:{active:true}}}),false);
 }
 assert.equal(subclassControlProfile(berserker()).dc,17);
 assert.equal(subclassControlProfile({...berserker(),strength:8,proficiency_bonus:5}).dc,12);
 assert.equal(subclassControlResources(sorcerer())[0].max,1);
 assert.equal(subclassActionDefinitions(berserker(2)).length,0);
 assert.deepEqual([3,9,16].map(l=>subclassActionDefinitions(berserker(l))[0].formula),['2d6','3d6','4d6']);
});

test('new cards have Russian visible text, canonical form values and no dice for toggles',()=>{
 const c={...sorcerer(),id:'s'},r=[{source_key:wings,current_value:1,max_value:1},{source_key:points,current_value:3,max_value:14}];
 const html=renderSubclassControls(c,r,s=>translateText(s,'ru'));
 assert.match(html,/Крылья дракона/);assert.match(html,/data-live-action/);assert.doesNotMatch(html,/data-live-roll/);
 assert.match(html,/name="effect" value="wings_start"/);assert.match(html,/name="action" value="subclass_control"/);
 for(const fragment of [html,renderSubclassControls({...berserker(),id:'b'},[],s=>translateText(s,'ru')),renderSubclassActionPanel({...berserker(),id:'b'},[],s=>translateText(s,'ru'))]){
  const text=[];const walk=n=>{if(n.nodeName==='#text' && /[a-zA-Z]{2}/.test(n.value))text.push(n.value.trim());for(const child of n.childNodes||[])walk(child);};walk(parseFragment(fragment));
  assert.deepEqual(text,[],'No untranslated visible prose');
 }
 assert.doesNotMatch(renderSubclassActionPanel({...berserker(),id:'b'},[]),/undefined/);
});

test('Frenzy confirmation is required and its bonus never spends another Rage use',async()=>{
 const f=await subclassFixture();try{
  await f.create({...berserker(9),id:'b'});
  const before=(await f.resources('b')).find(r=>r.source_key===rage).current_value;
  await assert.rejects(()=>useSubclassAction(f.sql,'b',{effect:'frenzy'}),/Confirm/);
  const result=await useSubclassAction(f.sql,'b',{effect:'frenzy',confirmed:'yes'},formula=>({total:12,formula,dice:[],parts:[]}));
  assert.equal(result.formula,'3d6');assert.equal(result.total,12);assert.match(result.outcome,/same damage type/);
  assert.equal((await f.resources('b')).find(r=>r.source_key===rage).current_value,before);
  assert.equal((await f.sql`SELECT * FROM roll_log`).length,1);
 }finally{await f.db.close();}
});

test('controls persist, restore resources atomically and respect rest rules',async t=>{
 const f=await subclassFixture();
 const count=async(id,key)=>(await f.resources(id)).find(r=>r.source_key===key).current_value;
 try{
  await f.create({...sorcerer(),id:'s'});await f.create({...berserker(),id:'b'});
  await t.test('wings start once, preserve other choices, and dismiss without refund',async()=>{
   const result=await useSubclassControl(f.sql,'s',{effect:'wings_start'});
   assert.equal(result.effects.flight,true);assert.equal(await count('s',wings),0);
   assert.equal((await f.character('s')).feature_choices.keep,'original');
   assert.equal((await f.character('s')).feature_choices.concentration.name,'Bless');
   await assert.rejects(()=>useSubclassControl(f.sql,'s',{effect:'wings_start'}),/already active/);
   assert.equal(await count('s',wings),0);
   await useSubclassControl(f.sql,'s',{effect:'wings_end'});
   assert.equal(dragonWingsActive(await f.character('s')),false);assert.equal(await count('s',wings),0);
  });
  await t.test('restoring costs exactly 3 points, does not activate, and cannot refill an available use',async()=>{
   await useSubclassControl(f.sql,'s',{effect:'wings_restore'});
   assert.equal(await count('s',points),11);assert.equal(await count('s',wings),1);
   assert.equal(dragonWingsActive(await f.character('s')),false);
   await assert.rejects(()=>useSubclassControl(f.sql,'s',{effect:'wings_restore'}),/already has/);
   assert.equal(await count('s',points),11);
  });
  await t.test('a use can be restored during active flight without ending it',async()=>{
   await useSubclassControl(f.sql,'s',{effect:'wings_start'});
   await useSubclassControl(f.sql,'s',{effect:'wings_restore'});
   assert.equal(dragonWingsActive(await f.character('s')),true);
   assert.equal(await count('s',wings),1);assert.equal(await count('s',points),8);
   await useSubclassControl(f.sql,'s',{effect:'wings_end'});
   assert.equal(await count('s',wings),1);
  });
  await t.test('insufficient points do not restore or spend anything',async()=>{
   await useSubclassControl(f.sql,'s',{effect:'wings_start'});
   await f.sql`UPDATE character_resources SET current_value=2 WHERE character_id='s' AND source_key=${points}`;
   await assert.rejects(()=>useSubclassControl(f.sql,'s',{effect:'wings_restore'}),/Not enough/);
   assert.equal(await count('s',points),2);assert.equal(await count('s',wings),0);assert.equal(dragonWingsActive(await f.character('s')),true);
  });
  await t.test('short rest ends the hour-long wings without replenishing; long rest restores',async()=>{
   await f.restCharacter('s','short');assert.equal(dragonWingsActive(await f.character('s')),false);
   assert.equal(await count('s',wings),0);assert.equal(await count('s',points),2);
   await f.restCharacter('s','long');assert.equal(await count('s',wings),1);assert.equal(await count('s',points),14);
  });
  await t.test('Intimidating Presence consumes its own use and restores for one Rage without activating Rage',async()=>{
   const before=await count('b',rage);
   const result=await useSubclassControl(f.sql,'b',{effect:'presence_use'});
   assert.match(result.outcome,/DC 17/);assert.equal(await count('b',presence),0);assert.equal(await count('b',rage),before);
   await assert.rejects(()=>useSubclassControl(f.sql,'b',{effect:'presence_use'}),/No free/);
   await useSubclassControl(f.sql,'b',{effect:'presence_restore'});
   assert.equal(await count('b',presence),1);assert.equal(await count('b',rage),before-1);
   assert.deepEqual((await f.character('b')).feature_choices,{keep:'original',concentration:{name:'Bless'}});
   await useSubclassControl(f.sql,'b',{effect:'presence_use'});
   await f.restCharacter('b','short');assert.equal(await count('b',presence),0);
   await f.restCharacter('b','long');assert.equal(await count('b',presence),1);
  });
  await t.test('cross-class opcodes and legacy rules are rejected',async()=>{
   await assert.rejects(()=>useSubclassControl(f.sql,'b',{effect:'wings_restore'}),/not available/);
   await assert.rejects(()=>useSubclassControl(f.sql,'s',{effect:'presence_use'}),/not available/);
   await f.create({...sorcerer(),id:'old',builder_meta:{content_sources:{subclass:{ruleset:'dnd5e-2014'}}}});
   await assert.rejects(()=>useSubclassControl(f.sql,'old',{effect:'wings_start'}),/not available/);
  });
  await t.test('failure after recovery rolls back both resources',async()=>{
   await useSubclassControl(f.sql,'s',{effect:'wings_start'});
   const before=await count('s',points);
   await f.db.exec("ALTER TABLE roll_log ADD CONSTRAINT reject_recovery CHECK(formula <> 'wings_restore') NOT VALID");
   await assert.rejects(()=>useSubclassControl(f.sql,'s',{effect:'wings_restore'}));
   assert.equal(await count('s',wings),0);assert.equal(await count('s',points),before);
   assert.equal(dragonWingsActive(await f.character('s')),true);
  });
 }finally{await f.db.close();}
});
