import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLegacySpeciesBonuses,
  classifyClassRecord,
  dedupeGuidedRows,
  normalizeBuilderRecord,
  scopeAllows
} from "../src/shared/builder-content.mjs";

const document=(key,gamesystem,name=key)=>({key,name,gamesystem:{key:gamesystem}});

test("class records use Open5e subclass_of instead of a hardcoded name list",()=>{
  assert.equal(classifyClassRecord({name:"Wizard",subclass_of:null}),"class");
  assert.equal(classifyClassRecord({name:"School of Invention",subclass_of:{name:"Wizard",key:"wizard"}}),"subclass");
});

test("SRD 5.2 background benefits become guided-builder fields",()=>{
  const row=normalizeBuilderRecord("background",{
    name:"Acolyte",
    document:document("srd-2024","5e-2024","System Reference Document 5.2"),
    benefits:[
      {name:"Ability Scores",type:"ability_score",desc:"Intelligence, Wisdom, Charisma"},
      {name:"Feat",type:"feat",desc:"Magic Initiate (Cleric)"},
      {name:"Skill Proficiencies",type:"skill_proficiency",desc:"Insight, Religion"},
      {name:"Tool Proficiency",type:"tool_proficiency",desc:"Calligrapher's Supplies"},
      {name:"Equipment",type:"equipment",desc:"Holy Symbol, Robe, 8 GP"}
    ]
  });
  assert.deepEqual(row.summary.ability_scores,["Intelligence","Wisdom","Charisma"]);
  assert.equal(row.summary.feat,"Magic Initiate (Cleric)");
  assert.deepEqual(row.proficiencies.skills,["Insight","Religion"]);
  assert.deepEqual(row.summary.skill_choice,{count:0,options:[]});
  assert.deepEqual(row.proficiencies.tools,["Calligrapher's Supplies"]);
  assert.equal(row.summary.legacy,false);
});

test("legacy background separates fixed skills from player choices",()=>{
  const row=normalizeBuilderRecord("background",{
    name:"Crime Syndicate Member",
    document:document("tdcs","5e-2014","Tal'dorei Campaign Setting"),
    benefits:[
      {name:"Skill Proficiencies",type:"skill_proficiency",desc:"Deception, plus your choice of one between Sleight of Hand or Stealth."},
      {name:"Tool Proficiencies",type:"tool_proficiency",desc:"Your choice of one from Thieves' Tools, Forgery Kit, or Disguise Kit."}
    ]
  });
  assert.deepEqual(row.proficiencies.skills,["Deception"]);
  assert.deepEqual(row.summary.skill_choice,{count:1,options:["Sleight of Hand","Stealth"]});
  assert.equal(row.summary.legacy,true);

  const innkeeper=normalizeBuilderRecord("background",{
    name:"Innkeeper",document:document("toh","5e-2014"),
    benefits:[{name:"Skill Proficiencies",type:"skill_proficiency",desc:"Insight plus one of your choice from among Intimidation or Persuasion"}]
  });
  assert.deepEqual(innkeeper.proficiencies.skills,["Insight"]);
  assert.deepEqual(innkeeper.summary.skill_choice,{count:1,options:["Intimidation","Persuasion"]});
});

test("legacy species keeps fixed and flexible ability increases",()=>{
  const row=normalizeBuilderRecord("species",{
    name:"Half-Elf",
    document:document("srd-2014","5e-2014","System Reference Document 5.1"),
    traits:[{name:"Ability Score Increase",desc:"Your Charisma score increases by 2, and two other ability scores of your choice increase by 1."}]
  });
  assert.deepEqual(row.summary.ability_scores,{charisma:2});
  assert.equal(row.summary.ability_score_choices.length,1);
  assert.deepEqual(row.summary.ability_score_choices[0],{
    count:2,amount:1,options:["Strength","Dexterity","Constitution","Intelligence","Wisdom"]
  });
  const scores={strength:10,dexterity:10,constitution:10,intelligence:10,wisdom:10,charisma:10};
  assert.deepEqual(applyLegacySpeciesBonuses(scores,row.summary,["dexterity","wisdom"]),{
    strength:10,dexterity:11,constitution:10,intelligence:10,wisdom:11,charisma:12
  });

  const delver=normalizeBuilderRecord("species",{
    name:"Delver",document:document("toh","5e-2014"),
    traits:[{name:"Ability Score Increase",desc:"Your Strength or Dexterity score increases by 1."}]
  });
  assert.deepEqual(delver.summary.ability_scores,{});
  assert.deepEqual(delver.summary.ability_score_choices,[{count:1,amount:1,options:["Strength","Dexterity"]}]);

  const chassis=normalizeBuilderRecord("species",{
    name:"Human Chassis",document:document("toh","5e-2014"),
    traits:[{name:"Ability Score Increase",desc:"One ability score of your choice increases by 1."}]
  });
  assert.deepEqual(chassis.summary.ability_score_choices,[{count:1,amount:1,options:["Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"]}]);
});

test("legacy Human applies +1 to every ability",()=>{
  const row=normalizeBuilderRecord("species",{
    name:"Human",
    document:document("srd-2014","5e-2014"),
    traits:[{name:"Ability Score Increase",desc:"Your ability scores each increase by 1."}]
  });
  assert.deepEqual(row.summary.ability_scores,{
    strength:1,dexterity:1,constitution:1,intelligence:1,wisdom:1,charisma:1
  });
});

test("guided catalog deduplicates names in favor of 2024 and excludes A5E",()=>{
  const rows=[
    {id:"legacy",name_en:"Acolyte",source_key:"srd-2014",ruleset:"dnd5e-2014",summary:{}},
    {id:"modern",name_en:"Acolyte",source_key:"srd-2024",ruleset:"dnd5e-2024",summary:{}},
    {id:"a5e",name_en:"Acolyte",source_key:"a5e-ag",ruleset:"a5e",summary:{}}
  ];
  assert.deepEqual(dedupeGuidedRows(rows,"background").map(row=>row.id),["modern"]);
  assert.equal(scopeAllows(rows[0],"expanded"),true);
  assert.equal(scopeAllows(rows[0],"srd2024"),false);
  assert.equal(scopeAllows(rows[2],"expanded"),false);
});
