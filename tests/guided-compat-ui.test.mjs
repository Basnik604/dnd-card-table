import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { translateText } from '../src/web/assets/i18n-core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const server=readFileSync(path.join(here,'../src/web/server.mjs'),'utf8');

test('guided builder option labels keep source but hide repeated rules years',()=>{
  assert.match(server,/function guidedOptionLabel\(record,lang="ru"\)/);
  assert.match(server,/return `\$\{display\} · \$\{guidedSourceName\(record\)\}`/);
  assert.doesNotMatch(server,/guidedOptionLabel[\s\S]{0,500}sourceLabel\(record\)/);
});

test('legacy background plus modern species gets an origin ability compatibility guardrail',()=>{
  assert.match(server,/compatibilityOriginBoost=allowedBackgroundAbilities\.length!==3 && !legacySpeciesAbilityData/);
  assert.match(server,/Choose three different abilities for the compatibility \+1\/\+1\/\+1 increase/);
  assert.match(server,/compatibility_origin_boost:compatibilityOriginBoost/);
});

test('new compatibility messages are localized',()=>{
  assert.equal(translateText('Legacy 5e source','ru'),'Источник старой редакции 5e');
  assert.match(translateText('This older background has no ability increase and the selected species does not supply a legacy increase. Choose +2/+1 or three +1 increases here so the character is not left without an origin ability increase.','ru'),/предыстории старой редакции/);
});
