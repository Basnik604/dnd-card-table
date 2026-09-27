import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { plainRulesText, renderRulesText, rulesInline } from "../src/web/rules-text.mjs";
import { rollDiceFormula, rollWithMode } from "../src/web/dice.mjs";

test("rules text renders Open5e emphasis without literal Markdown stars", () => {
  const html=renderRulesText("- ***Weather Sensor.*** You create a harmless sensory effect.\n- **Bloom.** A flower opens.");
  assert.match(html,/<ul>/);
  assert.match(html,/<strong><em>Weather Sensor\.<\/em><\/strong>/);
  assert.match(html,/<strong>Bloom\.<\/strong>/);
  assert.doesNotMatch(html,/\*\*\*/);
});

test("rules text escapes source HTML and strips Markdown for previews", () => {
  assert.equal(rulesInline("**Safe** <script>alert(1)</script>"),"<strong>Safe</strong> &lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(plainRulesText("### Heading\n***Bold italic*** and [a link](https://example.test)"),"Heading Bold italic and a link");
});

test("dice formulas expose each die for the on-page animation", () => {
  const values=[0,.99,.49];
  const result=rollDiceFormula("2d6+3-1d4",()=>values.shift());
  assert.equal(result.total,8);
  assert.deepEqual(result.dice.map(d=>[d.sides,d.value,d.kept]),[[6,1,true],[6,6,true],[4,2,true]]);
  assert.match(result.parts.join(" "),/2d6 \[1, 6\]/);
});

test("advantage keeps the higher d20 and marks the discarded die", () => {
  const values=[.1,.9];
  const result=rollWithMode("1d20+4","advantage",()=>values.shift());
  assert.equal(result.total,23);
  assert.deepEqual(result.dice.map(d=>[d.value,d.kept]),[[3,false],[19,true]]);
});

test("unsupported dice input is rejected", () => {
  assert.throws(()=>rollDiceFormula("1d20;process.exit()"),/Unsupported dice formula/);
  assert.throws(()=>rollWithMode("2d20","advantage"),/supports 1d20/);
});

test("runtime markup contains the new spell and in-place-roll controls", () => {
  const server=fs.readFileSync(new URL("../src/web/server.mjs",import.meta.url),"utf8");
  const client=fs.readFileSync(new URL("../src/web/assets/table-ui.js",import.meta.url),"utf8");
  assert.match(server,/class="spell-description-toggle"><summary>Full description<\/summary>/);
  assert.match(server,/<small>Casting cost<\/small>/);
  assert.match(server,/data-live-roll data-roll-formula="1d10\+/);
  assert.match(client,/url\.pathname!=='\/roll'/);
  assert.match(client,/fetch\(requestUrl,\{method:'POST'/);
});
