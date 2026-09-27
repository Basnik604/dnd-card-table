import { readCatalog } from './catalog.mjs';
import { runTranslation } from './jobs.mjs';
export function startTranslationWorker(sql) {
  if(process.env.LOCALIZATION_AUTO!=='1')return ()=>{};
  if(!process.env.LOCALIZATION_MODEL){console.warn('Автоперевод не запущен: не указан LOCALIZATION_MODEL.');return ()=>{};}
  let running=false,stopped=false;
  async function tick(){
    if(running||stopped)return;
    running=true;
    try{await runTranslation(await readCatalog(sql));}
    catch(e){console.warn('Автоперевод приостановлен:',e.message);}
    finally{running=false;}
  }
  // Local application worker: unchanged text hashes are skipped after each import.
  const timer=setInterval(tick,Math.max(60000,Number(process.env.LOCALIZATION_POLL_MS)||120000));
  timer.unref();tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
