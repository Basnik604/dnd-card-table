import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createTokenArtLibrary,tokenArtLibrary,normalizeArtText} from '../src/web/tabletop-art.mjs';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {seedTokenSources,tokenSourceIds,TOKEN_PNG} from './helpers/token-sources.mjs';
import {LOCAL_GM,createTabletopStore} from '../src/web/tabletop.mjs';
const fullPack=existsSync(new URL('../data/token-packs/first-dnd/manifest.json',import.meta.url));
let f,root,library,entries,scene,second;
before(async()=>{
 root=mkdtempSync(path.join(tmpdir(),'dnd-art-test-'));const folder=path.join(root,'test-pack');mkdirSync(path.join(folder,'images'),{recursive:true});
 const bytes=Buffer.from(TOKEN_PNG.split(',')[1],'base64'),hash=createHash('sha256').update(bytes).digest('hex');
 entries=['zombie 1','zombie 2','howling wolf','undead wolf','villager 1','wizard with wand','red dragon 1','blue dragon 1','illithid'].map((name,i)=>({id:String(i+1).padStart(24,'0'),file:'images/'+String(i+1).padStart(24,'0')+'.png',name,sha256:hash,category_ids:['1111111111111111'],source_paths:[name+'.png'],width:1,height:1}));
 for(const entry of entries)writeFileSync(path.join(folder,entry.file),bytes);
 writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({schema:1,id:'test-pack',title:'Test tokens',source_count:entries.length,categories:[{id:'1111111111111111',label:'Creatures',label_ru:'Существа'}],entries}));
 library=createTokenArtLibrary({root});f=await tabletopFixture({server:true,artLibrary:library});await seedTokenSources(f);
 const session=await f.store.createSession(LOCAL_GM,'Набор'),location=await f.store.createLocation(session.id,LOCAL_GM,'Зал');
 second=await f.store.floors.create(location.id,LOCAL_GM,{name:'Подвал',location_revision:1});scene=await f.store.scene(location.scene_id,LOCAL_GM);
});
after(async()=>{await f?.close();if(root)rmSync(root,{recursive:true,force:true});});
const add=async(kind='npc',source_id)=>(await f.store.tokens.add(scene.id,LOCAL_GM,{kind,source_id,name:'НИП',x:140,y:210,snap:true,scene_revision:scene.revision})).token;
const edit=async(token,data={})=>(await f.store.tokens.change(token.id,LOCAL_GM,{...token,scene_revision:1,...data})).token;

