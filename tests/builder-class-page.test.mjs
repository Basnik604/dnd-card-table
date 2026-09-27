import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const server=fs.readFileSync(new URL("../src/web/server.mjs",import.meta.url),"utf8");

test("class page has progression features, subclasses, and edition switching",()=>{
  assert.match(server,/class="class-progression-table"/);
  assert.match(server,/id="class-features"/);
  assert.match(server,/id="class-subclasses"/);
  assert.match(server,/builderPresentationOnlyTrait/);
  assert.match(server,/class-variant-switch/);
  assert.match(server,/coreClassFeatures/);
  assert.match(server,/coreClassProgressionData/);
});

test("default Builder Data class list groups 2014 and 2024 editions",()=>{
  assert.match(server,/classes_unique/);
  assert.match(server,/groupClassVariants/);
  assert.match(server,/builderVariantBadges/);
});

test("class rule text uses the rich markdown renderer",()=>{
  assert.match(server,/renderBuilderLinkedRulesText/);
  assert.match(server,/builder-rules-text/);
});

test("wide tavern header uses horizontal space",()=>{
  assert.match(server,/@media\(min-width:1321px\)/);
  assert.match(server,/width:min\(1420px,calc\(100vw - 34px\)\)/);
});
