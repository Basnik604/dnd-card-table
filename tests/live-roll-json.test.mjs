import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const server=readFileSync(new URL("../src/web/server.mjs",import.meta.url),"utf8");
const ui=readFileSync(new URL("../src/web/assets/table-ui.js",import.meta.url),"utf8");
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;

test("live-roll URL is not shadowed by the hidden action control",()=>{
  const statement=ui.match(/const url=new URL\([^\n]+;/)?.[0];
  assert.ok(statement);
  const resolve=new Function("form","location","document",`${statement}; return url.href;`);
  const location={href:"http://localhost:3000/character/cleric-1"};
  const document={baseURI:location.href};
  const form={
    action:{toString:()=>"[object HTMLInputElement]"},
    getAttribute:name=>name==="action"?"/character/cleric-1/class-action":null
  };
  assert.equal(resolve(form,location,document),"http://localhost:3000/character/cleric-1/class-action");
  for(const path of ["/roll","/character/cleric-1/concentration/check"]){
    assert.equal(resolve({getAttribute:()=>path},location,document),`http://localhost:3000${path}`);
  }
  assert.equal(resolve({getAttribute:()=>null},location,document),location.href);
});

function extractWantsJson(){
  const start=server.indexOf("function wantsJson(req)");
  const end=server.indexOf("async function rollPage",start);
  assert.ok(start>=0 && end>start,"wantsJson source must exist");
  const chunk=server.slice(start,end);
  return new Function(`${chunk}; return wantsJson;`)();
}

test("wantsJson accepts explicit live-roll response flag",()=>{
  const wantsJson=extractWantsJson();
  assert.equal(wantsJson({headers:{accept:"application/json"},url:"/x"}),true);
  assert.equal(wantsJson({headers:{accept:"text/html"},url:"/x?_response=json"}),true);
  assert.equal(wantsJson({headers:{accept:"text/html"},url:"/x",__dndWantsJson:true}),true);
  assert.equal(wantsJson({headers:{accept:"text/html"},url:"/api/character/c/class-action"}),true);
  assert.equal(wantsJson({headers:{accept:"text/html"},url:"/x"}),false);
});

test("live-roll fetch sends explicit JSON flag in POST body and validates content type",()=>{
  assert.match(ui,/body\.set\('_response','json'\)/);
  assert.match(ui,/requestUrl\.pathname='\/api'\+requestUrl\.pathname/);
  assert.match(ui,/redirect:'error'/);
  assert.doesNotMatch(ui,/searchParams\.set\('_response','json'\)/);
  assert.match(ui,/content-type/);
  assert.match(ui,/HTML page instead of roll data/);
});

test("parseForm promotes POST response flag onto the request",()=>{
  assert.match(server,/params\.get\("_response"\)==="json"\) req\.__dndWantsJson=true/);
});


test("dedicated class-action live-roll API cannot redirect to the character HTML page",()=>{
  assert.match(server,/apiClassActionMatch=url\.pathname\.match\(\/\^\\\/api\\\/character/);
  assert.match(server,/if\(!result\) throw new Error\("This class action completed without live-roll data"\)/);
  assert.match(server,/json\(res,200,result\);return;/);
  assert.ok(server.includes(`D&D Card Table v${version}`));
  assert.ok(server.includes(`table-ui.js?v=${version}`));
});
