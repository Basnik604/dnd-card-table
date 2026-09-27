import {PGlite} from '@electric-sql/pglite';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOKEN_ICONS} from '../../src/web/assets/tabletop-icon-art.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createTabletopStore,createTabletopHandler} from '../../src/web/tabletop.mjs';
import {serverFunctions} from './server-functions.mjs';
import {localizeHtml} from '../../src/localization/html.mjs';
import {normalizeLanguage,translateText} from '../../src/web/assets/i18n-core.mjs';

export function tabletopSql(db) {
  const sql=async(strings,...values)=>(await db.query(strings.reduce((s,part,index)=>s+(index?'$'+index:'')+part,''),values)).rows;
  sql.json=value=>JSON.stringify(value);
  sql.unsafe=source=>db.exec(source);
  sql.begin=callback=>db.transaction(tx=>callback(tabletopSql(tx)));
  return sql;
}
export async function tabletopFixture({server=false,artLibrary}={}) {
  const db=new PGlite(),sql=tabletopSql(db),store=createTabletopStore(sql,{artLibrary});
  await db.exec(`CREATE TABLE characters(id uuid PRIMARY KEY,name text,class_name text,level int,portrait_bytes bytea,portrait_mime text);
    CREATE TABLE content_entities(id uuid PRIMARY KEY,name_en text,entity_type text,ruleset text);
    CREATE TABLE creatures(entity_id uuid PRIMARY KEY REFERENCES content_entities(id) ON DELETE CASCADE,size text,creature_type text);`);
  await store.ensureSchema();
  let listener;
  if(server) {
    const displayContext=new AsyncLocalStorage();
    const {layout,html,json,requestLanguage}=serverFunctions(['esc','layout','html','json','requestLanguage'],{displayContext,TABS:[],localizeHtml,translateText,normalizeLanguage});
    const {serveThemeAsset}=serverFunctions(['THEME_ASSETS','serveThemeAsset'],{TOKEN_ICONS,readFileSync,path,WEB_DIR:fileURLToPath(new URL('../../src/web/',import.meta.url))});
    const handle=createTabletopHandler({sql,layout,html,json,language:requestLanguage,artLibrary});
    listener=http.createServer((req,res)=>displayContext.run({language:requestLanguage(req)},async()=>{
      try {
        const url=new URL(req.url,`http://${req.headers.host}`);
        if(serveThemeAsset(res,url.pathname))return;
        if(url.pathname==='/api/localization/dictionary') {json(res,200,{dictionary:{}});return;}
        if(await handle(req,res,url))return;
        res.writeHead(404);res.end();
      } catch(error) {console.error(error);res.writeHead(500);res.end('Test server error');}
    }));
    await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  }
  return {db,sql,store,origin:listener?`http://127.0.0.1:${listener.address().port}`:null,
    close:async()=>{if(listener){listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));}await db.close();}};
}
