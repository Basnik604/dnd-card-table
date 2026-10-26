import test from 'node:test';import assert from 'node:assert/strict';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';import {LOCAL_GM} from '../src/web/tabletop.mjs';
test('combat persists scene turns, protects revisions and leaves map/token records intact',async()=>{
 const f=await tabletopFixture();try{
 const s=await f.store.createSession(LOCAL_GM,'Combat'),l=await f.store.createLocation(s.id,LOCAL_GM,'Arena');
 const a=(await f.store.tokens.add(l.scene_id,LOCAL_GM,{kind:'npc',name:'A',x:140,y:140,snap:true,scene_revision:1})).token;
 const b=(await f.store.tokens.add(l.scene_id,LOCAL_GM,{kind:'npc',name:'B',x:280,y:140,snap:true,scene_revision:1})).token;
 const scene=await f.store.scene(l.scene_id,LOCAL_GM),tokens=await f.store.tokens.list(l.scene_id,LOCAL_GM);
 let c=await f.store.combat.read(l.scene_id,LOCAL_GM);assert.equal(c.revision,1);assert.equal(c.round,0);
 const change=async(action,entries)=>c=await f.store.combat.change(l.scene_id,LOCAL_GM,{action,entries,revision:c.revision});
 await change('set',[{token_id:b.id,initiative:8},{token_id:a.id,initiative:18}]);assert.equal(c.entries[0].token_id,a.id);
 await change('start');assert.equal(c.active_token_id,a.id);assert.equal(c.round,1);
 await assert.rejects(()=>change('previous'),e=>e.status===400);
 await change('next');assert.equal(c.active_token_id,b.id);await change('next');assert.equal(c.round,2);await change('previous');assert.equal(c.round,1);assert.equal(c.active_token_id,b.id);
 const stored=await f.store.combat.read(l.scene_id,LOCAL_GM);assert.deepEqual(stored,c);
 await assert.rejects(()=>f.store.combat.change(l.scene_id,LOCAL_GM,{action:'stop',revision:1}),e=>e.status===409);
 await assert.rejects(()=>f.store.combat.read(l.scene_id,'outsider'),e=>e.status===404);
 await assert.rejects(()=>change('set',[{token_id:a.id,initiative:18},{token_id:a.id,initiative:8}]),e=>e.status===400);
 await assert.rejects(()=>change('set',[{token_id:a.id,initiative:NaN}]),e=>e.status===400);
 assert.deepEqual(await f.store.scene(l.scene_id,LOCAL_GM),scene);assert.deepEqual(await f.store.tokens.list(l.scene_id,LOCAL_GM),tokens);
 await change('stop');assert.equal(c.round,0);assert.equal(c.active_token_id,null);assert.equal(c.entries.length,2);
 const other=await f.store.createLocation(s.id,LOCAL_GM,'Other');assert.equal((await f.store.combat.read(other.scene_id,LOCAL_GM)).entries.length,0);
 await change('start');await f.sql`DELETE FROM vtt_tokens WHERE id=${a.id}`;c=await f.store.combat.read(l.scene_id,LOCAL_GM);assert.equal(c.active_token_id,null);assert.equal(c.round,0);assert.equal(c.entries.length,1);
 }finally{await f.close();}
});
