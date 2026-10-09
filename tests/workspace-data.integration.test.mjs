import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceDataFixture} from './helpers/workspace-data-fixture.mjs';
test('panel endpoints authorize scene/session/token before invoking the shared sheet renderer',async()=>{
 const f=await workspaceDataFixture();try{
  const path=`/tabletop/${f.session.id}/scenes/${f.location.scene_id}/tokens/${f.token.id}/panels/abilities`;
  const okay=await fetch(f.origin+path);assert.equal(okay.status,200);assert.match(await okay.text(),/FEATURES/);assert.equal(okay.headers.get('cache-control'),'no-store');const calls=f.renderCalls();
  for(const wrong of [path.replace(f.session.id,'00000000-0000-4000-8000-000000000000'),path.replace(f.token.id,f.npc.id),path.replace('/abilities','/notes')])assert.equal((await fetch(f.origin+wrong)).status,404);
  assert.equal(f.renderCalls(),calls);
  const [before]=await f.sql`SELECT hp_current FROM characters WHERE id=${f.character}`;
  await fetch(f.origin+'/character/'+f.character+'/hp',{method:'POST',body:new URLSearchParams({delta:'-2'})});
  const after=await fetch(f.origin+path);assert.match(await after.text(),/8 \/ 20/);assert.equal(before.hp_current,10);
 }finally{await f.close();}
});
