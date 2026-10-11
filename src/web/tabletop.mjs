import {createTacticsStore} from './tabletop-tactics.mjs';
import {createBattleStore} from './tabletop-battle.mjs';
import {createCombatStore} from './tabletop-combat.mjs';
import {createTokenStore} from './tabletop-tokens.mjs';
import {createFloorStore} from './tabletop-floors.mjs';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {tabletopText} from './assets/tabletop-i18n.mjs';
import {renderTabletopHome, renderTabletopSession} from './tabletop-view.mjs';

export const LOCAL_GM = 'local-master';
export const DEFAULT_GRID = Object.freeze({cellSize:70,offsetX:0,offsetY:0,opacity:0.45,color:'#ffffff',visible:true,distance:5,unit:'ft'});
const schema = ['018_tabletop.sql','019_tabletop_tokens.sql','021_tabletop_icon_colors.sql','022_tabletop_floors.sql','023_tabletop_token_art.sql','024_tabletop_combat.sql','025_tabletop_battle.sql','026_tabletop_tactics.sql'].map(file=>readFileSync(new URL('../../db/migrations/'+file,import.meta.url),'utf8')).join('\n');
const missing = 'Session or location not found.';
const stale = 'This location changed in another tab. Reload the page before saving again.';
export class TabletopError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
const fail = (message, status) => { throw new TabletopError(message,status); };
const idValue = value => {
  if(typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) fail(missing,404);
  return value;
};
function nameValue(value) {
  if(typeof value !== 'string' || !value.trim() || value.trim().length>120) fail('Enter a name from 1 to 120 characters.');
  return value.trim();
}
function revisionValue(value) {
  if(!Number.isSafeInteger(value) || value<1) fail('Invalid request.');
  return value;
}
export function validateGrid(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) fail('Invalid grid settings.');
  const out={};
  for(const [key,min,max] of [['cellSize',5,500],['offsetX',-10000,10000],['offsetY',-10000,10000],['opacity',0,1],['distance',0.1,1000]]) {
    const n=input[key];
    if(typeof n!=='number' || !Number.isFinite(n) || n<min || n>max) fail('Invalid grid settings.');
    out[key]=Math.round(n*100)/100;
  }
  if(typeof input.visible!=='boolean' || !/^#[0-9a-f]{6}$/i.test(input.color) || !['ft','m'].includes(input.unit)) fail('Invalid grid settings.');
  return {...out,visible:input.visible,color:input.color.toLowerCase(),unit:input.unit};
}

// Read dimensions from the actual raster header, never from client metadata.
// SVG/HTML and other active document formats are deliberately not image maps.
export function decodeMap(dataUrl) {
  if(typeof dataUrl!=='string' || dataUrl.length>16_800_000) fail('The prepared map exceeds the upload limit. Choose a smaller image.');
  const match=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match) fail('Unsupported image format. Use PNG, JPEG or WebP.');
  const bytes=Buffer.from(match[2],'base64'),mime=match[1];
  if(bytes.length>12_000_000) fail('The prepared map exceeds the upload limit. Choose a smaller image.');
  let width=0,height=0;
  if(mime==='image/png' && bytes.length>=33 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16)==='IHDR') {
    width=bytes.readUInt32BE(16); height=bytes.readUInt32BE(20);
  } else if(mime==='image/webp' && bytes.length>=30 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') {
    const kind=bytes.toString('ascii',12,16);
    if(kind==='VP8X') { width=1+bytes.readUIntLE(24,3); height=1+bytes.readUIntLE(27,3); }
    if(kind==='VP8L' && bytes[20]===0x2f) { const bits=bytes.readUInt32LE(21); width=(bits&0x3fff)+1; height=((bits>>>14)&0x3fff)+1; }
    if(kind==='VP8 ' && bytes[23]===0x9d && bytes[24]===1 && bytes[25]===0x2a) { width=bytes.readUInt16LE(26)&0x3fff; height=bytes.readUInt16LE(28)&0x3fff; }
  } else if(mime==='image/jpeg' && bytes[0]===0xff && bytes[1]===0xd8) {
    let p=2;
    while(p+3<bytes.length) {
      if(bytes[p++]!==0xff) break;
      while(bytes[p]===0xff) p++;
      const marker=bytes[p++];
      if(marker===0xda || marker===0xd9) break;
      if(marker===0x01 || (marker>=0xd0 && marker<=0xd7)) continue;
      if(p+2>bytes.length) break;
      const length=bytes.readUInt16BE(p);
      if(length<2 || p+length>bytes.length) break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length>=7) {
        height=bytes.readUInt16BE(p+3); width=bytes.readUInt16BE(p+5); break;
      }
      p+=length;
    }
  }
  if(!width || !height) fail('The image could not be read.');
  if(width>4096 || height>4096 || width*height>16_777_216) fail('Invalid map dimensions.');
  return {bytes,mime,width,height};
}

