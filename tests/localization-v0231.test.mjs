import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cachedOrKnownRussian} from '../src/localization/translation-engine.mjs';

const server=fs.readFileSync(new URL('../src/web/server.mjs',import.meta.url),'utf8');
const browser=fs.readFileSync(new URL('../src/web/assets/i18n.js',import.meta.url),'utf8');

test('Aboleth reference terms are immediately available without ML',()=>{
  assert.equal(cachedOrKnownRussian('Aboleth',{context:'entity-name',kind:'creature',ruleset:'dnd5e-2024'}),'Аболет');
  assert.equal(cachedOrKnownRussian('Amphibious',{context:'entity-name'}),'Амфибия');
  assert.equal(cachedOrKnownRussian('Mucus Cloud',{context:'entity-name'}),'Облако слизи');
  assert.equal(cachedOrKnownRussian('Consume Memories',{context:'entity-name'}),'Поглощение воспоминаний');
});

test('RU entity pages pretranslate imported names and prose before rendering',()=>{
  assert.match(server,/async function primeEntityRussian/);
  assert.match(server,/await primeEntityRussian\(data,lang\)/);
  assert.match(server,/await primeCatalogRowsRussian\(rows,lang\)/);
  assert.match(server,/await primeRussianStrings\(builderPrime,lang\)/);
});

test('runtime fallback also catches one-word imported rules terms',()=>{
  assert.match(browser,/Aboleth, Amphibious/);
  assert.match(browser,/\.inventory-item/);
  assert.match(browser,/slice\(0,100\)/);
});
