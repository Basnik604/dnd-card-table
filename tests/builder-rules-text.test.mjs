import test from "node:test";
import assert from "node:assert/strict";
import {renderBuilderLinkedRulesText} from "../src/web/builder-links.mjs";

const refs=new Map();

test("builder rich text renders markdown emphasis instead of raw stars",()=>{
  const html=renderBuilderLinkedRulesText("**Armor:** Light armor\n**Weapons:** Simple weapons",refs,null);
  assert.match(html,/<strong>Armor:<\/strong>/);
  assert.match(html,/<strong>Weapons:<\/strong>/);
  assert.doesNotMatch(html,/\*\*Armor/);
});

test("builder rich text renders equipment bullets as a real list",()=>{
  const html=renderBuilderLinkedRulesText("* a greataxe\n* two handaxes\n* an explorer's pack",refs,null);
  assert.match(html,/<ul>/);
  assert.match(html,/<li>a greataxe<\/li>/);
});
