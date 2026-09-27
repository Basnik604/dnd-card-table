import {subclassControlResources} from "../src/web/subclass-controls.mjs";
import {subclassResourceDefinitions} from "../src/web/subclass-actions.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serverFunctions} from "./helpers/server-functions.mjs";
import {translateText} from "../src/web/assets/i18n-core.mjs";

const source=readFileSync(new URL("../src/web/server.mjs",import.meta.url),"utf8");
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

function cleric(level=2,extra={}){
  return {id:"cleric-1",name:"Mira",class_name:"Cleric",level,wisdom:16,proficiency_bonus:2,feature_choices:{},...extra};
}
function paladin(level=3,extra={}){
  return {id:"paladin-1",name:"Doran",class_name:"Paladin",level,charisma:16,proficiency_bonus:2,feature_choices:{},...extra};
}

const profileFns=serverFunctions(["abilityModifier","channelDivinityProfile"],{});

test("Channel Divinity profiles scale Cleric and Paladin actions by level",()=>{
  assert.deepEqual(profileFns.channelDivinityProfile(cleric(2)),{
    available:true,className:"Cleric",level:2,abilityKey:"wisdom",mod:3,saveDc:13,
    sourceKey:"class:cleric:channel-divinity",sparkDice:1,searDice:0,abjureTargets:0
  });
  const c7=profileFns.channelDivinityProfile(cleric(7,{wisdom:18,proficiency_bonus:3}));
  assert.equal(c7.sparkDice,2);
  assert.equal(c7.searDice,4);
  assert.equal(c7.saveDc,15);
  assert.equal(profileFns.channelDivinityProfile(cleric(18,{wisdom:20,proficiency_bonus:6})).sparkDice,4);

  const p3=profileFns.channelDivinityProfile(paladin(3));
  assert.equal(p3.sourceKey,"class:paladin:channel-divinity");
  assert.equal(p3.abjureTargets,0);
  const p9=profileFns.channelDivinityProfile(paladin(9,{charisma:18,proficiency_bonus:4}));
  assert.equal(p9.abjureTargets,4);
  assert.equal(p9.saveDc,16);
});

test("automatic resources use 2024 Channel Divinity use progressions",()=>{
  const {abilityModifier,automaticResourceDefinitions}=serverFunctions(["abilityModifier","automaticResourceDefinitions"],{subclassResourceDefinitions,subclassControlResources});
  const clericUses=lvl=>automaticResourceDefinitions(cleric(lvl)).find(x=>x.key==="class:cleric:channel-divinity")?.max;
  assert.equal(clericUses(2),2);
  assert.equal(clericUses(6),3);
  assert.equal(clericUses(18),4);
  const paladinUses=lvl=>automaticResourceDefinitions(paladin(lvl)).find(x=>x.key==="class:paladin:channel-divinity")?.max;
  assert.equal(paladinUses(3),2);
  assert.equal(paladinUses(11),3);
  assert.equal(automaticResourceDefinitions(cleric(2)).find(x=>x.key==="class:cleric:channel-divinity").shortGain,1);
});

function actionHarness(character,{inventory=[]}={}){
  const spent=[];
  const patches=[];
  const logs=[];
  const sql=async(strings,...values)=>{logs.push({query:strings.join("?"),values});return [];};
  sql.json=value=>value;
  const fns=serverFunctions(["emptyActionResult","useChannelDivinity"],{
    getCharacter:async()=>({character,inventory}),
    channelDivinityProfile:c=>profileFns.channelDivinityProfile(c),
    channelDivinityState:c=>({divine_sense:c.feature_choices?.channel_divinity_state?.divine_sense||null,sacred_weapon:c.feature_choices?.channel_divinity_state?.sacred_weapon||null}),
    spendManagedResourceByKey:async(id,key,amount)=>{spent.push([id,key,amount]);return {current_value:1,max_value:2};},
    patchCharacterFeatureChoices:async(id,patch)=>patches.push({id,patch}),
    isPactBladeEligibleItem:item=>Boolean(item?.melee),
    stateBool:(state,key)=>Boolean(state?.[key]),
    signedFormula:(base,bonus=0)=>`${base}${bonus?`${bonus>=0?"+":""}${bonus}`:""}`,
    fixedDiceResult:(count,sides,bonus=0)=>({formula:`${count}d${sides}+${bonus}`,total:count*sides+bonus,dice:[],parts:[]}),
    rollDiceFormula:formula=>({formula,total:11,dice:[],parts:["fixed roll"]}),
    sql
  });
  return {fns,spent,patches,logs};
}

