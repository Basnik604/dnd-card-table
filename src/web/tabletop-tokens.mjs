import {randomUUID} from 'node:crypto';
import {TOKEN_ICONS,characterIcon,creatureIcon,creatureSize,tokenPosition} from './assets/tabletop-token-model.mjs';
import {displayText,localizedAliases} from '../localization/runtime.mjs';
import {englishAliasesForRussianQuery} from './assets/game-ru.mjs';
import {tokenArtLibrary,publicTokenArt} from './tabletop-art.mjs';

export function createTokenStore(sql,{scene,ErrorType,decodeImage,artLibrary=tokenArtLibrary}) {
  const fail=(text,status=400)=>{throw new ErrorType(text,status);};
  const id=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))fail('Token not found.',404);return value;};
  const name=value=>{if(typeof value!=='string'||!value.trim()||value.trim().length>120)fail('Enter a name from 1 to 120 characters.');return value.trim();};
  const number=value=>{if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>100000)fail('Invalid token settings.');return value;};
  const numeric=row=>({...row,x:Number(row.x),y:Number(row.y),size_cells:Number(row.size_cells)});
  async function lockedScene(db,sceneId,principal,revision) {
    await db`SELECT id FROM vtt_scenes WHERE id=${id(sceneId)} FOR UPDATE`;
    const current=await scene(db,sceneId,principal);
    if(current.revision!==revision)fail('The map changed. Reload the page before moving tokens.',409);
    return current;
  }
  async function rows(db,sceneId) {
    const result=await db`SELECT t.id,t.scene_id,t.session_id,t.kind,t.character_id,t.entity_id,t.name,t.ordinal,t.icon_type,t.icon_color,t.relation,t.border_color,t.size_cells,t.x,t.y,t.image_mode,t.image_revision,t.revision,t.art_id,
      t.art_variant,ce.name_en AS source_name,c.creature_type,ch.class_name,
      (t.image_bytes IS NOT NULL) AS has_custom_image,
      (t.image_mode='custom' AND t.image_bytes IS NOT NULL OR t.image_mode='auto' AND ch.portrait_bytes IS NOT NULL) AS has_image
      FROM vtt_tokens t LEFT JOIN characters ch ON ch.id=t.character_id
      LEFT JOIN content_entities ce ON ce.id=t.entity_id LEFT JOIN creatures c ON c.entity_id=t.entity_id
      WHERE t.scene_id=${sceneId} ORDER BY t.created_at,t.id`;
    return result.map(row=>{
      const auto=artLibrary.suggest({name:row.source_name||row.name,kind:row.kind,className:row.class_name,creatureType:row.creature_type},row.art_variant);
      const selected=artLibrary.get(row.art_id),art=row.image_mode==='catalog'?selected:row.image_mode==='auto'&&!row.has_image?auto:null;
      return {...numeric(row),art:publicTokenArt(art,sceneId),auto_art:publicTokenArt(auto,sceneId),selected_art:publicTokenArt(selected,sceneId),art_missing:row.image_mode==='catalog'&&!selected};
    });
  }
  async function get(db,tokenId,principal) {
    const found=await db`SELECT * FROM vtt_tokens WHERE id=${id(tokenId)}`;
    if(!found.length)fail('Token not found.',404);
    await scene(db,found[0].scene_id,principal);
    return numeric(found[0]);
  }
  async function list(sceneId,principal) {await scene(sql,sceneId,principal);return rows(sql,sceneId);}
  async function source(db,kind,sourceId,lang) {
    id(sourceId);
    if(kind==='character') {
      const result=await db`SELECT id,name,class_name FROM characters WHERE id=${sourceId}`;
      if(!result.length)fail('Source no longer exists.',404);
      return {...result[0],icon_type:characterIcon(result[0].class_name),size_cells:1};
    }
    const result=await db`SELECT ce.id,ce.name_en,ce.ruleset,c.size,c.creature_type FROM content_entities ce JOIN creatures c ON c.entity_id=ce.id WHERE ce.id=${sourceId} AND ce.entity_type='creature'`;
    if(!result.length)fail('Source no longer exists.',404);
    const entry=result[0];
    return {...entry,name:displayText(entry.name_en,{language:lang,kind:'creature',ruleset:entry.ruleset}),icon_type:creatureIcon(entry.creature_type),size_cells:creatureSize(entry.size)};
  }
  async function search(sceneId,principal,kind,q,lang='ru') {
    await scene(sql,sceneId,principal);
    const term=String(q||'').trim().slice(0,80),pattern='%'+term+'%';
    if(kind==='character')return sql`SELECT id,name,class_name,level FROM characters WHERE name ILIKE ${pattern} ORDER BY name,id LIMIT 40`;
    if(kind!=='creature')fail('Invalid token settings.');
    const aliases=term?[...new Set([...englishAliasesForRussianQuery(term,{kind:'creature',limit:80}),...localizedAliases(term,{kind:'creature'})])].slice(0,100):[];
    const result=await sql`SELECT ce.id,ce.name_en,ce.ruleset,c.size,c.creature_type FROM content_entities ce JOIN creatures c ON c.entity_id=ce.id
      WHERE ce.entity_type='creature' AND (ce.name_en ILIKE ${pattern} OR LOWER(ce.name_en) IN (SELECT LOWER(value) FROM jsonb_array_elements_text(${sql.json(aliases)}::jsonb)))
      ORDER BY ce.name_en,ce.ruleset,ce.id LIMIT 40`;
    return result.map(entry=>({...entry,name:displayText(entry.name_en,{language:lang,kind:'creature',ruleset:entry.ruleset}),size_cells:creatureSize(entry.size)}));
  }
  async function add(sceneId,principal,data,lang='ru') {
    if(!['character','creature','npc'].includes(data.kind)||typeof data.snap!=='boolean')fail('Invalid token settings.');
    number(data.x);number(data.y);
    return sql.begin(async tx=>{
      const current=await lockedScene(tx,sceneId,principal,data.scene_revision);
      if(data.kind==='character') {
        const existing=await tx`SELECT id FROM vtt_tokens WHERE scene_id=${sceneId} AND character_id=${id(data.source_id)}`;
        if(existing.length)return {token:(await rows(tx,sceneId)).find(t=>t.id===existing[0].id),created:false};
      }
      const count=await tx`SELECT COUNT(*)::int AS n FROM vtt_tokens WHERE scene_id=${sceneId}`;
      if(count[0].n>=200)fail('This map already has 200 tokens.');
      const entry=data.kind==='npc'?{name:name(data.name),icon_type:'npc',size_cells:1}:await source(tx,data.kind,data.source_id,lang);
      let ordinal=null;
      if(data.kind==='creature') {
        const counter=await tx`INSERT INTO vtt_token_counters(scene_id,source_key,last_number) VALUES(${sceneId},${data.source_id},1)
          ON CONFLICT(scene_id,source_key) DO UPDATE SET last_number=vtt_token_counters.last_number+1 RETURNING last_number`;
        ordinal=counter[0].last_number;
      }
      const tokenId=randomUUID();let position=tokenPosition(current,entry.size_cells,data.x,data.y,data.snap);
      const occupied=await tx`SELECT x,y,size_cells FROM vtt_tokens WHERE scene_id=${sceneId}`;
      const cell=current.grid.cellSize,extent=entry.size_cells*cell;
      const free=p=>!occupied.some(other=>p.x<Number(other.x)+Number(other.size_cells)*cell&&p.x+extent>Number(other.x)&&p.y<Number(other.y)+Number(other.size_cells)*cell&&p.y+extent>Number(other.y));
      if(!free(position)) {
        const origin=position;
        outer:for(let ring=1;ring<=12;ring++)for(let dy=-ring;dy<=ring;dy++)for(let dx=-ring;dx<=ring;dx++) {
          if(Math.max(Math.abs(dx),Math.abs(dy))!==ring)continue;
          const p=tokenPosition(current,entry.size_cells,origin.x+dx*cell,origin.y+dy*cell,data.snap);
          if(free(p)){position=p;break outer;}
        }
      }
      const relation=data.kind==='character'?'friendly':data.kind==='creature'?'hostile':'neutral';
      const color={friendly:'#74a7df',hostile:'#d87979',neutral:'#d4b16a'}[relation];
      await tx`INSERT INTO vtt_tokens(id,scene_id,session_id,kind,character_id,entity_id,owner_principal_id,name,ordinal,art_variant,icon_type,icon_color,relation,border_color,size_cells,x,y)
        VALUES(${tokenId},${sceneId},${current.session_id},${data.kind},${data.kind==='character'?data.source_id:null},${data.kind==='creature'?data.source_id:null},${data.kind==='character'?principal:null},${String(entry.name).slice(0,120)},${ordinal},${Math.max(0,(ordinal||1)-1)},${entry.icon_type},${TOKEN_ICONS[entry.icon_type].color},${relation},${color},${entry.size_cells},${position.x},${position.y})`;
      return {token:(await rows(tx,sceneId)).find(t=>t.id===tokenId),created:true};
    });
  }
  async function change(tokenId,principal,data,mode='edit') {
    return sql.begin(async tx=>{
      const original=await get(tx,tokenId,principal);
      const current=await lockedScene(tx,original.scene_id,principal,data.scene_revision);
      // Re-read after the scene lock, so simultaneous edits cannot both win.
      const token=await get(tx,tokenId,principal);
      if(token.scene_id!==current.id)fail('This token changed in another tab. Reload the page.',409);
      if(token.revision!==data.revision)fail('This token changed in another tab. Reload the page.',409);
      if(mode==='delete') {await tx`DELETE FROM vtt_tokens WHERE id=${tokenId}`;return {ok:true};}
      if(mode==='move') {
        if(typeof data.snap!=='boolean')fail('Invalid token settings.');
        const p=tokenPosition(current,token.size_cells,number(data.x),number(data.y),data.snap);
        await tx`UPDATE vtt_tokens SET x=${p.x},y=${p.y} WHERE id=${tokenId}`;
      } else if(mode==='edit') {
        const title=name(data.name),size=number(data.size_cells);
        const iconColor=data.icon_color===undefined?token.icon_color:data.icon_color;
        if(typeof iconColor!=='string'||!/^#[0-9a-f]{6}$/i.test(iconColor))fail('Invalid token settings.');
        if(![0.5,1,2,3,4].includes(size)||!Object.hasOwn(TOKEN_ICONS,data.icon_type)||!['friendly','neutral','hostile'].includes(data.relation)||!/^#[0-9a-f]{6}$/i.test(data.border_color)||!['auto','custom','icon','catalog'].includes(data.image_mode))fail('Invalid token settings.');
        if(data.image_mode==='custom'&&!token.image_bytes)fail('Upload a token portrait first.');
        const artId=data.art_id===undefined?token.art_id:data.art_id;
        if(artId!==null&&(typeof artId!=='string'||! /^[a-z0-9][a-z0-9-]{0,47}\/[a-f0-9]{24}$/.test(artId)))fail('Invalid token artwork.');
        if(artId!==token.art_id&&artId!==null&&!artLibrary.get(artId))fail('Token artwork is unavailable.');
        if(data.image_mode==='catalog'&&!artId)fail('Choose token artwork first.');
        const p=tokenPosition(current,size,token.x,token.y,false);
        await tx`UPDATE vtt_tokens SET name=${title},size_cells=${size},icon_type=${data.icon_type},icon_color=${iconColor.toLowerCase()},relation=${data.relation},border_color=${data.border_color.toLowerCase()},image_mode=${data.image_mode},art_id=${artId},x=${p.x},y=${p.y} WHERE id=${tokenId}`;
      } else if(mode==='image') {
        const image=decodeImage(data.data_url);
        if(image.width>512||image.height>512||image.bytes.length>1_500_000)fail('Token portraits must be no larger than 512 pixels.');
        await tx`UPDATE vtt_tokens SET image_bytes=${image.bytes},image_mime=${image.mime},image_mode='custom',image_revision=image_revision+1 WHERE id=${tokenId}`;
      } else if(mode==='remove-image') {
        await tx`UPDATE vtt_tokens SET image_bytes=NULL,image_mime=NULL,image_mode='auto',image_revision=image_revision+1 WHERE id=${tokenId}`;
      } else fail('Invalid token settings.');
      await tx`UPDATE vtt_tokens SET revision=revision+1,updated_at=NOW() WHERE id=${tokenId}`;
      return {token:(await rows(tx,token.scene_id)).find(t=>t.id===tokenId)};
    });
  }
  async function fitPositions(db,current) {
    const tokens=await db`SELECT id,x,y,size_cells FROM vtt_tokens WHERE scene_id=${current.id}`;
    for(const token of tokens) {
      const p=tokenPosition(current,Number(token.size_cells),Number(token.x),Number(token.y),false);
      if(p.x!==Number(token.x)||p.y!==Number(token.y))await db`UPDATE vtt_tokens SET x=${p.x},y=${p.y},revision=revision+1,updated_at=NOW() WHERE id=${token.id}`;
    }
  }
  async function transfer(sceneId,principal,data) {
    id(sceneId);id(data.target_scene_id);
    if(sceneId===data.target_scene_id)fail('Choose a different floor.');
    if(!Array.isArray(data.tokens)||!data.tokens.length||data.tokens.length>200||typeof data.snap!=='boolean')fail('Choose at least one token to transfer.');
    for(const row of data.tokens)if(!row||!Number.isSafeInteger(row.revision)||row.revision<1)fail('Invalid token settings.');else id(row.id);
    if(new Set(data.tokens.map(row=>row.id)).size!==data.tokens.length)fail('Invalid token settings.');
    return sql.begin(async tx=>{
      // Every transfer locks both scenes in UUID order. Adds/moves take the
      // scene lock too, so capacity, duplicate PCs and spawn cells stay atomic.
      const sceneIds=[sceneId,data.target_scene_id].sort();
      for(const sceneId of sceneIds)await tx`SELECT id FROM vtt_scenes WHERE id=${sceneId} FOR UPDATE`;
      const from=await scene(tx,sceneId,principal),target=await scene(tx,data.target_scene_id,principal);
      if(from.session_id!==target.session_id)fail('Tokens can only move within the same session.');
      if(from.revision!==data.scene_revision||target.revision!==data.target_revision)fail('The map changed. Reload the page before moving tokens.',409);
      const source=await tx`SELECT id,kind,entity_id,character_id,ordinal,x,y,size_cells,revision FROM vtt_tokens WHERE scene_id=${sceneId}`;
      const moving=data.tokens.map(entry=>{
        const token=source.find(token=>token.id===entry.id);
        if(!token||token.revision!==entry.revision)fail('This token changed in another tab. Reload the page.',409);
        return numeric(token);
      });
      const occupied=(await tx`SELECT id,character_id,x,y,size_cells FROM vtt_tokens WHERE scene_id=${target.id}`).map(numeric);
      if(occupied.length+moving.length>200)fail('The destination would exceed 200 tokens.');
      if(moving.some(token=>token.character_id&&occupied.some(other=>other.character_id===token.character_id)))fail('A character is already on the destination floor. No tokens were transferred.',409);
      const free=(p,size)=>!occupied.some(other=>p.x<other.x+other.size_cells*target.grid.cellSize&&p.x+size*target.grid.cellSize>other.x&&p.y<other.y+other.size_cells*target.grid.cellSize&&p.y+size*target.grid.cellSize>other.y);
      for(const token of moving) {
        const history=(await tx`SELECT x,y,ordinal FROM vtt_token_positions WHERE token_id=${token.id} AND scene_id=${target.id}`)[0];
        const cell=target.grid.cellSize,size=token.size_cells;
        const preferred=tokenPosition(target,size,history?Number(history.x):((target.map_width||2000)-size*cell)/2,history?Number(history.y):((target.map_height||1400)-size*cell)/2,history?false:data.snap);
        let position=free(preferred,size)?preferred:null;
        // Expanding rings find a nearby free cell without scanning/sorting a
        // whole high-resolution map for every arriving party member.
        if(!position) {
          const limit=Math.ceil(Math.max(target.map_width||2000,target.map_height||1400)/cell)+1,seen=new Set();
          search:for(let ring=1;ring<=limit;ring++)for(let offset=-ring;offset<=ring;offset++)for(const [dx,dy] of [[offset,-ring],[offset,ring],[-ring,offset],[ring,offset]]) {
              const p=tokenPosition(target,size,preferred.x+dx*cell,preferred.y+dy*cell,data.snap),key=p.x+':'+p.y;
              if(seen.has(key))continue;seen.add(key);
              if(free(p,size)){position=p;break search;}
            }
        }
        if(!position)fail('There is no free space for the selected tokens on that floor.');
        let ordinal=token.ordinal;
        if(token.kind==='creature') {
          if(history?.ordinal)ordinal=history.ordinal;
          else {
            const counter=await tx`INSERT INTO vtt_token_counters(scene_id,source_key,last_number) VALUES(${target.id},${token.entity_id||'orphan:'+token.id},1)
              ON CONFLICT(scene_id,source_key) DO UPDATE SET last_number=vtt_token_counters.last_number+1 RETURNING last_number`;
            ordinal=counter[0].last_number;
          }
        }
        await tx`INSERT INTO vtt_token_positions(token_id,scene_id,x,y,ordinal) VALUES(${token.id},${from.id},${token.x},${token.y},${token.ordinal})
          ON CONFLICT(token_id,scene_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,ordinal=EXCLUDED.ordinal`;
        await tx`UPDATE vtt_tokens SET scene_id=${target.id},x=${position.x},y=${position.y},ordinal=${ordinal},revision=revision+1,updated_at=NOW() WHERE id=${token.id}`;
        occupied.push({...token,...position});
      }
      return {tokens:await rows(tx,from.id),transferred:moving.length,target_token_count:occupied.length,target_scene_id:target.id,location_id:target.location_id,session_id:target.session_id};
    });
  }
  async function image(tokenId,principal) {
    const token=await get(sql,tokenId,principal);
    if(token.image_mode==='custom'&&token.image_bytes)return {bytes:Buffer.from(token.image_bytes),mime:token.image_mime};
    if(token.image_mode==='auto'&&token.character_id) {
      const chars=await sql`SELECT portrait_bytes,portrait_mime FROM characters WHERE id=${token.character_id}`;
      if(chars[0]?.portrait_bytes)return {bytes:Buffer.from(chars[0].portrait_bytes),mime:chars[0].portrait_mime};
    }
    fail('Token portrait not found.',404);
  }
  async function artSearch(sceneId,principal,options) {
    await scene(sql,sceneId,principal);const result=artLibrary.search(options);
    const {entries,...meta}=result;return {...meta,items:entries.map(entry=>publicTokenArt(entry,sceneId))};
  }
  async function artImage(sceneId,principal,key) {
    await scene(sql,sceneId,principal);const image=artLibrary.image(key);
    if(!image)fail('Token artwork is unavailable.',404);return image;
  }
  return {list,search,add,change,image,fitPositions,transfer,artSearch,artImage};
}
