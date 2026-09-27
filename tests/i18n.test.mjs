import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanguage, translateText } from '../src/web/assets/i18n-core.mjs';

test('language normalization defaults to Russian and preserves explicit English',()=>{
  assert.equal(normalizeLanguage('ru'),'ru');
  assert.equal(normalizeLanguage('ru-RU'),'ru');
  assert.equal(normalizeLanguage('en'),'en');
  assert.equal(normalizeLanguage('en-US'),'en');
  assert.equal(normalizeLanguage(undefined),'ru');
});

test('core UI labels translate to Russian',()=>{
  assert.equal(translateText('Characters','ru'),'Персонажи');
  assert.equal(translateText('Guided Character Builder','ru'),'Пошаговый конструктор персонажа');
  assert.equal(translateText('Builder Data','ru'),'Данные конструктора');
});

test('dynamic builder and validation strings translate without altering embedded numbers',()=>{
  assert.equal(translateText('Point Buy: 23 / 27 points','ru'),'Покупка характеристик: 23 / 27 очков');
  assert.equal(translateText('Background 1 / 2 · Class 2 / 2','ru'),'Предыстория 1 / 2 · Класс 2 / 2');
  assert.equal(translateText('Level 7','ru'),'Уровень 7');
});

test('dynamic server errors translate class labels',()=>{
  assert.equal(translateText('This spell is not on the Bard spell list','ru'),'Это заклинание отсутствует в списке класса «Бард»');
  assert.equal(translateText('No level 3 spell slot available','ru'),'Нет доступной ячейки заклинаний 3 уровня');
});

test('verified game names localize while long canonical prose remains untouched',()=>{
  assert.equal(translateText('College of Lore','ru'),'Коллегия знаний');
  assert.equal(translateText('Magic Initiate (Cleric)','ru'),'Посвящённый в магию (Жрец)');
  assert.equal(translateText('Your lineage stems from a dragon progenitor.','ru'),'Your lineage stems from a dragon progenitor.');
});

test('English mode is a strict pass-through',()=>{
  assert.equal(translateText('Characters','en'),'Characters');
  assert.equal(translateText('  Characters  ','en'),'  Characters  ');
});


test('catalog pages localize counted tabs, descriptions and verified metadata names',()=>{
  assert.equal(translateText('Monsters · 331','ru'),'Монстры · 331');
  assert.equal(translateText('Subclasses · 125','ru'),'Подклассы · 125');
  assert.equal(translateText('Imported SRD content normalized into one local database. Search stays inside the selected content category, checks names first, and falls back to descriptions only when no name matches.','ru'),'Импортированный SRD-контент приведён к единому формату и хранится в локальной базе. Поиск работает внутри выбранной категории: сначала по названиям, а если совпадений нет — по описаниям.');
  assert.equal(translateText('Open entry to view complete game data.','ru'),'Откройте запись, чтобы посмотреть полные игровые данные.');
  assert.equal(translateText('subclass','ru'),'подкласс');
  assert.equal(translateText('DRAGON','ru'),'ДРАКОН');
  assert.equal(translateText('Adult Black Dragon','ru'),'Adult Black Dragon');
});
