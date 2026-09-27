import test from "node:test";
import assert from "node:assert/strict";
import {
  coreClassFeatures,
  coreClassProgressionData,
  groupClassVariants,
  compactRulesetLabel,
  progressionAnchorTarget
} from "../src/web/class-progression.mjs";

test("all-scope class variants prefer 2024 and group duplicate edition cards",()=>{
  const rows=[
    {id:"old",name_en:"Druid",ruleset:"dnd5e-2014",source_key:"srd-2014",source_name:"SRD 5.1"},
    {id:"new",name_en:"Druid",ruleset:"dnd5e-2024",source_key:"srd-2024",source_name:"SRD 5.2"},
    {id:"marshal",name_en:"Marshal",ruleset:"dnd5e-2014",source_key:"ag",source_name:"Adventurer's Guide"}
  ];
  const grouped=groupClassVariants(rows);
  assert.equal(grouped.length,2);
  const druid=grouped.find(x=>x.name_en==="Druid");
  assert.equal(druid.id,"new");
  assert.equal(druid.variants.length,2);
});

test("2014 Druid progression fills important milestone levels",()=>{
  assert.deepEqual(coreClassFeatures("Druid","dnd5e-2014",4),["Wild Shape Improvement","Ability Score Improvement"]);
  assert.deepEqual(coreClassFeatures("Druid","dnd5e-2014",18),["Timeless Body","Beast Spells"]);
  assert.match(String(coreClassProgressionData("Druid","dnd5e-2014",8)["Wild Shape"]),/CR 1/);
  assert.equal(progressionAnchorTarget("Wild Shape Improvement"),"Wild Shape");
});

test("core classes have edition-specific high-level milestones and class data",()=>{
  assert.ok(coreClassFeatures("Fighter","dnd5e-2024",20).includes("Three Extra Attacks"));
  assert.equal(coreClassProgressionData("Rogue","dnd5e-2024",11)["Sneak Attack"],"6d6");
  assert.equal(compactRulesetLabel("dnd5e-2024"),"5e 2024");
});
