import test from 'node:test';import assert from 'node:assert/strict';import {serverFunctions} from './helpers/server-functions.mjs';
test('battle catalogue uses stable monster IDs and does not turn Multiattack into an attack roll',async()=>{
 const rows=[{id:'multi',name_en:'Multiattack',description_en:'The creature makes two attacks.'},{id:'claw',name_en:'Claw',description_en:'Melee Attack Roll: +5. Hit: 1d6+3 slashing damage.'}];
 const {mapCombatProfile}=serverFunctions(['mapCombatProfile'],{sql:async()=>rows,translateText:s=>s,displayContext:{getStore:()=>({language:'en'})},firstDiceFormula:s=>s?.match(/\d+d\d+(?:[+-]\d+)?/)?.[0]});
 const actions=await mapCombatProfile({entity_id:'monster'});assert.equal(actions.find(a=>a.id==='creature:multi').kind,'utility');assert.equal(actions.find(a=>a.id==='creature:claw').attack_formula,'1d20+5');
});
test('battle spell catalogue filters preparation, uses full save abilities and marks slot availability',async()=>{
 const data={character:{id:'hero'},inventory:[],resources:[],slots:[],spells:[{character_spell_id:'save',spell_level:1,prepared:true,name_en:'Save spell',saving_throw_ability:'Constitution',description_en:'1d6 fire damage. Half damage on a successful save.'},{character_spell_id:'hidden',spell_level:1,prepared:false,name_en:'Unprepared'},{character_spell_id:'heal',spell_level:0,name_en:'Heal',description_en:'Restore 1d4 hit points.'}]};
 const {mapCombatProfile}=serverFunctions(['mapCombatProfile'],{getCharacter:async()=>data,characterSpellProfile:()=>({attack:5,saveDc:13}),spellDamageFormula:s=>s.description_en?.match(/\d+d\d+/)?.[0],translateText:s=>s,displayContext:{getStore:()=>({language:'en'})}});
 const actions=await mapCombatProfile({character_id:'hero'}),save=actions.find(a=>a.id==='spell:save');assert.equal(save.save_ability,'constitution');assert.equal(save.available,false);assert.equal(save.half_on_save,true);assert.equal(save.damage_type,'fire');assert.ok(!actions.some(a=>a.id==='spell:hidden'));assert.equal(actions.find(a=>a.id==='spell:heal').kind,'heal');
});
