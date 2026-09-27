import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {seedTokenSources,tokenSourceIds,TOKEN_PNG} from './helpers/token-sources.mjs';
import {LOCAL_GM,DEFAULT_GRID,createTabletopStore} from '../src/web/tabletop.mjs';
import {tokenPosition,creatureIcon,creatureSize,tokenIcon,TOKEN_ICONS} from '../src/web/assets/tabletop-token-model.mjs';
let f;
before(async()=>{f=await tabletopFixture({server:true});await seedTokenSources(f);});
after(async()=>f?.close());
async function setup(principal=LOCAL_GM) {
  const session=await f.store.createSession(principal,'Сессия токенов');const location=await f.store.createLocation(session.id,principal,'Зал');
  return {principal,session,scene:await f.store.scene(location.scene_id,principal)};
}
const input=(scene,kind='npc',extra={})=>({kind,name:'Страж',x:180,y:160,snap:true,scene_revision:scene.revision,...extra});
const edit=(scene,token,extra={})=>({name:token.name,size_cells:token.size_cells,icon_type:token.icon_type,border_color:token.border_color,relation:token.relation,image_mode:token.image_mode,revision:token.revision,scene_revision:scene.revision,...extra});

test('linked PC inherits portrait, cannot be duplicated on the same map, and source fields are not client-controlled',async()=>{
  const a=await setup();const body=input(a.scene,'character',{source_id:tokenSourceIds.character,owner_principal_id:'attacker',name:'Fake',icon_type:'undead'});
  const first=await f.store.tokens.add(a.scene.id,a.principal,body),second=await f.store.tokens.add(a.scene.id,a.principal,body);
  assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.token.id,second.token.id);
  assert.equal(first.token.character_id,tokenSourceIds.character);assert.equal(first.token.name,'Мира');assert.equal(first.token.icon_type,'class_wizard');assert.equal(first.token.has_image,true);
  const rows=await f.sql`SELECT owner_principal_id FROM vtt_tokens WHERE id=${first.token.id}`;assert.equal(rows[0].owner_principal_id,LOCAL_GM);
  const image=await f.store.tokens.image(first.token.id,a.principal);assert.equal(image.mime,'image/png');
});
test('monster icons and sizes come from the source; deleted numbers are not reused',async()=>{
  const a=await setup();const zombie=input(a.scene,'creature',{source_id:tokenSourceIds.zombie});
  const first=(await f.store.tokens.add(a.scene.id,a.principal,zombie)).token;
  const second=(await f.store.tokens.add(a.scene.id,a.principal,zombie)).token;
  assert.equal(first.icon_type,'undead');assert.equal(first.ordinal,1);assert.equal(second.ordinal,2);
  assert.ok(first.x!==second.x||first.y!==second.y,'new tokens seek free cells');
  await f.store.tokens.change(first.id,a.principal,edit(a.scene,first),'delete');
  const third=(await f.store.tokens.add(a.scene.id,a.principal,zombie)).token;assert.equal(third.ordinal,3);
  const wolf=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene,'creature',{source_id:tokenSourceIds.wolf}))).token;
  assert.equal(wolf.icon_type,'beast');assert.equal(wolf.size_cells,2);assert.equal(wolf.relation,'hostile');
});
test('snap respects grid offset and token footprint; free movement preserves fractional positions',async()=>{
  const grid={...DEFAULT_GRID,cellSize:80,offsetX:13,offsetY:-9};
  const scene={grid,map_width:1000,map_height:700};
  const p=tokenPosition(scene,2,400,300,true);assert.deepEqual(p,{x:413,y:311});
  const edge=tokenPosition(scene,2,9999,-400,true);assert.ok(edge.x+160<=1000);assert.ok(edge.y>=0);assert.equal((edge.x-13)%80,0);
  assert.deepEqual(tokenPosition(scene,1,123.45,210.5,false),{x:123.45,y:210.5});
  const a=await setup();const token=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene))).token;
  const result=await f.store.tokens.change(token.id,a.principal,edit(a.scene,token,{x:333.25,y:211.5,snap:false}),'move');
  assert.equal(result.token.x,333.25);assert.equal(result.token.revision,2);
  const refreshed=await createTabletopStore(f.sql).tokens.list(a.scene.id,a.principal);assert.equal(refreshed[0].x,333.25);
});
test('stale movement and stale grid revision cannot overwrite a newer position',async()=>{
  const a=await setup();const token=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene))).token;
  const moved=await f.store.tokens.change(token.id,a.principal,edit(a.scene,token,{x:420,y:350,snap:true}),'move');
  await assert.rejects(f.store.tokens.change(token.id,a.principal,edit(a.scene,token,{x:0,y:0,snap:true}),'move'),e=>e.status===409);
  await f.store.updateScene(a.scene.id,a.principal,{name:'Зал',grid:{...DEFAULT_GRID,cellSize:90},revision:1});
  await assert.rejects(f.store.tokens.change(token.id,a.principal,edit(a.scene,moved.token,{x:0,y:0,snap:true}),'move'),e=>e.status===409);
  assert.equal((await f.store.tokens.list(a.scene.id,a.principal))[0].x,420);
});
test('NPC appearance changes persist; deleting its token never deletes a source character',async()=>{
  const a=await setup();const token=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene))).token;
  const result=await f.store.tokens.change(token.id,a.principal,edit(a.scene,token,{name:'Лесной страж',size_cells:3,icon_type:'plant',border_color:'#22AA33',relation:'friendly'}));
  assert.equal(result.token.name,'Лесной страж');assert.equal(result.token.border_color,'#22aa33');assert.equal(result.token.size_cells,3);
  const pc=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene,'character',{source_id:tokenSourceIds.character}))).token;
  await f.store.tokens.change(pc.id,a.principal,edit(a.scene,pc),'delete');
  assert.equal((await f.sql`SELECT name FROM characters WHERE id=${tokenSourceIds.character}`)[0].name,'Мира');
});
test('token portraits are independent of character portraits; movement does not invalidate image revision',async()=>{
  const a=await setup();const pc=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene,'character',{source_id:tokenSourceIds.character}))).token;
  const uploaded=(await f.store.tokens.change(pc.id,a.principal,edit(a.scene,pc,{data_url:TOKEN_PNG}),'image')).token;
  assert.equal(uploaded.image_mode,'custom');assert.equal(uploaded.image_revision,2);
  const moved=(await f.store.tokens.change(pc.id,a.principal,edit(a.scene,uploaded,{x:350,y:350,snap:true}),'move')).token;
  assert.equal(moved.image_revision,2);
  const removed=(await f.store.tokens.change(pc.id,a.principal,edit(a.scene,moved),'remove-image')).token;
  assert.equal(removed.has_custom_image,false);assert.equal(removed.has_image,true);assert.equal(removed.image_mode,'auto');
  const onlyIcon=(await f.store.tokens.change(pc.id,a.principal,edit(a.scene,removed,{image_mode:'icon'}))).token;
  assert.equal(onlyIcon.has_image,false);await assert.rejects(f.store.tokens.image(pc.id,a.principal),e=>e.status===404);
  assert.ok((await f.sql`SELECT portrait_bytes FROM characters WHERE id=${tokenSourceIds.character}`)[0].portrait_bytes);
});
test('invalid settings, image uploads and unauthorized operations preserve the token',async()=>{
  const a=await setup('owner');await f.sql`INSERT INTO vtt_session_members VALUES(${a.session.id},'player','player')`;
  const token=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene))).token;
  for(const patch of [{size_cells:0},{size_cells:100},{icon_type:'<script>'},{border_color:'red'},{image_mode:'custom'},{relation:'admin'},{name:''}])await assert.rejects(f.store.tokens.change(token.id,a.principal,edit(a.scene,token,patch)));
  await assert.rejects(f.store.tokens.change(token.id,a.principal,edit(a.scene,token,{data_url:'data:image/svg+xml;base64,PHN2Zz4='}),'image'));
  for(const principal of ['outsider','player']) {
    await assert.rejects(f.store.tokens.list(a.scene.id,principal));await assert.rejects(f.store.tokens.image(token.id,principal));
    await assert.rejects(f.store.tokens.change(token.id,principal,edit(a.scene,token),'delete'));
    await assert.rejects(f.store.tokens.add(a.scene.id,principal,input(a.scene)));
    await assert.rejects(f.store.tokens.search(a.scene.id,principal,'character',''));
  }
  assert.equal((await f.store.tokens.list(a.scene.id,a.principal))[0].revision,1);
});
test('map replacement keeps tokens reachable and invalidates old token edits if repositioned',async()=>{
  const a=await setup();const token=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene))).token;
  await f.store.updateScene(a.scene.id,a.principal,{revision:1,name:'Зал',grid:DEFAULT_GRID,data_url:TOKEN_PNG},'upload');
  const current=(await f.store.tokens.list(a.scene.id,a.principal))[0];assert.equal(current.x,0);assert.equal(current.y,0);assert.equal(current.revision,token.revision+1);
});
test('source deletion leaves a usable independent token; scene deletion removes tokens and counters',async()=>{
  const a=await setup();const extra='44444444-4444-4444-8444-444444444444';
  await f.sql`INSERT INTO characters(id,name) VALUES(${extra},'Временный персонаж')`;
  const token=(await f.store.tokens.add(a.scene.id,a.principal,input(a.scene,'character',{source_id:extra}))).token;
  await f.sql`DELETE FROM characters WHERE id=${extra}`;
  const current=(await f.store.tokens.list(a.scene.id,a.principal))[0];assert.equal(current.character_id,null);assert.equal(current.name,'Временный персонаж');
  await f.store.tokens.change(token.id,a.principal,edit(a.scene,current,{name:'Сохранённый жетон'}));
  await f.store.tokens.add(a.scene.id,a.principal,input(a.scene,'creature',{source_id:tokenSourceIds.zombie}));
  await f.store.deleteSession(a.session.id,a.principal);
  assert.equal((await f.sql`SELECT id FROM vtt_tokens WHERE scene_id=${a.scene.id}`).length,0);
  assert.equal((await f.sql`SELECT * FROM vtt_token_counters WHERE scene_id=${a.scene.id}`).length,0);
});
test('real HTTP source search, token API and media routes are scoped and return JSON errors',async()=>{
  const a=await setup();let response=await fetch(`${f.origin}/api/tabletop/scenes/${a.scene.id}/sources?kind=character&q=${encodeURIComponent('Мир')}`);
  assert.equal((await response.json()).sources[0].id,tokenSourceIds.character);
  response=await fetch(`${f.origin}/api/tabletop/scenes/${a.scene.id}/sources?kind=creature&q=Zombie`);assert.equal((await response.json()).sources[0].id,tokenSourceIds.zombie);
  const endpoint=`${f.origin}/api/tabletop/scenes/${a.scene.id}/tokens`,headers={'Content-Type':'application/json','X-Tabletop-Request':'1'};
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(input(a.scene,'character',{source_id:tokenSourceIds.character}))});assert.equal(response.status,201);
  const {token}=await response.json();response=await fetch(`${f.origin}/media/tabletop/tokens/${token.id}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  response=await fetch(`${f.origin}/api/tabletop/tokens/${token.id}`,{method:'PUT',headers,body:JSON.stringify(edit(a.scene,token,{revision:0}))});assert.equal(response.status,409);assert.match((await response.json()).error,/другой вкладке/);
});
test('symbol catalog is static SVG and creature size defaults are stable',()=>{
  for(const type of Object.keys(TOKEN_ICONS))assert.match(tokenIcon(type),/^<svg/);
  assert.equal(creatureIcon('Undead'),'undead');assert.equal(creatureIcon('Beast'),'beast');assert.equal(creatureSize('Gargantuan'),4);assert.equal(creatureSize('Tiny'),0.5);assert.equal(creatureSize('Medium'),1);
});
