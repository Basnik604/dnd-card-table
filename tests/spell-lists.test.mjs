import { displayContext, displayText, lookupTranslation } from "../src/localization/runtime.mjs";
import { translateText } from "../src/web/assets/i18n-core.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { spellClassNames, spellHasClass } from "../src/web/spell-classes.mjs";
import { plainRulesText } from "../src/web/rules-text.mjs";

const formats = [
  ["Open5e class objects", [{name:"Bard",key:"srd-2024_bard"},{name:"Wizard"}], ["Bard","Wizard"]],
  ["legacy name array", ["Bard","Wizard"], ["Bard","Wizard"]],
  ["legacy comma-separated names", "Bard, Wizard", ["Bard","Wizard"]],
  ["serialized JSON", '[{"name":"Bard"},{"name":"Wizard"}]', ["Bard","Wizard"]],
  ["single class reference", {name:"Bard"}, ["Bard"]],
  ["compact Open5e keys", [{key:"srd-2024_bard"},{slug:"wizard"}], ["Bard","Wizard"]],
  ["mixed casing and duplicates", [" bard ",{name:"BARD"},"wizard"], ["Bard","Wizard"]],
  ["empty and unknown values", [null,undefined,42,{},false,"[object Object]"], []]
];

for (const [label,input,expected] of formats) {
  test(`class names: ${label}`, () => assert.deepEqual(spellClassNames(input),expected));
}

test("membership checks exact class names, never descriptions or document metadata", () => {
  assert.equal(spellHasClass([{name:"Wizard",description:"Bard",document:{name:"Bard"}}],"Bard"),false);
  assert.equal(spellHasClass([{name:"Bardic College"}],"Bard"),false);
  assert.equal(spellHasClass([{description:"Bard"}],"Bard"),false);
  assert.equal(spellHasClass([{name:"Wizard",key:"srd-2024_bard"}],"Bard"),false);
  assert.equal(spellHasClass(null,"Bard"),false);
  assert.equal(spellHasClass(["Bard"]," bard "),true);
});

// Execute the actual server functions without opening a listener or requiring a
// user's PostgreSQL database. Only SQL I/O is mocked; profiles and limits come
// from server.mjs. The source override allows reproducing the original failure.
const serverSource = readFileSync(process.env.DND_TEST_SERVER
  ? resolve(process.env.DND_TEST_SERVER)
  : new URL("../src/web/server.mjs",import.meta.url),"utf8");

