import {randomUUID,createHash} from 'node:crypto';
import {CONDITIONS,readTactics,writeTactics} from './tabletop-tactics.mjs';
import {pendingConcentrationChecks} from './combat-state.mjs';
import {rollWithMode} from './dice.mjs';
import {areaGeometry} from './assets/combat-area.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const concentrationKey=c=>c?.name?JSON.stringify([c.spell_id||null,c.started_at||null,c.name]):null;

async function clearEffect(db,row){
 const tokens=await db`SELECT t.id FROM vtt_tokens t JOIN vtt_unit_tactics u ON u.token_id=t.id WHERE t.scene_id=${row.scene_id}`;
 for(const token of tokens){const state=await readTactics(db,token.id),conditions=state.conditions.filter(c=>c.effect_id!==row.id);if(conditions.length!==state.conditions.length){state.conditions=conditions;await writeTactics(db,token.id,state);}}
 await db`DELETE FROM vtt_effects WHERE id=${row.id}`;
}
export async function syncEffects(db,sceneId){
 const concentrating=await db`SELECT c.id,to_jsonb(c)->'feature_choices' AS feature_choices,(to_jsonb(c)->>'hp_current')::integer AS hp_current,u.state AS tactics FROM characters c JOIN vtt_tokens t ON t.character_id=c.id LEFT JOIN vtt_unit_tactics u ON u.token_id=t.id WHERE t.scene_id=${sceneId} ORDER BY c.id FOR UPDATE OF c`;
 for(const row of concentrating)if(row.feature_choices?.concentration&&(row.hp_current===0||row.tactics?.conditions?.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c.key)))){const choices={...row.feature_choices};delete choices.concentration;await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${row.id}`;}
 const rows=await db`SELECT e.*,t.scene_id AS owner_scene,t.character_id,to_jsonb(c)->'feature_choices' AS feature_choices,(to_jsonb(c)->>'hp_current')::integer AS hp_current,u.state AS tactics FROM vtt_effects e LEFT JOIN vtt_tokens t ON t.id=e.owner_token_id LEFT JOIN characters c ON c.id=t.character_id LEFT JOIN vtt_unit_tactics u ON u.token_id=t.id WHERE e.scene_id=${sceneId} ORDER BY e.id`;
 for(const row of rows)if(row.owner_scene!==sceneId)await clearEffect(db,row);
 for(const row of rows)if(row.state.concentration_key&&(concentrationKey(row.feature_choices?.concentration)!==row.state.concentration_key||row.hp_current===0||row.tactics?.conditions?.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c.key))))await clearEffect(db,row);
 // Deleting or transferring an owner removes its effect by FK or moves it out
 // of this scene; derived conditions must never survive that orphan.
 const active=new Set((await db`SELECT id FROM vtt_effects WHERE scene_id=${sceneId}`).map(r=>r.id));
 const tokens=await db`SELECT id FROM vtt_tokens WHERE scene_id=${sceneId}`;
 for(const token of tokens){const state=await readTactics(db,token.id),conditions=state.conditions.filter(c=>!c.effect_id||active.has(c.effect_id));if(conditions.length!==state.conditions.length){state.conditions=conditions;await writeTactics(db,token.id,state);}}
}
export async function advanceEffects(db,sceneId,from,to,action){
 await syncEffects(db,sceneId);if(action!=='next')return;
 const rows=await db`SELECT * FROM vtt_effects WHERE scene_id=${sceneId} ORDER BY id`;
 for(const row of rows){const s=row.state;if(!s.remaining||row.owner_token_id!==(s.phase==='start'?to:from))continue;
  if(s.remaining>1)await db`UPDATE vtt_effects SET state=${db.json({...s,remaining:s.remaining-1})},revision=revision+1 WHERE id=${row.id}`;
  else{if(s.concentration_key){const [owner]=await db`SELECT c.id,c.feature_choices FROM characters c JOIN vtt_tokens t ON t.character_id=c.id WHERE t.id=${row.owner_token_id} FOR UPDATE OF c`;if(owner&&concentrationKey(owner.feature_choices?.concentration)===s.concentration_key){const choices={...owner.feature_choices};delete choices.concentration;await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${owner.id}`;}}await clearEffect(db,row);}
 }
 await syncEffects(db,sceneId);
}
export function createEffectsStore(sql,{scene,ErrorType,random=Math.random}){
 const fail=(m,s=400)=>{throw new ErrorType(m,s);};
 async function context(db,id,p){const current=await scene(db,id,p);const tokens=await db`SELECT t.*,to_jsonb(c) AS character,u.state AS tactics,u.revision AS tactics_revision FROM vtt_tokens t LEFT JOIN characters c ON c.id=t.character_id LEFT JOIN vtt_unit_tactics u ON u.token_id=t.id WHERE t.scene_id=${id} ORDER BY t.id`;const effects=await db`SELECT * FROM vtt_effects WHERE scene_id=${id} ORDER BY created_at,id`;const [combat]=await db`SELECT revision FROM vtt_combat WHERE scene_id=${id}`;return {current,tokens,effects,stamp:hash([current.revision,current.grid,combat?.revision,tokens,effects])};}
 return {
  async read(id,p){return sql.begin(async db=>{await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;await syncEffects(db,id);const ctx=await context(db,id,p);return {effects:ctx.effects,concentrators:ctx.tokens.filter(t=>t.character?.feature_choices?.concentration?.name).map(t=>({token_id:t.id,name:t.name,character_id:t.character_id,concentration:t.character.feature_choices.concentration,checks:pendingConcentrationChecks(t.character.feature_choices.concentration)}))};});},
  async preview(id,p,input){return sql.begin(async db=>{
   if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid ongoing effect.');await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;await syncEffects(db,id);const ctx=await context(db,id,p),owner=ctx.tokens.find(t=>t.id===input.token_id);if(!owner)fail('Target no longer exists.',404);
   const kind=input.kind,eventId=randomUUID();let change,summary;
   if(kind==='create'){
    const name=String(input.name||'').trim();if(!name||name.length>120||!Number.isSafeInteger(input.remaining)||input.remaining<0||input.remaining>1000||!['start','end'].includes(input.phase)||!['none','current','new'].includes(input.linking))fail('Invalid ongoing effect.');
    const targets=input.targets;if(!Array.isArray(targets)||targets.length>200||new Set(targets).size!==targets.length||targets.some(id=>!ctx.tokens.some(t=>t.id===id)))fail('Invalid battle targets.');
    if(input.condition&&!CONDITIONS.includes(input.condition))fail('Invalid condition.');
    if(input.area){try{areaGeometry(input.area,ctx.current.grid);}catch{fail('Invalid area.');}}
    if(input.linking!=='none'&&(!owner.character_id||owner.character.hp_current<=0||owner.tactics?.conditions?.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c.key))))fail('Choose a conscious character for concentration.');
    let concentration=owner.character?.feature_choices?.concentration;
    if(input.linking==='current'&&!concentration?.name)fail('Character is not concentrating');
    if(input.linking==='new')concentration={spell_id:'effect:'+eventId,name,started_at:new Date().toISOString(),check_dc:null,last_damage:null};
    change={id:eventId,name,remaining:input.remaining,phase:input.phase,condition:input.condition||null,targets,area:input.area||null,concentration_key:input.linking==='none'?null:concentrationKey(concentration),concentration:input.linking==='new'?concentration:null};summary=name;
   }else if(kind==='end'||kind==='move'){
    const row=ctx.effects.find(e=>e.id===input.effect_id&&e.owner_token_id===owner.id);if(!row)fail('Ongoing effect changed. Refresh and calculate again.',409);if(row.revision!==input.revision)fail('Ongoing effect changed. Refresh and calculate again.',409);
    if(kind==='move'){try{areaGeometry(input.area,ctx.current.grid);}catch{fail('Invalid area.');}if(!row.state.area)fail('Invalid area.');}
    change={effect_id:row.id,area:input.area||null};summary=row.state.name;
   }else if(kind==='check'||kind==='stop'){
    const c=owner.character?.feature_choices?.concentration;if(!c?.name)fail('Character is not concentrating');summary=c.name;
    if(kind==='stop')change={};else{
     const check=pendingConcentrationChecks(c)[0];if(!check||check.id!==input.check_id)fail('Concentration check changed. Refresh the page.',409);
     if(!['','advantage','disadvantage'].includes(input.mode||'')||!Number.isSafeInteger(input.modifier||0)||Math.abs(input.modifier||0)>30)fail('Invalid recovery roll.');
     const source=owner.character,proficient=source.saving_throw_proficiencies?.some(v=>String(v).toLowerCase().startsWith('con')),exhaustion=owner.tactics?.conditions?.find(c=>c.key==='exhaustion')?.level||0,modifier=Math.floor((Number(source.constitution)||10)/2)-5+(proficient?Number(source.proficiency_bonus)||0:0)-2*exhaustion+Number(input.modifier||0);
     let roll;if(input.manual_roll!=null){if(!Number.isInteger(input.manual_roll)||input.manual_roll<1||input.manual_roll>20)fail('Invalid recovery roll.');roll={total:input.manual_roll+modifier,dice:[],parts:[String(input.manual_roll)],formula:'physical d20'};}else roll=rollWithMode('1d20'+(modifier>=0?'+':'')+modifier,input.mode||'',random);
     change={check_id:check.id,dc:check.dc,modifier,roll,success:roll.total>=check.dc};
    }
   }else fail('Invalid ongoing effect.');
   const result={actor:owner.name,label:summary,effect_event:true,kind,results:[],change};await db`INSERT INTO vtt_battle_actions(id,scene_id,actor_token_id,combat_revision,payload,result) VALUES(${eventId},${id},${owner.id},0,${db.json({effects:true,stamp:ctx.stamp})},${db.json(result)})`;return {id:eventId,...result};
  });},
  async confirm(id,p,input){return sql.begin(async db=>{
   await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;const [event]=await db`SELECT * FROM vtt_battle_actions WHERE id=${input.id} AND scene_id=${id} FOR UPDATE`;if(!event?.payload.effects)fail('Battle result not found.',404);if(event.status==='applied')return {already_applied:true};if(event.status!=='pending')fail('This result was cancelled.',409);if(input.cancel){await db`UPDATE vtt_battle_actions SET status='cancelled' WHERE id=${event.id}`;return {cancelled:true};}
   const chars=await db`SELECT DISTINCT character_id FROM vtt_tokens WHERE scene_id=${id} AND character_id IS NOT NULL ORDER BY character_id`;for(const row of chars)await db`SELECT id FROM characters WHERE id=${row.character_id} FOR UPDATE`;
   await syncEffects(db,id);const ctx=await context(db,id,p);if(ctx.stamp!==event.payload.stamp)fail('Ongoing effect changed. Refresh and calculate again.',409);const owner=ctx.tokens.find(t=>t.id===event.actor_token_id),{kind,change}=event.result;
   if(kind==='create'){
    if(change.concentration){const choices={...owner.character.feature_choices,concentration:change.concentration};await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${owner.character_id}`;await syncEffects(db,id);}
    const {concentration,...state}=change;await db`INSERT INTO vtt_effects(id,scene_id,owner_token_id,state) VALUES(${change.id},${id},${owner.id},${db.json(state)})`;
    if(change.condition)for(const target of change.targets){const state=await readTactics(db,target);state.conditions.push({key:change.condition,source:change.name,effect_id:change.id,read_only:true,remaining:0,phase:'end',level:1});await writeTactics(db,target,state);}
   }else if(kind==='move'){await db`UPDATE vtt_effects SET state=state||${db.json({area:change.area})},revision=revision+1 WHERE id=${change.effect_id}`;}
   else if(kind==='end'){const row=ctx.effects.find(e=>e.id===change.effect_id);await clearEffect(db,row);}
   else{
    const choices={...owner.character.feature_choices},c=choices.concentration;
    if(kind==='stop'||!change.success)delete choices.concentration;
    else{const checks=pendingConcentrationChecks(c).slice(1);choices.concentration={...c,pending_checks:checks,check_dc:checks[0]?.dc??null,last_damage:checks[0]?.damage??null,last_check:{total:change.roll.total,dc:change.dc,success:true,at:new Date().toISOString()}};}
    await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${owner.character_id}`;
   }
   await syncEffects(db,id);await db`UPDATE vtt_battle_actions SET status='applied',applied_at=NOW() WHERE id=${event.id}`;return {ok:true};
  });}
 };
}
