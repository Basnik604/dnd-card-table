import {readdirSync,readFileSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw new Error('Usage: node scripts/token-packs/build-first-collection.mjs EXTRACTED_DIRECTORY OUTPUT_PACK_DIRECTORY');
const labels=JSON.parse(readFileSync(new URL('./first-collection-labels.json',import.meta.url)));
const categories=new Map(),images=new Map();let sourceCount=0;
const hash=value=>createHash('sha256').update(value).digest('hex');
function category(parts) {
 const key=parts.join('/'),id=hash(key).slice(0,16);
 if(!categories.has(id)) {
  for(const part of parts)if(!labels[part])throw new Error('Missing category translation: '+part);
  categories.set(id,{id,parent:parts.length>1?category(parts.slice(0,-1)):null,label:parts.join(' / '),label_ru:parts.map(p=>labels[p]).join(' / ')});
 }
 return id;
}
function visit(directory,parts=[]) {
 for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
  const file=path.join(directory,entry.name);
  if(entry.isSymbolicLink())throw new Error('Symlinks are not supported');
  if(entry.isDirectory()){visit(file,[...parts,entry.name]);continue;}
  if(!entry.name.toLowerCase().endsWith('.png'))continue;
  const bytes=readFileSync(file);
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==256||bytes.readUInt32BE(20)!==256)throw new Error('Unexpected image: '+file);
  const sha256=hash(bytes),id=sha256.slice(0,24),sourcePath=[...parts,entry.name].join('/');sourceCount++;
  let item=images.get(id);
  if(!item) {
   item={id,name:entry.name.replace(/\.png$/i,'').replace(/\(\d+\)$/,''),file:'images/'+id+'.png',sha256,width:256,height:256,category_ids:[],source_paths:[]};
   images.set(id,item);mkdirSync(path.join(target,'images'),{recursive:true});copyFileSync(file,path.join(target,item.file));
  }
  if(item.sha256!==sha256)throw new Error('ID collision');
  item.source_paths.push(sourcePath);
  for(let n=1;n<=parts.length;n++){const key=category(parts.slice(0,n));if(!item.category_ids.includes(key))item.category_ids.push(key);}
 }
}
visit(source);
const entries=[...images.values()].sort((a,b)=>a.name.localeCompare(b.name,'en')||a.id.localeCompare(b.id));
const manifest={schema:1,id:'first-dnd',title:'1st D&D Token Collection',title_ru:'Коллекция токенов D&D',version:1,source_count:sourceCount,unique_count:entries.length,categories:[...categories.values()],entries};
writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:sourceCount,unique:entries.length,categories:categories.size}));
