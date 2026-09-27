import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serverFunctions} from "./helpers/server-functions.mjs";
import {translateText} from "../src/web/assets/i18n-core.mjs";

const source=readFileSync(new URL("../src/web/server.mjs",import.meta.url),"utf8");

const stateFns=serverFunctions([
  "abilityModifier","featureChoiceValue","featureChoiceArray","metamagicLimit","metamagicSelections",
  "warlockInvocationLimit","invocationSelections","hasInvocation","pactTomeSelections","pactFamiliarState",
  "giftProtectorState","giftProtectorLimit","loreDiscoverySelections","pendingClassChoices",
  "firstDiceFormula","familiarAttackProfile","spellGrantLabel","spellCastButtonText"
]);

function warlock(featureChoices={},extra={}){
  return {id:"warlock-1",class_name:"Warlock",level:5,charisma:18,feature_choices:featureChoices,...extra};
}

function sqlRecorder(){
  const calls=[];
  const sql=async(strings,...values)=>{calls.push({query:strings.join("?"),values});return [];};
  sql.json=value=>value;
  return {sql,calls};
}

test("Book of Shadows state accepts only its three cantrips and two level-1 rituals",()=>{
  const selected=stateFns.pactTomeSelections(warlock({pact_tome:[
    {id:"c1",name:"Light",level:0,ritual:false,ruleset:"dnd5e-2024",source_key:"srd-2024"},
    {id:"r1",name:"Identify",level:1,ritual:true},
    {id:"bad",name:"Fireball",level:3,ritual:false}
  ]}));
  assert.deepEqual(selected.map(x=>x.id),["c1","r1"]);
  assert.equal(selected[0].ruleset,"dnd5e-2024");
});

test("Pact familiar state clamps HP and keeps Investment choices",()=>{
  assert.deepEqual(stateFns.pactFamiliarState(warlock({pact_familiar:{
    form:"Imp",entity_id:"imp",hp_current:99,hp_max:10,movement:"Swim",damage_type:"Radiant"
  }})),{
    form:"Imp",entity_id:"imp",hp_current:10,hp_max:10,movement:"Swim",damage_type:"Radiant"
  });
  assert.equal(stateFns.pactFamiliarState(warlock({})),null);
});

test("familiar attacks parse the 2024 attack bonus, damage dice and save DC",()=>{
  const profile=stateFns.familiarAttackProfile({
    name_en:"Rend",
    description_en:"Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage. DC 13 Constitution save.",
    raw_data:null
  });
  assert.deepEqual(profile,{name:"Rend",attack:"1d20+5",damage:"1d4+3",saveDc:13});
});

test("unfinished Tome and Chain setup appears in pending class choices",()=>{
  const unfinished=warlock({eldritch_invocations:[{name:"Pact of the Tome"},{name:"Pact of the Chain"}]});
  assert.ok(stateFns.pendingClassChoices(unfinished).includes("Book of Shadows"));
  assert.ok(stateFns.pendingClassChoices(unfinished).includes("Pact Familiar"));

  const complete=warlock({
    eldritch_invocations:[{name:"Pact of the Tome"},{name:"Pact of the Chain"}],
    pact_tome:[
      {id:"c1",name:"One",level:0},{id:"c2",name:"Two",level:0},{id:"c3",name:"Three",level:0},
      {id:"r1",name:"Four",level:1,ritual:true},{id:"r2",name:"Five",level:1,ritual:true}
    ],
    pact_familiar:{form:"Owl",hp_current:1,hp_max:1}
  });
  assert.ok(!stateFns.pendingClassChoices(complete).includes("Book of Shadows"));
  assert.ok(!stateFns.pendingClassChoices(complete).includes("Pact Familiar"));
});

test("Pact spells receive explicit source badges",()=>{
  assert.equal(stateFns.spellGrantLabel({source_key:"invocation:pact-tome:spell-1"}),"Book of Shadows");
  assert.equal(stateFns.spellGrantLabel({source_key:"invocation:pact-chain:find-familiar"}),"Pact of the Chain");
  assert.equal(stateFns.spellCastButtonText({source_key:"invocation:pact-chain:find-familiar"},1),"Cast without spell slot");
});