export function createTabletopStore(sql,{artLibrary}={}) {
  let initializing;
  async function ensureSchema() {
    if(!initializing) initializing=sql.begin(async tx=>{ await tx.unsafe(schema); }).catch(error=>{ initializing=null; throw error; });
    return initializing;
  }
  async function requireGM(db,sessionId,principal) {
    const rows=await db`SELECT s.*,m.role FROM vtt_sessions s JOIN vtt_session_members m ON m.session_id=s.id
      WHERE s.id=${idValue(sessionId)} AND m.principal_id=${principal}`;
    if(!rows.length) fail(missing,404);
    if(rows[0].role!=='gm') fail('Only the game master can change this table.',403);
    return rows[0];
  }
  async function scene(db,sceneId,principal) {
    const rows=await db`SELECT sc.id,sc.session_id,sc.location_id,sc.name AS floor_name,sc.sort_order,sc.grid,sc.revision,
      sc.map_mime,sc.map_name,sc.map_width,sc.map_height,(sc.map_bytes IS NOT NULL) AS has_map,l.name AS location_name,l.revision AS location_revision,
      EXISTS(SELECT 1 FROM vtt_scenes sibling WHERE sibling.location_id=l.id AND sibling.map_bytes IS NOT NULL) AS location_has_map
      FROM vtt_scenes sc JOIN vtt_locations l ON l.id=sc.location_id WHERE sc.id=${idValue(sceneId)}`;
    if(!rows.length) fail(missing,404);
    await requireGM(db,rows[0].session_id,principal);
    return rows[0];
  }
  const combat=createCombatStore(sql,{scene,ErrorType:TabletopError});
  const tokens=createTokenStore(sql,{scene,ErrorType:TabletopError,decodeImage:decodeMap,artLibrary});
  const floors=createFloorStore(sql,{scene,requireGM,ErrorType:TabletopError,defaultGrid:DEFAULT_GRID});
  async function updateScene(sceneId,principal,payload,mapMode=null) {
    const revision=revisionValue(payload.revision),grid=validateGrid(payload.grid),name=nameValue(payload.name);
    const map=mapMode==='upload'?decodeMap(payload.data_url):null;
    const floorName=payload.floor_name===undefined?undefined:nameValue(payload.floor_name);
    return sql.begin(async tx=>{
      const initial=await scene(tx,sceneId,principal);
      await floors.lockLocation(tx,initial.location_id,principal,payload.location_revision);
      const current=await scene(tx,sceneId,principal);
      if(payload.location_revision===undefined&&name!==current.location_name) {
        const siblings=await tx`SELECT id FROM vtt_scenes WHERE location_id=${current.location_id}`;
        if(siblings.length>1)fail('The floor list or location changed. Reload the page.',409);
      }
      const changed=await tx`UPDATE vtt_scenes SET grid=${tx.json(grid)},revision=revision+1,updated_at=NOW()
        WHERE id=${sceneId} AND revision=${revision} RETURNING id`;
      if(!changed.length) fail(stale,409);
      if(floorName!==undefined)await tx`UPDATE vtt_scenes SET name=${floorName} WHERE id=${sceneId}`;
      if(mapMode==='upload') await tx`UPDATE vtt_scenes SET map_bytes=${map.bytes},map_mime=${map.mime},map_width=${map.width},map_height=${map.height},map_name=${String(payload.file_name||'map').slice(0,180)} WHERE id=${sceneId}`;
      if(mapMode==='remove') await tx`UPDATE vtt_scenes SET map_bytes=NULL,map_mime=NULL,map_name=NULL,map_width=NULL,map_height=NULL WHERE id=${sceneId}`;
      await tx`UPDATE vtt_locations SET name=${name},revision=revision+1,updated_at=NOW() WHERE id=${current.location_id}`;
      await tx`UPDATE vtt_sessions SET updated_at=NOW() WHERE id=${current.session_id}`;
      const updated=await scene(tx,sceneId,principal);
      await tokens.fitPositions(tx,updated);
      return updated;
    });
  }
  return {
    ensureSchema,tokens,floors,combat,battleScene:scene,
    session:(id,p)=>requireGM(sql,id,p),
    scene:(id,p)=>scene(sql,id,p),
    async sessions(principal) {
      return sql`SELECT s.id,s.name,COUNT(l.id)::int AS location_count FROM vtt_sessions s
        JOIN vtt_session_members m ON m.session_id=s.id LEFT JOIN vtt_locations l ON l.session_id=s.id
        WHERE m.principal_id=${principal} AND m.role='gm' GROUP BY s.id ORDER BY s.updated_at DESC,s.id`;
    },
    async createSession(principal,value) {
      const name=nameValue(value),id=randomUUID();
      return sql.begin(async tx=>{
        await tx`INSERT INTO vtt_sessions(id,name,owner_id) VALUES(${id},${name},${principal})`;
        await tx`INSERT INTO vtt_session_members(session_id,principal_id,role) VALUES(${id},${principal},'gm')`;
        return {id,name};
      });
    },
    async renameSession(id,principal,value) {
      const name=nameValue(value);
      return sql.begin(async tx=>{ await requireGM(tx,id,principal); await tx`UPDATE vtt_sessions SET name=${name},updated_at=NOW() WHERE id=${id}`; return {id,name}; });
    },
    async deleteSession(id,principal) {
      return sql.begin(async tx=>{ await requireGM(tx,id,principal); await tx`DELETE FROM vtt_sessions WHERE id=${id}`; });
    },
    async locations(sessionId,principal) {
      await requireGM(sql,sessionId,principal);
      return sql`SELECT l.id,l.name,l.revision,sc.id AS scene_id,
        EXISTS(SELECT 1 FROM vtt_scenes s WHERE s.location_id=l.id AND s.map_bytes IS NOT NULL) AS has_map,
        (SELECT COUNT(*)::int FROM vtt_scenes s WHERE s.location_id=l.id) AS floor_count
        FROM vtt_locations l JOIN LATERAL (SELECT id FROM vtt_scenes WHERE location_id=l.id ORDER BY sort_order,id LIMIT 1) sc ON true
        WHERE l.session_id=${sessionId} ORDER BY l.created_at,l.id`;
    },
    async createLocation(sessionId,principal,value,lang='ru') {
      const name=nameValue(value),id=randomUUID(),sceneId=randomUUID();
      return sql.begin(async tx=>{
        await requireGM(tx,sessionId,principal);
        await tx`INSERT INTO vtt_locations(id,session_id,name) VALUES(${id},${sessionId},${name})`;
        await tx`INSERT INTO vtt_scenes(id,session_id,location_id,name,grid) VALUES(${sceneId},${sessionId},${id},${tabletopText('Ground floor',lang)},${tx.json(DEFAULT_GRID)})`;
        await tx`UPDATE vtt_sessions SET updated_at=NOW() WHERE id=${sessionId}`;
        return {id,scene_id:sceneId};
      });
    },
    updateScene,
    async deleteLocation(id,principal,revision,locationRevision) {
      revisionValue(revision);
      return sql.begin(async tx=>{
        await floors.lockLocation(tx,idValue(id),principal,locationRevision);
        const rows=await tx`SELECT id FROM vtt_scenes WHERE location_id=${id} ORDER BY id FOR UPDATE`;
        if(!rows.length) fail(missing,404);
        if(locationRevision===undefined) {
          if(rows.length>1)fail('The floor list or location changed. Reload the page.',409);
          const current=await scene(tx,rows[0].id,principal);
          if(current.revision!==revision) fail(stale,409);
        }
        await tx`DELETE FROM vtt_locations WHERE id=${id}`;
      });
    },
    async image(sceneId,principal) {
      await scene(sql,sceneId,principal);
      const rows=await sql`SELECT map_bytes,map_mime FROM vtt_scenes WHERE id=${sceneId}`;
      if(!rows[0]?.map_bytes) fail(missing,404);
      return {bytes:Buffer.from(rows[0].map_bytes),mime:rows[0].map_mime};
    }
  };
}

