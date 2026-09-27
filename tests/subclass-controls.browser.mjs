// Optional Chromium + PGlite integration. See live-roll.browser.mjs for setup.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {subclassFixture} from './helpers/subclass-fixture.mjs';
import {serverFunctions} from './helpers/server-functions.mjs';
import {useSubclassControl,renderSubclassControls,dragonWingsActive} from '../src/web/subclass-controls.mjs';
import {useSubclassAction,renderSubclassActionPanel} from '../src/web/subclass-actions.mjs';
import {translateText} from '../src/web/assets/i18n-core.mjs';
import {localizeHtml} from '../src/localization/html.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'["--no-sandbox"]')});
const f=await subclassFixture(),t=s=>translateText(s,'ru');
const dispatch=serverFunctions(['useClassAction'],{sql:f.sql,useSubclassAction,useSubclassControl}).useClassAction;
const ui=readFileSync(new URL('../src/web/assets/table-ui.js',import.meta.url),'utf8');
const wingsKey='subclass:draconic:dragon-wings',pointsKey='class:sorcerer:sorcery-points';
const presenceKey='subclass:berserker:intimidating-presence',rageKey='class:barbarian:rage';
try{
 const context=await browser.newContext({reducedMotion:'reduce'});
 async function setup(c){
  await f.create(c);const page=await context.newPage();const requests=[];
  await page.route('http://dnd.test/**',async route=>{
   const request=route.request();
   if(request.method()==='POST'){
    requests.push(request.url());assert.equal(new URL(request.url()).pathname,`/api/character/${c.id}/class-action`);
    try{
     const result=await dispatch(c.id,Object.fromEntries(new URLSearchParams(request.postData())));
     result.outcome=t(result.outcome);
     if(result.effects?.subclassControlsHtml)result.effects.subclassControlsHtml=localizeHtml(result.effects.subclassControlsHtml,'ru');
     await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    }catch(error){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:t(error.message)})});}
   }else{
    const character=await f.character(c.id),resources=await f.resources(c.id);
    const controls=renderSubclassControls(character,resources,t);
    const panel=`<div data-subclass-controls="${c.id}">${controls}</div>`;
    const actions=renderSubclassActionPanel(character,resources,t);
    await route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><small data-subclass-flight ${dragonWingsActive(character)?'':'hidden'}>${t('Fly 60 ft. · Dragon Wings')}</small>${actions}${panel}${panel}`});
   }
  });
  const load=async()=>{await page.goto(`http://dnd.test/character/${c.id}`);await page.addScriptTag({content:ui});};
  const click=async effect=>{await page.locator(`[data-control-effect="${effect}"] button`).first().click();await page.waitForFunction(()=>!document.querySelector('form[aria-busy]'));};
  await load();return {page,load,click,requests};
 }
 const count=async(id,key)=>(await f.resources(id)).find(r=>r.source_key===key).current_value;
 const s=await setup({id:'s',class_name:'Sorcerer',subclass_name:'Draconic Sorcery',level:14});
 await s.click('wings_start');
 assert.equal(await count('s',wingsKey),0);assert.equal(await s.page.locator('[data-subclass-flight]').isVisible(),true);
 assert.equal(await s.page.locator('[data-control-effect="wings_end"]').count(),2);
 assert.equal(await s.page.locator('.dice-tray').count(),0,'no dice UI for toggles');
 for(const notice of await s.page.locator('[data-control-notice]').allTextContents())assert.match(notice,/активны/);
 await s.click('wings_restore');assert.equal(await count('s',pointsKey),11);assert.equal(await count('s',wingsKey),1);
 assert.equal(await s.page.locator('[data-subclass-flight]').isVisible(),true);
 await s.click('wings_end');assert.equal(await s.page.locator('[data-subclass-flight]').isVisible(),false);assert.equal(await count('s',wingsKey),1);
 await s.click('wings_start');await s.load();
 assert.equal(await s.page.locator('[data-subclass-flight]').isVisible(),true);
 assert.equal(await s.page.locator('[data-control-effect="wings_end"]').count(),2);
 await f.restCharacter('s','short');await s.load();
 assert.equal(await s.page.locator('[data-subclass-flight]').isVisible(),false);
 assert.equal(await s.page.locator('[data-control-effect="wings_start"] button:disabled').count(),2);
 await f.restCharacter('s','long');await s.load();
 assert.equal(await s.page.locator('[data-control-effect="wings_start"] button:disabled').count(),0);
 console.log('PASS wings: activate, restore while active, dismiss, re-activate, refresh, short/long rest; no dice tray');
 // Simulate an old tab: UI says enough points, another action spends them first.
 await s.click('wings_start');
 await f.sql`UPDATE character_resources SET current_value=2 WHERE character_id='s' AND source_key=${pointsKey}`;
 await s.click('wings_restore');
 assert.match(await s.page.locator('[data-action-error]').textContent(),/Недостаточно ресурсов/);
 assert.equal(await s.page.locator('.dice-tray').count(),0);assert.equal(await count('s',wingsKey),0);assert.equal(await count('s',pointsKey),2);
 assert.equal(await s.page.locator('[data-control-effect="wings_restore"] button').first().isEnabled(),true,'error releases the button');
 console.log('PASS stale-tab failure: inline localized error, no partial spend, button unlocked');
 await s.page.close();
 const b=await setup({id:'b',class_name:'Barbarian',subclass_name:'Path of the Berserker',level:14,strength:18,proficiency_bonus:5});
 await b.click('presence_use');assert.equal(await count('b',presenceKey),0);
 for(const notice of await b.page.locator('[data-control-notice]').allTextContents())assert.match(notice,/Сл 17/);
 assert.equal(await b.page.locator('[data-control-effect="presence_use"] button:disabled').count(),2);
 await b.click('presence_restore');assert.equal(await count('b',rageKey),4);assert.equal(await count('b',presenceKey),1);
 assert.equal(await b.page.locator('[data-control-effect="presence_use"] button:disabled').count(),0);
 assert.equal(await b.page.locator('.dice-tray').count(),0);
 console.log('PASS Intimidating Presence: DC 17, depletion, one Rage recovery, both panels updated');
 const frenzy=b.page.locator('[data-subclass-action="frenzy"]');
 const before=b.requests.length;await frenzy.locator('button').click();assert.equal(b.requests.length,before);
 await frenzy.locator('[name="confirmed"]').check();await frenzy.locator('button').click();
 await b.page.waitForFunction(()=>!document.querySelector('form[aria-busy]'));
 assert.equal(await b.page.locator('.dice-tray.is-error').count(),0);
 assert.equal(await b.page.locator('.dice-formula').textContent(),'3d6');
 assert.equal(await b.page.locator('.dice-label').textContent(),'Бешенство');
 assert.equal(await count('b',rageKey),4);assert.equal(await frenzy.locator('[name="confirmed"]').isChecked(),false);
 await b.load();assert.equal(await count('b',rageKey),4);
 console.log('PASS Frenzy: required trigger, 3d6, Russian label, no additional Rage spend');
 await b.page.close();
}finally{await browser.close();await f.db.close();}
