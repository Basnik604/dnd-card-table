import test from 'node:test';
import assert from 'node:assert/strict';
import {
  translateGameEntity,
  englishAliasesForRussianQuery,
  gameTranslationStatus
} from '../src/web/assets/game-ru.mjs';

test('ruleset-aware background terminology follows the matching DnD.su edition',()=>{
  assert.equal(translateGameEntity('Acolyte',{ruleset:'dnd5e-2024',kind:'background'}),'Послушник');
  assert.equal(translateGameEntity('Acolyte',{ruleset:'dnd5e-2014',kind:'background'}),'Прислужник');
  assert.equal(translateGameEntity('Noble',{ruleset:'dnd5e-2024',kind:'background'}),'Дворянин');
  assert.equal(translateGameEntity('Noble',{ruleset:'dnd5e-2014',kind:'background'}),'Благородный');
});

test('ruleset-aware feat and species terms do not collapse edition differences',()=>{
  assert.equal(translateGameEntity('Savage Attacker',{ruleset:'dnd5e-2024',kind:'feat'}),'Неистово атакующий');
  assert.equal(translateGameEntity('Savage Attacker',{ruleset:'dnd5e-2014',kind:'feat'}),'Дикий атакующий');
  assert.equal(translateGameEntity('Changeling',{ruleset:'dnd5e-2014',kind:'species'}),'Чейнджлинг');
});

test('legacy species and PHB feats use verified Russian names',()=>{
  assert.equal(translateGameEntity('Aarakocra',{ruleset:'dnd5e-2014',kind:'species'}),'Ааракокра');
  assert.equal(translateGameEntity('Half-Elf',{ruleset:'dnd5e-2014',kind:'species'}),'Полуэльф');
  assert.equal(translateGameEntity('War Caster',{ruleset:'dnd5e-2014',kind:'feat'}),'Боевой заклинатель');
  assert.equal(translateGameEntity('Crossbow Expert',{ruleset:'dnd5e-2014',kind:'feat'}),'Эксперт в арбалетах');
});

test('Russian partial search resolves back to canonical English names',()=>{
  assert.ok(englishAliasesForRussianQuery('дру',{kind:'class'}).includes('Druid'));
  assert.ok(englishAliasesForRussianQuery('прислуж',{ruleset:'dnd5e-2014',kind:'background'}).includes('Acolyte'));
  assert.ok(englishAliasesForRussianQuery('полуэльф',{kind:'species'}).includes('Half-Elf'));
});

test('context-aware status marks verified overrides as reference translations',()=>{
  assert.equal(gameTranslationStatus('Acolyte',{ruleset:'dnd5e-2014',kind:'background'}),'reference');
});

test('independent fallback names remain distinguishable from DnD.su-verified terminology',()=>{
  assert.equal(translateGameEntity('Bardic Inspiration',{ruleset:'dnd5e-2024',kind:'class_feature'}),'Бардовское вдохновение');
  assert.equal(gameTranslationStatus('Bardic Inspiration',{ruleset:'dnd5e-2024',kind:'class_feature'}),'generated');
  assert.equal(translateGameEntity('Trophy Hunter',{ruleset:'dnd5e-2014',kind:'background'}),'Охотник за трофеями');
});
