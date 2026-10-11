import {advanceTactics} from './tabletop-tactics.mjs';
export function createCombatStore(sql,{scene,ErrorType}){
 const fail=(message,status=400)=>{throw new ErrorType(message,status);};
 const sort=entries=>entries.sort((a,b)=>b.initiative-a.initiative||a.token_id.localeCompare(b.token_id));
 async function snapshot(db,sceneId,principal){
  await scene(db,sceneId,principal);
  const [row]=await db`SELECT * FROM vtt_combat WHERE scene_id=${sceneId}`;
  const tokens=await db`SELECT id,name FROM vtt_tokens WHERE scene_id=${sceneId} ORDER BY created_at,id`;
  const entries=sort((row?.entries||[]).filter(e=>tokens.some(t=>t.id===e.token_id)).map(e=>({...e,name:tokens.find(t=>t.id===e.token_id).name})));
  return {revision:row?.revision||1,fight_id:row?.fight_id||null,entries,active_token_id:entries.some(e=>e.token_id===row?.active_token_id)?row.active_token_id:null,round:entries.some(e=>e.token_id===row?.active_token_id)?row.round:0,tokens};
 }
 return {
  read:(id,p)=>snapshot(sql,id,p),
  async change(id,principal,input){return sql.begin(async tx=>{
   await scene(tx,id,principal);await tx`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;
   await tx`INSERT INTO vtt_combat(scene_id) VALUES(${id}) ON CONFLICT DO NOTHING`;
   const current=await snapshot(tx,id,principal);
   if(input.revision!==current.revision)fail('Combat changed elsewhere. Refresh before continuing.',409);
   let entries=current.entries.map(({token_id,initiative})=>({token_id,initiative})),active=current.active_token_id,round=current.round;
   if(input.action==='set'){
    if(!Array.isArray(input.entries)||input.entries.length>200)fail('Invalid combat participants.');
    const ids=new Set();entries=input.entries.map(e=>{if(!current.tokens.some(t=>t.id===e.token_id)||ids.has(e.token_id)||!Number.isSafeInteger(e.initiative)||e.initiative< -100||e.initiative>100)fail('Invalid combat participants.');ids.add(e.token_id);return {token_id:e.token_id,initiative:e.initiative};});sort(entries);
    if(active&&!ids.has(active)){active=null;round=0;}
   }else if(input.action==='start'){
    if(!entries.length)fail('Add participants before starting combat.');active=entries[0].token_id;round=1;
   }else if(input.action==='next'||input.action==='previous'){
    if(!entries.length||!active||!round)fail('Start combat before advancing turns.');
    const index=entries.findIndex(e=>e.token_id===active),delta=input.action==='next'?1:-1;
    if(delta<0&&index===0&&round===1)fail('This is the first turn of combat.');
    const next=(index+delta+entries.length)%entries.length;if(delta>0&&next===0)round++;if(delta<0&&index===0)round--;active=entries[next].token_id;
   }else if(input.action==='stop'){active=null;round=0;}
   else fail('Invalid combat action.');
   await tx`UPDATE vtt_combat SET fight_id=CASE WHEN ${input.action==='start'} THEN gen_random_uuid() ELSE fight_id END,entries=${tx.json(entries)},active_token_id=${active},round=${round},revision=revision+1,updated_at=NOW() WHERE scene_id=${id}`;
   await advanceTactics(tx,id,current.active_token_id,active,input.action);
   return snapshot(tx,id,principal);
  });}
 };
}