test("Divine Spark spends one use and validates damage type before spending",async()=>{
  const c=cleric(7,{wisdom:18,proficiency_bonus:3});
  let h=actionHarness(c);
  await assert.rejects(h.fns.useChannelDivinity(c.id,{effect:"divine_spark",mode:"damage",damage_type:"Cold"}),/Radiant or Necrotic/);
  assert.equal(h.spent.length,0);

  h=actionHarness(c);
  const result=await h.fns.useChannelDivinity(c.id,{effect:"divine_spark",mode:"damage",damage_type:"Radiant"});
  assert.deepEqual(h.spent,[["cleric-1","class:cleric:channel-divinity",1]]);
  assert.equal(result.total,11);
  assert.match(result.outcome,/Constitution save DC 15/);
  assert.equal(result.effects.resource.current,1);
  assert.equal(h.logs.length,1);
});

test("Life Domain Preserve Life and Sear Undead use the Cleric shared resource",async()=>{
  const life=cleric(6,{wisdom:18,proficiency_bonus:3,subclass_name:"Life Domain"});
  let h=actionHarness(life);
  const preserve=await h.fns.useChannelDivinity(life.id,{effect:"preserve_life"});
  assert.equal(preserve.total,30);
  assert.match(preserve.outcome,/30 HP/);
  assert.equal(h.spent.length,1);

  h=actionHarness(life);
  const turn=await h.fns.useChannelDivinity(life.id,{effect:"turn_undead"});
  assert.match(turn.outcome,/Sear Undead/);
  assert.deepEqual(h.spent,[["cleric-1","class:cleric:channel-divinity",1]]);

  const other=cleric(6,{subclass_name:"Light Domain"});
  h=actionHarness(other);
  await assert.rejects(h.fns.useChannelDivinity(other.id,{effect:"preserve_life"}),/Preserve Life is not available/);
  assert.equal(h.spent.length,0);
});

test("Paladin Divine Sense and Sacred Weapon persist active state and spend the shared resource",async()=>{
  const p=paladin(3,{subclass_name:"Oath of Devotion"});
  let h=actionHarness(p);
  await h.fns.useChannelDivinity(p.id,{effect:"divine_sense"});
  assert.deepEqual(h.spent,[["paladin-1","class:paladin:channel-divinity",1]]);
  assert.ok(h.patches[0].patch.channel_divinity_state.divine_sense.started_at);

  const weapon={instance_id:"sword-1",name_en:"Longsword",melee:true,state:{equipped:true}};
  h=actionHarness(p,{inventory:[weapon]});
  await h.fns.useChannelDivinity(p.id,{effect:"sacred_weapon",instance_id:"sword-1"});
  assert.equal(h.patches[0].patch.channel_divinity_state.sacred_weapon.instance_id,"sword-1");
  assert.equal(h.patches[0].patch.channel_divinity_state.sacred_weapon.attack_bonus,3);
  assert.equal(h.spent.length,1);
});

test("Sacred Weapon increases attack rolls but not weapon damage",()=>{
  const {characterWeaponRolls}=serverFunctions(["characterWeaponRolls"],{
    inventoryType:()=>"weapon",
    weaponAbility:()=>({key:"strength",mod:4,pactBlade:false}),
    fightingStyleName:()=>"",
    channelDivinityState:()=>({sacred_weapon:{instance_id:"sword-1"}}),
    abilityModifier:score=>Math.floor((Number(score)-10)/2),
    weaponMasteryForItem:()=>null,
    signedFormula:(base,n)=>`${base}${n>=0?"+":""}${n}`
  });
  const c=paladin(5,{charisma:16,proficiency_bonus:3,subclass_name:"Oath of Devotion"});
  const rolls=characterWeaponRolls(c,{instance_id:"sword-1",data:{damageDice:"1d8",weaponCategory:"martial melee"}});
  assert.equal(rolls.attack,"1d20+10"); // STR 4 + PB 3 + Sacred Weapon 3
  assert.equal(rolls.damage,"1d8+4");
  assert.equal(rolls.sacredWeapon,true);
  assert.equal(rolls.sacredBonus,3);
});

