import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {LOCAL_GM} from '../src/web/tabletop.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'["--no-sandbox"]')});
const f=await tabletopFixture({server:true}),errors=[],qa=process.env.VTT_QA_DIR;
if(qa)mkdirSync(qa,{recursive:true});
try {
  const session=await f.store.createSession(LOCAL_GM,'Новые значки');
  const location=await f.store.createLocation(session.id,LOCAL_GM,'Торговая площадь');
  const token=(await f.store.tokens.add(location.scene_id,LOCAL_GM,{kind:'npc',name:'Торговец',x:500,y:350,snap:true,scene_revision:1})).token;
  const context=await browser.newContext({viewport:{width:1512,height:1120},reducedMotion:'reduce'});
  await context.addInitScript(()=>{localStorage.setItem('dnd-lang','ru');localStorage.setItem('dnd-theme','tavern');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(f.origin+'/tabletop/'+session.id);
  const editor=page.locator('[data-token-editor]'),gallery=page.locator('[data-token-gallery]'),preview=page.locator('[data-token-icon-preview]');
  const node=page.locator(`[data-token-id="${token.id}"]`);
  const current=async()=>(await f.store.tokens.list(location.scene_id,LOCAL_GM)).find(t=>t.id===token.id);
  const pick=async()=>{await page.locator('[data-inspector-tab=tokens]').click();await page.locator(`[data-select-token="${token.id}"]`).click();};
  const save=async()=>{await page.locator('[data-token-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-vtt-root]').hasAttribute('aria-busy'));};
  await pick();await editor.locator('[name=icon_color]').fill('#77bbff');
  await page.locator('[data-token-gallery-open]').click();
  assert.equal(await gallery.locator('[data-choose-icon]').count(),61);
  assert.equal(await gallery.locator('section').count(),5);
  assert.equal(await gallery.locator('[aria-pressed=true]').count(),1);
  // Decode the PNGs and supplemental atlases before inspecting their clipped browser rendering.
  await page.evaluate(async()=>{await Promise.all([...new Set([...document.querySelectorAll('[data-token-gallery] image')].map(el=>el.getAttribute('href')))].map(src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=src;})));});
  if(qa)for(let index=0;index<5;index++)await gallery.locator('section').nth(index).screenshot({path:qa+'/icons-group-'+index+'.png'});
  await gallery.locator('[data-choose-icon=merchant]').click();assert.equal(await gallery.isVisible(),false);
  assert.equal(await editor.locator('[name=icon_type]').inputValue(),'merchant');
  assert.equal(await preview.locator('svg').getAttribute('data-icon'),'merchant');
  assert.equal((await current()).icon_type,'npc','preview does not save prematurely');
  console.log('PASS 61 rendered symbols in five localized groups, gallery selection and unsaved preview');

  await editor.locator('[name=border_color]').fill('#aa55dd');
  await save();assert.equal((await current()).icon_color,'#77bbff');assert.equal((await current()).border_color,'#aa55dd');
  await page.reload();await pick();
  assert.equal(await editor.locator('[name=icon_type]').inputValue(),'merchant');
  assert.equal(await editor.locator('[name=icon_color]').inputValue(),'#77bbff');
  assert.equal(await node.locator('svg').getAttribute('data-icon-color'),'#77bbff');
  const rgb=await page.evaluate(async()=>{
    const {tokenIcon}=await import('/assets/tabletop-token-model.mjs');
    const tint=async color=>{
      const doc=new DOMParser().parseFromString(tokenIcon('undead',color),'image/svg+xml'),svg=doc.documentElement,atlas=svg.querySelector('image');
      const blob=await (await fetch(atlas.getAttribute('href'))).blob();
      const data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
      atlas.setAttribute('href',data);svg.setAttribute('width','128');svg.setAttribute('height','128');
      const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
      try {
        const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,128,128).data,sums=[0,0,0];let count=0;
        for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200){count++;for(let j=0;j<3;j++)sums[j]+=pixels[i+j];}
        return {sums,count};
      } finally {URL.revokeObjectURL(url);}
    };
    return {red:await tint('#ff2222'),green:await tint('#22ff22')};
  });
  assert.ok(rgb.red.count>1000);assert.ok(rgb.red.sums[0]>rgb.red.sums[1]*1.5);assert.ok(rgb.green.sums[1]>rgb.green.sums[0]*1.5);
  console.log('PASS independent icon/border colors survive reload; rendered pixels actually change red and green');

  let legacy=await current();
  await f.store.tokens.change(token.id,LOCAL_GM,{...legacy,scene_revision:1,icon_type:'questgiver'});
  await page.reload();await pick();
  assert.equal(await editor.locator('[name=icon_type]').inputValue(),'questgiver');
  await page.locator('[data-token-gallery-open]').click();
  assert.equal(await gallery.locator('[data-choose-icon=quest_giver]').getAttribute('aria-pressed'),'true');
  assert.equal(await gallery.locator('[data-choose-icon=questgiver]').count(),0);
  await page.keyboard.press('Escape');await editor.locator('[name=name]').fill('Квестодатель');await save();
  assert.equal((await current()).icon_type,'questgiver','renaming must not silently replace a key saved by the other branch');
  await page.locator('[data-token-gallery-open]').click();await gallery.locator('[data-choose-icon=elf]').click();await save();
  await page.reload();await pick();
  assert.equal(await node.locator('image').getAttribute('href'),'/assets/token-icons/elf.png?v=0.31.2');
  assert.equal((await current()).icon_type,'elf');
  console.log('PASS art-branch questgiver alias survives rename; race selection uses the restored PNG after reload');

  // The screenshot showed the other branch's character/skull pair. The fixed
  // release must use its own atlases for these shared keys after upgrading.
  const skull=(await f.store.tokens.add(location.scene_id,LOCAL_GM,{kind:'npc',name:'Нежить',x:700,y:350,snap:true,scene_revision:1})).token;
  await f.store.tokens.change(skull.id,LOCAL_GM,{...skull,scene_revision:1,icon_type:'undead',icon_color:'#8ed8ff'});
  legacy=await current();await f.store.tokens.change(token.id,LOCAL_GM,{...legacy,scene_revision:1,icon_type:'character',icon_color:'#8ed8ff'});
  await page.reload();await pick();
  assert.equal(await node.locator('image').getAttribute('href'),'/assets/token-icons-roles-v1.png?v=0.31.2');
  assert.equal(await page.locator(`[data-token-id="${skull.id}"] image`).getAttribute('href'),'/assets/token-icons-creatures-v1.png?v=0.31.2');
  const centering=await node.evaluate(el=>{const face=el.querySelector('.vtt-token-face').getBoundingClientRect(),art=el.querySelector('svg').getBoundingClientRect();return {dx:Math.abs(art.x+art.width/2-face.x-face.width/2),dy:Math.abs(art.y+art.height/2-face.y-face.height/2),size:face.width};});
  assert.ok(centering.dx<1);assert.ok(centering.dy<centering.size*.04);
  if(qa)await page.locator('[data-vtt-map]').screenshot({path:qa+'/restored-tokens-map.png'});
  console.log('PASS fixed-release character/skull art takes priority and is centered inside the token frames');

  const old=await current();await editor.locator('[name=icon_color]').fill('#ff5544');
  await page.route('**/api/tabletop/tokens/'+token.id,route=>route.abort());await save();
  assert.equal((await current()).icon_color,old.icon_color);assert.equal(await editor.locator('[name=icon_color]').inputValue(),'#ff5544');
  assert.match(await page.locator('[data-vtt-status]').textContent(),/Не удалось связаться/);
  await page.unroute('**/api/tabletop/tokens/'+token.id);await save();assert.equal((await current()).icon_color,'#ff5544');
  console.log('PASS failed color save leaves the stored token intact and permits retry');

  await editor.locator('[name=icon_type]').selectOption('class_paladin');
  await page.locator('[data-token-color-reset]').click();assert.equal(await editor.locator('[name=icon_color]').inputValue(),'#c8d2dc');
  assert.equal(await editor.locator('[name=border_color]').inputValue(),'#aa55dd');await save();
  await page.locator('[data-token-gallery-open]').click();await gallery.locator('[data-choose-icon=boss]').click();await save();
  assert.equal((await current()).icon_type,'boss');
  await page.locator('[data-token-gallery-open]').click();await page.keyboard.press('Escape');assert.equal(await gallery.isVisible(),false);
  console.log('PASS class/boss selection, reset to type color without changing border, and Escape dismisses catalog');

  await page.setViewportSize({width:390,height:844});await page.locator('[data-token-gallery-open]').click();
  assert.ok(await gallery.evaluate(el=>el.scrollWidth<=el.clientWidth+2));
  const bounds=await gallery.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
  if(qa)await page.screenshot({path:qa+'/icons-mobile.png'});
  await gallery.locator('[data-choose-icon=portal]').click();await save();await page.reload();await pick();
  assert.equal((await current()).icon_type,'portal');assert.equal(await node.locator('svg').getAttribute('data-icon'),'portal');
  assert.deepEqual(errors,[]);console.log('PASS mobile catalog fits screen, map marker persists and all art assets load without errors');
} finally {await browser.close();await f.close();}
