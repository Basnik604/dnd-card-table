import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translateGameEntity,translateGameText} from '../src/web/assets/game-ru.mjs';
import {cachedOrKnownRussian,translateRussian,isSuspiciousMachineTranslation,translationCacheStats} from '../src/localization/translation-engine.mjs';

const browser=fs.readFileSync(new URL('../src/web/assets/i18n.js',import.meta.url),'utf8');

test('core dragon names are deterministic and never depend on NMT',()=>{
  assert.equal(translateGameEntity('Adult Black Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый чёрный дракон');
  assert.equal(translateGameEntity('Adult Blue Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый синий дракон');
  assert.equal(translateGameEntity('Adult Brass Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый латунный дракон');
  assert.equal(translateGameEntity('Adult Bronze Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый бронзовый дракон');
  assert.equal(translateGameEntity('Adult Copper Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый медный дракон');
  assert.equal(translateGameEntity('Adult Gold Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый золотой дракон');
  assert.equal(translateGameEntity('Adult Green Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый зелёный дракон');
  assert.equal(translateGameEntity('Adult Red Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый красный дракон');
  assert.equal(translateGameEntity('Adult Silver Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый серебряный дракон');
  assert.equal(translateGameEntity('Adult White Dragon',{kind:'creature',ruleset:'dnd5e-2024'}),'Взрослый белый дракон');
});

test('verified Aboleth terminology is deterministic',()=>{
  assert.equal(translateGameText('Aboleth'),'Аболет');
  assert.equal(translateGameText('Amphibious'),'Амфибия');
  assert.equal(translateGameText('Eldritch Restoration'),'Потустороннее восстановление');
  assert.equal(translateGameText('Mucous Cloud'),'Облако слизи');
  assert.equal(translateGameText('Probing Telepathy'),'Зондирующая телепатия');
  assert.equal(translateGameText('Consume Memories'),'Поглощение воспоминаний');
});

test('unknown entity names remain canonical English instead of invoking machine translation',async()=>{
  const name='Xalvorith the Uncatalogued';
  assert.equal(cachedOrKnownRussian(name,{context:'entity-name',kind:'creature'}),name);
  assert.equal(await translateRussian(name,{context:'entity-name',kind:'creature'}),name);
});

test('translation validator rejects token leakage and obvious gibberish',()=>{
  assert.equal(isSuspiciousMachineTranslation('Adult Black Dragon','-79 градусов ZXQooQXZ'),true);
  assert.equal(isSuspiciousMachineTranslation('Adult Gold Dragon','////////////////////////'),true);
  assert.equal(isSuspiciousMachineTranslation('The dragon can fly.','Дракон может летать.'),false);
});

test('browser never sends entity-name nodes to generic NMT fallback',()=>{
  assert.match(browser,/if\(el\?\.closest\?\.\('\[data-i18n-entity\]'\)\) return false/);
});

test('cache version is isolated from the corrupted v0.23.0 entity cache',()=>{
  assert.match(String(translationCacheStats().file),/ru-cache\.json$/);
  const engine=fs.readFileSync(new URL('../src/localization/translation-engine.mjs',import.meta.url),'utf8');
  assert.match(engine,/ru-v4-safe-names/);
  assert.match(engine,/data\?\.version!==CACHE_VERSION/);
});
