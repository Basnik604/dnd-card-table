import {syncEffects} from './tabletop-effects.mjs';
export const CONDITIONS=['blinded','charmed','deafened','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious','exhaustion','custom'];
export const freshBudget=()=>({action:0,bonus:0,reaction:0,movement:0,attacks:0,dash:0});
export function tacticalState(value={}){value ||= {};return {speed:30,attacks_per_action:1,conditions:[],...value,budget:{...freshBudget(),...value.budget}};}
export async function readTactics(db,tokenId){const [row]=await db`SELECT * FROM vtt_unit_tactics WHERE token_id=${tokenId}`;return {revision:row?.revision||1,...tacticalState(row?.state)};}
export async function writeTactics(db,tokenId,state){const {revision,...value}=state;await db`INSERT INTO vtt_unit_tactics(token_id,revision,state) VALUES(${tokenId},2,${db.json(value)}) ON CONFLICT(token_id) DO UPDATE SET state=EXCLUDED.state,revision=vtt_unit_tactics.revision+1`;}
export function effectiveSpeed(state){if(state.conditions.some(c=>['grappled','restrained','paralyzed','petrified','unconscious'].includes(c.key)))return 0;const exhaustion=state.conditions.find(c=>c.key==='exhaustion')?.level||0;return Math.max(0,state.speed-5*exhaustion);}
export function spendTiming(state,timing){
 const next=tacticalState(structuredClone(state)),b=next.budget;
 if(timing==='free')return next;
 if(next.conditions.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c.key)))throw Error('The unit is incapacitated. Use a GM exception if appropriate.');
 if(timing==='attack'){if(b.attacks===0){if(b.action)throw Error('The action has already been spent.');b.action=1;}if(b.attacks>=next.attacks_per_action)throw Error('No attacks remain in this action.');b.attacks++;}
 else if(['action','bonus','reaction'].includes(timing)){if(b[timing])throw Error('This turn resource has already been spent.');b[timing]=1;}
 else if(timing==='dash'){if(b.action)throw Error('The action has already been spent.');b.action=1;b.dash+=effectiveSpeed(next);}
 else throw Error('Invalid turn resource.');return next;
}
// Duration counts the affected unit's own turns, never other participants' turns.
export async function advanceTactics(db,sceneId,from,to,action){
 const tick=async(tokenId,phase)=>{if(!tokenId)return;const state=await readTactics(db,tokenId);state.conditions=state.conditions.flatMap(c=>{if(c.phase!==phase||!c.remaining)return [c];return c.remaining>1?[{...c,remaining:c.remaining-1}]:[];});await writeTactics(db,tokenId,state);};
 if(action==='start'){const rows=await db`SELECT t.id FROM vtt_tokens t WHERE t.scene_id=${sceneId}`;for(const row of rows){const state=await readTactics(db,row.id);state.budget=freshBudget();await writeTactics(db,row.id,state);}}
 if(action==='next'){await tick(from,'end');await tick(to,'start');const state=await readTactics(db,to);state.budget=freshBudget();await writeTactics(db,to,state);}
 // Previous is navigation only: it cannot resurrect expired effects or unspend resources.
}
export function createTacticsStore(sql,{scene,ErrorType}){
 const fail=(message,status=400)=>{throw new ErrorType(message,status);};const int=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
 return {async change(id,principal,input){return sql.begin(async db=>{
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid turn tool action.');await scene(db,id,principal);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;const [token]=await db`SELECT id,character_id FROM vtt_tokens WHERE id=${input.token_id} AND scene_id=${id} FOR UPDATE`;if(!token)fail('Target no longer exists.',404);
  const state=await readTactics(db,token.id);if(state.revision!==input.revision)fail('Turn tools changed. Refresh before continuing.',409);
  if(input.action==='configure'){if(!int(input.speed,0,1000)||!int(input.attacks_per_action,1,10))fail('Invalid turn settings.');state.speed=input.speed;state.attacks_per_action=input.attacks_per_action;}
  else if(input.action==='condition'){
   if(!CONDITIONS.includes(input.key)||!int(input.remaining,0,100)||!['start','end'].includes(input.phase)||!int(input.level||1,1,6))fail('Invalid condition.');
   const condition={key:input.key,remaining:input.remaining,phase:input.phase,level:input.level||1,note:String(input.note||'').slice(0,500),source:String(input.source||'').slice(0,100)};
   state.conditions=state.conditions.filter(c=>c.effect_id||c.key!==input.key||(input.key!=='exhaustion'&&(c.source||'')!==condition.source));if(!input.remove)state.conditions.push(condition);
   if(!input.remove&&token.character_id&&['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(input.key)){const [c]=await db`SELECT feature_choices FROM characters WHERE id=${token.character_id} FOR UPDATE`;const choices={...c.feature_choices};delete choices.concentration;await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${token.character_id}`;}
  }else if(input.action==='reset'){state.budget=freshBudget();}
  else if(input.action==='spend'||input.action==='movement'){
   const [combat]=await db`SELECT * FROM vtt_combat WHERE scene_id=${id}`;if(!combat?.active_token_id||combat.revision!==input.combat_revision)fail('Combat changed elsewhere. Refresh before continuing.',409);
   if(input.timing!=='reaction'&&combat.active_token_id!==token.id)fail('Only the active unit can spend this resource.');
   if(input.action==='movement'){if(!int(input.distance,0,1000))fail('Invalid movement distance.');if(state.budget.movement+input.distance>effectiveSpeed(state)+state.budget.dash)fail('Not enough movement remains.');state.budget.movement+=input.distance;}
   else{try{Object.assign(state,spendTiming(state,input.timing));}catch(error){fail(error.message);}}
  }else fail('Invalid turn tool action.');
  await writeTactics(db,token.id,state);await syncEffects(db,id);return readTactics(db,token.id);
 });}};
}
