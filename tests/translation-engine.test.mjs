import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { textId, protectMechanics, restoreMechanics, validateTranslation, makeManifest, translationCoverage } from '../src/localization/core.mjs';
import { runTranslation, atomicJson } from '../src/localization/jobs.mjs';
import { translateBatch } from '../src/localization/provider.mjs';
import { localizeHtml } from '../src/localization/html.mjs';
import { parseFragment } from 'parse5';
import { translateText } from '../src/web/assets/i18n-core.mjs';

test('different editions and changed source invalidate cached translations',()=>{
  const source='Roll 2d6 + 3.';
  assert.notEqual(textId(source,{ruleset:'2014'}),textId(source,{ruleset:'2024'}));
  assert.notEqual(textId(source),textId('Roll 2d6 + 4.'));
  assert.equal(textId(source),textId('  '+source+'\r\n'));
});
test('mechanics round trip and missing/duplicated tokens are rejected',()=>{
  const text='Roll 2d6 + 3 at DC 15 within 30 feet. See https://example.org/rule.';
  const protectedText=protectMechanics(text);
  assert.equal(restoreMechanics(protectedText.text,protectedText.tokens),text);
  assert.throws(()=>restoreMechanics(protectedText.text.replace('⟦K0⟧',''),protectedText.tokens));
  assert.throws(()=>restoreMechanics(protectedText.text+'⟦K0⟧',protectedText.tokens));
  assert.ok(validateTranslation('Roll 2d6 + 3.','Бросьте 2d6 + 4.').length);
  assert.deepEqual(validateTranslation('Roll 2d6 + 3.','Бросьте 2d6 + 3.'),[]);
});
test('translation validation rejects lost tables and HTML injection',()=>{
  assert.ok(validateTranslation('| Level | Slots |\n|---|---|\n|1|2|','Уровень 1, ячейки 2').length);
  assert.ok(validateTranslation('One action.','<script>Действие.</script>').length);
});
test('catalog extraction keeps descriptions but excludes machine identifiers',()=>{
  const m=makeManifest([{key:'source:test',name:'Test',ruleset:'dnd5e-2024',kind:'feat',source:'srd-2024',fields:{name_en:'Test',description_en:'Roll 1d6.',raw_source:{secret:'leave raw data alone'},id:'machine-id',traits:[{name:'Test',description:'Roll 1d6.'}]}}]);
  assert.equal(m.segments.length,2);
  assert.ok(!JSON.stringify(m).includes('leave raw'));
  assert.equal(m.segments.find(x=>x.text==='Roll 1d6.').uses.length,2);
  assert.equal(translationCoverage(m,[]).complete,false);
});
test('resume only translates new source and keeps reviewed translations',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dnd-i18n-'));
  try{
    const file=path.join(dir,'ru.json');
    const m=makeManifest([{key:'one',ruleset:'2024',kind:'feat',fields:{description_en:'Custom rule 7d9.'}}]);
    let calls=0;
    const provider=async batch=>{calls++;return batch.map(s=>({...s,translation:'Особое правило 7d9.',status:'machine'}));};
    let result=await runTranslation(m,{file,provider});assert.equal(result.complete,true);
    await runTranslation(m,{file,provider});assert.equal(calls,1);
    const pack=JSON.parse(await readFile(file));pack.entries[0].status='reviewed';pack.entries[0].translation='Проверенное правило 7d9.';
    await atomicJson(file,pack);await runTranslation(m,{file,provider});
    assert.equal(JSON.parse(await readFile(file)).entries[0].translation,'Проверенное правило 7d9.');
    const changed=structuredClone(m);changed.segments[0].text='Custom rule 8d9.';changed.segments[0].id=textId(changed.segments[0].text,changed.segments[0]);
    assert.equal(translationCoverage(changed,pack.entries).pending,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('a failed batch does not enter the translation cache',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dnd-i18n-'));
  try{
    const file=path.join(dir,'ru.json');
    const m=makeManifest([{key:'one',fields:{description:'Custom rule 7d9.'}}]);
    await assert.rejects(runTranslation(m,{file,provider:async b=>b.map(s=>({...s,translation:'Особое правило 1d20.'}))}));
    assert.equal(JSON.parse(await readFile(file)).entries.length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Ollama contract restores protected numbers and labels machine output honestly',async()=>{
  const segment={text:'Roll 7d9.',ruleset:'dnd5e-2024',kind:'feat'};segment.id=textId(segment.text,segment);
  let request;
  const fake=async(url,options)=>{request=JSON.parse(options.body);const input=JSON.parse(request.messages[1].content);return {ok:true,json:async()=>({message:{content:JSON.stringify({translations:[{id:input[0].id,text:'Бросьте ⟦K0⟧.'}]})}})};};
  const [out]=await translateBatch([segment],{fetchImpl:fake,env:{LOCALIZATION_MODEL:'test-model'}});
  assert.equal(out.translation,'Бросьте 7d9.');assert.equal(out.status,'machine');assert.equal(request.stream,false);
  assert.ok(!request.messages[1].content.includes('7d9'));
});
test('HTML localization does not mutate canonical values, URLs, script or user text',()=>{
  const source='<form action="/class/Druid"><h3>Starting Equipment</h3><option value="Druid">Druid</option><input name="class" value="Druid" placeholder="Search"><textarea>My Rogue</textarea><b data-i18n-skip>Rage</b><pre>Wild Shape</pre><script>const x="Druid"</script><span>Spell attack 1d20+5</span></form>';
  const out=localizeHtml(source,'ru');
  assert.match(out,/Стартовое снаряжение/);assert.match(out,/value="Druid">Друид/);
  assert.match(out,/name="class" value="Druid" placeholder="Поиск"/);
  assert.match(out,/<textarea>My Rogue<\/textarea>/);assert.match(out,/data-i18n-skip="">Rage/);
  assert.match(out,/<script>const x="Druid"<\/script>/);assert.match(out,/1d20\+5/);
  assert.equal(localizeHtml(source,'en'),source);
  assert.match(localizeHtml('<select name="skill"><option>Nature</option></select>'), /value="Nature">Природа/);
});
test('long paragraphs are translated completely and preserve blank lines and formulas',async()=>{
  const text=('Roll 7d9. '.repeat(800)).trim()+'\n\nRoll 1d20.';
  const segment={text,id:textId(text)};
  let calls=0;
  const fake=async(url,options)=>{
    calls++;
    const input=JSON.parse(JSON.parse(options.body).messages[1].content);
    return {ok:true,json:async()=>({message:{content:JSON.stringify({translations:input.map(s=>({id:s.id,text:s.text.replaceAll('Roll','Бросьте').trim()}))})}})};
  };
  const [out]=await translateBatch([segment],{fetchImpl:fake,env:{LOCALIZATION_MODEL:'test-model'}});
  assert.ok(calls>1);
  assert.equal(out.translation,text.replaceAll('Roll','Бросьте'));
});
test('UI template translation keeps dice formulas, dynamic values and edition-specific names',()=>{
  assert.equal(translateText('Spell attack 1d20+5'),'Атака заклинанием 1d20+5');
  assert.equal(translateText('Acolyte','ru',{ruleset:'dnd5e-2014',kind:'background'}),'Прислужник');
  assert.equal(translateText('Acolyte','ru',{ruleset:'dnd5e-2024',kind:'background'}),'Послушник');
  assert.equal(translateText('Bardic Inspiration d8. Uses equal Charisma modifier (minimum 1).'),'Бардовское вдохновение d8. Число использований равно модификатору Харизмы (минимум 1).');
  assert.equal(translateText('Distant Spell · 1 SP'),'Далёкое заклинание · 1 ОЧ');
  assert.equal(translateText('Druid Spellcasting'),'Друид · Заклинания');
  assert.equal(translateText('Druid has no inventory cards.'),'У персонажа Druid нет карточек инвентаря.');
});
