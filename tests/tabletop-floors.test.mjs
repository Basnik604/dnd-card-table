import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parse} from 'parse5';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {seedTokenSources,tokenSourceIds,TOKEN_PNG} from './helpers/token-sources.mjs';
import {LOCAL_GM,DEFAULT_GRID,createTabletopStore} from '../src/web/tabletop.mjs';
let f;
before(async()=>{f=await tabletopFixture({server:true});await seedTokenSources(f);});
after(async()=>f?.close());
async function setup(principal=LOCAL_GM) {
  const session=await f.store.createSession(principal,'Поместье'),location=await f.store.createLocation(session.id,principal,'Дом');
  const second=await f.store.floors.create(location.id,principal,{name:'Подвал',location_revision:1});
  return {principal,session,location,first:await f.store.scene(location.scene_id,principal),second};
}
const scene=(a,id)=>f.store.scene(id,a.principal);
const add=async(a,id,kind='npc',extra={})=>(await f.store.tokens.add(id,a.principal,{kind,name:'Страж',x:140,y:210,snap:true,scene_revision:(await scene(a,id)).revision,...extra})).token;
const settings=(s,extra={})=>({revision:s.revision,location_revision:s.location_revision,name:s.location_name,floor_name:s.floor_name,grid:s.grid,...extra});
async function transfer(a,from,to,tokens,extra={}) {
  const source=await scene(a,from),target=await scene(a,to);
  return f.store.tokens.transfer(from,a.principal,{tokens:tokens.map(t=>({id:t.id,revision:t.revision})),target_scene_id:to,scene_revision:source.revision,target_revision:target.revision,snap:true,...extra});
}
const token=async(a,id,tokenId)=>(await f.store.tokens.list(id,a.principal)).find(t=>t.id===tokenId);

