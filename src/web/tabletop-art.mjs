import {readdirSync,readFileSync,statSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../data/token-packs/',import.meta.url));
const PACK=/^[a-z0-9][a-z0-9-]{0,47}$/,ID=/^[a-f0-9]{24}$/;
const TERMS={
 'mind flayer':'illithid','иллитид':'illithid','пожиратель разума':'illithid','аболет':'aboleth','бехолдер':'beholder','зритель':'beholder',
 'зомби':'zombie','скелет':'skeleton','скелеты':'skeleton','вампир':'vampire','лич':'lich','демилич':'demilich','упырь':'ghoul','ревенант':'revenant','привидение':'ghost','призрак':'ghost','спектр':'specter','дух':'spirit','нежить':'undead','драколич':'dracolich',
 'гоблин':'goblin','гоблины':'goblin','хобгоблин':'hobgoblin','кобольд':'kobold','гнолл':'gnoll','орк':'orc','орки':'orc','полуорк':'half orc','дворф':'dwarf','дварф':'dwarf','гном':'gnome','эльф':'elf','полуэльф':'half elf','дроу':'drow','полурослик':'halfling','тифлинг':'tiefling','драконорожденный':'dragonborn','человек':'human','табакси':'tabaxi','кенку':'kenku','фирболг':'firbolg','кованый':'warforged',
 'волк':'wolf','волки':'wolf','лютый волк':'dire wolf','оборотень':'werewolf','медведь':'bear','бурый медведь':'brown bear','черный медведь':'black bear','белый медведь':'polar bear','паук':'spider','гигантский паук':'giant spider','летучая мышь':'bat','летучие мыши':'bat','змея':'snake','крыса':'rat','лошадь':'horse','собака':'dog','кот':'cat','кошка':'cat','лев':'lion','тигр':'tiger','орел':'eagle','ворон':'raven','сова':'owl','акула':'shark','крокодил':'crocodile','динозавр':'dinosaur',
 'дракон':'dragon','драконы':'dragon','красный':'red','синий':'blue','зеленый':'green','черный':'black','белый':'white','золотой':'gold','серебряный':'silver','бронзовый':'bronze','медный':'copper','взрослый':'adult','древний':'ancient','молодой':'young','вирмлинг':'wyrmling',
 'великан':'giant','тролль':'troll','огр':'ogre','циклоп':'cyclops','минотавр':'minotaur','кентавр':'centaur','медуза':'medusa','гидра':'hydra','сфинкс':'sphinx','гарпия':'harpy','грифон':'griffon','мантикора':'manticore','химера':'chimera','тарраск':'tarrasque','василиск':'basilisk','кракен':'kraken','голем':'golem','элементаль':'elemental','джинн':'djinni','демон':'demon','дьявол':'devil','ангел':'angel','фея':'fairy','дриада':'dryad','карга':'hag','сатир':'satyr','слизь':'ooze','студенистый куб':'gelatinous cube',
 'воин':'fighter','варвар':'barbarian','берсерк':'berserker','паладин':'paladin','следопыт':'ranger','плут':'rogue','монах':'monk','бард':'bard','друид':'druid','жрец':'cleric','волшебник':'wizard','маг':'mage','чародей':'sorcerer','колдун':'warlock','ведьма':'witch','некромант':'necromancer','культист':'cultist','разбойник':'bandit','стражник':'guard','страж':'guard','торговец':'merchant','кузнец':'blacksmith','капитан':'captain','пират':'pirate','моряк':'sailor','рыцарь':'knight','лучник':'archer','житель':'villager','крестьянин':'villager',
 'меч':'sword','щит':'shield','сундук':'treasure box','свиток':'scroll','кольцо':'ring','книга':'tome','посох':'staff','женщина':'female','мужчина':'male','ребенок':'child','огонь':'fire','лед':'ice','вода':'water'
};
const FIXES={abberant:'aberrant',abberation:'aberration',abberations:'aberration',gobling:'goblin',assassion:'assassin',griffin:'griffon',spectre:'specter',hellhound:'hell hound',wolves:'wolf',zombies:'zombie',skeletons:'skeleton',goblins:'goblin',dwarves:'dwarf',elves:'elf',bears:'bear',spiders:'spider',bats:'bat',rats:'rat',horses:'horse',snakes:'snake'};
const base=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const translations=Object.entries(TERMS).sort((a,b)=>b[0].length-a[0].length);
export function normalizeArtText(value) {
 let text=' '+base(value)+' ';
 for(const [ru,en] of translations)text=text.split(' '+ru+' ').join(' '+en+' ');
 return text.trim().split(' ').map(word=>FIXES[word]||word).join(' ').replace(/\s+/g,' ');
}
const words=value=>normalizeArtText(value).split(' ').filter(w=>w&&!/^\d+$/.test(w));
const plain=value=>words(value).join(' ');
const stop=new Set(['the','a','an','of','with','in','on','at','and','token']);
const undeadWords=new Set(['undead','zombie','skeleton','skeletal','ghost','specter','spirit','dracolich','lich','demilich','vampire','revenant','ghoul']);
export function publicTokenArt(entry,sceneId) {
 if(!entry)return null;
 return {key:entry.key,name:entry.name,pack:entry.pack,category:entry.category,category_ru:entry.category_ru,url:`/media/tabletop/art/${sceneId}/${entry.key}.png?v=${entry.sha256.slice(0,16)}`};
}
export function createTokenArtLibrary({root=ROOT}={}) {
 let catalog=null;const matches=new Map();
 function load() {
  if(catalog)return catalog;
  const entries=[],categories=[],packs=[],warnings=[];let directories=[];
  try{directories=readdirSync(root,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')warnings.push('Token pack could not be read.');}
  for(const directory of directories.sort((a,b)=>a.name.localeCompare(b.name))) {
   if(!directory.isDirectory()||!PACK.test(directory.name))continue;
   try {
    const folder=realpathSync(path.join(root,directory.name)),manifestPath=path.join(folder,'manifest.json');
    if(statSync(manifestPath).size>20_000_000)throw new Error('Manifest too large');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    if(manifest.schema!==1||manifest.id!==directory.name||!Array.isArray(manifest.entries)||manifest.entries.length>25000||!Array.isArray(manifest.categories)||manifest.categories.length>1000)throw new Error('Invalid manifest');
    const groupMap=new Map();
    for(const group of manifest.categories){if(!/^[a-f0-9]{16}$/.test(group.id)||typeof group.label!=='string'||typeof group.label_ru!=='string'||group.label.length>500||group.label_ru.length>500)throw new Error('Invalid category');groupMap.set(group.id,group);}
    const packEntries=[],ids=new Set();
    for(const entry of manifest.entries) {
     if(!ID.test(entry.id)||ids.has(entry.id)||entry.file!==`images/${entry.id}.png`||! /^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.name!=='string'||entry.name.length>240||!Array.isArray(entry.category_ids)||!entry.category_ids.every(id=>groupMap.has(id)))throw new Error('Invalid art entry');
     ids.add(entry.id);
     const file=realpathSync(path.join(folder,entry.file)),stat=statSync(file);
     if(!file.startsWith(folder+path.sep)||!stat.isFile()||stat.size<33||stat.size>2_000_000)throw new Error('Invalid art file');
     const groups=entry.category_ids.map(id=>groupMap.get(id)),category=groups.reduce((a,b)=>b.label.length>a.label.length?b:a,{label:'',label_ru:''});
     const names=[entry.name,...(entry.source_paths||[]).slice(0,30).map(v=>path.basename(String(v),'.png'))];
     packEntries.push({...entry,key:manifest.id+'/'+entry.id,pack:manifest.id,file,category:category.label,category_ru:category.label_ru,category_ids:entry.category_ids.map(id=>manifest.id+'/'+id),_item:groups.some(g=>g.label==='Items'),_names:names.map(plain),_words:new Set(names.flatMap(words)),_search:normalizeArtText([...names,...groups.flatMap(g=>[g.label,g.label_ru])].join(' '))});
    }
    entries.push(...packEntries);
    for(const group of groupMap.values())categories.push({id:manifest.id+'/'+group.id,label:group.label,label_ru:group.label_ru,count:packEntries.filter(e=>e.category_ids.includes(manifest.id+'/'+group.id)).length});
    packs.push({id:manifest.id,title:String(manifest.title||manifest.id),title_ru:String(manifest.title_ru||manifest.title||manifest.id),count:packEntries.length,source_count:Number(manifest.source_count)||packEntries.length});
   } catch(error) {warnings.push('Token pack could not be read.');console.warn('Token pack '+directory.name+': '+error.message);}
  }
  entries.sort((a,b)=>a.name.localeCompare(b.name,'en')||a.key.localeCompare(b.key));
  catalog={entries,categories,packs,warnings,byKey:new Map(entries.map(e=>[e.key,e]))};return catalog;
 }
 function get(key){return typeof key==='string'?load().byKey.get(key)||null:null;}
 function search({q='',category='',page=1,language='ru'}={}) {
  const data=load();let query=words(String(q).slice(0,120));
  let found=data.entries.filter(e=>(!category||e.category_ids.includes(category))&&query.every(word=>e._search.includes(word))),relaxed=false;
  const simpler=query.filter(w=>!['adult','young','ancient','elder','wyrmling','dire','giant'].includes(w));
  if(!found.length&&simpler.length&&simpler.length<query.length){found=data.entries.filter(e=>(!category||e.category_ids.includes(category))&&simpler.every(word=>e._search.includes(word)));relaxed=found.length>0;if(relaxed)query=simpler;}
  // Exact creature names precede partial words and category-only matches.
  if(query.length){const score=entry=>entry._names.includes(query.join(' '))?3000:query.every(w=>entry._words.has(w))?2000-entry._words.size:query.reduce((sum,w)=>sum+(entry._words.has(w)?100:0),0);found.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name,'en')||a.key.localeCompare(b.key));}
  const pages=Math.max(1,Math.ceil(found.length/48)),current=Math.min(Math.max(1,Number.isSafeInteger(page)?page:1),pages);
  const categories=[...data.categories].sort((a,b)=>(language==='ru'?a.label_ru:a.label).localeCompare(language==='ru'?b.label_ru:b.label,language));
  return {entries:found.slice((current-1)*48,current*48),total:found.length,page:current,pages,page_size:48,categories,packs:data.packs,warnings:data.warnings,language,relaxed};
 }
 function suggest({name,kind='creature',className='',creatureType=''},variant=0) {
  const cacheKey=JSON.stringify([name,kind,className,creatureType]);let options=matches.get(cacheKey);
  if(!options) {
   const queries=[name];
   if(kind==='character')queries.push(className||'adventurer');
   if(kind==='npc'&&['npc','нип',''].includes(base(name)))queries.push('villager');
   let best=-1;options=[];
   for(const query of queries) {
    const full=plain(query),parts=words(query).filter(w=>!stop.has(w));if(!parts.length)continue;
    const variants=[parts,parts.filter(w=>!['adult','young','ancient','elder','wyrmling','dire','giant','boss'].includes(w))].filter(v=>v.length);
    for(const entry of load().entries) {
     if(entry._item&&kind!=='npc')continue;
     if(base(creatureType)==='beast'&&[...undeadWords].some(w=>entry._words.has(w)))continue;
     let score=-1;
     if(entry._names.includes(full))score=2000;
     else for(let v=0;v<variants.length;v++)if(variants[v].every(w=>entry._words.has(w)))score=Math.max(score,1000-v*300-(entry._words.size-variants[v].length)*10);
     if(score>best){best=score;options=score>=0?[entry]:[];}else if(score===best&&score>=0)options.push(entry);
    }
    if(options.length)break;
   }
   options=[...new Map(options.map(e=>[e.key,e])).values()];
   if(matches.size>5000)matches.clear();matches.set(cacheKey,options);
  }
  return options.length?options[Math.abs(Number(variant)||0)%options.length]:null;
 }
 function image(key) {
  const entry=get(key);if(!entry)return null;
  try {
   const bytes=readFileSync(entry.file);
   if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;
   return {bytes,mime:'image/png',sha256:entry.sha256};
  } catch{return null;}
 }
 return {get,search,suggest,image,summary(){const {packs,warnings}=load();return {packs,warnings};},reload(){catalog=null;matches.clear();}};
}
export const tokenArtLibrary=createTokenArtLibrary();