function functionSource(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`,"m").exec(serverSource);
  assert.ok(match,`Missing server function ${name}`);
  const end = serverSource.indexOf("\n}",match.index);
  assert.ok(end>match.index,`Missing end of ${name}`);
  return serverSource.slice(match.index,end+2);
}

const profileStart = serverSource.indexOf("const SPELLCASTING_ABILITY");
const profileEnd = serverSource.indexOf("function normalizedSpellName",profileStart);
assert.ok(profileStart>=0 && profileEnd>profileStart);
const runtimeCode = [
  serverSource.slice(profileStart,profileEnd),
  ...["entityDisplayName","abilityModifier","featureChoiceValue","featureChoiceArray","innateSorceryActive",
    "spellUsageCounts","spellPickerPayload","characterSpellOptions","addCharacterSpell",
    "loreDiscoverySelections","loreDiscoveryOptions","invocationTargetContext"].map(functionSource)
].join("\n");

function harness(steps) {
  let index=0;
  const calls=[];
  const sql=async (strings,...values) => {
    const query=strings.join("?").replace(/\s+/g," ").trim();
    const step=steps[index++];
    assert.ok(step,`Unexpected SQL: ${query}`);
    assert.match(query,step.match);
    calls.push({query,values});
    return step.rows;
  };
  const context=vm.createContext({sql,spellClassNames,spellHasClass,plainRulesText,displayContext,displayText,lookupTranslation,translateText});
  vm.runInContext(runtimeCode,context,{filename:"server-spell-runtime.mjs"});
  return {context,calls,done:()=>assert.equal(index,steps.length,"All expected SQL calls should run")};
}

const character=(className="Bard",extra={}) => ({
  id:"test-character",class_name:className,level:3,
  intelligence:16,wisdom:16,charisma:16,proficiency_bonus:2,feature_choices:{},...extra
});
const spell=(classes=[{name:"Bard",key:"srd-2024_bard"}],level=1) => ({
  id:"test-spell",name_en:"Test spell",spell_level:level,classes
});
const assigned=(level=1,always=false) => ({spell_level:level,prepared:true,always_prepared:always});

function additionSteps(c,s,current=[],write=true) {
  return [
    {match:/FROM characters WHERE/,rows:[c]},
    {match:/FROM content_entities/,rows:[s]},
    {match:/FROM character_spells cs/,rows:current},
    ...(write?[{match:/INSERT INTO character_spells/,rows:[]}]:[])
  ];
}

for (const className of ["Bard","Cleric","Druid","Paladin","Ranger","Sorcerer","Warlock","Wizard"]) {
  test(`${className}: add a level-1 spell with object class references`,async()=>{
    const h=harness(additionSteps(character(className),spell([{name:className}])));
    await h.context.addCharacterSpell("test-character","test-spell");
    assert.deepEqual(h.calls.at(-1).values.slice(0,2),["test-character","test-spell"]);
    h.done();
  });
}

test("Bard: add a cantrip with object class references",async()=>{
  const h=harness(additionSteps(character(),spell(undefined,0)));
  await h.context.addCharacterSpell("test-character","test-spell");
  h.done();
});

test("Bard: picker and add handler agree; unrelated metadata grants no access",async()=>{
  const rows=[
    {...spell(),id:"bard-object"},
    {...spell("Bard, Cleric"),id:"bard-string"},
    {...spell([{name:"Wizard",description:"Bard"}]),id:"wizard"},
    {...spell([{name:"Bardic College"}]),id:"other"}
  ];
  const h=harness([{match:/FROM content_entities/,rows}]);
  const options=await h.context.characterSpellOptions(character());
  assert.deepEqual(Array.from(options,x=>x.id),["bard-object","bard-string"]);
  assert.equal(h.context.spellPickerPayload(options)[0].classes,"Бард");
  for(const option of options) {
    const add=harness(additionSteps(character(),option));
    await add.context.addCharacterSpell("test-character",option.id);
    add.done();
  }
  h.done();
});

test("spell picker returns a Russian display name while preserving the English search alias",()=>{
  const h=harness([]);
  const payload=displayContext.run({language:"ru"},()=>h.context.spellPickerPayload([{
    ...spell([{name:"Wizard"}],3),
    name_en:"Fireball",
    ruleset:"dnd5e-2024",
    source_key:"srd-2024"
  }]));
  assert.equal(payload[0].name,"Огненный шар");
  assert.equal(payload[0].name_original,"Fireball");
  h.done();
});

test("adding a spell from another class remains forbidden",async()=>{
  const h=harness(additionSteps(character(),spell([{name:"Wizard",description:"Bard"}])).slice(0,2));
  await assert.rejects(h.context.addCharacterSpell("test-character","test-spell"),/not on the Bard spell list/);
  h.done();
});

test("spell-level restriction still applies",async()=>{
  const h=harness(additionSteps(character(),spell(undefined,3)).slice(0,2));
  await assert.rejects(h.context.addCharacterSpell("test-character","test-spell"),/cannot access level 3/);
  h.done();
});

test("Bard cantrip limit is enforced",async()=>{
  const h=harness(additionSteps(character(),spell(undefined,0),[assigned(0),assigned(0)],false));
  await assert.rejects(h.context.addCharacterSpell("test-character","test-spell"),/Cantrip limit reached \(2\)/);
  h.done();
});

test("Bard prepared spell limit is enforced",async()=>{
  const h=harness(additionSteps(character(),spell(),Array.from({length:6},()=>assigned()),false));
  await assert.rejects(h.context.addCharacterSpell("test-character","test-spell"),/Prepared spell limit reached \(6\)/);
  h.done();
});

test("always-prepared spells do not consume the ordinary prepared limit",async()=>{
  const h=harness(additionSteps(character(),spell(),Array.from({length:6},()=>assigned(1,true))));
  await h.context.addCharacterSpell("test-character","test-spell");
  h.done();
});

test("Wizard can add to the spellbook when the prepared list is full",async()=>{
  const h=harness(additionSteps(character("Wizard"),spell([{name:"Wizard"}]),Array.from({length:6},()=>assigned())));
  await h.context.addCharacterSpell("test-character","test-spell");
  assert.equal(h.calls.at(-1).values[2],false);
  h.done();
});

for(const [className,choice,baseLimit] of [
  ["Cleric",{divine_order:"Thaumaturge"},3],
  ["Druid",{primal_order:"Magician"},2]
]) {
  test(`${className}: the extra class-choice cantrip can be added`,async()=>{
    const h=harness(additionSteps(character(className,{feature_choices:choice}),spell([{name:className}],0),Array.from({length:baseLimit},()=>assigned(0))));
    await h.context.addCharacterSpell("test-character","test-spell");
    assert.match(h.calls[0].query,/feature_choices/);
    h.done();
  });
}

test("Lore discovery picker uses the same class normalization",async()=>{
  const c=character("Bard",{level:6,subclass_name:"College of Lore",feature_choices:{lore_discoveries:[{id:"already",name:"Known spell",level:1}]}});
  const rows=[
    {...spell([{name:"Wizard"}]),id:"wizard"},
    {...spell([{key:"srd-2024_cleric"}]),id:"cleric"},
    {...spell([{name:"Druid"}]),id:"already"},
    {...spell([{name:"Bard",description:"Wizard"}]),id:"bard"}
  ];
  const h=harness([{match:/FROM content_entities/,rows}]);
  const options=await h.context.loreDiscoveryOptions(c);
  assert.deepEqual(Array.from(options,x=>x.id),["wizard","cleric"]);
  h.done();
});

test("Warlock invocation targets use class names rather than metadata",async()=>{
  const h=harness([
    {match:/FROM character_spells cs/,rows:[{...spell([{name:"Warlock"}],0),id:"warlock"},{...spell([{name:"Wizard",description:"Warlock"}],0),id:"wizard"}]},
    {match:/FROM character_content cc/,rows:[]}
  ]);
  const result=await h.context.invocationTargetContext(character("Warlock"));
  assert.deepEqual(Array.from(result.cantrips,x=>x.id),["warlock"]);
  h.done();
});
