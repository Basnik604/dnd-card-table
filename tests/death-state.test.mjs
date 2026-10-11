import test from 'node:test';import assert from 'node:assert/strict';import {deathRoll,emptyDeath} from '../src/web/death-state.mjs';import {applyHitPointDelta} from '../src/web/combat-state.mjs';
const character=(hp=0,extra={})=>({hp_current:hp,hp_max:20,temp_hp:0,feature_choices:{},...extra});
test('death dice: raw 1 causes two failures, raw 20 heals and three successes stabilize with reset counters',()=>{
 assert.equal(deathRoll(emptyDeath(),1,40).state.failures,2);assert.equal(deathRoll(emptyDeath(),20,-10).hp,1);
 const result=deathRoll({successes:2,failures:2,last_turn:'keep'},10);assert.equal(result.state.stable,true);assert.equal(result.state.failures,0);assert.equal(result.state.successes,0);assert.equal(result.state.last_turn,'keep');assert.equal(deathRoll({successes:2,failures:2},9).state.dead,true);
});
test('damage at zero HP preserves successes, ends stability and critical damage counts twice',()=>{
 const source=character(0,{temp_hp:10,feature_choices:{death_saves:{successes:1,failures:0}}});const next=applyHitPointDelta(source,-1,{critical:true});assert.equal(next.temp_hp,9);assert.equal(next.feature_choices.death_saves.successes,1);assert.equal(next.feature_choices.death_saves.failures,2);assert.equal(applyHitPointDelta(next,-1).feature_choices.death_saves.dead,true);
 assert.equal(applyHitPointDelta(character(0,{feature_choices:{death_saves:{stable:true}}}),-1).feature_choices.death_saves.stable,false);
});
test('massive damage handles remaining damage and ordinary healing resets counters without allowing revival',()=>{
 const dying=applyHitPointDelta(character(5),-24);assert.equal(dying.feature_choices.death_saves.dead,false);const dead=applyHitPointDelta(character(5),-25);assert.equal(dead.feature_choices.death_saves.dead,true);assert.throws(()=>applyHitPointDelta(dead,5),/revival/);assert.equal(applyHitPointDelta(dead,5,{revive:true}).hp_current,5);
 const healed=applyHitPointDelta(character(0,{feature_choices:{death_saves:{failures:2,last_turn:'turn'}}}),3);assert.equal(healed.feature_choices.death_saves.failures,0);assert.equal(healed.feature_choices.death_saves.last_turn,'turn');assert.equal(applyHitPointDelta(character(5,{temp_hp:10}),-25).feature_choices.death_saves.dead,false);
});