test("Tome and familiar renderers expose persistent controls",()=>{
  const deps={
    esc:value=>String(value??""),
    translateText,
    displayContext:{getStore:()=>({language:"ru"})},
    entityDisplayName:row=>String(row?.name_en||row?.name||""),
    renderSpellSearchPicker:({action,buttonText})=>`<form action="${action}">${buttonText}</form>`,
    hasInvocation:(c,name)=>(c.feature_choices?.eldritch_invocations||[]).some(x=>(x.name||x)===name),
    characterSpellProfile:()=>({saveDc:15}),
    acText:()=>"13",
    speedText:()=>"30 ft.",
    characterRollForm:({formula})=>`<form>${formula}</form>`
  };
  const fns=serverFunctions([
    "pactTomeSelections","giftProtectorState","giftProtectorLimit","pactFamiliarState",
    "renderGiftProtectorsPanel","renderPactTomePanel","renderPactFamiliarPanel"
  ],deps);
  const tome=warlock({
    eldritch_invocations:[{name:"Pact of the Tome"}],
    pact_tome:[{id:"light",name:"Light",level:0}]
  });
  const tomeHtml=fns.renderPactTomePanel(tome,{cantrips:[],rituals:[]});
  assert.match(tomeHtml,/Book of Shadows/);
  assert.match(tomeHtml,/\/pact-tome/);
  assert.match(tomeHtml,/1\/3 · 0\/2/);

  const chain=warlock({
    eldritch_invocations:[{name:"Pact of the Chain"},{name:"Investment of the Chain Master"}],
    pact_familiar:{form:"Imp",entity_id:"imp",hp_current:8,hp_max:10,movement:"Fly",damage_type:"Radiant"}
  },{proficiency_bonus:3});
  const familiarHtml=fns.renderPactFamiliarPanel(chain,[{
    name:"Imp",name_en:"Imp",id:"imp",kind:"special",catalogued:true,hit_points:10,
    armor_class:13,speed:{walk:20,fly:40},attack:{name:"Sting",attack:"1d20+5",damage:"1d6+3",saveDc:13}
  }]);
  assert.match(familiarHtml,/\/pact-familiar/);
  assert.match(familiarHtml,/8 \/ 10 HP/);
  assert.match(familiarHtml,/Investment of the Chain Master/);
  assert.match(familiarHtml,/1d20\+5/);
  assert.match(familiarHtml,/Реакция или Бонусное действие/);
  assert.match(familiarHtml,/Сл спасброска 15/);
});

test("Tome handler enforces the three-cantrip limit before writing",async()=>{
  const c=warlock({
    eldritch_invocations:[{name:"Pact of the Tome"}],
    pact_tome:[1,2,3].map(n=>({id:`c${n}`,name:`Cantrip ${n}`,level:0}))
  });
  const {sql,calls}=sqlRecorder();
  const fns=serverFunctions([
    "featureChoiceValue","featureChoiceArray","invocationSelections","hasInvocation","pactTomeSelections","setPactTomeSpell"
  ],{
    sql,
    getCharacter:async()=>({character:c}),
    pactTomeOptions:async()=>({cantrips:[{id:"c4",name_en:"Fourth",spell_level:0,ritual:false}],rituals:[]}),
    ensureAlwaysPreparedSpells:async()=>{}
  });
  await assert.rejects(fns.setPactTomeSpell(c.id,{action:"add",spell_entity_id:"c4"}),/cantrip limit reached \(3\)/);
  assert.equal(calls.length,0);
});

