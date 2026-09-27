import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeManifest, textId, translationCoverage } from '../src/localization/core.mjs';
import { atomicJson, runTranslation } from '../src/localization/jobs.mjs';

test('resume path calls provider once and preserves reviewed translations',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dnd-i18n-'));
  try{
    const file=path.join(dir,'ru.json');
    const manifest=makeManifest([{key:'one',ruleset:'2024',kind:'feat',fields:{description_en:'Custom rule 7d9.'}}]);
    let calls=0;
    const provider=async batch=>{calls++;return batch.map(s=>({...s,translation:'Особое правило 7d9.',status:'machine'}));};
    const first=await runTranslation(manifest,{file,provider});
    assert.equal(first.complete,true);
    await runTranslation(manifest,{file,provider});
    assert.equal(calls,1);
    const pack=JSON.parse(await readFile(file));
    pack.entries[0].status='reviewed'; pack.entries[0].translation='Проверенное правило 7d9.';
    await atomicJson(file,pack); await runTranslation(manifest,{file,provider});
    assert.equal(JSON.parse(await readFile(file)).entries[0].translation,'Проверенное правило 7d9.');
    const changed=structuredClone(manifest); changed.segments[0].text='Custom rule 8d9.'; changed.segments[0].id=textId(changed.segments[0].text,changed.segments[0]);
    assert.equal(translationCoverage(changed,pack.entries).pending,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('failed provider batch never enters translation cache',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dnd-i18n-'));
  try{
    const file=path.join(dir,'ru.json');
    const manifest=makeManifest([{key:'one',fields:{description:'Custom rule 7d9.'}}]);
    await assert.rejects(runTranslation(manifest,{file,provider:async batch=>batch.map(s=>({...s,translation:'Особое правило 1d20.'}))}));
    assert.equal(JSON.parse(await readFile(file)).entries.length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('technical segments never reach provider',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'dnd-i18n-'));
  try{
    const file=path.join(dir,'ru.json');
    const manifest={entityCount:1,segments:[
      {id:'technical-id',text:'source-key',uses:[{path:'items.0.canonical_data.source_index'}]},
      ...makeManifest([{key:'one',fields:{description:'Custom rule 7d9.'}}]).segments
    ]};
    let seen=[];
    const provider=async batch=>{seen.push(...batch.map(x=>x.text));return batch.map(s=>({...s,translation:'Особое правило 7d9.'}));};
    const out=await runTranslation(manifest,{file,provider});
    assert.deepEqual(seen,['Custom rule 7d9.']);
    assert.equal(out.ignored,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
