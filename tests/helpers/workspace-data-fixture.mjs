import {tabletopFixture} from './tabletop-fixture.mjs';
import {createTabletopHandler,LOCAL_GM} from '../../src/web/tabletop.mjs';
import {projectCharacterPanel} from '../../src/web/workspace-character.mjs';
import {adjustCharacterHitPoints} from '../../src/web/combat-state.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
export async function workspaceDataFixture(){
 const f=await tabletopFixture();await f.db.exec(`ALTER TABLE characters ADD hp_current int DEFAULT 10,ADD hp_max int DEFAULT 20,ADD temp_hp int DEFAULT 0,ADD feature_choices jsonb DEFAULT '{}',ADD updated_at timestamptz;CREATE TABLE encounter_combatants(character_id uuid,hp_current int,hp_max int,updated_at timestamptz);`);
 const character='12345678-1234-4234-8234-123456789abc';await f.sql`INSERT INTO characters(id,name,class_name,level) VALUES(${character},'Мастер проверок','Wizard',3)`;
 const session=await f.store.createSession(LOCAL_GM,'Панели данных'),location=await f.store.createLocation(session.id,LOCAL_GM,'Зал');
 const {token}=await f.store.tokens.add(location.scene_id,LOCAL_GM,{kind:'character',source_id:character,x:140,y:140,snap:true,scene_revision:1});
 const npc=(await f.store.tokens.add(location.scene_id,LOCAL_GM,{kind:'npc',name:'НИП',x:280,y:140,snap:true,scene_revision:1})).token;
 const html=(res,status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(body);};
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 const layout=({title,content})=>`<html><head><title>${title}</title></head><body><main>${content}</main></body></html>`;
 const panel=async id=>{const [c]=await f.sql`SELECT * FROM characters WHERE id=${id}`;return {status:200,body:layout({title:c.name,content:`<div class="sheet-vitals"><p data-hp-value>${c.hp_current} / ${c.hp_max}</p><form action="/character/${id}/hp" method="post"><input name="delta" value="-1"><button>HP Apply</button></form><form action="/character/${id}/hp" method="post"><input name="delta" value="2"><button>Heal</button></form></div><section class="sheet-pane" data-sheet-pane="features"><form action="/character/${id}/feature" method="post"><input name="draft" value=""></form><p>FEATURES</p></section><div data-workspace-character-resources>RESOURCE</div><section class="sheet-pane" data-sheet-pane="spells"><p data-hp-value>${c.hp_current} / ${c.hp_max}</p><p>SPELLS</p></section><section class="sheet-pane" data-sheet-pane="inventory">INVENTORY</section>`})};};
 let renderCalls=0;const handle=createTabletopHandler({sql:f.sql,layout,html,json,language:()=> 'ru',characterPanel:async(id,name)=>{renderCalls++;const result=await panel(id);return {...result,body:projectCharacterPanel(result.body,name,id)};}});
 const {fileURLToPath}=await import('node:url');const assets=fileURLToPath(new URL('../../src/web/assets/',import.meta.url));
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/assets/')){const name=path.basename(url.pathname);if(!/\.(?:js|mjs|css)$/.test(name)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(path.join(assets,name)));return;}
  if(req.method==='POST'&&url.pathname===`/character/${character}/hp`){let body='';for await(const chunk of req)body+=chunk;await adjustCharacterHitPoints(f.sql,character,new URLSearchParams(body).get('delta'));res.writeHead(303,{Location:'/character/'+character});res.end();return;}
  if(url.pathname==='/character/'+character){const result=await panel(character);html(res,result.status,result.body);return;}
  if(await handle(req,res,url))return;res.writeHead(404);res.end();
 }catch(error){console.error(error);res.writeHead(500);res.end(String(error));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {...f,character,session,location,token,npc,origin:'http://127.0.0.1:'+server.address().port,renderCalls:()=>renderCalls,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await f.close();}};
}
