import { open, readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { packPath, termTranslation } from './runtime.mjs';
import { isTechnicalSegment, validPackEntries, validateTranslation, translationCoverage } from './core.mjs';
import { translateBatch } from './provider.mjs';

export async function readPack(file=packPath){
  try{
    const raw=JSON.parse(await readFile(file,'utf8'));
    const entries=validPackEntries(raw);
    if(entries.length!==raw.entries.length)throw new Error('В пакете есть повреждённые переводы. Исходный файл оставлен без изменений.');
    return {schema:1,language:'ru',entries};
  }
  catch(e){if(e.code==='ENOENT')return {schema:1,language:'ru',entries:[]};throw e;}
}
export async function atomicJson(file,data){
  await mkdir(path.dirname(file),{recursive:true});
  const tmp=file+`.${process.pid}.tmp`;
  await writeFile(tmp,JSON.stringify(data,null,2)+'\n');
  await rename(tmp,file);
}
export async function withPackLock(file,fn){
  await mkdir(path.dirname(file),{recursive:true});
  let handle;
  try{handle=await open(file+'.lock','wx');await handle.writeFile(String(process.pid));}
  catch(e){if(e.code==='EEXIST')throw new Error('Другой процесс уже обновляет пакет перевода. Если он аварийно завершился, удалите файл .lock.');throw e;}
  try{return await fn();}finally{await handle.close();await rm(file+'.lock',{force:true});}
}
export async function runTranslation(manifest,{file=packPath,provider=translateBatch,onProgress=()=>{},limit=Infinity}={}){
  return withPackLock(file,async()=>{
    const pack=await readPack(file);
    const current=new Map(pack.entries.map(e=>[e.id,e]));
    const pending=[];
    for(const s of manifest.segments){
      if(isTechnicalSegment(s))continue;
      if(current.has(s.id))continue;
      const term=termTranslation(s.text,s);
      if(term&&validateTranslation(s.text,term).length===0)current.set(s.id,{...s,translation:term,status:'reviewed',origin:'bundled'});
      else pending.push(s);
    }
    const save=()=>atomicJson(file,{schema:1,language:'ru',entries:[...current.values()]});
    await save();
    let done=0;
    // A failed batch never marks source text as translated, and never overwrites a reviewed entry.
    while(pending.length&&done<limit){
      const batch=[];let size=0;
      while(pending.length&&batch.length<4&&done+batch.length<limit){
        const next=pending[0];
        if(batch.length&&size+next.text.length>7000)break;
        batch.push(pending.shift());size+=next.text.length;
      }
      const translated=await provider(batch);
      const expected=new Map(batch.map(s=>[s.id,s]));
      if(translated.length!==batch.length||new Set(translated.map(e=>e.id)).size!==batch.length)throw new Error('Неполный пакет от переводчика');
      for(const item of translated){
        const source=expected.get(item.id);
        if(!source||validateTranslation(source.text,item.translation).length)throw new Error('Невалидный пакет от переводчика');
        current.set(item.id,{...source,translation:item.translation,status:'machine',model:item.model,translatedAt:item.translatedAt});
      }
      done+=batch.length;await save();onProgress({done,remaining:pending.length});
    }
    return translationCoverage(manifest,[...current.values()],termTranslation);
  });
}
