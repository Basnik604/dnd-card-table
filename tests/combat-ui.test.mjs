import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { parseFragment } from 'parse5';
import { serverFunctions } from './helpers/server-functions.mjs';
import { pendingConcentrationChecks } from '../src/web/combat-state.mjs';
import { localizeHtml } from '../src/localization/html.mjs';

const ui = serverFunctions(['esc', 'featureChoiceValue', 'featureChoiceObject', 'featureChoiceArray',
  'invocationSelections', 'hasInvocation', 'concentrationState', 'renderConcentrationPanel',
  'renderTemporaryHpControl', 'combatReturnPath'], { pendingConcentrationChecks });
function elements(html) {
  const result = [];
  function walk(n) { if (n.tagName) result.push(n); for (const c of n.childNodes || []) walk(c); }
  walk(parseFragment(html));
  return result;
}
const attrs = n => Object.fromEntries(n.attrs.map(a => [a.name, a.value]));

test('localized concentration panel retains character/check IDs, return path and Eldritch Mind', () => {
  const character = { id: 'caster-a', feature_choices: { eldritch_invocations: ['Eldritch Mind'],
    concentration: { name: '<script>unsafe</script>', pending_checks: [
      { id: 'check-one', dc: 11, damage: 23 }, { id: 'check-two', dc: 10, damage: 5 }
    ] } } };
  const html = localizeHtml(ui.renderConcentrationPanel(character, '/encounter/battle-a'), 'ru');
  const nodes = elements(html);
  assert.ok(!nodes.some(n => n.tagName === 'script'));
  assert.match(html, /Ожидают проверки/);
  assert.match(html, /: 2/);
  const form = nodes.find(n => n.tagName === 'form' && attrs(n).action.endsWith('/check'));
  assert.equal(attrs(form).action, '/character/caster-a/concentration/check');
  assert.equal(attrs(form)['data-roll-mode'], 'advantage');
  assert.ok(nodes.some(n => attrs(n).name === 'check_id' && attrs(n).value === 'check-one'));
  assert.ok(nodes.some(n => attrs(n).name === 'back' && attrs(n).value === '/encounter/battle-a'));
});

test('temporary HP form preserves zero and concentration return targets stay inside the app', () => {
  const html = localizeHtml(ui.renderTemporaryHpControl({ id: 'caster-a', temp_hp: 0 }, '/encounter/battle-a'), 'ru');
  assert.match(html, /Временные хиты/);
  const input = elements(html).find(n => attrs(n).name === 'amount');
  assert.equal(attrs(input).value, '0');
  assert.equal(attrs(input).min, '0');
  for (const back of ['//outside.test', 'https://outside.test', '/encounter/../outside', '/encounter/x\r\nLocation: evil']) {
    assert.equal(ui.combatReturnPath(back, 'caster-a'), '/character/caster-a');
  }
  assert.equal(ui.combatReturnPath('/encounter/battle-a', 'caster-a'), '/encounter/battle-a');
});

test('a live save updates only its caster when several concentration panels are visible', () => {
  const source = fs.readFileSync(new URL('../src/web/assets/table-ui.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('table-ui.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let body;
  function walk(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'applyEffects') body = n.getText(ast); ts.forEachChild(n, walk); }
  walk(ast);
  const panels = [{ dataset: { concentrationCharacter: 'caster-a' }, innerHTML: 'before-a' },
    { dataset: { concentrationCharacter: 'caster-b' }, innerHTML: 'before-b' }];
  const document = { querySelectorAll: selector => selector === '[data-concentration-area]' ? panels : [] };
  const apply = new Function('document', body + '\nreturn applyEffects;')(document);
  apply({ characterId: 'caster-a', concentrationHtml: 'next check' });
  assert.equal(panels[0].innerHTML, 'next check');
  assert.equal(panels[1].innerHTML, 'before-b');
  apply({ characterId: 'caster-a', concentrationHtml: '' });
  assert.equal(panels[0].innerHTML, '');
  assert.equal(panels[1].innerHTML, 'before-b');
});
