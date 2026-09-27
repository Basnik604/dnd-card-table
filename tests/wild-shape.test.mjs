import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serverFunctions} from "./helpers/server-functions.mjs";
import {translateText} from "../src/web/assets/i18n-core.mjs";

const source=readFileSync(new URL("../src/web/server.mjs",import.meta.url),"utf8");

const stateFns=serverFunctions([
  "numberText","challengeRatingValue","challengeRatingText","creatureHasFlySpeed",
  "wildShapeRules","wildShapeState","pendingClassChoices","firstDiceFormula",
  "familiarAttackProfile","wildShapeActionProfile"
],{
  featureChoiceValue:(c,key)=>c.feature_choices?.[key]??null,
  metamagicSelections:()=>[],metamagicLimit:()=>0,
  invocationSelections:()=>[],warlockInvocationLimit:()=>0,hasInvocation:()=>false,
  pactTomeSelections:()=>[],pactFamiliarState:()=>null,
  loreDiscoverySelections:()=>[]
});

function druid(level=2,featureChoices={},extra={}){
  return {id:"druid-1",name:"Mira",class_name:"Druid",level,temp_hp:0,feature_choices:featureChoices,...extra};
}

test("Wild Shape rules scale known forms, challenge rating, flight and duration",()=>{
  assert.deepEqual(stateFns.wildShapeRules(druid(2)),{
    available:true,knownLimit:4,maxCr:0.25,allowFly:false,durationHours:1,temporaryHitPoints:2
  });
  assert.deepEqual(stateFns.wildShapeRules(druid(4)),{
    available:true,knownLimit:6,maxCr:0.5,allowFly:false,durationHours:2,temporaryHitPoints:4
  });
  assert.deepEqual(stateFns.wildShapeRules(druid(8)),{
    available:true,knownLimit:8,maxCr:1,allowFly:true,durationHours:4,temporaryHitPoints:8
  });
  assert.equal(stateFns.challengeRatingValue("1/4"),0.25);
  assert.equal(stateFns.challengeRatingText(0.5),"1/2");
  assert.equal(stateFns.creatureHasFlySpeed({walk:30,fly:60}),true);
  assert.equal(stateFns.creatureHasFlySpeed({walk:30}),false);
});

test("Wild Shape state normalizes known and active forms",()=>{
  const state=stateFns.wildShapeState(druid(6,{wild_shape:{
    known_forms:[{id:"wolf",name:"Wolf",ruleset:"dnd5e-2024"},{id:"wolf",name:"Duplicate"},{id:"","name":"Bad"}],
    active_form:{id:"wolf",name:"Wolf",duration_hours:3,armor_class:13,dexterity:15}
  }}));
  assert.deepEqual(state.known,[{id:"wolf",name:"Wolf",ruleset:"dnd5e-2024",source_key:""}]);
  assert.equal(state.active.name,"Wolf");
  assert.equal(state.active.duration_hours,3);
  assert.equal(state.active.armor_class,13);
});

test("missing learned forms are shown as a pending Druid choice",()=>{
  const pending=stateFns.pendingClassChoices(druid(2,{primal_order:"Warden"}));
  assert.deepEqual(pending,["Wild Shape Forms"]);
  const complete=stateFns.pendingClassChoices(druid(2,{primal_order:"Warden",wild_shape:{known_forms:[1,2,3,4].map(n=>({id:`b${n}`,name:`Beast ${n}`}))}}));
  assert.ok(!complete.includes("Wild Shape Forms"));
});

test("Wild Shape action profiles expose attack, damage and save controls",()=>{
  const profile=stateFns.wildShapeActionProfile({
    action_type:"Action",name_en:"Bite",
    description_en:"Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage. DC 13 Strength save.",
    raw_data:null
  });
  assert.deepEqual(profile,{
    name:"Bite",attack:"1d20+5",damage:"1d8+3",saveDc:13,
    action_type:"Action",description:"Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage. DC 13 Strength save."
  });
});

test("Wild Shape catalogue keeps eligible Beasts and blocks flight before level 8",async()=>{
  const rows=[
    {id:"wolf24",name_en:"Wolf",ruleset:"dnd5e-2024",source_key:"srd-2024",creature_type:"Beast",challenge_rating:0.25,speed:{walk:40},armor_class:13},
    {id:"wolf14",name_en:"Wolf",ruleset:"dnd5e-2014",source_key:"srd-2014",creature_type:"Beast",challenge_rating:0.25,speed:{walk:40},armor_class:13},
    {id:"eagle",name_en:"Giant Eagle",ruleset:"dnd5e-2024",source_key:"srd-2024",creature_type:"Beast",challenge_rating:1,speed:{walk:10,fly:80},armor_class:13}
  ];
  const actions=[{entity_id:"wolf24",action_type:"Action",name_en:"Bite",description_en:"Melee Attack Roll: +4. Hit: 5 (1d6 + 2) damage.",raw_data:null}];
  const sql=(first,...values)=>{
    if(Array.isArray(first)&&!Object.hasOwn(first,"raw")) return first;
    const query=first.join("?");
    if(query.includes("FROM content_entities")) return Promise.resolve(rows);
    if(query.includes("FROM entity_actions")) return Promise.resolve(actions);
    return Promise.resolve([]);
  };
  const fns=serverFunctions([
    "challengeRatingValue","creatureHasFlySpeed","wildShapeRules","firstDiceFormula",
    "familiarAttackProfile","wildShapeActionProfile","wildShapeOptions"
  ],{sql});
  const level2=await fns.wildShapeOptions(druid(2));
  assert.equal(level2.length,2);
  assert.equal(level2.find(x=>x.name_en==="Wolf").id,"wolf24");
  assert.equal(level2.find(x=>x.name_en==="Wolf").eligible,true);
  assert.equal(level2.find(x=>x.name_en==="Giant Eagle").eligible,false);
  assert.equal(level2.find(x=>x.name_en==="Wolf").actions[0].damage,"1d6+2");

  const level8=await fns.wildShapeOptions(druid(8));
  assert.equal(level8.find(x=>x.name_en==="Giant Eagle").eligible,true);
});

