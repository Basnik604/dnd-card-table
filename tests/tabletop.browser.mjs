// Real HTTP + production renderer/router/client + PGlite. Optional Chromium.
// PLAYWRIGHT_MODULE, CHROMIUM_EXECUTABLE and CHROMIUM_ARGS follow the other
// browser suites. VTT_QA_DIR optionally saves screenshots for visual review.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {LOCAL_GM} from '../src/web/tabletop.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'["--no-sandbox"]')});
const f=await tabletopFixture({server:true}),errors=[];
const qa=process.env.VTT_QA_DIR;
if(qa)mkdirSync(qa,{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:1512,height:1120},reducedMotion:'reduce'});
  await context.addInitScript(()=>{if(!localStorage.getItem('dnd-theme'))localStorage.setItem('dnd-theme','tavern');localStorage.setItem('dnd-lang','ru');});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const idle=async(p=page)=>p.waitForFunction(()=>!document.querySelector('[data-vtt-root]').hasAttribute('aria-busy'));
  const config=async(p=page)=>p.locator('[data-vtt-config]').evaluate(el=>JSON.parse(el.textContent));
  await page.goto(f.origin+'/tabletop');
  assert.equal(await page.getByRole('heading',{name:'Игровой стол',exact:true}).count(),1);
  const create=page.locator('[data-vtt-api="/api/tabletop/sessions"]');
  await create.locator('input').fill('Старое поместье');await create.locator('button').click();
  await page.waitForURL(/\/tabletop\/[a-f0-9-]+$/);
  let cfg=await config();const sessionId=cfg.session.id;
  const newLocation=()=>page.locator(`form[data-vtt-api="/api/tabletop/sessions/${sessionId}/locations"]`);
  await newLocation().locator('input').fill('Главный зал');await newLocation().locator('button').click();await page.waitForURL(/location=/);
  cfg=await config();const sceneId=cfg.scene.id,locationId=cfg.scene.location_id,url=page.url();
  assert.equal((await f.store.locations(sessionId,LOCAL_GM)).length,1);
  console.log('PASS real HTTP: session and location creation, Russian navigation, empty map');

  const fixtureImage=async(w=1400,h=1000,type='image/png')=>page.evaluate(({w,h,type})=>{
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
    ctx.fillStyle='#24332b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#827253';ctx.fillRect(w*.09,h*.12,w*.82,h*.76);
    ctx.strokeStyle='#514936';ctx.lineWidth=1;
    for(let x=w*.09;x<w*.92;x+=50){ctx.beginPath();ctx.moveTo(x,h*.12);ctx.lineTo(x,h*.88);ctx.stroke();}
    for(let y=h*.12;y<h*.88;y+=50){ctx.beginPath();ctx.moveTo(w*.09,y);ctx.lineTo(w*.91,y);ctx.stroke();}
    ctx.strokeStyle='#b8ab8b';ctx.lineWidth=24;ctx.strokeRect(w*.09,h*.12,w*.82,h*.76);
    ctx.fillStyle='#3b4031';for(const x of [.2,.8])for(const y of [.3,.7]){ctx.beginPath();ctx.arc(w*x,h*y,28,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#483624';ctx.fillRect(w*.4,h*.36,w*.2,h*.28);ctx.strokeStyle='#c3a66c';ctx.lineWidth=5;ctx.strokeRect(w*.4,h*.36,w*.2,h*.28);
    return c.toDataURL(type,.9);
  },{w,h,type});
  const setFile=async(data,name,mimeType)=>{await page.locator('[data-vtt-file]').setInputFiles({name,mimeType,buffer:Buffer.from(data.split(',')[1],'base64')});await idle();};
  const mapData=await fixtureImage();await setFile(mapData,'great-hall.png','image/png');
  await page.waitForFunction(()=>{const i=document.querySelector('[data-vtt-map-image]');return !i.hidden&&i.complete&&i.naturalWidth===1400;});
  const settings=()=>page.locator('[data-vtt-settings]');
  await settings().locator('[name=cellSize]').fill('80');await settings().locator('[name=offsetX]').fill('13');await settings().locator('[name=offsetY]').fill('-9');
  await settings().locator('[name=color]').fill('#ffe2a1');
  await settings().locator('[name=opacity]').evaluate(el=>{el.value='.55';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await settings().locator('[data-vtt-save]').click();await idle();
  let dbScene=await f.store.scene(sceneId,LOCAL_GM);
  assert.equal(dbScene.grid.cellSize,80);assert.equal(dbScene.grid.offsetY,-9);assert.equal(dbScene.map_width,1400);
  await page.reload();await page.locator('[data-vtt-map-image]').waitFor({state:'visible'});
  assert.equal(await settings().locator('[name=cellSize]').inputValue(),'80');assert.equal(await settings().locator('[name=color]').inputValue(),'#ffe2a1');
  assert.equal(await page.locator('#vtt-grid-pattern').getAttribute('width'),'80');
  await settings().locator('[name=visible]').uncheck();assert.equal(await page.locator('[data-vtt-grid]').isVisible(),false);
  await settings().locator('[data-vtt-save]').click();await idle();await page.reload();assert.equal(await settings().locator('[name=visible]').isChecked(),false);
  await settings().locator('[name=visible]').check();await settings().locator('[data-vtt-save]').click();await idle();
  console.log('PASS PNG upload, live grid preview, offsets/color/opacity, hidden grid and database persistence across reload');

  const previousZoom=await page.locator('[data-vtt-zoom-label]').textContent();await page.locator('[data-vtt-zoom=in]').click();
  assert.notEqual(await page.locator('[data-vtt-zoom-label]').textContent(),previousZoom);
  const vp=await page.locator('[data-vtt-viewport]').boundingBox();await page.mouse.move(vp.x+vp.width/2,vp.y+100);await page.mouse.down();await page.mouse.move(vp.x+vp.width/2+50,vp.y+145,{steps:5});await page.mouse.up();
  const transform=await page.locator('[data-vtt-map]').evaluate(el=>el.style.transform);
  await page.waitForFunction(id=>!!localStorage.getItem('dnd-vtt-camera:'+id),sceneId);await page.reload();
  await page.waitForFunction(expected=>document.querySelector('[data-vtt-map]').style.transform===expected,transform);
  await page.locator('[data-vtt-fit]').click();
  await page.locator('[data-vtt-fullscreen]').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.evaluate(()=>document.exitFullscreen());
  console.log('PASS zoom, drag/pan, camera persistence, fit map and fullscreen');

  await page.locator('.vtt-new-location summary').click();await newLocation().locator('input').fill('Подвал');await newLocation().locator('button').click();
  await page.waitForURL(current=>current.searchParams.get('location')!==locationId&&!!current.searchParams.get('location'));
  assert.equal(await settings().locator('[name=cellSize]').inputValue(),'70');assert.equal(await page.locator('[data-vtt-map-empty]').isVisible(),true);
  await page.locator(`[data-vtt-location="${locationId}"]`).click();await page.waitForURL(url);
  assert.equal(await settings().locator('[name=cellSize]').inputValue(),'80');
  console.log('PASS separate location maps and grids, switching locations restores settings');

  const oldTab=await context.newPage();oldTab.on('dialog',dialog=>dialog.accept());oldTab.on('pageerror',error=>errors.push(error.message));await oldTab.goto(url);
  await settings().locator('[name=name]').fill('Главный зал · вечер');await settings().locator('[data-vtt-save]').click();await idle();
  await oldTab.locator('[data-vtt-settings] [name=cellSize]').fill('90');await oldTab.locator('[data-vtt-save]').click();await idle(oldTab);
  assert.match(await oldTab.locator('[data-vtt-status]').textContent(),/другой вкладке/);assert.equal(await oldTab.locator('[data-vtt-reload]').isVisible(),true);
  assert.equal(await oldTab.locator('[data-vtt-save]').isEnabled(),true);assert.equal((await f.store.scene(sceneId,LOCAL_GM)).grid.cellSize,80);
  await oldTab.locator('[data-vtt-reload]').click();await oldTab.waitForLoadState('load');await oldTab.close();
  console.log('PASS two-tab conflict: newer state preserved, localized 409, retry controls available');

  const endpoint=`**/api/tabletop/scenes/${sceneId}`;
  await page.route(endpoint,route=>route.abort());await settings().locator('[name=offsetX]').fill('20');await settings().locator('[data-vtt-save]').click();await idle();
  assert.match(await page.locator('[data-vtt-status]').textContent(),/Не удалось связаться/);assert.equal(await settings().locator('[data-vtt-save]').isEnabled(),true);
  assert.equal((await f.store.scene(sceneId,LOCAL_GM)).grid.offsetX,13);
  await page.unroute(endpoint);await page.route(endpoint,route=>route.fulfill({status:404,contentType:'text/html',body:'<h1>404</h1>'}));
  await settings().locator('[data-vtt-save]').click();await idle();assert.match(await page.locator('[data-vtt-status]').textContent(),/неожиданный ответ/);
  await page.unroute(endpoint);await settings().locator('[data-vtt-save]').click();await idle();assert.equal((await f.store.scene(sceneId,LOCAL_GM)).grid.offsetX,20);
  await page.locator('[data-vtt-file]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken image')});await idle();
  assert.match(await page.locator('[data-vtt-status]').textContent(),/Не удалось прочитать/);assert.equal((await f.store.scene(sceneId,LOCAL_GM)).map_name,'great-hall.png');
  console.log('PASS network loss, HTML 404 and unreadable image: previous data kept, form unlocks, successful retry');

  const jpeg=await fixtureImage(1200,900,'image/jpeg');await setFile(jpeg,'hall.jpg','image/jpeg');assert.equal((await f.store.image(sceneId,LOCAL_GM)).mime,'image/jpeg');
  const large=await fixtureImage(4500,3000);await setFile(large,'large-hall.png','image/png');
  dbScene=await f.store.scene(sceneId,LOCAL_GM);assert.equal(dbScene.map_width,4096);assert.equal(dbScene.map_height,2731);assert.equal(dbScene.map_mime,'image/webp');assert.equal(dbScene.grid.cellSize,80);
  await setFile(mapData,'great-hall.png','image/png');await page.locator('[data-vtt-map-image]').waitFor({state:'visible'});
  console.log('PASS JPEG, WebP resizing of large maps, replacement preserves grid');

  await page.evaluate(()=>window.scrollTo(0,0));
  if(qa)await page.screenshot({path:qa+'/tabletop-tavern.png',fullPage:true});
  await page.locator('#theme-picker').selectOption('base');
  if(qa)await page.screenshot({path:qa+'/tabletop-base.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('[data-vtt-root]').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'tabletop fits mobile width');
  if(qa)await page.screenshot({path:qa+'/tabletop-mobile.png',fullPage:true});
  await page.setViewportSize({width:1512,height:1120});await page.locator('#theme-picker').selectOption('tavern');
  await page.locator('[data-vtt-save-state]').scrollIntoViewIfNeeded();
  const pin=await page.evaluate(()=>({header:document.querySelector('.topbar').getBoundingClientRect().bottom,tools:document.querySelector('.vtt-stage-toolbar').getBoundingClientRect().top,stageBottom:document.querySelector('.vtt-stage').getBoundingClientRect().bottom,workspaceBottom:document.querySelector('.vtt-workspace').getBoundingClientRect().bottom,stickyTop:getComputedStyle(document.querySelector('.vtt-stage')).top}));
  if(qa&&pin.tools<pin.header)await page.screenshot({path:qa+'/sticky-failure.png'});
  assert.ok(pin.tools>=pin.header,'camera toolbar stays below sticky site navigation '+JSON.stringify(pin));
  console.log('PASS desktop themes, narrow viewport and camera toolbar clear of sticky navigation');

  await page.locator('[data-vtt-remove-map]').click();await idle();assert.equal((await f.store.scene(sceneId,LOCAL_GM)).has_map,false);assert.equal((await f.store.scene(sceneId,LOCAL_GM)).grid.cellSize,80);
  await page.locator('[data-vtt-delete-location]').click();await page.waitForURL(f.origin+'/tabletop/'+sessionId);
  assert.equal((await f.store.locations(sessionId,LOCAL_GM)).length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS map removal, location deletion and cascade; no browser exceptions');
} finally {await browser.close();await f.close();}
