import test from 'node:test';import assert from 'node:assert/strict';import {conditionRoll} from '../src/web/assets/condition-rolls.mjs';
const unit=(...conditions)=>({tactics:{conditions:conditions.map(key=>typeof key==='string'?{key}:key)}});
test('simple condition advantages cancel rather than stack and Exhaustion affects the rolling unit',()=>{
 const actor=unit('poisoned',{key:'exhaustion',level:2}),target=unit('restrained');assert.deepEqual(conditionRoll({actor,target,kind:'attack'}),{mode:'',modifier:-4,autoFail:false});assert.equal(conditionRoll({actor,target:unit(),kind:'attack'}).mode,'disadvantage');assert.equal(conditionRoll({actor,target:unit(),kind:'attack',mode:'advantage'}).mode,'');
 assert.deepEqual(conditionRoll({actor:unit({key:'exhaustion',level:4}),target:unit({key:'exhaustion',level:1}),kind:'save',ability:'constitution'}),{mode:'',modifier:-2,autoFail:false});
});
test('selected Strength/Dexterity saves fail automatically, conditional sight effects remain a GM decision',()=>{
 assert.equal(conditionRoll({actor:unit(),target:unit('paralyzed'),kind:'save',ability:'dexterity'}).autoFail,true);assert.equal(conditionRoll({actor:unit(),target:unit('paralyzed'),kind:'save',ability:'constitution'}).autoFail,false);assert.equal(conditionRoll({actor:unit(),target:unit('restrained'),kind:'save',ability:'dexterity'}).mode,'disadvantage');assert.equal(conditionRoll({actor:unit('invisible','frightened'),target:unit('prone'),kind:'attack'}).mode,'');
});