async function readRequest(req,maxBytes=64_000) {
  if(!String(req.headers['content-type']||'').startsWith('application/json')) fail('Invalid request.',415);
  const chunks=[]; let size=0;
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>maxBytes) fail('The prepared map exceeds the upload limit. Choose a smaller image.',413);
    chunks.push(chunk);
  }
  try {
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!data || typeof data!=='object' || Array.isArray(data)) fail('Invalid request.');
    return data;
  } catch(error) { if(error instanceof TabletopError) throw error; fail('Invalid request.'); }
}

export function createTabletopHandler({sql,layout,html,json,language=()=> 'ru',artLibrary,characterPanel,combatProfile}) {
  const store=createTabletopStore(sql,{artLibrary});
  const tactics=createTacticsStore(sql,{scene:store.battleScene,ErrorType:TabletopError});
  const battle=createBattleStore(sql,{scene:store.battleScene,combat:store.combat,ErrorType:TabletopError,profile:combatProfile});
  // The existing application listens on loopback and has no accounts. In 0.29
  // the server assigns one installation-local GM. This is NOT internet auth.
  // Later authentication must supply a verified principal here; never accept
  // a principal/role from the request body or expose legacy routes to players.
  return async function handleTabletop(req,res,url) {
    if(!/^\/(?:tabletop(?:\/|$)|api\/tabletop(?:\/|$)|media\/tabletop(?:\/|$))/.test(url.pathname)) return false;
    const lang=language(req),t=text=>tabletopText(text,lang),principal=LOCAL_GM;
    const isApi=url.pathname.startsWith('/api/');
    try {
      if(!['GET','POST','PUT','DELETE'].includes(req.method)) fail('Invalid request.',405);
      if(req.method!=='GET') {
        if(!isApi || req.headers['x-tabletop-request']!=='1' || req.headers['sec-fetch-site']==='cross-site') fail('This request must come from the game table.',403);
        const origin=req.headers.origin;
        if(origin) {
          let host; try { host=new URL(origin).host; } catch { fail('This request must come from the game table.',403); }
          if(host!==req.headers.host) fail('This request must come from the game table.',403);
        }
      }
      try { await store.ensureSchema(); } catch(error) { console.error({tabletopSchema:error}); fail('The tabletop tables could not be initialized. Check the database connection and permissions, then reload.',503); }
      let match;
      if((match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/tactics$/))&&req.method==='POST'){json(res,200,await tactics.change(match[1],principal,await readRequest(req)));return true;}
      if((match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/battle(?:\/(preview|confirm|vitals))?$/))){
        await store.ensureSchema();
        if(req.method==='GET'&&!match[2]){json(res,200,await battle.read(match[1],principal));return true;}
        if(req.method==='POST'&&match[2]){const input=await readRequest(req);if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid battle action.');const method={preview:'preview',confirm:'confirm',vitals:'configure'}[match[2]];json(res,200,await battle[method](match[1],principal,input));return true;}
      }
      if((match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/combat$/))){
        if(req.method==='GET'){json(res,200,await store.combat.read(match[1],principal));return true;}
        if(req.method==='POST'){json(res,200,await store.combat.change(match[1],principal,await readRequest(req)));return true;}
      }
      if(req.method==='GET'&&(match=url.pathname.match(/^\/tabletop\/([^/]+)\/scenes\/([^/]+)\/tokens\/([^/]+)\/panels\/(inventory|spells|abilities)$/))){
        const session=await store.session(match[1],principal),current=await store.scene(match[2],principal);
        if(current.session_id!==session.id)fail(missing,404);
        const token=(await store.tokens.list(current.id,principal)).find(token=>token.id===match[3]);
        if(!token?.character_id||!characterPanel)fail(missing,404);
        // Only the installation-local master is currently supported. Online must
        // replace this verified server principal and authorize before rendering.
        const result=await characterPanel(token.character_id,match[4]);
        res.setHeader('Cache-Control','no-store');html(res,result.status,result.body);return true;
      }
      if(req.method==='GET' && url.pathname==='/tabletop') {
        html(res,200,layout({title:t('Game Table'),content:renderTabletopHome(await store.sessions(principal),lang)})); return true;
      }
      if(req.method==='GET' && (match=url.pathname.match(/^\/tabletop\/([^/]+)$/))) {
        const session=await store.session(match[1],principal),locations=await store.locations(session.id,principal);
        const requested=url.searchParams.get('location');
        const selected=requested?locations.find(l=>l.id===requested):locations[0];
        if(requested&&!selected) fail(missing,404);
        const floors=await store.floors.list(session.id,principal),requestedScene=url.searchParams.get('scene');
        const picked=requestedScene?floors.find(s=>s.id===requestedScene&&(!requested||s.location_id===selected?.id)):selected?floors.find(s=>s.id===selected.scene_id):null;
        if(requestedScene&&!picked)fail(missing,404);
        const current=picked?await store.scene(picked.id,principal):null;
        html(res,200,layout({title:session.name,userTitle:true,content:renderTabletopSession({session,locations,floors,scene:current,tokens:current?await store.tokens.list(current.id,principal):[]},lang)})); return true;
      }
      if(req.method==='GET' && (match=url.pathname.match(/^\/media\/tabletop\/art\/([^/]+)\/([a-z0-9][a-z0-9-]{0,47})\/([a-f0-9]{24})\.png$/))) {
        const image=await store.tokens.artImage(match[1],principal,match[2]+'/'+match[3]),etag='"'+image.sha256+'"';
        if(req.headers['if-none-match']===etag){res.writeHead(304,{'ETag':etag,'Cache-Control':'private, max-age=3600'});res.end();return true;}
        res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'private, max-age=3600','ETag':etag,'X-Content-Type-Options':'nosniff'});res.end(image.bytes);return true;
      }
      if(req.method==='GET' && (match=url.pathname.match(/^\/media\/tabletop\/tokens\/([^/]+)$/))) {
        const image=await store.tokens.image(match[1],principal);
        res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(image.bytes);return true;
      }
      if(req.method==='GET' && (match=url.pathname.match(/^\/media\/tabletop\/([^/]+)$/))) {
        const image=await store.image(match[1],principal);
        res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(image.bytes); return true;
      }
      if(isApi) {
        if(req.method==='GET'&&(match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/art$/))) {
          const page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1)fail('Invalid request.');
          json(res,200,await store.tokens.artSearch(match[1],principal,{q:url.searchParams.get('q')||'',category:url.searchParams.get('category')||'',page,language:lang}));return true;
        }
        if(req.method==='GET'&&(match=url.pathname.match(/^\/api\/tabletop\/sessions\/([^/]+)\/scenes$/))) {
          json(res,200,{scenes:await store.floors.list(match[1],principal)});return true;
        }
        if(req.method==='POST'&&(match=url.pathname.match(/^\/api\/tabletop\/locations\/([^/]+)\/scenes$/))) {
          const scene=await store.floors.create(match[1],principal,await readRequest(req));
          json(res,201,{url:`/tabletop/${scene.session_id}?location=${scene.location_id}&scene=${scene.id}`});return true;
        }
        if(req.method==='PUT'&&(match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/order$/))) {
          const scene=await store.floors.reorder(match[1],principal,await readRequest(req));
          json(res,200,{url:`/tabletop/${scene.session_id}?location=${scene.location_id}&scene=${scene.id}`});return true;
        }
        if(req.method==='DELETE'&&(match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)$/))) {
          const target=await store.floors.remove(match[1],principal,await readRequest(req));
          json(res,200,{url:`/tabletop/${target.session_id}?location=${target.location_id}&scene=${target.scene_id}`});return true;
        }
        if(req.method==='POST'&&(match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/transfer$/))) {
          const result=await store.tokens.transfer(match[1],principal,await readRequest(req));
          json(res,200,{...result,url:`/tabletop/${result.session_id}?location=${result.location_id}&scene=${result.target_scene_id}`});return true;
        }
        if((match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)\/(tokens|sources)$/))) {
          if(req.method==='GET' && match[2]==='sources') {
            json(res,200,{sources:await store.tokens.search(match[1],principal,url.searchParams.get('kind'),url.searchParams.get('q'),lang)});return true;
          }
          if(req.method==='GET' && match[2]==='tokens') {json(res,200,{tokens:await store.tokens.list(match[1],principal)});return true;}
          if(req.method==='POST' && match[2]==='tokens') {
            const result=await store.tokens.add(match[1],principal,await readRequest(req),lang);json(res,result.created?201:200,result);return true;
          }
        }
        if((match=url.pathname.match(/^\/api\/tabletop\/tokens\/([^/]+)(\/image)?$/))) {
          const mode=match[2]?(req.method==='POST'?'image':req.method==='DELETE'?'remove-image':null):req.method==='DELETE'?'delete':req.method==='PUT'?'edit':null;
          if(mode) {
            const data=await readRequest(req,mode==='image'?2_100_000:64_000);
            const action=mode==='edit'&&data.action==='move'?'move':mode;
            json(res,200,await store.tokens.change(match[1],principal,data,action));return true;
          }
        }
        if(req.method==='POST' && url.pathname==='/api/tabletop/sessions') {
          const data=await readRequest(req),session=await store.createSession(principal,data.name);
          json(res,201,{url:`/tabletop/${session.id}`}); return true;
        }
        if((match=url.pathname.match(/^\/api\/tabletop\/sessions\/([^/]+)$/))) {
          const data=await readRequest(req);
          if(req.method==='PUT') { await store.renameSession(match[1],principal,data.name); json(res,200,{url:`/tabletop/${match[1]}`}); return true; }
          if(req.method==='DELETE') { await store.deleteSession(match[1],principal); json(res,200,{url:'/tabletop'}); return true; }
        }
        if(req.method==='POST' && (match=url.pathname.match(/^\/api\/tabletop\/sessions\/([^/]+)\/locations$/))) {
          const data=await readRequest(req),location=await store.createLocation(match[1],principal,data.name,lang);
          json(res,201,{url:`/tabletop/${match[1]}?location=${location.id}`}); return true;
        }
        if((match=url.pathname.match(/^\/api\/tabletop\/scenes\/([^/]+)(\/map)?$/))) {
          const mode=match[2]?(req.method==='POST'?'upload':req.method==='DELETE'?'remove':null):null;
          if((!match[2] && req.method==='PUT') || mode) {
            const data=await readRequest(req,mode==='upload'?17_000_000:64_000);
            const scene=await store.updateScene(match[1],principal,data,mode);
            json(res,200,{scene,tokens:await store.tokens.list(scene.id,principal)}); return true;
          }
        }
        if(req.method==='DELETE' && (match=url.pathname.match(/^\/api\/tabletop\/locations\/([^/]+)$/))) {
          const data=await readRequest(req); await store.deleteLocation(match[1],principal,data.revision,data.location_revision); json(res,200,{ok:true}); return true;
        }
      }
      fail(missing,404);
    } catch(error) {
      const known=error instanceof TabletopError,status=known?error.status:500;
      if(!known) console.error('Tabletop:',error);
      const message=t(known?error.message:'Could not save the table. Please try again.');
      if(isApi) json(res,status,{error:message});
      else html(res,status,layout({title:t('Game Table'),content:`<div class="empty" data-i18n-skip><p>${message}</p><a class="button" href="/tabletop">${t('Back to sessions')}</a></div>`}));
      return true;
    }
  };
}
