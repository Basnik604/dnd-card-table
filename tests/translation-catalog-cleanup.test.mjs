import test from 'node:test';
import assert from 'node:assert/strict';
import { isTechnicalPath, isTechnicalSegment, translationCoverage } from '../src/localization/core.mjs';
import { termTranslation, displayText } from '../src/localization/runtime.mjs';

test('technical catalog paths are excluded without hiding ordinary visible fields',()=>{
  for(const path of [
    'character_content.0.summary.publisher',
    'character_content.0.summary.gamesystem',
    'items.0.canonical_data.source_name',
    'items.0.canonical_data.source_index',
    'items.0.canonical_data.image',
    'items.0.canonical_data.index',
    'items.0.canonical_data.dexMode',
    'character_content.0.traits.0.feature_type',
    'entity_traits.0.trait_type',
    'conditions.0.mechanics.attackRolls',
    'character_content.0.traits.0.type'
  ]) assert.equal(isTechnicalPath(path),true,path);
  for(const path of ['name_en','description_en','character_content.0.traits.0.name','conditions.0.name'])
    assert.equal(isTechnicalPath(path),false,path);
});

test('a segment is ignored only when every use is technical',()=>{
  assert.equal(isTechnicalSegment({uses:[{path:'items.0.canonical_data.source_index'}]}),true);
  assert.equal(isTechnicalSegment({uses:[{path:'conditions.0.mechanics.attackRolls'}]}),true);
  assert.equal(isTechnicalSegment({uses:[{path:'items.0.canonical_data.source_index'},{path:'name_en'}]}),false);
  assert.equal(isTechnicalSegment({uses:[]}),false);
});

test('coverage counts only display strings and reports ignored technical segments',()=>{
  const visible={id:'v',text:'Visible rule',uses:[{path:'description_en'}]};
  const technical={id:'t',text:'source-key',uses:[{path:'items.0.canonical_data.source_index'}]};
  const out=translationCoverage({entityCount:1,segments:[visible,technical]},[]);
  assert.equal(out.total,1); assert.equal(out.ignored,1); assert.equal(out.pending,1); assert.equal(out.complete,false);
});

test('reusable UI templates are accepted only when they translate the whole string',()=>{
  assert.equal(termTranslation('Roll 7d9.'), 'Бросить 7d9.');
  assert.equal(termTranslation('Druid has no inventory cards.'), 'У персонажа Druid нет карточек инвентаря.');
  assert.equal(termTranslation('Damage Resistance'), null);
  assert.equal(termTranslation('Versatile Exploration'), null);
  const long='Roll 1d6 at the end of each of your turns for the duration. On a roll of 4–6, you vanish from your current plane of existence.';
  assert.equal(termTranslation(long),null);
  assert.equal(displayText('Heal',{language:'ru',kind:'spell'}),'Исцеление');
  assert.equal(displayText('Heal',{language:'en',kind:'spell'}),'Heal');
});
