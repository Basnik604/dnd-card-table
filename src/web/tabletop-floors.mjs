import {randomUUID} from 'node:crypto';

export function createFloorStore(sql,{scene,requireGM,ErrorType,defaultGrid}) {
  const fail=(message,status=400)=>{throw new ErrorType(message,status);};
  const missing='Session or location not found.';
  const stale='The floor list or location changed. Reload the page.';
  const id=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))fail(missing,404);return value;};
  async function lockLocation(db,locationId,principal,revision) {
    const rows=await db`SELECT * FROM vtt_locations WHERE id=${id(locationId)} FOR UPDATE`;
    if(!rows.length)fail(missing,404);
    await requireGM(db,rows[0].session_id,principal);
    if(revision!==undefined&&rows[0].revision!==revision)fail(stale,409);
    return rows[0];
  }
  async function list(sessionId,principal) {
    await requireGM(sql,sessionId,principal);
    return sql`SELECT sc.id,sc.session_id,sc.location_id,sc.name AS floor_name,sc.sort_order,sc.revision,
      l.name AS location_name,l.revision AS location_revision,(sc.map_bytes IS NOT NULL) AS has_map,
      (SELECT COUNT(*)::int FROM vtt_tokens t WHERE t.scene_id=sc.id) AS token_count
      FROM vtt_scenes sc JOIN vtt_locations l ON l.id=sc.location_id WHERE sc.session_id=${sessionId}
      ORDER BY l.created_at,l.id,sc.sort_order,sc.id`;
  }
  async function create(locationId,principal,data) {
    if(typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>120)fail('Enter a name from 1 to 120 characters.');
    if(!Number.isSafeInteger(data.location_revision))fail('Invalid request.');
    return sql.begin(async tx=>{
      const location=await lockLocation(tx,locationId,principal,data.location_revision);
      const entries=await tx`SELECT sort_order FROM vtt_scenes WHERE location_id=${location.id} ORDER BY sort_order`;
      if(entries.length>=50)fail('This location already has 50 floors.');
      const sceneId=randomUUID(),order=(entries.at(-1)?.sort_order??-1)+1;
      await tx`INSERT INTO vtt_scenes(id,session_id,location_id,name,sort_order,grid) VALUES(${sceneId},${location.session_id},${location.id},${data.name.trim()},${order},${tx.json(defaultGrid)})`;
      await tx`UPDATE vtt_locations SET revision=revision+1,updated_at=NOW() WHERE id=${location.id}`;
      return scene(tx,sceneId,principal);
    });
  }
  async function reorder(sceneId,principal,data) {
    if(!['up','down'].includes(data.direction)||!Number.isSafeInteger(data.location_revision))fail('Invalid request.');
    return sql.begin(async tx=>{
      const initial=await scene(tx,sceneId,principal);
      await lockLocation(tx,initial.location_id,principal,data.location_revision);
      const entries=(await tx`SELECT id,sort_order FROM vtt_scenes WHERE location_id=${initial.location_id} ORDER BY id FOR UPDATE`).sort((a,b)=>a.sort_order-b.sort_order);
      const index=entries.findIndex(s=>s.id===sceneId),other=entries[index+(data.direction==='up'?-1:1)];
      if(index<0)fail(missing,404);
      if(other) {
        await tx`UPDATE vtt_scenes SET sort_order=-1 WHERE id=${sceneId}`;
        await tx`UPDATE vtt_scenes SET sort_order=${entries[index].sort_order} WHERE id=${other.id}`;
        await tx`UPDATE vtt_scenes SET sort_order=${other.sort_order} WHERE id=${sceneId}`;
        await tx`UPDATE vtt_locations SET revision=revision+1,updated_at=NOW() WHERE id=${initial.location_id}`;
      }
      return scene(tx,sceneId,principal);
    });
  }
  async function remove(sceneId,principal,data) {
    if(!Number.isSafeInteger(data.location_revision)||!Number.isSafeInteger(data.revision))fail('Invalid request.');
    return sql.begin(async tx=>{
      const initial=await scene(tx,sceneId,principal);
      await lockLocation(tx,initial.location_id,principal,data.location_revision);
      await tx`SELECT id FROM vtt_scenes WHERE id=${sceneId} FOR UPDATE`;
      const current=await scene(tx,sceneId,principal);
      if(current.revision!==data.revision)fail('This location changed in another tab. Reload the page before saving again.',409);
      const entries=await tx`SELECT id FROM vtt_scenes WHERE location_id=${current.location_id} ORDER BY sort_order`;
      if(entries.length===1)fail('Keep at least one floor in a location.');
      if((await tx`SELECT id FROM vtt_tokens WHERE scene_id=${sceneId} LIMIT 1`).length)fail('Move or delete the tokens on this floor before deleting it.');
      await tx`DELETE FROM vtt_scenes WHERE id=${sceneId}`;
      await tx`UPDATE vtt_locations SET revision=revision+1,updated_at=NOW() WHERE id=${current.location_id}`;
      return {scene_id:entries.find(s=>s.id!==sceneId).id,location_id:current.location_id,session_id:current.session_id};
    });
  }
  return {lockLocation,list,create,reorder,remove};
}
