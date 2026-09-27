import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RU_GAME_EXACT, RU_GAME_GENERATED, RU_GAME_KIND_EXACT, RU_GAME_CONTEXT, translateGameEntity } from '../web/assets/game-ru.mjs';
import { RU_RULES_GLOSSARY, RU_UI_FALLBACK } from '../web/assets/glossary-ru.mjs';

const DIR=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(DIR,'../..');
const CACHE_FILE=process.env.I18N_CACHE_FILE||path.join(ROOT,'.localization','ru-cache.json');
const MODEL=process.env.I18N_MODEL||'Xenova/opus-mt-en-ru';
const DTYPE=process.env.I18N_DTYPE||'q8';
const CACHE_VERSION='ru-v4-safe-names';

const cache=new Map();
const cacheMeta=new Map();
let loaded=false;
let dirty=false;
let saveTimer=null;
let translatorPromise=null;
let queue=Promise.resolve();

function loadCache(){
  if(loaded)return;
  loaded=true;
  try{
    const data=JSON.parse(fs.readFileSync(CACHE_FILE,'utf8'));
    // Cache formats are intentionally versioned. A previous localization build may
    // contain damaged ML entity names, so never import stale entries or aliases.
    if(data?.version!==CACHE_VERSION)return;
    if(data&&typeof data==='object'&&data.entries&&typeof data.entries==='object'){
      for(const [k,v] of Object.entries(data.entries)) if(typeof v==='string') cache.set(k,v);
      if(data.meta&&typeof data.meta==='object')for(const [k,v] of Object.entries(data.meta))if(v&&typeof v==='object')cacheMeta.set(k,v);
    }
  }catch{}
}

function scheduleSave(){
  dirty=true;
  if(saveTimer)return;
  saveTimer=setTimeout(()=>{saveTimer=null;flushTranslationCacheSync();},300);
  saveTimer.unref?.();
}

export function flushTranslationCacheSync(){
  loadCache();
  if(!dirty)return;
  fs.mkdirSync(path.dirname(CACHE_FILE),{recursive:true});
  const tmp=CACHE_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({version:CACHE_VERSION,model:MODEL,updated_at:new Date().toISOString(),entries:Object.fromEntries(cache),meta:Object.fromEntries(cacheMeta)},null,2));
  fs.renameSync(tmp,CACHE_FILE);
  dirty=false;
}

process.on('exit',()=>{try{flushTranslationCacheSync();}catch{}});

function normalizeContext(options={}){
  return {
    context:String(options.context||'generic'),
    kind:options.kind?String(options.kind):'',
    ruleset:options.ruleset?String(options.ruleset):''
  };
}

function protectedNameContext(options={}){
  const context=String(options?.context||'');
  return context==='entity-name' || context==='entity-action-name' || context==='entity-trait-name' || context==='builder-feature-name';
}

function keyFor(text,options={}){
  const c=normalizeContext(options);
  // Entity names are ruleset/kind-sensitive; ordinary UI/prose translations are reusable everywhere.
  const scope=c.context==='entity-name'?['entity-name',c.kind,c.ruleset]:['text','',''];
  return crypto.createHash('sha256').update([CACHE_VERSION,...scope,String(text)].join('\u0001')).digest('hex');
}

export function getCachedRussian(text,options={}){
  loadCache();
  const raw=String(text??'');
  if(!raw)return raw;
  return cache.get(keyFor(raw,options))??null;
}

export function setCachedRussian(text,translation,options={}){
  loadCache();
  const raw=String(text??''),out=String(translation??'');
  if(!raw||!out)return out;
  const key=keyFor(raw,options),ctx=normalizeContext(options);
  cache.set(key,out);
  cacheMeta.set(key,{source:raw,translation:out,...ctx});
  scheduleSave();
  return out;
}

export function englishSourcesForRussianQuery(term,{kind=null,ruleset=null,limit=120}={}){
  loadCache();
  const needle=String(term||'').trim().toLowerCase();
  if(!needle)return [];
  const out=[],seen=new Set();
  for(const meta of cacheMeta.values()){
    if(meta?.context!=='entity-name')continue;
    if(kind&&kind!=='all'&&meta.kind&&String(meta.kind)!==String(kind))continue;
    if(ruleset&&ruleset!=='all'&&meta.ruleset&&String(meta.ruleset)!==String(ruleset))continue;
    const translation=String(meta.translation||'').toLowerCase();
    if(!translation.includes(needle))continue;
    const source=String(meta.source||'').trim();
    if(source&&!seen.has(source.toLowerCase())){seen.add(source.toLowerCase());out.push(source);if(out.length>=limit)break;}
  }
  return out;
}

export function translationCacheStats(){
  loadCache();
  return {entries:cache.size,model:MODEL,dtype:DTYPE,file:CACHE_FILE};
}

