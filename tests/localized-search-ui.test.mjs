import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serverFunctions } from './helpers/server-functions.mjs';
import { displayText, localizedAliases } from '../src/localization/runtime.mjs';
import { UI_RU_EXTRA } from '../src/web/assets/ui-ru-extra.mjs';
import { englishAliasesForRussianQuery } from '../src/web/assets/game-ru.mjs';
const server=fs.readFileSync(new URL('../src/web/server.mjs',import.meta.url),'utf8');

test('Builder and Content search accept Russian display-name aliases',()=>{
  assert.match(server,/englishAliasesForRussianQuery/);
  assert.match(server,/russianSearchAliases/);
  assert.match(server,/LOWER\(ce\.name_en\) IN/);
});

test('Builder cards render ruleset-aware Russian names without losing canonical English metadata',()=>{
  assert.match(server,/entityDisplayName\(r,lang,r\.content_kind\)/);
  assert.match(server,/localized-original-name/);
  assert.match(server,/data-i18n-skip/);
});

test('Card suggestions resolve a partial Russian name and return the localized label',async()=>{
  const calls=[];
  const sql=(first,...values)=>{
    if(Array.isArray(first)&&Object.hasOwn(first,'raw')){
      calls.push({query:first.join('?'),values});
      return Promise.resolve([{
        id:'fireball-card',name_en:'Fireball',card_type:'spell',description_en:'',
        data:{entityType:'spell',ruleset:'dnd5e-2024'},entity_type:'spell',
        ruleset:'dnd5e-2024',source_key:'srd-2024',match_source:'name'
      }]);
    }
    return first;
  };
  const ui=serverFunctions([
    'entityDisplayName','russianSearchAliases','cardEntityKind','cardDisplayName','cardSearchSuggestions'
  ],{displayText,localizedAliases,UI_RU_EXTRA,englishAliasesForRussianQuery,sql});

  const rows=await ui.cardSearchSuggestions('огнен','ru');
  assert.equal(rows[0].name,'Огненный шар');
  assert.ok(calls[0].values.some(value=>Array.isArray(value)&&value.includes('fireball')));
  assert.match(calls[0].query,/LOWER\(ct\.name_en\) IN/);
});

test('Russian search routes preserve request language and content source context',()=>{
  assert.match(server,/cardSearchSuggestions\(url\.searchParams\.get\("q"\)\|\|"",requestLanguage\(req\)\)/);
  assert.match(server,/cardsPage\(url,requestLanguage\(req\)\)/);
  assert.match(server,/cs\.document_key AS source_key/);
});

test('Concentration spells make their state change explicit on the cast button',()=>{
  const {spellCastButtonText}=serverFunctions(['spellCastButtonText']);
  assert.equal(spellCastButtonText({concentration:true},1),'Cast & start Concentration');
  assert.equal(spellCastButtonText({concentration:false},0),'Cast cantrip');
  assert.equal(spellCastButtonText({concentration:false},3),'Cast');
});
