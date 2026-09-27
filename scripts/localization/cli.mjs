import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalog } from '../../src/localization/catalog.mjs';
import { textId, validPackEntries, translationCoverage } from '../../src/localization/core.mjs';
import { termTranslation, packPath } from '../../src/localization/runtime.mjs';
import { atomicJson, readPack, runTranslation, withPackLock } from '../../src/localization/jobs.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const command=process.argv[2]||'audit';
const arg=name=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:null;};
let sql;
async function manifest(){
  if(arg('input'))return JSON.parse(await fs.readFile(path.resolve(arg('input')),'utf8'));
  if(!process.env.DATABASE_URL)throw new Error('Нет DATABASE_URL. Запускайте команду в папке проекта с вашим файлом .env, либо укажите --input dnd-translation-input.json.');
  const {default:postgres}=await import('postgres');
  sql=postgres(process.env.DATABASE_URL,{max:1,idle_timeout:5});
  return readCatalog(sql);
}
try{
  if(command==='import'){
    if(!arg('input'))throw new Error('Укажите --input путь-к-пакету.json');
    const incoming=JSON.parse(await fs.readFile(path.resolve(arg('input')),'utf8'));
    const entries=validPackEntries(incoming);
    if(entries.length!==incoming.entries.length)throw new Error('Пакет содержит повреждённые или непроверенные записи. Импорт отменён.');
    await withPackLock(packPath,async()=>{
      const existing=await readPack();const map=new Map(existing.entries.map(e=>[e.id,e]));
      for(const e of entries){if(map.get(e.id)?.status==='reviewed'&&e.status!=='reviewed')continue;map.set(e.id,e);}
      await atomicJson(packPath,{schema:1,language:'ru',entries:[...map.values()]});
    });
    console.log(`Импортировано переводов: ${entries.length}`);
  }else{
    const data=await manifest();
    if(data.schema!==1||!Array.isArray(data.segments)||data.segments.some(s=>s.id!==textId(s.text,s)))throw new Error('Неверный формат исходного каталога');
    if(command==='export'){
      const output=path.resolve(arg('output')||path.join(root,'dnd-translation-input.json'));
      await atomicJson(output,data);console.log(`Готово: ${output}\nСущностей: ${data.entityCount}; текстов: ${data.segments.length}. Персонажи, заметки и настройки подключения не включены.`);
    }else{
      const coverage=command==='translate'
        ?await runTranslation(data,{limit:Number(arg('limit'))||Infinity,onProgress:p=>console.log(`Переведено: ${p.done}; осталось: ${p.remaining}`)})
        :translationCoverage(data,(await readPack()).entries,termTranslation);
      const {pendingSegments,...summary}=coverage;
      console.log(JSON.stringify(summary,null,2));
      if(arg('output'))await atomicJson(path.resolve(arg('output')),{...summary,pendingSegments});
      if(!coverage.complete)process.exitCode=2;
    }
  }
}catch(e){console.error(e.message);process.exitCode=1;}
finally{if(sql)await sql.end({timeout:3});}