test('upgrade from 0.30.2 preserves the first map, tokens, colors, images and revisions',async()=>{
  const old=await tabletopFixture();
  try {
    const s=await old.store.createSession(LOCAL_GM,'Старый стол'),l=await old.store.createLocation(s.id,LOCAL_GM,'Зал');
    const initial=await old.store.scene(l.scene_id,LOCAL_GM);
    await old.store.updateScene(initial.id,LOCAL_GM,settings(initial,{data_url:TOKEN_PNG,grid:{...DEFAULT_GRID,cellSize:150}}),'upload');
    await old.store.tokens.add(initial.id,LOCAL_GM,{kind:'npc',name:'Был до обновления',x:0,y:0,snap:true,scene_revision:2});
    await old.sql`DROP TABLE vtt_token_positions`;await old.sql`ALTER TABLE vtt_locations DROP COLUMN revision`;
    const beforeScenes=await old.sql`SELECT * FROM vtt_scenes`,beforeTokens=await old.sql`SELECT * FROM vtt_tokens`;
    const updated=createTabletopStore(old.sql);await updated.ensureSchema();await createTabletopStore(old.sql).ensureSchema();
    assert.deepEqual(await old.sql`SELECT * FROM vtt_scenes`,beforeScenes);assert.deepEqual(await old.sql`SELECT * FROM vtt_tokens`,beforeTokens);
    assert.equal((await updated.floors.list(s.id,LOCAL_GM))[0].location_revision,1);
    await updated.floors.create(l.id,LOCAL_GM,{name:'Новый этаж',location_revision:1});
    assert.equal((await updated.locations(s.id,LOCAL_GM))[0].floor_count,2);
  } finally {await old.close();}
});
test('floors can be created, renamed, reordered and removed without losing a location when order zero disappears',async()=>{
  const a=await setup();assert.equal(a.second.has_map,false);assert.deepEqual(a.second.grid,DEFAULT_GRID);
  const renamed=await f.store.updateScene(a.second.id,a.principal,settings(a.second,{floor_name:'Погреб',grid:{...DEFAULT_GRID,cellSize:90}}));
  const moved=await f.store.floors.reorder(renamed.id,a.principal,{direction:'up',location_revision:renamed.location_revision});
  assert.deepEqual((await f.store.floors.list(a.session.id,a.principal)).map(s=>s.floor_name),['Погреб','Первый этаж']);
  assert.equal((await f.store.locations(a.session.id,a.principal))[0].scene_id,moved.id);
  const result=await f.store.floors.remove(moved.id,a.principal,{revision:moved.revision,location_revision:moved.location_revision});
  assert.equal(result.scene_id,a.first.id);
  const locations=await f.store.locations(a.session.id,a.principal);assert.equal(locations.length,1);assert.equal(locations[0].scene_id,a.first.id);
  const last=await scene(a,a.first.id);await assert.rejects(f.store.floors.remove(last.id,a.principal,settings(last)),/at least one floor/);
  await assert.rejects(f.store.floors.create(a.location.id,a.principal,{name:'',location_revision:last.location_revision}));
});
test('floor maps and grids are independent; stale location names, order and deletes cannot overwrite another floor change',async()=>{
  const a=await setup();
  await f.store.updateScene(a.second.id,a.principal,settings(a.second,{name:'Новое поместье',data_url:TOKEN_PNG,grid:{...DEFAULT_GRID,cellSize:80}}),'upload');
  await assert.rejects(f.store.updateScene(a.first.id,a.principal,settings(a.first,{name:'Устаревшее имя'})),e=>e.status===409);
  await assert.rejects(f.store.floors.reorder(a.first.id,a.principal,{direction:'down',location_revision:a.first.location_revision}),e=>e.status===409);
  await assert.rejects(f.store.deleteLocation(a.location.id,a.principal,1,a.first.location_revision),e=>e.status===409);
  const first=await scene(a,a.first.id);assert.equal(first.location_name,'Новое поместье');assert.equal(first.has_map,false);assert.equal(first.location_has_map,true);assert.equal(first.grid.cellSize,70);
  assert.equal((await f.store.locations(a.session.id,a.principal))[0].has_map,true);
});
test('batch transfer retains identity, custom portraits and colors, and restores independent positions on return',async()=>{
  const a=await setup();let pc=await add(a,a.first.id,'character',{source_id:tokenSourceIds.character}),npc=await add(a,a.first.id);
  pc=(await f.store.tokens.change(pc.id,a.principal,{...pc,scene_revision:a.first.revision,data_url:TOKEN_PNG},'image')).token;
  pc=(await f.store.tokens.change(pc.id,a.principal,{...pc,scene_revision:a.first.revision,icon_color:'#1122aa',border_color:'#ff2255',image_mode:'custom'})).token;
  const home={x:pc.x,y:pc.y};await transfer(a,a.first.id,a.second.id,[pc,npc]);
  assert.equal((await f.store.tokens.list(a.first.id,a.principal)).length,0);
  let moved=await token(a,a.second.id,pc.id);assert.equal(moved.icon_color,'#1122aa');assert.equal(moved.border_color,'#ff2255');assert.equal(moved.has_custom_image,true);assert.equal(moved.image_revision,pc.image_revision);
  assert.deepEqual((await f.store.tokens.image(pc.id,a.principal)).bytes,Buffer.from(TOKEN_PNG.split(',')[1],'base64'));
  moved=(await f.store.tokens.change(pc.id,a.principal,{revision:moved.revision,scene_revision:a.second.revision,x:350,y:280,snap:true},'move')).token;
  const away={x:moved.x,y:moved.y};await transfer(a,a.second.id,a.first.id,[moved]);
  const returned=await token(a,a.first.id,pc.id);assert.deepEqual({x:returned.x,y:returned.y},home);
  await transfer(a,a.first.id,a.second.id,[returned]);const revisited=await token(a,a.second.id,pc.id);assert.deepEqual({x:revisited.x,y:revisited.y},away);
  assert.equal((await f.store.tokens.list(a.second.id,a.principal)).length,2);
});
test('duplicate characters, stale tokens and changed target grid reject an entire transfer before any token leaves',async()=>{
  const a=await setup(),npc=await add(a,a.first.id),pc=await add(a,a.first.id,'character',{source_id:tokenSourceIds.character});
  await add(a,a.second.id,'character',{source_id:tokenSourceIds.character});
  await assert.rejects(transfer(a,a.first.id,a.second.id,[npc,pc]),e=>e.status===409);
  assert.equal((await f.store.tokens.list(a.first.id,a.principal)).length,2);
  await assert.rejects(transfer(a,a.first.id,a.second.id,[npc],{tokens:[{id:npc.id,revision:999}]}),e=>e.status===409);
  await assert.rejects(transfer(a,a.first.id,a.second.id,[npc],{target_revision:999}),e=>e.status===409);
  await assert.rejects(transfer(a,a.first.id,a.second.id,[npc,npc]));
  assert.equal((await f.sql`SELECT * FROM vtt_token_positions WHERE token_id=${npc.id}`).length,0);
});
test('destination capacity and lack of free cells roll back all transfers, including earlier members of a batch',async()=>{
  const a=await setup(),one=await add(a,a.first.id),two=await add(a,a.first.id);
  await f.store.updateScene(a.second.id,a.principal,settings(a.second,{data_url:TOKEN_PNG}),'upload');
  await assert.rejects(transfer(a,a.first.id,a.second.id,[one,two]),/no free space/);
  assert.equal((await f.store.tokens.list(a.first.id,a.principal)).length,2);assert.equal((await f.store.tokens.list(a.second.id,a.principal)).length,0);
  assert.equal((await f.sql`SELECT * FROM vtt_token_positions WHERE token_id=${one.id}`).length,0);
  const ids=Array.from({length:200},()=>randomUUID());
  await f.sql`INSERT INTO vtt_tokens(id,scene_id,session_id,kind,name) SELECT value::uuid,${a.second.id}::uuid,${a.session.id}::uuid,'npc','Capacity' FROM jsonb_array_elements_text(${f.sql.json(ids)}::jsonb)`;
  await assert.rejects(transfer(a,a.first.id,a.second.id,[one]),/exceed 200/);
});
test('creature numbering is allocated per destination and reserved while away; occupied remembered cells are avoided',async()=>{
  const a=await setup(),home=await add(a,a.first.id,'creature',{source_id:tokenSourceIds.zombie});
  await add(a,a.second.id,'creature',{source_id:tokenSourceIds.zombie});
  await transfer(a,a.first.id,a.second.id,[home]);let away=await token(a,a.second.id,home.id);assert.equal(away.ordinal,2);
  const blocker=await add(a,a.first.id);assert.equal(blocker.x,home.x);assert.equal(blocker.y,home.y);
  await transfer(a,a.second.id,a.first.id,[away]);const returned=await token(a,a.first.id,home.id);assert.equal(returned.ordinal,1);
  assert.ok(returned.x!==blocker.x||returned.y!==blocker.y);
  const extra=await add(a,a.second.id,'creature',{source_id:tokenSourceIds.zombie});assert.equal(extra.ordinal,3);
  await transfer(a,a.first.id,a.second.id,[returned]);assert.equal((await token(a,a.second.id,home.id)).ordinal,2);
});
test('floor removal refuses present tokens and cleans position history while keeping tokens on other floors',async()=>{
  const a=await setup(),npc=await add(a,a.first.id);
  await assert.rejects(f.store.floors.remove(a.first.id,a.principal,settings(a.first)),/Move or delete/);
  await transfer(a,a.first.id,a.second.id,[npc]);
  const from=await scene(a,a.first.id);await f.store.floors.remove(from.id,a.principal,settings(from));
  assert.equal((await f.store.tokens.list(a.second.id,a.principal)).length,1);
  assert.equal((await f.sql`SELECT * FROM vtt_token_positions WHERE token_id=${npc.id}`).length,0);
});
test('unauthorized floor actions and transfers, including transfers to a different session, are rejected',async()=>{
  const a=await setup('owner'),b=await setup('owner'),npc=await add(a,a.first.id);
  await f.sql`INSERT INTO vtt_session_members VALUES(${a.session.id},'player','player')`;
  for(const principal of ['outsider','player']) {
    await assert.rejects(f.store.floors.list(a.session.id,principal));
    await assert.rejects(f.store.floors.create(a.location.id,principal,{name:'X',location_revision:2}));
    await assert.rejects(f.store.floors.reorder(a.first.id,principal,{direction:'down',location_revision:2}));
    await assert.rejects(f.store.floors.remove(a.second.id,principal,settings(a.second)));
    await assert.rejects(f.store.tokens.transfer(a.first.id,principal,{target_scene_id:a.second.id,tokens:[{id:npc.id,revision:1}],scene_revision:1,target_revision:1,snap:true}));
  }
  await assert.rejects(transfer(a,a.first.id,b.first.id,[npc]),/same session/);
  assert.equal((await f.store.tokens.list(a.first.id,a.principal)).length,1);
});
test('real HTTP floor routes enforce scene scope, translate errors and reject injected floor names in markup',async()=>{
  const a=await setup(),headers={'Content-Type':'application/json','X-Tabletop-Request':'1'};
  let response=await fetch(`${f.origin}/api/tabletop/sessions/${a.session.id}/scenes`);assert.equal((await response.json()).scenes.length,2);
  response=await fetch(`${f.origin}/tabletop/${a.session.id}?scene=${a.second.id}`);assert.equal(response.status,200);assert.match(await response.text(),/Подвал/);
  const b=await setup();assert.equal((await fetch(`${f.origin}/tabletop/${a.session.id}?scene=${b.first.id}`)).status,404);
  assert.equal((await fetch(`${f.origin}/tabletop/${a.session.id}?location=${b.location.id}&scene=${a.second.id}`)).status,404);
  response=await fetch(`${f.origin}/api/tabletop/locations/${a.location.id}/scenes`,{method:'POST',headers,body:JSON.stringify({name:'</script><img onerror=alert(1)>',location_revision:a.second.location_revision})});
  assert.equal(response.status,201);const url=(await response.json()).url;
  const html=await (await fetch(f.origin+url)).text(),unsafe=[];
  const visit=node=>{if((node.attrs||[]).some(a=>a.name==='onerror'))unsafe.push(node);for(const child of node.childNodes||[])visit(child);};
  visit(parse(html));assert.equal(unsafe.length,0);assert.match(html,/\\u003c\/script>/);
  const npc=await add(a,a.first.id);
  response=await fetch(`${f.origin}/api/tabletop/scenes/${a.first.id}/transfer`,{method:'POST',headers,body:JSON.stringify({tokens:[{id:npc.id,revision:npc.revision}],target_scene_id:a.second.id,scene_revision:1,target_revision:1,snap:true})});
  assert.equal(response.status,200);assert.equal((await response.json()).transferred,1);
});
