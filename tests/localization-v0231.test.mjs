import test from 'node:test';
import assert from 'node:assert/strict';
import {displayText} from '../src/localization/runtime.mjs';
import {localizeHtml} from '../src/localization/html.mjs';
import {startTranslationWorker} from '../src/localization/worker.mjs';
test('shipped Aboleth terms are available without a model',()=>{
  assert.equal(displayText('Aboleth'),'Аболет');assert.equal(displayText('Amphibious'),'амфибия');
  assert.equal(displayText('Mucus Cloud'),'Слизистое облако');assert.equal(displayText('Consume Memories'),'Поглощение воспоминаний');
});
test('RU rendering preserves identifiers, user names and English mode',()=>{
  const source='<a href="/entry/aboleth">Aboleth</a><span data-i18n-skip="">My Aboleth</span>';
  assert.equal(localizeHtml(source,'ru'),'<a href="/entry/aboleth">Аболет</a><span data-i18n-skip="">My Aboleth</span>');
  assert.equal(localizeHtml(source,'en'),source);assert.equal(displayText('Uncatalogued Creature 123'),'Uncatalogued Creature 123');
});
test('default startup does not query the database or enable model translation',()=>{
  const previous=process.env.LOCALIZATION_AUTO;
  try{delete process.env.LOCALIZATION_AUTO;const stop=startTranslationWorker(()=>assert.fail('disabled worker queried DB'));assert.equal(typeof stop,'function');stop();}
  finally{if(previous===undefined)delete process.env.LOCALIZATION_AUTO;else process.env.LOCALIZATION_AUTO=previous;}
});
