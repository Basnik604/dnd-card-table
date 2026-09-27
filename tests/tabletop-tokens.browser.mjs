import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {seedTokenSources,tokenSourceIds} from './helpers/token-sources.mjs';
import {LOCAL_GM,DEFAULT_GRID} from '../src/web/tabletop.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'["--no-sandbox"]')});
const f=await tabletopFixture({server:true}),errors=[],qa=process.env.VTT_QA_DIR;
if(qa)mkdirSync(qa,{recursive:true});
try {
  await seedTokenSources(f);
  const session=await f.store.createSession(LOCAL_GM,'Ночная стража');const location=await f.store.createLocation(session.id,LOCAL_GM,'Старый форт');
  const context=await browser.newContext({viewport:{width:1512,height:1120},reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('dnd-lang','ru');if(!localStorage.getItem('dnd-theme'))localStorage.setItem('dnd-theme','tavern');});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const imageData=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=1400;c.height=900;const x=c.getContext('2d');x.fillStyle='#27392f';x.fillRect(0,0,1400,900);x.fillStyle='#726951';x.fillRect(100,90,1200,720);x.strokeStyle='#b4a786';x.lineWidth=30;x.strokeRect(100,90,1200,720);
    x.fillStyle='#2e392d';for(const a of [210,1190])for(const b of [220,680]){x.beginPath();x.arc(a,b,35,0,Math.PI*2);x.fill();}return c.toDataURL();
  });
  await f.store.updateScene(location.scene_id,LOCAL_GM,{name:'Старый форт',revision:1,grid:{...DEFAULT_GRID,offsetX:13,offsetY:-9},data_url:imageData,file_name:'fort.png'},'upload');
  const url=f.origin+'/tabletop/'+session.id;await page.goto(url);
  const idle=async(p=page)=>p.waitForFunction(()=>!document.querySelector('[data-vtt-root]').hasAttribute('aria-busy'));
  const rows=()=>f.store.tokens.list(location.scene_id,LOCAL_GM);
  const row=async id=>(await rows()).find(t=>t.id===id);
  const editor=()=>page.locator('[data-token-editor]');
  const pick=async id=>{await page.locator('[data-inspector-tab=tokens]').click();await page.locator(`[data-select-token="${id}"]`).click();};
  const save=async()=>{await page.locator('[data-token-save]').click();await idle();};
  await page.locator('[data-inspector-tab=tokens]').click();
  await page.waitForFunction(()=>document.querySelector('[data-token-sources]').options.length>0);
  await page.locator('[data-token-add] [name=source_id]').selectOption(tokenSourceIds.character);
  await page.locator('[data-token-add] button').click();await idle();
  let all=await rows(),pc=all[0];assert.equal(pc.kind,'character');assert.equal(pc.name,'Мира');
  await page.locator('[data-token-add] button').click();await idle();assert.equal((await rows()).length,1);
  assert.equal(await page.locator(`[data-token-id="${pc.id}"] img`).count(),1);
  assert.match(await page.locator('[data-token-source-link]').getAttribute('href'),new RegExp(tokenSourceIds.character));
  console.log('PASS linked character, inherited portrait, source link and duplicate prevention');

  await page.locator('[data-token-add] [name=kind]').selectOption('creature');
  await page.waitForFunction(()=>[...document.querySelector('[data-token-sources]').options].some(o=>o.value==='22222222-2222-4222-8222-222222222222'));
  await page.locator('[data-token-sources]').selectOption(tokenSourceIds.zombie);
  await page.locator('[data-token-add] button').click();await idle();await page.locator('[data-token-add] button').click();await idle();
  let zombies=(await rows()).filter(t=>t.entity_id===tokenSourceIds.zombie);assert.deepEqual(zombies.map(t=>t.ordinal),[1,2]);
  assert.equal(await page.locator(`[data-token-id="${zombies[0].id}"] svg`).getAttribute('data-icon-color'),'#91d573');
  assert.equal(await page.locator(`[data-token-id="${zombies[1].id}"] .vtt-token-number`).textContent(),'2');
  await page.locator('[data-token-sources]').selectOption(tokenSourceIds.wolf);await page.locator('[data-token-add] button').click();await idle();
  const wolf=(await rows()).find(t=>t.entity_id===tokenSourceIds.wolf);assert.equal(wolf.size_cells,2);
  assert.equal(await page.locator(`[data-token-id="${wolf.id}"]`).evaluate(el=>el.style.width),'140px');
  await page.locator('[data-token-add] [name=kind]').selectOption('npc');await page.locator('[data-token-add] [name=name]').fill('Капитан');await page.locator('[data-token-add] button').click();await idle();
  const npc=(await rows()).find(t=>t.kind==='npc');assert.ok(npc);assert.equal((await rows()).length,5);
  console.log('PASS monsters from catalog, undead/beast SVG symbols, sizes, numbering, NPC and free spawn cells');

  await editor().locator('[name=name]').fill('Капитан стражи');await editor().locator('[name=border_color]').fill('#a988e5');await editor().locator('[name=icon_type]').selectOption('humanoid');await editor().locator('[name=relation]').selectOption('friendly');await save();
  assert.equal((await row(npc.id)).border_color,'#a988e5');assert.equal((await row(npc.id)).relation,'friendly');
  await pick(wolf.id);await editor().locator('[name=size_cells]').selectOption('3');await save();assert.equal(await page.locator(`[data-token-id="${wolf.id}"]`).evaluate(el=>el.style.width),'210px');
  await editor().locator('[name=size_cells]').selectOption('2');await save();
  console.log('PASS token name, relationship badge, custom border, icon and footprint');

  await pick(pc.id);await page.locator('[data-vtt-zoom=in]').click();
  let before=await row(pc.id);let box=await page.locator(`[data-token-id="${pc.id}"]`).boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+115,box.y+box.height/2+70,{steps:6});await page.mouse.up();await idle();
  pc=await row(pc.id);assert.notEqual(pc.x,before.x);assert.equal((pc.x-13)%70,0);assert.equal((pc.y+9)%70,0);
  await page.locator('[data-token-snap]').uncheck();before=pc;box=await page.locator(`[data-token-id="${pc.id}"]`).boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+19,box.y+box.height/2+11,{steps:4});await page.mouse.up();await idle();
  pc=await row(pc.id);assert.notEqual(pc.x,before.x);assert.notEqual((pc.x-13)%70,0);
  const position={x:pc.x,y:pc.y};await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-token-id]').length===5);
  assert.equal(await page.locator(`[data-token-id="${pc.id}"]`).evaluate(el=>parseFloat(el.style.left)),position.x);
  await pick(pc.id);await page.locator(`[data-token-id="${pc.id}"]`).press('ArrowRight');await idle();assert.notEqual((await row(pc.id)).x,position.x);
  console.log('PASS pointer drag at zoom, shifted-grid snapping, free movement, keyboard movement and reload');

  const fixed=await row(pc.id);await page.locator('[data-token-tool=pan]').click();box=await page.locator(`[data-token-id="${pc.id}"]`).boundingBox();
  const transform=await page.locator('[data-vtt-map]').evaluate(el=>el.style.transform);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+25,{steps:4});await page.mouse.up();
  assert.notEqual(await page.locator('[data-vtt-map]').evaluate(el=>el.style.transform),transform);assert.equal((await row(pc.id)).revision,fixed.revision);
  await page.locator('[data-token-tool=tokens]').click();await page.locator('[data-vtt-fit]').click();
  console.log('PASS pan mode drags the map without moving a token');

  await pick(pc.id);
  const portrait=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=600;const x=c.getContext('2d');x.fillStyle='#333d65';x.fillRect(0,0,320,600);x.fillStyle='#d4b676';x.beginPath();x.arc(160,150,90,0,Math.PI*2);x.fill();x.fillStyle='#7095af';x.fillRect(55,270,210,330);return c.toDataURL();});
  const portraitFile={name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(portrait.split(',')[1],'base64')};
  await page.locator('[data-token-file]').setInputFiles(portraitFile);await page.locator('[data-token-crop]').waitFor({state:'visible'});
  await page.locator('[data-token-crop-y]').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-token-crop-apply]').click();await idle();assert.equal(await page.locator('[data-token-crop]').isVisible(),false);
  pc=await row(pc.id);assert.equal(pc.image_mode,'custom');assert.equal(pc.has_custom_image,true);
  assert.equal((await f.store.tokens.image(pc.id,LOCAL_GM)).bytes.readUInt32BE(16),512);
  await editor().locator('[name=image_mode]').selectOption('icon');await save();assert.equal(await page.locator(`[data-token-id="${pc.id}"] img`).count(),0);
  await editor().locator('[name=image_mode]').selectOption('custom');await save();
  console.log('PASS custom portrait, adjustable crop, 512px saved image and icon/portrait switching');

  await page.locator('[data-token-file]').setInputFiles(portraitFile);await page.locator('[data-token-crop]').waitFor({state:'visible'});
  await page.route(`**/api/tabletop/tokens/${pc.id}/image`,route=>route.abort());const imageRevision=(await row(pc.id)).image_revision;
  await page.locator('[data-token-crop-apply]').click();await idle();assert.match(await page.locator('[data-token-crop-status]').textContent(),/Не удалось связаться/);assert.equal((await row(pc.id)).image_revision,imageRevision);
  await page.unroute(`**/api/tabletop/tokens/${pc.id}/image`);await page.locator('[data-token-crop-cancel]').click();
  await page.locator('[data-token-file]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
  await page.waitForFunction(()=>document.querySelector('[data-vtt-status]').textContent.includes('Не удалось прочитать'));
  assert.equal((await row(pc.id)).image_revision,imageRevision);
  console.log('PASS failed portrait upload stays in crop dialog, invalid image preserves old portrait');

  const old=await context.newPage();old.on('dialog',dialog=>dialog.accept());old.on('pageerror',error=>errors.push(error.message));await old.goto(url);await old.locator('[data-inspector-tab=tokens]').click();await old.locator(`[data-select-token="${pc.id}"]`).click();
  await editor().locator('[name=name]').fill('Мира · разведчица');await save();
  await old.locator('[data-token-editor] [name=name]').fill('Устаревшее имя');await old.locator('[data-token-save]').click();await idle(old);assert.match(await old.locator('[data-vtt-status]').textContent(),/другой вкладке/);assert.equal((await row(pc.id)).name,'Мира · разведчица');await old.close();
  const endpoint=`**/api/tabletop/tokens/${pc.id}`;await page.route(endpoint,route=>route.abort());
  before=await row(pc.id);box=await page.locator(`[data-token-id="${pc.id}"]`).boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2,{steps:3});await page.mouse.up();await idle();
  assert.equal(await page.locator(`[data-token-id="${pc.id}"]`).evaluate(el=>parseFloat(el.style.left)),before.x);assert.equal((await row(pc.id)).revision,before.revision);await page.unroute(endpoint);
  console.log('PASS stale-tab edits are rejected and failed movement restores the token position');

  await page.locator('[data-inspector-tab=map]').click();await page.locator('[data-vtt-settings] [name=cellSize]').fill('80');
  await page.locator('[data-inspector-tab=tokens]').click();await editor().locator('[name=name]').fill('Мира · новая сетка');await page.locator('[data-token-save]').click();await idle();
  assert.match(await page.locator('[data-vtt-status]').textContent(),/Токен сохранён/);
  assert.equal((await f.store.scene(location.scene_id,LOCAL_GM)).grid.cellSize,80);
  assert.equal((await row(pc.id)).name,'Мира · новая сетка');
  await page.locator('[data-inspector-tab=map]').click();await page.locator('[data-vtt-settings] [name=cellSize]').fill('70');await page.locator('[data-inspector-tab=tokens]').click();
  await editor().locator('[name=name]').fill((await row(pc.id)).name);
  await page.locator(`[data-token-id="${pc.id}"]`).press('ArrowLeft');await idle();
  assert.match(await page.locator('[data-vtt-status]').textContent(),/Токен перемещён/);
  assert.equal((await f.store.scene(location.scene_id,LOCAL_GM)).grid.cellSize,70);
  console.log('PASS edited grid saves before token appearance and keyboard movement');

  await page.evaluate(()=>window.scrollTo(0,0));if(qa)await page.screenshot({path:qa+'/tokens-tavern.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('[data-vtt-root]').evaluate(el=>el.scrollWidth<=el.clientWidth+2));if(qa)await page.screenshot({path:qa+'/tokens-mobile.png',fullPage:true});
  await page.setViewportSize({width:1512,height:1120});await pick(pc.id);await page.locator('[data-token-remove-image]').click();await idle();assert.equal((await row(pc.id)).image_mode,'auto');assert.equal((await row(pc.id)).has_image,true);
  await pick(zombies[0].id);await page.locator('[data-token-delete]').click();await idle();assert.equal((await rows()).length,4);assert.ok((await f.sql`SELECT id FROM content_entities WHERE id=${tokenSourceIds.zombie}`).length);
  assert.deepEqual(errors,[]);console.log('PASS responsive token controls, portrait fallback and token-only deletion; no browser exceptions');
} finally {await browser.close();await f.close();}
