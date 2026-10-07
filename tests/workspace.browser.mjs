import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {DEFAULT_GRID,LOCAL_GM} from '../src/web/tabletop.mjs';
import {workspaceKey} from '../src/web/assets/workspace-state.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'["--no-sandbox"]')});
const f=await tabletopFixture({server:true}),errors=[],qa=process.env.VTT_QA_DIR;
if(qa)mkdirSync(qa,{recursive:true});
try{
  const s=await f.store.createSession(LOCAL_GM,'Рабочий стол мастера'),l=await f.store.createLocation(s.id,LOCAL_GM,'Старый зал');
  const floor=await f.store.floors.create(l.id,LOCAL_GM,{name:'Подвал',location_revision:1});
  await f.store.updateScene(l.scene_id,LOCAL_GM,{revision:1,name:'Старый зал',grid:{...DEFAULT_GRID,cellSize:47.5}});
  const {token}=await f.store.tokens.add(l.scene_id,LOCAL_GM,{kind:'npc',name:'Страж',x:285,y:285,snap:true,scene_revision:2});
  const other=await f.store.createSession(LOCAL_GM,'Другая сессия');
  const context=await browser.newContext({viewport:{width:1512,height:1120},reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('dnd-lang','ru');localStorage.setItem('dnd-theme','tavern');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url=f.origin+'/tabletop/'+s.id+'?scene='+l.scene_id;
  const panel=n=>page.locator(`[data-workspace-panel="${n}"]`),toggle=n=>page.locator(`[data-workspace-toggle="${n}"]`);
  const node=page.locator(`[data-token-id="${token.id}"]`),mapName=page.locator('[data-vtt-settings] [name=name]'),tokenName=page.locator('[data-token-editor] [name=name]');
  const idle=()=>page.waitForFunction(()=>!document.querySelector('[data-vtt-root]').hasAttribute('aria-busy'));
  const savedScene=await f.store.scene(l.scene_id,LOCAL_GM),savedTokens=await f.store.tokens.list(l.scene_id,LOCAL_GM);
  await page.goto(url);await node.waitFor();
  const width=(await page.locator('[data-vtt-stage]').boundingBox()).width;
  await page.locator('[data-workspace-close=locations]').focus();await page.keyboard.press('Enter');
  assert.equal(await panel('locations').isVisible(),false);assert.equal(await toggle('locations').evaluate(e=>e===document.activeElement),true);
  assert.ok((await page.locator('[data-vtt-stage]').boundingBox()).width>width);
  assert.equal(await node.evaluate(e=>parseFloat(e.style.width)),47.5);
  console.log('PASS keyboard close restores focus and expands the map without changing fractional token size');

  await mapName.fill('Черновик карты');await toggle('inspector').click();await toggle('inspector').click();assert.equal(await mapName.inputValue(),'Черновик карты');
  await page.locator('[data-inspector-tab=tokens]').click();await page.locator(`[data-select-token="${token.id}"]`).click();await tokenName.fill('Черновик токена');
  await page.locator('[data-workspace-map-only]').click();assert.equal(await panel('inspector').isVisible(),false);
  await page.locator('[data-workspace-map-only]').click();assert.equal(await panel('inspector').isVisible(),true);assert.equal(await panel('locations').isVisible(),false);
  assert.equal(await tokenName.inputValue(),'Черновик токена');await page.locator('[data-workspace-reset]').click();assert.equal(await mapName.inputValue(),'Черновик карты');
  assert.deepEqual(await f.store.scene(l.scene_id,LOCAL_GM),savedScene);assert.deepEqual(await f.store.tokens.list(l.scene_id,LOCAL_GM),savedTokens);
  await mapName.fill('Старый зал');await page.locator('[data-inspector-tab=tokens]').click();await tokenName.fill('Страж');
  console.log('PASS hiding, map-only, restore and reset preserve map/token drafts and all game data');

  // Docks use original panel/form nodes; exercise all destinations and controls.
  await page.locator('[data-inspector-tab=map]').click();await mapName.fill('Новый черновик');
  await page.locator('[data-inspector-tab=tokens]').click();await tokenName.fill('Новый токен');
  for(const dock of ['left','bottom','right']){
    await page.locator('[data-workspace-location=inspector]').selectOption(dock);
    assert.equal(await panel('inspector').evaluate(e=>e.parentElement.dataset.workspaceDock),dock);
    assert.equal(await tokenName.inputValue(),'Новый токен');
    const separator=page.locator(`[data-workspace-resize="${dock}"]`);
    await separator.focus();await page.keyboard.press('End');
    assert.equal(Number(await separator.getAttribute('aria-valuenow')),dock==='bottom'?420:dock==='left'?440:480);
    await page.keyboard.press('Home');
    const bounds=await separator.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+(dock==='left'?50:dock==='right'?-50:0),bounds.y+bounds.height/2+(dock==='bottom'?-50:0),{steps:5});await page.mouse.up();
    assert.ok(Number(await separator.getAttribute('aria-valuenow'))>(dock==='bottom'?120:dock==='left'?180:240));
    assert.ok((await page.locator('[data-vtt-stage]').boundingBox()).width>=320);
  }
  await toggle('help').click();await page.locator('[data-workspace-location=help]').selectOption('right');
  await page.locator('[data-workspace-tab=inspector]').click();
  assert.equal(await panel('help').isVisible(),false);assert.equal(await tokenName.inputValue(),'Новый токен');
  await page.locator('[data-workspace-map-only]').click();await page.locator('[data-workspace-map-only]').click();assert.equal(await panel('inspector').isVisible(),true);
  await page.locator('[data-workspace-tab=inspector]').focus();await page.keyboard.press('ArrowRight');assert.equal(await panel('help').isVisible(),true);
  await page.locator('[data-workspace-close=help]').click();assert.equal(await panel('inspector').isVisible(),true);
  await toggle('locations').click(); // Reveal an empty left destination during drag.
  await page.locator('[data-workspace-drag=inspector]').evaluate(el=>{window.workspaceTransfer=new DataTransfer();el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.workspaceTransfer}));});
  await page.locator('[data-workspace-dock=left]').evaluate(el=>el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.workspaceTransfer})));
  assert.equal(await panel('inspector').evaluate(e=>e.parentElement.dataset.workspaceDock),'left');
  assert.equal(await page.locator('[data-token-editor]').count(),1);assert.equal(await tokenName.inputValue(),'Новый токен');
  await page.locator('[data-workspace-reset]').click();assert.equal(await mapName.inputValue(),'Новый черновик');
  await page.locator('[data-inspector-tab=tokens]').click();assert.equal(await tokenName.inputValue(),'Новый токен');
  assert.deepEqual(await f.store.scene(l.scene_id,LOCAL_GM),savedScene);assert.deepEqual(await f.store.tokens.list(l.scene_id,LOCAL_GM),savedTokens);
  await page.locator('[data-inspector-tab=map]').click();await mapName.fill('Старый зал');await page.locator('[data-inspector-tab=tokens]').click();await tokenName.fill('Страж');
  console.log('PASS every dock, pointer/keyboard resize, accessible movement, tabs and drag preserve drafts and server data');

  await toggle('locations').click();await toggle('help').click();await page.reload();
  assert.equal(await panel('locations').isVisible(),false);assert.equal(await panel('help').isVisible(),true);assert.equal(await page.locator('[data-token-panel]').isVisible(),true);
  await page.goto(f.origin+'/tabletop/'+s.id+'?scene='+floor.id);assert.equal(await panel('locations').isVisible(),false);assert.equal(await panel('help').isVisible(),true);
  await page.goto(f.origin+'/tabletop/'+other.id);assert.equal(await panel('locations').isVisible(),true);assert.equal(await panel('help').isVisible(),false);assert.equal(await panel('inspector').count(),0);
  await page.locator('[data-workspace-map-only]').click();await page.locator('[data-workspace-reset]').click();assert.equal(await panel('locations').isVisible(),true);
  await page.goto(url);console.log('PASS reload/floor navigation retain layout and inspector tab; another empty session is independent');

  await page.locator('[data-workspace-map-only]').click();await page.reload();assert.equal(await panel('inspector').isVisible(),false);
  await node.click();assert.equal(await panel('inspector').isVisible(),true);assert.equal(await page.locator('[data-token-editor]').isVisible(),true);
  assert.equal(await page.locator('[data-workspace-map-only]').getAttribute('aria-pressed'),'false');
  console.log('PASS map-only persists and selecting a map token opens its inspector');

  await page.locator('[data-workspace-reset]').click();
  for(const viewport of [{width:980,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);await toggle('help').click();
    assert.ok(await page.locator('[data-workspace]').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    assert.ok(await page.locator('.workspace-toolbar').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    assert.ok((await page.locator('[data-vtt-stage]').boundingBox()).width>200);
    if(qa)await page.screenshot({path:qa+`/workspace-${viewport.width}.png`,fullPage:true});await toggle('help').click();
  }
  await page.setViewportSize({width:1512,height:1120});if(qa)await page.screenshot({path:qa+'/workspace-desktop.png',fullPage:true});
  console.log('PASS tablet/mobile controls fit without horizontal overflow');

  await page.evaluate(key=>localStorage.setItem(key,'{broken'),workspaceKey(s.id));await page.reload();assert.equal(await panel('locations').isVisible(),true);assert.equal(await panel('inspector').isVisible(),true);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('dnd-workspace:'))throw Error('quota');return original.call(this,k,v);};});
  await toggle('locations').click();assert.equal(await panel('locations').isVisible(),false);assert.match(await page.locator('[data-workspace-status]').textContent(),/Не удалось сохранить/);
  await toggle('locations').click();assert.equal(await panel('locations').isVisible(),true);
  console.log('PASS corrupt preferences recover and blocked writes keep the layout usable with feedback');

  await page.reload();await page.locator('[name=cellSize]').fill('70');
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/tabletop/scenes/'+l.scene_id,async route=>{await gate;await route.continue();});
  await page.locator('[data-vtt-save]').click();await page.waitForFunction(()=>document.querySelector('[data-vtt-root]').hasAttribute('aria-busy'));
  await toggle('inspector').click();assert.equal(await panel('inspector').isVisible(),false);release();await idle();await page.unroute('**/api/tabletop/scenes/'+l.scene_id);
  await toggle('inspector').click();assert.equal(await page.locator('[name=cellSize]').inputValue(),'70');assert.equal((await f.store.scene(l.scene_id,LOCAL_GM)).grid.cellSize,70);
  console.log('PASS workspace controls remain responsive during server saves');

  await page.locator('[name=cellSize]').fill('0');await toggle('inspector').click();
  await page.locator('[data-vtt-viewport]').evaluate(el=>{const transfer=new DataTransfer();transfer.items.add(new File(['invalid'], 'test.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));});
  assert.equal(await panel('inspector').isVisible(),true);assert.equal(await page.locator('[data-vtt-settings]').isVisible(),true);
  assert.match(await page.locator('[data-vtt-status]').textContent(),/Проверьте настройки/);assert.equal((await f.store.scene(l.scene_id,LOCAL_GM)).grid.cellSize,70);
  await page.locator('[name=cellSize]').fill('70');console.log('PASS dropping a map with invalid hidden settings reveals the inspector before upload');

  const migration=await browser.newContext({viewport:{width:1512,height:1120}});
  await migration.addInitScript(({key,old})=>{localStorage.setItem('dnd-lang','ru');localStorage.setItem(old,JSON.stringify({version:1,panels:{locations:false,inspector:false,help:true},mapOnly:true,inspectorTab:'tokens'}));},{key:workspaceKey(s.id),old:workspaceKey(s.id).replace(':v2:',':v1:')});
  const migrated=await migration.newPage();await migrated.goto(url);
  assert.equal(await migrated.locator('[data-workspace-panel=inspector]').isVisible(),false);
  await migrated.locator('[data-workspace-map-only]').click();assert.equal(await migrated.locator('[data-workspace-panel=help]').isVisible(),true);
  await migrated.locator('[data-workspace-toggle=inspector]').click();assert.equal(await migrated.locator('[data-token-panel]').isVisible(),true);
  const preferences=await migrated.evaluate(key=>({next:JSON.parse(localStorage.getItem(key)),old:localStorage.getItem(key.replace(':v2:',':v1:'))}),workspaceKey(s.id));assert.equal(preferences.next.version,2);assert.ok(preferences.old);
  await migrated.locator('[data-workspace-location=inspector]').selectOption('bottom');
  await migrated.locator('[data-workspace-resize=bottom]').focus();await migrated.keyboard.press('End');
  await migrated.reload();assert.equal(await migrated.locator('[data-workspace-panel=inspector]').evaluate(e=>e.parentElement.dataset.workspaceDock),'bottom');assert.equal(await migrated.locator('[data-workspace-tab=inspector]').getAttribute('aria-selected'),'true');
  await migrated.setViewportSize({width:390,height:844});await migrated.locator('[data-workspace-map-only]').click();await migrated.locator('[data-workspace-map-only]').click();
  assert.equal(await migrated.evaluate(key=>JSON.parse(localStorage.getItem(key)).sizes.bottom,workspaceKey(s.id)),420);
  await migrated.setViewportSize({width:1512,height:1120});assert.equal(await migrated.locator('[data-workspace-resize=bottom]').getAttribute('aria-valuenow'),'420');
  await migration.close();console.log('PASS browser v1 migration, stored dock/tab/size and mobile preferences');

  const english=await browser.newContext({viewport:{width:1512,height:1120}});await english.addInitScript(()=>localStorage.setItem('dnd-lang','en'));
  await english.addCookies([{name:'dnd-lang',value:'en',url:f.origin}]);const en=await english.newPage();en.on('pageerror',e=>errors.push(e.message));await en.goto(url);
  assert.equal(await en.locator('[data-workspace-map-only]').textContent(),'Map only');assert.equal(await en.locator('[data-workspace-reset]').textContent(),'Reset layout');
  assert.deepEqual(errors,[]);console.log('PASS English controls and no browser exceptions');
}finally{await browser.close();await f.close();}