test("Chain handler summons a catalogued form at full HP and saves Investment settings",async()=>{
  let c=warlock({eldritch_invocations:[{name:"Pact of the Chain"},{name:"Investment of the Chain Master"}]});
  const {sql,calls}=sqlRecorder();
  const fns=serverFunctions([
    "featureChoiceValue","featureChoiceArray","invocationSelections","hasInvocation","pactFamiliarState","setPactFamiliar"
  ],{
    sql,
    getCharacter:async()=>({character:c}),
    pactFamiliarOptions:async()=>[{name:"Imp",id:"imp-1",hit_points:10}]
  });
  await fns.setPactFamiliar(c.id,{action:"summon",form_name:"Imp"});
  const summoned=calls.at(-1).values[0].pact_familiar;
  assert.deepEqual(summoned,{form:"Imp",entity_id:"imp-1",hp_current:10,hp_max:10,movement:"Fly",damage_type:"Normal"});

  c=warlock({
    eldritch_invocations:[{name:"Pact of the Chain"},{name:"Investment of the Chain Master"}],
    pact_familiar:summoned
  });
  await fns.setPactFamiliar(c.id,{action:"configure",movement:"Swim",damage_type:"Necrotic"});
  assert.equal(calls.at(-1).values[0].pact_familiar.movement,"Swim");
  assert.equal(calls.at(-1).values[0].pact_familiar.damage_type,"Necrotic");
});

test("casting Pact of the Chain Find Familiar restores the familiar without spending a slot",async()=>{
  const calls=[];
  const sql=async(strings,...values)=>{
    const query=strings.join("?").replace(/\s+/g," ").trim();
    calls.push({query,values});
    if(/FROM characters WHERE/.test(query)) return [warlock({pact_familiar:{form:"Imp",hp_current:0,hp_max:10}})];
    if(/FROM character_spells cs/.test(query)) return [{
      prepared:true,always_prepared:true,source_key:"invocation:pact-chain:find-familiar",
      entity_id:"find-familiar",name_en:"Find Familiar",spell_level:1,ritual:true,concentration:false
    }];
    return [];
  };
  const {spendSpellSlot}=serverFunctions(["spendSpellSlot"],{sql});
  await spendSpellSlot("warlock-1","spell-row-1",1);
  assert.equal(calls.length,3);
  assert.match(calls[2].query,/pact_familiar,hp_current/);
  assert.ok(!calls.some(x=>/UPDATE character_spell_slots/.test(x.query)));
});

test("Gift of the Protectors enforces the Charisma name limit and tracks its trigger",async()=>{
  const base=warlock({eldritch_invocations:[{name:"Pact of the Tome"},{name:"Gift of the Protectors"}],gift_protectors:{names:["A","B","C","D"],used:false}});
  const rows=[base];
  const calls=[];
  const sql=async(strings,...values)=>{
    const query=strings.join("?");calls.push({query,values});
    return /SELECT id::text/.test(query)?rows:[];
  };
  sql.json=value=>value;
  const fns=serverFunctions([
    "abilityModifier","featureChoiceValue","featureChoiceArray","invocationSelections","hasInvocation",
    "giftProtectorState","giftProtectorLimit","setGiftProtector"
  ],{sql});
  await fns.setGiftProtector(base.id,{action:"trigger",name:"B"});
  assert.equal(calls.at(-1).values[0].gift_protectors.used,true);
  await assert.rejects(fns.setGiftProtector(base.id,{action:"add",name:"E"}),/name limit reached \(4\)/);
});

test("server wires both Pact routes, automatic spells, and Long Rest reset",()=>{
  for(const fragment of [
    'endsWith("/pact-tome")','endsWith("/pact-familiar")','endsWith("/gift-protector")',
    'invocation:pact-tome:','invocation:pact-chain:find-familiar','{"used":false}',"c.challenge_rating=0"
  ]) assert.ok(source.includes(fragment),`missing ${fragment}`);
});

test("new Pact controls and familiar names are completely localized",()=>{
  for(const text of [
    "Book of Shadows","Pact Familiar","Slaad Tadpole","Apply HP","Gift of the Protectors is not selected",
    "Russian and English spell names are both searchable."
  ]) assert.notEqual(translateText(text,"ru"),text,text);
});
