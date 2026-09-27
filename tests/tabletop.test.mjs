import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parse} from 'parse5';
import {DEFAULT_GRID,LOCAL_GM,validateGrid,decodeMap,createTabletopStore} from '../src/web/tabletop.mjs';
import {TABLETOP_RU,tabletopText} from '../src/web/assets/tabletop-i18n.mjs';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
let f;
before(async()=>{f=await tabletopFixture({server:true});});
after(async()=>{await f?.close();});
async function setup(principal='master') {
  const session=await f.store.createSession(principal,'Поместье'),location=await f.store.createLocation(session.id,principal,'Главный зал');
  return {session,location,scene:await f.store.scene(location.scene_id,principal),principal};
}
const payload=(scene,changes={})=>({name:scene.location_name,grid:scene.grid,revision:scene.revision,...changes});

test('schema can be initialized repeatedly without changing existing maps',async()=>{
  const a=await setup();
  await f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{data_url:png}),'upload');
  await createTabletopStore(f.sql).ensureSchema();
  const saved=await f.store.scene(a.scene.id,a.principal);
  assert.equal(saved.has_map,true);assert.equal(saved.revision,2);
});
test('session, membership and initial floor form one usable hierarchy',async()=>{
  const a=await setup();
  assert.equal(a.scene.session_id,a.session.id);assert.equal(a.scene.location_id,a.location.id);
  assert.equal(a.scene.sort_order,0);assert.deepEqual(a.scene.grid,DEFAULT_GRID);
  const list=await f.store.locations(a.session.id,a.principal);
  assert.equal(list.length,1);assert.equal(list[0].scene_id,a.scene.id);
  const members=await f.sql`SELECT * FROM vtt_session_members WHERE session_id=${a.session.id}`;
  assert.equal(members[0].role,'gm');assert.equal(members[0].principal_id,a.principal);
});
test('grid and location name survive loading through a new store',async()=>{
  const a=await setup();
  const grid={...DEFAULT_GRID,cellSize:83.5,offsetX:-12.25,offsetY:37,visible:false,opacity:0.72,color:'#22AA66',distance:1.5,unit:'m'};
  await f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{grid,name:'Подвал'}));
  const loaded=await createTabletopStore(f.sql).scene(a.scene.id,a.principal);
  assert.equal(loaded.location_name,'Подвал');assert.deepEqual(loaded.grid,{...grid,color:'#22aa66'});assert.equal(loaded.revision,2);
});
test('stale writes and deletes cannot overwrite a newer map or title',async()=>{
  const a=await setup();
  await f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{name:'Новый зал'}));
  await assert.rejects(f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{name:'Старая вкладка',data_url:png}),'upload'),e=>e.status===409);
  await assert.rejects(f.store.deleteLocation(a.location.id,a.principal,1),e=>e.status===409);
  const saved=await f.store.scene(a.scene.id,a.principal);assert.equal(saved.location_name,'Новый зал');assert.equal(saved.has_map,false);assert.equal(saved.revision,2);
});
test('invalid grid and names reject the entire change',async()=>{
  const a=await setup();
  for(const grid of [{...DEFAULT_GRID,cellSize:0},{...DEFAULT_GRID,offsetY:Infinity},{...DEFAULT_GRID,visible:'true'},{...DEFAULT_GRID,color:'red'},{...DEFAULT_GRID,unit:'unknown'},{...DEFAULT_GRID,opacity:2}]) {
    await assert.rejects(f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{grid,name:'Should not save'})));
  }
  await assert.rejects(f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{name:' '.repeat(10)})));
  assert.equal((await f.store.scene(a.scene.id,a.principal)).revision,1);
  assert.deepEqual(validateGrid(DEFAULT_GRID),DEFAULT_GRID);
});
test('map upload uses raster dimensions, supports removal, and preserves grid',async()=>{
  const a=await setup();
  const saved=await f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{data_url:png,file_name:'hall.png',map_width:900,grid:{...DEFAULT_GRID,cellSize:91}}),'upload');
  assert.equal(saved.map_width,1);assert.equal(saved.map_height,1);assert.equal(saved.map_name,'hall.png');
  const image=await f.store.image(a.scene.id,a.principal);assert.equal(image.mime,'image/png');assert.deepEqual(image.bytes,decodeMap(png).bytes);
  const removed=await f.store.updateScene(a.scene.id,a.principal,payload(saved),'remove');
  assert.equal(removed.has_map,false);assert.equal(removed.grid.cellSize,91);assert.equal(removed.revision,3);
  await assert.rejects(f.store.image(a.scene.id,a.principal),e=>e.status===404);
});
test('invalid raster and active document uploads preserve the previous image',async()=>{
  const a=await setup();const saved=await f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{data_url:png}),'upload');
  for(const data_url of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PGh0bWw+','not an image']) {
    await assert.rejects(f.store.updateScene(a.scene.id,a.principal,payload(saved,{data_url}),'upload'));
  }
  assert.equal((await f.store.scene(a.scene.id,a.principal)).revision,2);
  assert.deepEqual((await f.store.image(a.scene.id,a.principal)).bytes,decodeMap(png).bytes);
});
test('membership gates reads, writes and image retrieval; players cannot edit',async()=>{
  const a=await setup('owner');
  await f.sql`INSERT INTO vtt_session_members VALUES(${a.session.id},'player','player')`;
  for(const principal of ['outsider','player']) {
    const status=principal==='outsider'?404:403;
    await assert.rejects(f.store.scene(a.scene.id,principal),e=>e.status===status);
    await assert.rejects(f.store.updateScene(a.scene.id,principal,payload(a.scene)),e=>e.status===status);
    await assert.rejects(f.store.image(a.scene.id,principal),e=>e.status===status);
    await assert.rejects(f.store.createLocation(a.session.id,principal,'Hidden'),e=>e.status===status);
    await assert.rejects(f.store.renameSession(a.session.id,principal,'Hidden'),e=>e.status===status);
    await assert.rejects(f.store.deleteSession(a.session.id,principal),e=>e.status===status);
    assert.equal((await f.store.sessions(principal)).length,0);
  }
});
test('same names do not mix sessions; deleting a session leaves other data intact',async()=>{
  const a=await setup('isolated'),b=await setup('isolated');
  await f.store.deleteSession(a.session.id,a.principal);
  await assert.rejects(f.store.scene(a.scene.id,a.principal),e=>e.status===404);
  assert.equal((await f.store.scene(b.scene.id,b.principal)).location_name,'Главный зал');
  await f.store.deleteLocation(b.location.id,b.principal,1);assert.equal((await f.store.locations(b.session.id,b.principal)).length,0);
});
test('failed map persistence rolls back name, grid, and revision together',async()=>{
  const a=await setup();
  await f.sql.unsafe(`CREATE FUNCTION vtt_test_failure() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER vtt_test_failure BEFORE UPDATE OF map_bytes ON vtt_scenes FOR EACH ROW EXECUTE FUNCTION vtt_test_failure();`);
  try {
    await assert.rejects(f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{name:'Wrong name',data_url:png,grid:{...DEFAULT_GRID,cellSize:90}}),'upload'));
    const current=await f.store.scene(a.scene.id,a.principal);assert.equal(current.revision,1);assert.equal(current.location_name,'Главный зал');assert.deepEqual(current.grid,DEFAULT_GRID);
  } finally {await f.sql.unsafe('DROP TRIGGER vtt_test_failure ON vtt_scenes; DROP FUNCTION vtt_test_failure();');}
});
test('actual HTTP routes reject cross-origin writes and ignore client-supplied roles',async()=>{
  const endpoint=f.origin+'/api/tabletop/sessions',body=JSON.stringify({name:'HTTP session',owner_id:'attacker',principal:'attacker',role:'player'});
  let response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(response.status,403);
  response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Tabletop-Request':'1','Origin':'https://other.example'},body});assert.equal(response.status,403);
  response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Tabletop-Request':'1','Origin':f.origin},body});assert.equal(response.status,201);
  const {url}=await response.json(),id=url.split('/').pop();
  assert.equal((await f.store.session(id,LOCAL_GM)).owner_id,LOCAL_GM);
  await assert.rejects(f.store.session(id,'attacker'),e=>e.status===404);
  const page=await fetch(f.origin+url);assert.equal(page.status,200);assert.match(await page.text(),/Локальный режим мастера/);
  assert.equal((await fetch(f.origin+'/tabletop/'+randomUUID())).status,404);
});
test('HTTP update returns JSON errors and rejects a location from another session',async()=>{
  const a=await setup(LOCAL_GM),b=await setup(LOCAL_GM);
  const response=await fetch(`${f.origin}/api/tabletop/scenes/${a.scene.id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Tabletop-Request':'1'},body:JSON.stringify(payload(a.scene,{revision:100}))});
  assert.equal(response.status,409);assert.match(response.headers.get('content-type'),/json/);assert.match((await response.json()).error,/другой вкладке/);
  assert.equal((await fetch(`${f.origin}/tabletop/${a.session.id}?location=${b.location.id}`)).status,404);
});
test('names are escaped in HTML and embedded data; UI has translations',async()=>{
  const a=await setup(LOCAL_GM);
  await f.store.updateScene(a.scene.id,a.principal,payload(a.scene,{name:'</script><img src=x onerror=alert(1)>'}));
  const response=await fetch(`${f.origin}/tabletop/${a.session.id}`),html=await response.text();
  const unsafe=[];
  const visit=node=>{if((node.attrs||[]).some(a=>a.name==='onerror'))unsafe.push(node);for(const child of node.childNodes||[])visit(child);};
  visit(parse(html));assert.equal(unsafe.length,0);
  assert.match(html,/\\u003c\/script>/);
  assert.match(html,/Сохранить локацию/);
  const english=await (await fetch(`${f.origin}/tabletop/${a.session.id}`,{headers:{Cookie:'dnd-lang=en'}})).text();
  assert.match(english,/Save location/);
  assert.equal(tabletopText('Game Table'),'Игровой стол');
  for(const [key,value] of Object.entries(TABLETOP_RU)) {assert.ok(value.length>0,key);assert.equal(tabletopText(key,'en'),key);}
});