test('the complete supplied collection has 1860 unique unmodified PNGs representing all 1924 paths',{skip:!fullPack},()=>{
 const file=new URL('../data/token-packs/first-dnd/manifest.json',import.meta.url),manifest=JSON.parse(readFileSync(file));
 assert.equal(manifest.entries.length,1860);assert.equal(manifest.source_count,1924);assert.equal(manifest.categories.length,103);
 assert.equal(new Set(manifest.entries.flatMap(e=>e.source_paths)).size,1924);
 assert.equal(new Set(manifest.entries.map(e=>e.sha256)).size,1860);
 for(const entry of manifest.entries){const bytes=readFileSync(new URL(entry.file,file));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),256);}
});
test('Russian search, creature aliases, exact variants and conservative fallback preserve creature identities',()=>{
 assert.equal(normalizeArtText('Красный дракон'),'red dragon');
 assert.equal(library.search({q:'зомби'}).total,2);assert.equal(library.search({q:'красный дракон'}).total,1);
 assert.equal(library.suggest({name:'Zombie'}).name,'zombie 1');assert.equal(library.suggest({name:'Zombie'},1).name,'zombie 2');
 assert.equal(library.suggest({name:'Mind Flayer'}).name,'illithid');
 assert.equal(library.suggest({name:'Dire Wolf',creatureType:'Beast'}).name,'howling wolf');
 assert.equal(library.suggest({name:'Adult Red Dragon'}).name,'red dragon 1');
 assert.equal(library.suggest({name:'Uncatalogued Moon Eater'}),null);
 assert.equal(library.search({q:'Dire Wolf'}).relaxed,true);
});
test('catalog pages are bounded, disjoint, filterable and use translated category labels',{skip:!fullPack},()=>{
 const first=tokenArtLibrary.search(),second=tokenArtLibrary.search({page:2});assert.equal(first.entries.length,48);assert.equal(first.total,1860);assert.equal(first.pages,39);
 assert.equal(first.entries.some(a=>second.entries.some(b=>a.key===b.key)),false);
 assert.equal(tokenArtLibrary.search({page:99999}).page,39);
 const bears=first.categories.find(c=>c.label==='Beasts / Bears');assert.ok(bears.label_ru.includes('Медведи'));
 assert.equal(tokenArtLibrary.search({category:bears.id}).total,bears.count);
 assert.equal(tokenArtLibrary.search({category:'no-such-category'}).total,0);
 assert.match(tokenArtLibrary.search({q:'красный дракон'}).entries[0].name,/^red dragon/);
});
test('existing auto tokens receive artwork while character portraits and explicitly selected symbols keep priority',async()=>{
 let zombie=await add('creature',tokenSourceIds.zombie);assert.equal(zombie.art.name,'zombie 1');assert.equal(zombie.art_id,null);assert.equal(zombie.has_image,false);
 zombie=await edit(zombie,{image_mode:'icon'});assert.equal(zombie.art,null);assert.equal(zombie.auto_art.name,'zombie 1');
 const character=await add('character',tokenSourceIds.character);assert.equal(character.has_image,true);assert.equal(character.art,null);assert.ok(character.auto_art.name.includes('wizard'));
 const npc=await add();assert.equal(npc.art.name,'villager 1');
});
test('automatic variants remain stable when the destination assigns a different monster number',async()=>{
 const token=await add('creature',tokenSourceIds.zombie);
 for(let i=0;i<token.ordinal;i++)await f.store.tokens.add(second.id,LOCAL_GM,{kind:'creature',source_id:tokenSourceIds.zombie,x:140,y:210,snap:true,scene_revision:1});
 await f.store.tokens.transfer(scene.id,LOCAL_GM,{tokens:[{id:token.id,revision:token.revision}],target_scene_id:second.id,scene_revision:1,target_revision:1,snap:true});
 const moved=(await f.store.tokens.list(second.id,LOCAL_GM)).find(t=>t.id===token.id);
 assert.notEqual(moved.ordinal,token.ordinal);assert.equal(moved.art.key,token.art.key);assert.equal(moved.art_variant,token.art_variant);
 const reloaded=createTabletopStore(f.sql,{artLibrary:library});await reloaded.ensureSchema();
 assert.equal((await reloaded.tokens.list(second.id,LOCAL_GM)).find(t=>t.id===token.id).art.key,token.art.key);
});
test('manual art choice is retained across rename, reload and floor transfer, without changing portraits or grid data',async()=>{
 let token=await add();token=(await f.store.tokens.change(token.id,LOCAL_GM,{...token,scene_revision:1,data_url:TOKEN_PNG},'image')).token;
 const imageRevision=token.image_revision,key='test-pack/'+entries[2].id;
 token=await edit(token,{art_id:key,image_mode:'catalog',border_color:'#128ad4'});assert.equal(token.art.key,key);assert.equal(token.has_image,false);
 token=await edit(token,{name:'Другой волк'});assert.equal(token.art_id,key);assert.equal(token.image_revision,imageRevision);assert.equal(token.has_custom_image,true);
 const home={x:token.x,y:token.y};
 await f.store.tokens.transfer(scene.id,LOCAL_GM,{tokens:[{id:token.id,revision:token.revision}],target_scene_id:second.id,scene_revision:1,target_revision:1,snap:true});
 token=(await f.store.tokens.list(second.id,LOCAL_GM)).find(t=>t.id===token.id);assert.equal(token.art_id,key);assert.ok(token.art.url.includes(second.id));assert.equal(token.border_color,'#128ad4');
 await f.store.tokens.transfer(second.id,LOCAL_GM,{tokens:[{id:token.id,revision:token.revision}],target_scene_id:scene.id,scene_revision:1,target_revision:1,snap:true});
 token=(await f.store.tokens.list(scene.id,LOCAL_GM)).find(t=>t.id===token.id);assert.equal(token.x,home.x);assert.equal(token.y,home.y);
 token=await edit(token,{image_mode:'custom'});assert.equal(token.art,null);assert.deepEqual((await f.store.tokens.image(token.id,LOCAL_GM)).bytes,Buffer.from(TOKEN_PNG.split(',')[1],'base64'));
});
test('missing packs keep the saved art ID and allow unrelated edits; reinstall restores the same choice',async()=>{
 let token=await add();token=await edit(token,{art_id:'test-pack/'+entries[0].id,image_mode:'catalog'});
 const empty=createTokenArtLibrary({root:path.join(root,'absent')}),offline=createTabletopStore(f.sql,{artLibrary:empty});await offline.ensureSchema();
 let missing=(await offline.tokens.list(scene.id,LOCAL_GM)).find(t=>t.id===token.id);assert.equal(missing.art_id,token.art_id);assert.equal(missing.art_missing,true);assert.equal(missing.art,null);
 missing=(await offline.tokens.change(token.id,LOCAL_GM,{...missing,name:'Имя при отсутствии набора',scene_revision:1})).token;
 assert.equal(missing.art_id,token.art_id);assert.equal((await f.store.tokens.list(scene.id,LOCAL_GM)).find(t=>t.id===token.id).art.key,token.art_id);
});
test('forged artwork and attempts to choose an unavailable asset cannot overwrite a token',async()=>{
 const token=await add();
 for(const art_id of ['../../.env','https://example.com/a.png','test-pack/not-a-hash',42,{},'test-pack/'+'f'.repeat(24)])await assert.rejects(edit(token,{art_id,image_mode:'catalog'}),e=>e.status===400);
 await assert.rejects(edit(token,{image_mode:'catalog',art_id:null}),e=>e.status===400);
 assert.equal((await f.store.tokens.list(scene.id,LOCAL_GM)).find(t=>t.id===token.id).revision,token.revision);
});
test('catalog and image HTTP routes enforce scene access and serve actual PNGs with ETag support',async()=>{
 const response=await fetch(f.origin+'/api/tabletop/scenes/'+scene.id+'/art?q=зомби');assert.equal(response.status,200);const body=await response.json();assert.equal(body.items.length,2);assert.equal(body.categories[0].label_ru,'Существа');
 const image=await fetch(f.origin+body.items[0].url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),Buffer.from(TOKEN_PNG.split(',')[1],'base64'));
 assert.equal((await fetch(f.origin+body.items[0].url,{headers:{'If-None-Match':image.headers.get('etag')}})).status,304);
 await assert.rejects(f.store.tokens.artSearch(scene.id,'outsider',{}),e=>e.status===404);await assert.rejects(f.store.tokens.artImage(scene.id,'outsider',body.items[0].key),e=>e.status===404);
 assert.equal((await fetch(f.origin+'/api/tabletop/scenes/'+scene.id+'/art?page=-1')).status,400);
 assert.equal((await fetch(f.origin+'/media/tabletop/art/'+scene.id+'/test-pack/'+'f'.repeat(24)+'.png')).status,404);
});
test('migration from v0.31.1 only adds catalog support, preserving saved token data',async()=>{
 const old=await tabletopFixture({artLibrary:library});
 try {
  const s=await old.store.createSession(LOCAL_GM,'До набора'),l=await old.store.createLocation(s.id,LOCAL_GM,'Зал');
  await old.store.tokens.add(l.scene_id,LOCAL_GM,{kind:'npc',name:'До обновления',x:140,y:210,snap:true,scene_revision:1});
  await old.sql`ALTER TABLE vtt_tokens DROP COLUMN art_id`;
  await old.sql`ALTER TABLE vtt_tokens DROP COLUMN art_variant`;
  await old.sql`ALTER TABLE vtt_tokens DROP CONSTRAINT vtt_tokens_image_mode_check`;
  await old.sql`ALTER TABLE vtt_tokens ADD CONSTRAINT vtt_tokens_image_mode_check CHECK(image_mode IN ('auto','custom','icon'))`;
  const before=await old.sql`SELECT * FROM vtt_tokens`;
  await createTabletopStore(old.sql,{artLibrary:library}).ensureSchema();await createTabletopStore(old.sql,{artLibrary:library}).ensureSchema();
  const after=await old.sql`SELECT * FROM vtt_tokens`;for(const row of after){assert.equal(row.art_id,null);assert.equal(row.art_variant,Math.max(0,(row.ordinal||1)-1));delete row.art_id;delete row.art_variant;}assert.deepEqual(after,before);
 }finally{await old.close();}
});
