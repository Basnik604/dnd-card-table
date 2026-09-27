import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validPackEntries,translationCoverage} from '../src/localization/core.mjs';
import {displayText,termTranslation} from '../src/localization/runtime.mjs';
import {localizeHtml} from '../src/localization/html.mjs';
import {parseFragment} from 'parse5';

const pack=JSON.parse(fs.readFileSync(new URL('../data/translations/ru.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(new URL('../data/translations/manifest.json',import.meta.url)));

test('the shipped Russian pack validates and covers the complete catalog snapshot',()=>{
  assert.ok(pack.entries.length>0);
  assert.equal(validPackEntries(pack).length,pack.entries.length);
  assert.equal(new Set(pack.entries.map(e=>e.id)).size,pack.entries.length);
  const coverage=translationCoverage(manifest,pack.entries,termTranslation);
  assert.equal(coverage.pending,0);
  assert.equal(coverage.complete,true);
});

test('English mode preserves every shipped source verbatim, including surrounding whitespace',()=>{
  for(const entry of pack.entries){
    const input=' \n'+entry.text+'\n ';
    assert.equal(displayText(input,{...entry,language:'en'}),input,entry.id);
  }
});

test('actual translated catalog names keep canonical form values and links',()=>{
  const names=pack.entries.filter(e=>e.uses?.some(u=>u.path==='name_en')).slice(0,50);
  assert.ok(names.length>0);
  const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  for(const entry of names){
    const source=`<a href="/entry/${entry.id}">${escape(entry.text)}</a><select name="entry"><option>${escape(entry.text)}</option></select>`;
    assert.equal(localizeHtml(source,'en',entry),source);
    const dom=parseFragment(localizeHtml(source,'ru',entry));
    const link=dom.childNodes[0],option=dom.childNodes[1].childNodes[0];
    assert.equal(link.attrs.find(a=>a.name==='href').value,'/entry/'+entry.id);
    assert.equal(link.childNodes[0].value,entry.translation);
    assert.equal(option.attrs.find(a=>a.name==='value').value,entry.text);
    assert.equal(option.childNodes[0].value,entry.translation);
  }
});