test("Channel Divinity renderers expose Cleric, Paladin and subclass action cards",()=>{
  const {renderChannelDivinityPanel,renderChannelDivinityCombatPanel}=serverFunctions(["renderChannelDivinityPanel","renderChannelDivinityCombatPanel"],{
    channelDivinityProfile:c=>profileFns.channelDivinityProfile(c),
    channelDivinityState:c=>({divine_sense:null,sacred_weapon:null}),
    signedFormula:(base,n)=>`${base}${n>=0?"+":""}${n}`,
    esc:value=>String(value??""),
    stateBool:(state,key)=>Boolean(state?.[key]),
    isPactBladeEligibleItem:item=>Boolean(item?.melee)
  });
  const resourceC=[{source_key:"class:cleric:channel-divinity",current_value:2,max_value:3}];
  const ch=renderChannelDivinityPanel(cleric(6,{wisdom:18,proficiency_bonus:3,subclass_name:"Life Domain"}),resourceC,[],"/");
  assert.match(ch,/Divine Spark/);
  assert.match(ch,/Turn Undead/);
  assert.match(ch,/Preserve Life/);
  assert.match(ch,/data-resource-consumer/);

  const resourceP=[{source_key:"class:paladin:channel-divinity",current_value:2,max_value:2}];
  const ph=renderChannelDivinityCombatPanel(paladin(9,{charisma:18,proficiency_bonus:4,subclass_name:"Oath of Devotion"}),resourceP,[{instance_id:"s1",name_en:"Longsword",melee:true,state:{equipped:true}}],"/");
  assert.match(ph,/Divine Sense/);
  assert.match(ph,/Sacred Weapon/);
  assert.match(ph,/Abjure Foes/);
});

test("new Channel Divinity controls and dynamic outcomes are localized",()=>{
  for(const text of [
    "Channel Divinity Actions","Divine Spark","Turn Undead","Preserve Life","Sacred Weapon",
    "Roll healing","Use Turn Undead","Activate Divine Sense","Use Abjure Foes",
    "Spend the shared class resource through one of the available effects below."
  ]) assert.notEqual(translateText(text,"ru"),text,text);
  assert.equal(translateText("4d8 Radiant on each failed save","ru"),"4d8 лучистого урона при каждом проваленном спасброске");
  assert.equal(translateText("45 HP pool","ru"),"Запас лечения: 45 хитов");
  assert.equal(translateText("4 targets · DC 16","ru"),"Целей: 4 · Сл 16");
});

test("server wires Channel Divinity into class actions, combat, rests and the current version",()=>{
  for(const fragment of [
    'action==="channel_divinity"',"renderChannelDivinityPanel","renderChannelDivinityCombatPanel",
    "class:cleric:channel-divinity","class:paladin:channel-divinity","channel_divinity_state",
    `D&D Card Table v${version}`
  ]) assert.ok(source.includes(fragment),`missing ${fragment}`);
});


test("live-roll JSON negotiation survives missing Accept headers",()=>{
  const {wantsJson}=serverFunctions(["wantsJson"]);
  assert.equal(wantsJson({headers:{accept:"application/json"},url:"/character/c/class-action"}),true);
  assert.equal(wantsJson({headers:{accept:"text/html"},url:"/character/c/class-action?_response=json"}),true);
  assert.equal(wantsJson({headers:{accept:"text/html"},url:"/character/c/class-action"}),false);
  const ui=readFileSync(new URL("../src/web/assets/table-ui.js",import.meta.url),"utf8");
  assert.match(ui,/requestUrl\.pathname='\/api'\+requestUrl\.pathname/);
  assert.match(ui,/content-type/);
});