test("transforming spends one use, records the form and grants level-based Temporary HP",async()=>{
  const character=druid(5,{wild_shape:{known_forms:[{id:"wolf",name:"Wolf"}]}},{temp_hp:1});
  const calls=[];
  const sql=(first,...values)=>{
    if(Array.isArray(first)&&!Object.hasOwn(first,"raw")) return first;
    calls.push({query:first.join("?"),values});
    return Promise.resolve([]);
  };
  const patches=[];
  const spent=[];
  const fns=serverFunctions(["wildShapeRules","wildShapeState","setWildShape"],{
    getCharacter:async()=>({character}),
    wildShapeOptions:async()=>[{id:"wolf",name_en:"Wolf",eligible:true,armor_class:13,dexterity:15}],
    spendManagedResourceByKey:async(...args)=>spent.push(args),
    numericArmorClass:()=>13,
    patchCharacterFeatureChoices:async(id,patch)=>patches.push({id,patch}),
    sql
  });
  await fns.setWildShape(character.id,{action:"transform",entity_id:"wolf"});
  assert.deepEqual(spent,[["druid-1","class:druid:wild-shape",1]]);
  assert.match(calls[0].query,/temp_hp=GREATEST/);
  assert.equal(calls[0].values[0],5);
  assert.equal(patches[0].patch.wild_shape.active_form.name,"Wolf");
  assert.equal(patches[0].patch.wild_shape.active_form.duration_hours,2);
});

test("Wild Shape renderers provide learning, transformation and combat action controls",()=>{
  const fns=serverFunctions([
    "challengeRatingValue","challengeRatingText","wildShapeRules","wildShapeState",
    "renderWildShapeActionList","renderWildShapeActiveCard","renderWildShapePanel","renderWildShapeCombatPanel"
  ],{
    numberText:value=>String(value),
    esc:value=>String(value??""),
    displayContext:{getStore:()=>({language:"ru"})},
    entityDisplayName:row=>row?.name_en||row?.name||"",
    displayText:value=>String(value||""),
    truncate:value=>String(value||""),
    characterRollForm:({formula})=>`<form>${formula}</form>`,
    acText:value=>String(value),speedText:()=>"40 ft.",abilityText:value=>String(value)
  });
  const character=druid(2,{wild_shape:{
    known_forms:[{id:"wolf",name:"Wolf"}],
    active_form:{id:"wolf",name:"Wolf",duration_hours:1,armor_class:13,dexterity:15}
  }},{temp_hp:2});
  const form={id:"wolf",name_en:"Wolf",eligible:true,cr:0.25,challenge_rating:0.25,armor_class:13,speed:{walk:40},strength:12,dexterity:15,constitution:12,size:"Medium",actions:[{name:"Bite",action_type:"Action",description:"Bite target.",attack:"1d20+4",damage:"1d6+2",saveDc:null}]};
  const resources=[{source_key:"class:druid:wild-shape",current_value:1,max_value:2}];
  const html=fns.renderWildShapePanel(character,[form],resources);
  assert.match(html,/Wild Shape Forms/);
  assert.match(html,/Active Wild Shape/);
  assert.match(html,/1d20\+4/);
  assert.match(html,/\/wild-shape/);
  assert.match(html,/Temporary HP/);
  assert.match(fns.renderWildShapeCombatPanel(character,[form],resources,"\/character\/druid-1"),/Bite/);
});

test("server wires the Wild Shape route, catalogue and encounter action switch",()=>{
  for(const fragment of [
    'endsWith("/wild-shape")',"async function wildShapeOptions","class:druid:wild-shape",
    "renderWildShapeCombatPanel","const wild=wildShapeState(c)"
  ]) assert.ok(source.includes(fragment),`missing ${fragment}`);
});

test("new Wild Shape controls are localized",()=>{
  for(const text of [
    "Wild Shape Forms","Learn form","Fill recommended forms","Leave form · Bonus Action",
    "No Wild Shape forms learned yet.","Choose an eligible Beast form for this Druid level"
  ]) assert.notEqual(translateText(text,"ru"),text,text);
  assert.equal(translateText("4/6 · CR 1/2 · No Fly","ru"),"4/6 · ПО 1/2 · Без полёта");
  assert.equal(translateText("8/8 · CR 1 · Fly allowed","ru"),"8/8 · ПО 1 · Полёт разрешён");
  assert.equal(translateText("AC 13 · fly 60 ft. · Temporary HP 8","ru"),"КД 13 · полёт 60 фт. · Временные хиты 8");
});
