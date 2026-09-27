// Optional browser + PGlite regression. Requires Playwright/Chromium, like live-roll.browser.mjs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {subclassFixture} from './helpers/subclass-fixture.mjs';
import {serverFunctions} from './helpers/server-functions.mjs';
import {useSubclassAction,renderSubclassActionPanel} from '../src/web/subclass-actions.mjs';
import {translateText} from '../src/web/assets/i18n-core.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'["--no-sandbox"]')});
const fixture=await subclassFixture();
const dispatch=serverFunctions(['useClassAction'],{sql:fixture.sql,useSubclassAction}).useClassAction;
const ui=readFileSync(new URL('../src/web/assets/table-ui.js',import.meta.url),'utf8');
const t=s=>translateText(s,'ru');
try{
 const context=await browser.newContext({reducedMotion:'reduce'});
 for(const scenario of [
  {id:'fiend',effect:'dark_blessing',class_name:'Warlock',subclass_name:'Fiend Patron',level:6},
  {id:'luck',effect:'dark_luck',class_name:'Warlock',subclass_name:'Fiend Patron',level:6},
  {id:'monk',effect:'wholeness',class_name:'Monk',subclass_name:'Warrior of the Open Hand',level:6},
  {id:'bard',effect:'cutting_words',class_name:'Bard',subclass_name:'College of Lore',level:5}
 ]){
  await fixture.create({...scenario,charisma:12,wisdom:12});
  const page=await context.newPage(),requests=[];
  await page.route('http://dnd.test/**',async route=>{
   const request=route.request();
   if(request.method()==='POST'){
    requests.push(request.url());
    assert.equal(new URL(request.url()).pathname,`/api/character/${scenario.id}/class-action`);
    const data=Object.fromEntries(new URLSearchParams(request.postData()));
    try{
     const result=await dispatch(scenario.id,data);
     result.outcome=t(result.outcome);
     await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    }catch(error){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:t(error.message)})});}
   }else{
    const c=await fixture.character(scenario.id),r=await fixture.resources(scenario.id);
    const panel=renderSubclassActionPanel(c,r,t);
    await route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><span data-hp-value>${c.hp_current} / ${c.hp_max}</span><span data-temp-hp-value>${c.temp_hp}</span><input data-temp-hp-input value="${c.temp_hp}"><main>${panel}${panel}</main>`});
   }
  });
  const load=async()=>{await page.goto(`http://dnd.test/character/${scenario.id}`);await page.addScriptTag({content:ui});};
  await load();
  const form=page.locator(`[data-subclass-action="${scenario.effect}"]`).first();
  const confirmation=form.locator('[name="confirmed"]');
  if(await confirmation.count()){
   await form.locator('button').click();assert.equal(requests.length,0,'native required confirmation prevents request');
   await confirmation.check();
  }
  await form.locator('button').click();
  await page.waitForFunction(()=>!document.querySelector('form[aria-busy]'));
  assert.equal(requests.length,1);
  assert.equal(await page.locator('.dice-tray.is-error').count(),0);
  const state=await fixture.character(scenario.id);
  if(scenario.effect==='dark_blessing'){
   assert.equal(state.temp_hp,7);
   assert.equal(await page.locator('[data-temp-hp-value]').textContent(),'7');
   assert.equal(await page.locator('[data-temp-hp-input]').inputValue(),'7');
  }else{
   assert.equal(await page.locator(`[data-subclass-action="${scenario.effect}"] button:disabled`).count(),2);
   const key=scenario.effect==='dark_luck'?'subclass:fiend:dark-luck':scenario.effect==='wholeness'?'subclass:open-hand:wholeness':'class:bard:bardic-inspiration';
   for(const text of await page.locator(`[data-resource-key="${key}"]`).allTextContents())assert.equal(text,'0 / 1');
   assert.equal(await page.locator(`[data-resource-empty="${key}"]:visible`).count(),2);
   if(scenario.effect==='wholeness'){
    assert.ok(state.hp_current>10);
    assert.equal(await page.locator('[data-hp-value]').textContent(),`${state.hp_current} / 30`);
   }
  }
  if(await confirmation.count())assert.equal(await confirmation.isChecked(),false);
  await load();
  if(scenario.effect!=='dark_blessing'){
   assert.equal(await page.locator(`[data-subclass-action="${scenario.effect}"] button:disabled`).count(),2,'exhaustion persists after refresh');
   await fixture.restCharacter(scenario.id,scenario.effect==='cutting_words'?'short':'long');
   await load();
   assert.equal(await page.locator(`[data-subclass-action="${scenario.effect}"] button:disabled`).count(),0,'rest re-enables both panels');
  }else assert.equal(await page.locator('[data-temp-hp-value]').textContent(),'7');
  console.log(`PASS ${scenario.effect}: browser -> dispatcher -> PostgreSQL engine -> UI -> refresh/rest`);
  await page.close();
 }
}finally{await browser.close();await fixture.db.close();}
