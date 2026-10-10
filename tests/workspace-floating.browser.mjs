import assert from 'node:assert/strict';
import {workspaceDataFixture} from './helpers/workspace-data-fixture.mjs';
import {LOCAL_GM} from '../src/web/tabletop.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const f=await workspaceDataFixture({floating:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=f.origin+`/tabletop/${f.session.id}?scene=${f.location.scene_id}`;
 await page.goto(url);const shell=page.locator('[data-workspace]'),panel=page.locator('[data-workspace-panel=inspector]');
 assert.ok(await shell.evaluate(el=>el.classList.contains('workspace-floating')));
 const viewport=await page.locator('[data-vtt-viewport]').boundingBox();assert.deepEqual(viewport,{x:0,y:0,width:1440,height:1000});
 const scene=await f.store.scene(f.location.scene_id,LOCAL_GM),tokens=await f.store.tokens.list(f.location.scene_id,LOCAL_GM);
 const draft=page.locator('[data-vtt-settings] [name=name]');await draft.fill('Черновик окна');
 const handle=panel.locator('[data-workspace-drag]');let before=await panel.boundingBox(),box=await handle.boundingBox();
 await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x-120,box.y+90,{steps:5});await page.mouse.up();let after=await panel.boundingBox();assert.ok(after.x<before.x&&after.y>before.y);assert.equal(await draft.inputValue(),'Черновик окна');
 for(const edge of ['n','s','e','w','ne','nw','se','sw']){const grip=panel.locator(`[data-window-resize=${edge}]`);before=await panel.boundingBox();await grip.focus();await page.keyboard.press(edge.includes('w')?'ArrowLeft':edge.includes('e')?'ArrowRight':edge==='n'?'ArrowUp':'ArrowDown');after=await panel.boundingBox();assert.ok(after.width!==before.width||after.height!==before.height);}
 const size=await panel.boundingBox();await page.reload();assert.deepEqual(await panel.boundingBox(),size);
 console.log('PASS fullscreen map, pointer movement, eight resize directions and persistent geometry');
 await page.locator('[data-inspector-tab=tokens]').click();await page.locator(`[data-select-token="${f.token.id}"]`).click();await page.locator('[data-workspace-toggle=abilities]').click();
 const abilities=page.locator('[data-workspace-panel=abilities]'),frame=page.frameLocator('[data-workspace-panel=abilities] iframe');await frame.locator('[name=draft]').fill('Сохранить черновик');
 await abilities.locator('[data-workspace-drag]').focus();await page.keyboard.press('ArrowLeft');await abilities.locator('[data-window-resize=se]').focus();await page.keyboard.press('ArrowDown');
 await page.locator('[data-workspace-mode]').click();await page.locator('[data-workspace-mode]').click();await page.locator('[data-workspace-map-only]').click();await page.locator('[data-workspace-map-only]').click();assert.equal(await frame.locator('[name=draft]').inputValue(),'Сохранить черновик');
 assert.ok(await panel.isVisible()&&await abilities.isVisible());
 console.log('PASS independent windows and iframe drafts survive resizing, mode switches and map-only');
 await page.setViewportSize({width:390,height:700});await page.waitForTimeout(100);
 for(const name of ['locations','inspector','abilities']){const r=await page.locator(`[data-workspace-panel=${name}]`).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=391&&r.y+r.height<=701);}
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(100);assert.ok((await abilities.boundingBox()).width>220);
 assert.deepEqual(await f.store.scene(f.location.scene_id,LOCAL_GM),scene);assert.deepEqual(await f.store.tokens.list(f.location.scene_id,LOCAL_GM),tokens);assert.deepEqual(errors,[]);
 console.log('PASS mobile windows remain reachable, desktop geometry returns and game records are unchanged');
}finally{await browser.close();await f.close();}
