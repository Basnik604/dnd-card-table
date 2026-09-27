// Optional real-browser regression; not part of npm test.
// npm install --no-save --package-lock=false playwright
// npx playwright install chromium
// node tests/live-roll.browser.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serverFunctions} from './helpers/server-functions.mjs';
import {localizeHtml} from '../src/localization/html.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
  args:JSON.parse(process.env.CHROMIUM_ARGS || '["--no-sandbox"]')});
const profileFns=serverFunctions(['abilityModifier','channelDivinityProfile']);
const renderers=serverFunctions(['renderChannelDivinityPanel'],{
  channelDivinityProfile:profileFns.channelDivinityProfile,
  channelDivinityState:()=>({}), signedFormula:(base,n)=>`${base}${n>=0?'+':''}${n}`,
  esc:v=>String(v??''),stateBool:(s,k)=>Boolean(s?.[k]),isPactBladeEligibleItem:()=>false
});
const c={id:'cleric-1',class_name:'Cleric',level:6,wisdom:18,proficiency_bonus:3,subclass_name:'Life Domain'};
const key='class:cleric:channel-divinity';
const panel=localizeHtml(renderers.renderChannelDivinityPanel(c,[{source_key:key,current_value:2,max_value:2}],[],'/'),'ru');
const ui=readFileSync(process.env.LIVE_ROLL_UI || new URL('../src/web/assets/table-ui.js',import.meta.url),'utf8');
const baseline=process.env.EXPECT_BROKEN==='1';
try{
  const context=await browser.newContext({reducedMotion:'reduce'});
  for(const scenario of [
    {name:'Necrotic',selector:'form:has([value="Necrotic"])',effect:'divine_spark',mode:'damage',damage:'Necrotic'},
    {name:'Radiant',selector:'form:has([value="Radiant"])',effect:'divine_spark',mode:'damage',damage:'Radiant'},
    {name:'Healing',selector:'form:has([value="heal"])',effect:'divine_spark',mode:'heal'},
    {name:'Turn Undead',selector:'form:has([value="turn_undead"])',effect:'turn_undead'},
    {name:'Preserve Life',selector:'form:has([value="preserve_life"])',effect:'preserve_life'},
    {name:'Ordinary roll',selector:'#ordinary',path:'/roll'},
    {name:'Concentration',selector:'#concentration',path:'/character/cleric-1/concentration/check'}
  ]){
    if(baseline && scenario.name!=='Necrotic')continue;
    const page=await context.newPage();
    const requests=[];
    await page.route('http://dnd.test/**',async route=>{
      const request=route.request();
      if(request.method()==='POST'){
        requests.push({url:request.url(),body:new URLSearchParams(request.postData())});
        if(baseline){await route.fulfill({status:404,contentType:'text/html',body:'<!DOCTYPE html><p>Page not found</p>'});return;}
        await route.fulfill({contentType:'application/json',body:JSON.stringify({total:9,formula:'1d8+4',parts:['5+4'],dice:[{sides:8,value:5}],effects:scenario.effect?{resource:{key,current:2-requests.length,max:2}}:{}})});
      }else{
        await route.fulfill({contentType:'text/html',body:`<!doctype html>${panel}<form id="ordinary" action="/roll" method="post"><input name="formula" value="1d20"><button>Roll</button></form><form id="concentration" action="/character/cleric-1/concentration/check" data-live-roll method="post"><input name="check_id" value="save-1"><button>Save</button></form>`});
      }
    });
    await page.goto('http://dnd.test/character/cleric-1');
    await page.addScriptTag({content:ui});
    if(scenario.effect)assert.equal(await page.locator(scenario.selector).evaluate(f=>String(f.action)),'[object HTMLInputElement]');
    await page.locator(`${scenario.selector} button`).click();
    await page.waitForFunction(()=>!document.querySelector('form[aria-busy]'));
    assert.equal(requests.length,1);
    if(baseline){
      assert.match(requests[0].url,/HTMLInputElement/);
      assert.match(await page.locator('.dice-detail').textContent(),/HTTP 404/);
      console.log('CONFIRMED original bug: '+requests[0].url+' -> HTTP 404');
    }else{
      assert.equal(new URL(requests[0].url).pathname,scenario.path||'/api/character/cleric-1/class-action');
      assert.equal(requests[0].body.get('_response'),'json');
      assert.equal(await page.locator('.dice-total-row strong').textContent(),'9');
      assert.equal(await page.locator('.dice-tray.is-error').count(),0);
      if(scenario.effect){
        assert.equal(requests[0].body.get('action'),'channel_divinity');
        assert.equal(requests[0].body.get('effect'),scenario.effect);
        if(scenario.mode)assert.equal(requests[0].body.get('mode'),scenario.mode);
        if(scenario.damage)assert.equal(requests[0].body.get('damage_type'),scenario.damage);
        assert.equal(await page.locator('[data-resource-key]').textContent(),'1 / 2');
        await page.locator(`${scenario.selector} button`).click();
        await page.waitForFunction(()=>!document.querySelector('form[aria-busy]'));
        assert.equal(requests.length,2);
        assert.equal(await page.locator('[data-resource-key]').textContent(),'0 / 2');
        assert.equal(await page.locator('[data-spend-resource]:not(:disabled)').count(),0);
      }
      console.log('PASS '+scenario.name);
    }
    await page.close();
  }
}finally{await browser.close();}
