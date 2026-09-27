import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cachedOrKnownRussian,
  looksEnglishForTranslation,
  glossaryStatus
} from '../src/localization/translation-engine.mjs';

const browser=fs.readFileSync(new URL('../src/web/assets/i18n.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../src/web/server.mjs',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('hybrid glossary provides established D&D mechanics before ML fallback',()=>{
  assert.equal(cachedOrKnownRussian('Armor Class',{context:'ui'}),'Класс Доспеха');
  assert.equal(cachedOrKnownRussian('Spell Slots',{context:'ui'}),'Ячейки заклинаний');
  assert.equal(cachedOrKnownRussian('Long Rest',{context:'ui'}),'Продолжительный отдых');
  assert.ok(glossaryStatus().rules>100);
});

test('automatic translator targets prose but ignores formulas and URLs',()=>{
  assert.equal(looksEnglishForTranslation('The target takes fire damage.'),true);
  assert.equal(looksEnglishForTranslation('2d6+3'),false);
  assert.equal(looksEnglishForTranslation('https://dnd.su/'),false);
});

test('browser localization has asynchronous machine-translation fallback',()=>{
  assert.match(browser,/\/api\/i18n\/translate/);
  assert.match(browser,/queueRemote/);
  assert.match(browser,/data-i18n-entity/);
});

test('server exposes translation endpoint and cache status',()=>{
  assert.match(server,/\/api\/i18n\/translate/);
  assert.match(server,/\/api\/i18n\/status/);
  assert.match(server,/translateBatchRussian/);
});

test('full localization command and local Transformers dependency are packaged',()=>{
  assert.equal(pkg.scripts['i18n:full'],'node src/localization/full-sync.mjs');
  assert.ok(pkg.dependencies['@huggingface/transformers']);
});
