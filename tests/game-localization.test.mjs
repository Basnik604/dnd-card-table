import test from 'node:test';
import assert from 'node:assert/strict';
import { translateGameText, gameTranslationStatus } from '../src/web/assets/game-ru.mjs';
import { translateText } from '../src/web/assets/i18n-core.mjs';

test('2024 DnD.su-aligned class/species/background names are localized',()=>{
  assert.equal(translateGameText('Warlock'),'Колдун');
  assert.equal(translateGameText('Sorcerer'),'Чародей');
  assert.equal(translateGameText('Dragonborn'),'Драконорождённый');
  assert.equal(translateGameText('Wayfarer'),'Бродяга');
});

test('core feat names use checked Russian reference names',()=>{
  assert.equal(translateGameText('Boon of Combat Prowess'),'Дар боевой удали');
  assert.equal(translateGameText('Boon of Dimensional Travel'),'Дар межпространственного перемещения');
  assert.equal(translateGameText('Boon of Spell Recall'),'Дар восстановления заклинаний');
  assert.equal(translateGameText('Savage Attacker'),'Неистово атакующий');
});

test('rules glossary terms follow 2024 Russian terminology',()=>{
  assert.equal(translateGameText('Arcana'),'Тайная магия');
  assert.equal(translateGameText('Restrained'),'Опутанный');
  assert.equal(translateGameText('Thunder'),'Звук');
  assert.equal(translateGameText('Conjuration'),'Призыв');
});

test('qualified feat names preserve stable English values while translating display text',()=>{
  assert.equal(translateText('Magic Initiate (Cleric)','ru'),'Посвящённый в магию (Жрец)');
  assert.equal(translateText('Magic Initiate (Cleric)','en'),'Magic Initiate (Cleric)');
});

test('unverified third-party names remain explicit rather than receiving guessed translations',()=>{
  assert.equal(translateGameText('Path of the Dragon'),'Path of the Dragon');
  assert.equal(gameTranslationStatus('Path of the Dragon'),'pending');
});