function exactKnownTranslation(text,options={}){
  const raw=String(text??'').trim();
  if(!raw)return raw;
  if(options.context==='entity-name'){
    const entity=translateGameEntity(raw,{ruleset:options.ruleset||null,kind:options.kind||null});
    if(entity&&entity!==raw)return entity;
  }
  if(Object.prototype.hasOwnProperty.call(RU_UI_FALLBACK,raw))return RU_UI_FALLBACK[raw];
  if(Object.prototype.hasOwnProperty.call(RU_RULES_GLOSSARY,raw))return RU_RULES_GLOSSARY[raw];
  if(Object.prototype.hasOwnProperty.call(RU_GAME_EXACT,raw))return RU_GAME_EXACT[raw];
  if(Object.prototype.hasOwnProperty.call(RU_GAME_GENERATED,raw))return RU_GAME_GENERATED[raw];
  return null;
}

export function looksEnglishForTranslation(value){
  const text=String(value??'').trim();
  if(text.length<2)return false;
  if(/^https?:\/\//i.test(text))return false;
  if(/^[\d\s+\-×÷*/().,:;%]+$/.test(text))return false;
  if(/^[A-Z]{1,4}$/.test(text)&&!['SAVE','FAIL'].includes(text))return false;
  return /[A-Za-z]{2,}/.test(text);
}

const glossaryEntries=[
  ...Object.entries(RU_RULES_GLOSSARY),
  ...Object.entries(RU_GAME_EXACT),
  ...Object.entries(RU_GAME_GENERATED)
]
  .filter(([en,ru])=>en&&ru&&en!==ru&&/[A-Za-z]/.test(en))
  .sort((a,b)=>b[0].length-a[0].length);

function escapeRegex(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function protectText(source){
  let text=String(source??'');
  const tokens=[];
  const add=(value,replacement=null)=>{
    const token=`ZXQ${String(tokens.length).padStart(4,'0')}QXZ`;
    tokens.push({token,value,replacement});
    return token;
  };

  // Preserve technical syntax and source/product titles before glossary replacement.
  for(const phrase of [
    'System Reference Document 5.2','System Reference Document 5.1','SRD 5.2','SRD 5.1',
    'Tome of Heroes',"Adventurer's Guide","Tal'Dorei Campaign Setting",'Open5e Originals',
    "Dungeon Delver's Guide",'Black Flag SRD','Gate Pass Gazette','Player\'s Handbook',
    "Dungeon Master's Guide",'Monster Manual','D&D Card Table','Open5e','A5E'
  ]){
    const pattern=new RegExp(escapeRegex(phrase),'gi');
    text=text.replace(pattern,m=>add(m,m));
  }
  text=text.replace(/https?:\/\/[^\s)\]]+/gi,m=>add(m,m));
  text=text.replace(/\b\d{1,3}d\d{1,4}(?:\s*[+\-]\s*\d+)?\b/gi,m=>add(m,m));
  text=text.replace(/\b(?:AC|HP|DC|CR|PB)\s*[+\-]?\d*(?:\/\d+)?\b/g,m=>add(m,m));
  text=text.replace(/\[[^\]]+\]\([^\)]+\)/g,m=>add(m,m));
  text=text.replace(/<[^>]+>/g,m=>add(m,m));

  for(const [en,ru] of glossaryEntries){
    const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(en)}(?![\\p{L}\\p{N}_])`,'giu');
    text=text.replace(pattern,m=>add(m,ru));
  }
  return {text,tokens};
}

function restoreText(translated,tokens){
  let out=String(translated??'');
  for(const item of tokens){
    const value=item.replacement??item.value;
    const loose=new RegExp(item.token.replace(/([A-Z])/g,'$1\\s*'),'gi');
    out=out.replaceAll(item.token,value).replace(loose,value);
  }
  return normalizeRussianOutput(out);
}

function normalizeRussianOutput(text){
  return String(text??'')
    .replace(/\s+([,.;:!?])/g,'$1')
    .replace(/([«(])\s+/g,'$1')
    .replace(/\s+([»)])/g,'$1')
    .replace(/\bкласс брони\b/gi,'Класс Доспеха')
    .replace(/\bочки жизни\b/gi,'хиты')
    .replace(/\bспасительный бросок\b/gi,'спасбросок')
    .replace(/\bбонус квалификации\b/gi,'бонус мастерства')
    .replace(/\bдлительный отдых\b/gi,'продолжительный отдых')
    .trim();
}

export function isSuspiciousMachineTranslation(source,translated){
  const src=String(source??'').trim();
  const out=String(translated??'').trim();
  if(!out)return true;
  if(/ZXQ\s*\d{2,}\s*QXZ/i.test(out) || /ZXQ/i.test(out) || /QXZ/i.test(out))return true;
  if(/\/{5,}|\\{5,}/.test(out))return true;
  if(/[A-Za-zА-Яа-яЁё]*\d+[A-Za-zА-Яа-яЁё]{2,}\d*/.test(out))return true;
  if(src.length>=8 && out.length>src.length*5+80)return true;
  if(src.length>=8 && out.length<src.length*0.08)return true;
  const weird=(out.match(/[^\p{L}\p{N}\s.,;:!?()«»“”'"+\-–—/%°×*]/gu)||[]).length;
  if(out.length>=12 && weird/out.length>0.12)return true;
  return false;
}

function splitLongText(source,maxChars=720){
  const raw=String(source??'');
  if(raw.length<=maxChars)return [raw];
  const pieces=[];
  for(const paragraph of raw.split(/(\n{2,})/)){
    if(/^\n{2,}$/.test(paragraph)){pieces.push(paragraph);continue;}
    if(paragraph.length<=maxChars){pieces.push(paragraph);continue;}
    let current='';
    const sentences=paragraph.match(/[^.!?\n]+(?:[.!?]+|$)|\n/g)||[paragraph];
    for(const sentence of sentences){
      if((current+sentence).length>maxChars&&current){pieces.push(current);current='';}
      if(sentence.length>maxChars){
        const words=sentence.split(/(\s+)/);
        for(const word of words){
          if((current+word).length>maxChars&&current){pieces.push(current);current='';}
          current+=word;
        }
      }else current+=sentence;
    }
    if(current)pieces.push(current);
  }
  return pieces.filter(Boolean);
}

async function getTranslator(){
  if(translatorPromise)return translatorPromise;
  translatorPromise=(async()=>{
    let mod;
    try{mod=await import('@huggingface/transformers');}
    catch(error){
      const err=new Error('Automatic RU translator is not installed. Run npm install first.');
      err.cause=error;throw err;
    }
    if(mod.env){
      mod.env.cacheDir=process.env.I18N_MODEL_CACHE||path.join(ROOT,'.localization','models');
      mod.env.allowRemoteModels=process.env.I18N_OFFLINE==='1'?false:true;
    }
    return mod.pipeline('translation',MODEL,{dtype:DTYPE});
  })();
  return translatorPromise;
}

async function translateChunk(chunk){
  if(!looksEnglishForTranslation(chunk))return chunk;
  const known=exactKnownTranslation(chunk,{context:'generic'});
  if(known)return known;
  const {text,tokens}=protectText(chunk);
  if(!looksEnglishForTranslation(text))return restoreText(text,tokens);
  const translator=await getTranslator();
  const output=await translator(text,{max_new_tokens:Math.min(768,Math.max(64,Math.ceil(text.length*1.7)))});
  const translated=Array.isArray(output)?output[0]?.translation_text:output?.translation_text;
  if(!translated)throw new Error('Translation model returned an empty result');
  const restored=restoreText(translated,tokens);
  // A damaged model output is always worse than readable canonical English.
  return isSuspiciousMachineTranslation(chunk,restored)?String(chunk):restored;
}

async function translateUncached(text,options={}){
  const raw=String(text??'');
  const exact=exactKnownTranslation(raw,options);
  if(exact)return exact;
  // Entity/action/trait names must never go through NMT. Unknown names stay in
  // canonical English until a curated or deterministic D&D translation exists.
  if(protectedNameContext(options))return raw;
  if(!looksEnglishForTranslation(raw))return raw;
  const parts=splitLongText(raw);
  const translated=[];
  for(const part of parts){
    if(/^\n{2,}$/.test(part)){translated.push(part);continue;}
    translated.push(await translateChunk(part));
  }
  return translated.join('');
}

export async function translateRussian(text,options={}){
  const raw=String(text??'');
  if(!raw)return raw;
  const exact=exactKnownTranslation(raw,options);
  if(exact)return exact;
  const hit=getCachedRussian(raw,options);
  if(hit!==null)return hit;
  if(!looksEnglishForTranslation(raw))return raw;
  const task=async()=>{
    const secondHit=getCachedRussian(raw,options);
    if(secondHit!==null)return secondHit;
    const out=await translateUncached(raw,options);
    setCachedRussian(raw,out,options);
    return out;
  };
  queue=queue.then(task,task);
  return queue;
}

export async function translateBatchRussian(items,{context='ui'}={}){
  const list=(Array.isArray(items)?items:[]).slice(0,80);
  const out=[];
  for(const item of list){
    if(item&&typeof item==='object'&&!Array.isArray(item)){
      const text=String(item.text??'');
      const options={context:item.context||context,kind:item.kind||null,ruleset:item.ruleset||null};
      out.push({text,translation:await translateRussian(text,options)});
    }else{
      const text=String(item??'');
      out.push({text,translation:await translateRussian(text,{context})});
    }
  }
  flushTranslationCacheSync();
  return out;
}

export function cachedOrKnownRussian(text,options={}){
  const raw=String(text??'');
  const exact=exactKnownTranslation(raw,options);
  if(exact!==null)return exact;
  if(protectedNameContext(options))return raw;
  return getCachedRussian(raw,options) ?? raw;
}

export function glossaryStatus(){
  return {
    exact:Object.keys(RU_GAME_EXACT).length,
    generated:Object.keys(RU_GAME_GENERATED).length,
    rules:Object.keys(RU_RULES_GLOSSARY).length,
    ui:Object.keys(RU_UI_FALLBACK).length,
    cache:translationCacheStats()
  };
}
