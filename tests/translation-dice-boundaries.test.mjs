import test from 'node:test';
import assert from 'node:assert/strict';
import { protectMechanics, restoreMechanics, validateTranslation } from '../src/localization/core.mjs';

test('plural dice and imported missing spaces preserve complete die expressions',()=>{
  const source='Roll three d20s and reduce damage by 1d10plus your modifier.';
  const masked=protectMechanics(source);
  assert.deepEqual(masked.tokens,['d20','1d10']);
  assert.equal(restoreMechanics(masked.text,masked.tokens),source);
});

test('Russian dice wording can remove English plural suffixes without changing mechanics',()=>{
  assert.deepEqual(validateTranslation('Roll three d20s.','Бросьте три d20.'),[]);
  assert.deepEqual(validateTranslation('Reduce damage by 1d10plus your Dexterity modifier.','Уменьшите урон на 1d10 плюс ваш модификатор Ловкости.'),[]);
  assert.deepEqual(validateTranslation('Roll d6 and compare the d6s.','Бросьте d6 и сравните результаты d6.'),[]);
});

test('plural-friendly dice validation still rejects different dice or extra numbers',()=>{
  assert.ok(validateTranslation('Roll three d20s.','Бросьте три d12.').includes('Изменены числа, формулы или ссылки'));
  assert.ok(validateTranslation('Reduce damage by 1d10plus your modifier.','Уменьшите урон на 1d6 плюс ваш модификатор.').includes('Изменены числа, формулы или ссылки'));
  assert.ok(validateTranslation('Roll d6s.','Бросьте 2d6.').includes('Изменены числа, формулы или ссылки'));
});

test('dice joined to imported headings remain the same dice after spacing repair',()=>{
  assert.deepEqual(protectMechanics('Deck of Illusions1d100').tokens,['1d100']);
  assert.deepEqual(validateTranslation('Deck of Illusions1d100','Колода иллюзий: 1d100'),[]);
  assert.ok(validateTranslation('Deck of Illusions1d100','Колода иллюзий: 1d20').includes('Изменены числа, формулы или ссылки'));
});

test('hyphenated dimensions keep positive lengths without weakening negative-number checks',()=>{
  const source='Build a 5-foot-by-5-foot section.';
  const masked=protectMechanics(source);
  assert.deepEqual(masked.tokens,['5','5']);
  assert.equal(restoreMechanics(masked.text,masked.tokens),source);
  assert.deepEqual(validateTranslation(source,'Постройте участок размером 5 футов на 5 футов.'),[]);
  assert.ok(validateTranslation('Apply a -5 penalty.','Примените штраф 5.').includes('Изменены числа, формулы или ссылки'));
});
