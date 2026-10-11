import {randomUUID,createHash} from 'node:crypto';
import {deathState,emptyDeath,deathStatus,deathRoll} from './death-state.mjs';
import {readTactics,writeTactics,spendTiming} from './tabletop-tactics.mjs';
import {rollWithMode} from './dice.mjs';
import {updateCharacterHp} from './combat-state.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createRecoveryStore(sql,{scene,ErrorType,random=Math.random}){
 const fail=(message,status=400)=>{throw new ErrorType(message,status);};
 async function context(db,id,p){await scene(db,id,p);const [combat]=await db`SELECT * FROM vtt_combat WHERE scene_id=${id}`;const rows=await db`SELECT t.*,to_jsonb(c) AS c,to_jsonb(cr) AS cr,v.hp_current AS local_hp,v.hp_max AS local_max,v.temp_hp AS local_temp,v.revision AS vital_revision,ut.state AS tactics_data,ut.revision AS tactics_revision FROM vtt_tokens t LEFT JOIN characters c ON c.id=t.character_id LEFT JOIN creatures cr ON cr.entity_id=t.entity_id LEFT JOIN vtt_token_vitals v ON v.token_id=t.id LEFT JOIN vtt_unit_tactics ut ON ut.token_id=t.id WHERE t.scene_id=${id}`;
  return {combat,units:rows.map(row=>{const linked=!!row.character_id,source=row.c||row.cr||{},enabled=linked||!!row.tactics_data?.recovery?.enabled,hp=Number(linked?source.hp_current:row.local_hp??source.hit_points??1)||0,max=Math.max(1,Number(linked?source.hp_max:row.local_max??source.hit_points??1)||1),death=deathState(linked?source.feature_choices?.death_saves:row.tactics_data?.recovery?.death);return {id:row.id,name:row.name,character_id:row.character_id,source,hp,max,temp:Number(linked?source.temp_hp:row.local_temp)||0,enabled,death,status:deathStatus(hp,death,enabled),stamp:hash([hp,max,death,enabled,source.updated_at,source.wisdom,source.proficiency_bonus,source.skill_proficiencies,source.expertise_skills,row.revision,row.vital_revision,row.tactics_revision])};})};
 }
 async function saveDeath(db,unit,death,hp=unit.hp,enabled=unit.enabled){
  if(unit.character_id){const [c]=await db`SELECT feature_choices FROM characters WHERE id=${unit.character_id} FOR UPDATE`;const choices={...c.feature_choices,death_saves:death};if(hp===0)delete choices.concentration;await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${unit.character_id}`;if(hp!==unit.hp)await updateCharacterHp(db,unit.character_id,hp-unit.hp,{revive:true});}
  else{const tactics=await readTactics(db,unit.id);tactics.recovery={enabled,death};await writeTactics(db,unit.id,tactics);if(hp!==unit.hp)await db`INSERT INTO vtt_token_vitals(token_id,hp_current,hp_max,temp_hp,armor_class) VALUES(${unit.id},${hp},${unit.max},${unit.temp},10) ON CONFLICT(token_id) DO UPDATE SET hp_current=EXCLUDED.hp_current,revision=vtt_token_vitals.revision+1`;}
 }
 return {
  async preview(id,p,input){return sql.begin(async db=>{
   if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid recovery action.');await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;const ctx=await context(db,id,p),unit=ctx.units.find(u=>u.id===input.token_id);if(!unit)fail('Target no longer exists.',404);
   const kind=input.kind;if(!['death','medicine','stabilize','revive','recover','tracking'].includes(kind))fail('Invalid recovery action.');
   const actor=kind==='medicine'?ctx.units.find(u=>u.id===input.actor_token_id):unit;if(!actor)fail('Choose a helper.');
   const timing=kind==='medicine'&&ctx.combat?.active_token_id?(input.timing||'action'):'free';if(!['action','free'].includes(timing))fail('Invalid recovery action.');
   if(kind==='death'&&(ctx.combat?.active_token_id!==unit.id||!ctx.combat.round))fail('Make a death saving throw on this unit’s turn.');
   const turnKey=ctx.combat?.fight_id+':'+ctx.combat?.round+':'+unit.id;
   if(kind==='death'&&unit.death.last_turn===turnKey)fail('A death saving throw has already been resolved this turn.');
   if(['death','medicine','stabilize'].includes(kind)&&(unit.hp!==0||unit.status!=='Dying'))fail('This unit does not need stabilization or a death saving throw.');
   if(kind==='recover'&&(unit.hp!==0||unit.status!=='Stable'))fail('Only a stable unit can recover after resting.');
   if(kind==='revive'&&unit.status!=='Dead')fail('Only a dead unit needs GM revival.');
   if(kind==='tracking'&&unit.character_id)fail('Characters always use death saving throws.');
   if(kind==='medicine'){if(actor.hp===0||actor.status==='Dead')fail('Choose a conscious helper.');if(timing==='action'&&ctx.combat?.active_token_id!==actor.id)fail('Only the active unit can spend this resource.');try{spendTiming(await readTactics(db,actor.id),timing);}catch(e){fail(e.message);}}
   let roll=null,die=null,modifier=0,death=deathState(unit.death),hp=unit.hp,enabled=unit.enabled,success=true;
   if(['death','medicine'].includes(kind)){
    if(!['','advantage','disadvantage'].includes(input.mode||'')||!Number.isInteger(input.modifier||0)||Math.abs(input.modifier||0)>30)fail('Invalid recovery roll.');
    const tactics=await readTactics(db,actor.id),exhaustion=tactics.conditions.find(c=>c.key==='exhaustion')?.level||0;
    modifier=Number(input.modifier||0)-2*exhaustion;
    let mode=input.mode||'';if(kind==='medicine'){
     const proficient=(actor.source.skill_proficiencies||[]).some(s=>String(s).toLowerCase()==='medicine'),expert=(actor.source.expertise_skills||[]).some(s=>String(s).toLowerCase()==='medicine');const imported=actor.source.skills?.medicine;
     modifier+=imported!=null&&Number.isFinite(Number(imported))?Number(imported):Math.floor((Number(actor.source.wisdom)||10)/2)-5+(proficient?Number(actor.source.proficiency_bonus||0)*(expert?2:1):0);
     if(tactics.conditions.some(c=>c.key==='poisoned'))mode=mode==='advantage'?'':'disadvantage';
    }
    if(input.manual_roll!=null){if(!Number.isInteger(input.manual_roll)||input.manual_roll<1||input.manual_roll>20)fail('Invalid recovery roll.');die=input.manual_roll;roll={total:die+modifier,parts:[String(die),String(modifier)],dice:[]};}
    else{roll=rollWithMode('1d20'+(modifier>=0?'+':'')+modifier,mode,random);die=roll.dice.find(d=>d.sides===20&&d.kept).value;}
    if(kind==='death'){const result=deathRoll(death,die,roll.total);death={...result.state,last_turn:turnKey};hp=result.hp;success=die===20||die!==1&&roll.total>=10;}
    else if(roll.total>=10)death={...emptyDeath(),stable:true,last_turn:death.last_turn};else success=false;
   }
   if(kind==='stabilize')death={...emptyDeath(),stable:true,last_turn:death.last_turn};
   if(kind==='revive'){hp=Number(input.hp??1);if(!Number.isSafeInteger(hp)||hp<1||hp>unit.max)fail('Invalid revival HP.');death=emptyDeath();}
   if(kind==='recover'){die=1+Math.floor(random()*4);hp=1;death={...emptyDeath(),last_turn:death.last_turn};}
   if(kind==='tracking'){if(typeof input.enabled!=='boolean')fail('Invalid recovery action.');enabled=input.enabled;if(enabled&&!unit.enabled)death=emptyDeath();}
   const eventId=randomUUID(),result={recovery:true,actor:actor.name,label:{death:'Death saving throw',medicine:'Medicine stabilization',stabilize:'GM stabilization',revive:'GM revival',recover:'Recovery after stable rest',tracking:'NPC death-save mode'}[kind],kind,roll,die,modifier,success,hours:kind==='recover'?die:null,timing,results:[{token_id:unit.id,name:unit.name,delta:hp-unit.hp,before:{hp:unit.hp,temp:unit.temp},after:{hp,temp:unit.temp},recovery_before:unit.status,recovery_after:deathStatus(hp,death,enabled),death}]};
   const payload={recovery:true,kind,target_id:unit.id,actor_stamp:actor.stamp,target_stamp:unit.stamp,hp,death,enabled,timing};await db`INSERT INTO vtt_battle_actions(id,scene_id,actor_token_id,combat_revision,payload,result) VALUES(${eventId},${id},${actor.id},${ctx.combat?.revision||1},${db.json(payload)},${db.json(result)})`;return {id:eventId,...result};
  });},
  async confirm(id,p,input){return sql.begin(async db=>{
   await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;const [event]=await db`SELECT * FROM vtt_battle_actions WHERE id=${input.id} AND scene_id=${id} FOR UPDATE`;if(!event?.payload.recovery)fail('Recovery result not found.',404);if(event.status==='applied')return {already_applied:true,result:event.result};if(event.status!=='pending')fail('This result was cancelled.',409);if(input.cancel){await db`UPDATE vtt_battle_actions SET status='cancelled' WHERE id=${event.id}`;return {cancelled:true};}
   const ids=[event.actor_token_id,event.payload.target_id].sort();for(const token of new Set(ids))await db`SELECT id FROM vtt_tokens WHERE id=${token} FOR UPDATE`;
   let ctx=await context(db,id,p);const linked=[...new Set(ctx.units.filter(u=>ids.includes(u.id)).map(u=>u.character_id).filter(Boolean))].sort();for(const cid of linked)await db`SELECT id FROM characters WHERE id=${cid} FOR UPDATE`;ctx=await context(db,id,p);const actor=ctx.units.find(u=>u.id===event.actor_token_id),unit=ctx.units.find(u=>u.id===event.payload.target_id);
   if(!actor||!unit||actor.stamp!==event.payload.actor_stamp||unit.stamp!==event.payload.target_stamp||(ctx.combat?.revision||1)!==event.combat_revision)fail('Recovery state changed. Calculate again.',409);
   if(event.payload.timing==='action'){try{await writeTactics(db,actor.id,spendTiming(await readTactics(db,actor.id),'action'));}catch(e){fail(e.message);}}
   await saveDeath(db,unit,event.payload.death,event.payload.hp,event.payload.enabled);await db`UPDATE vtt_battle_actions SET status='applied',applied_at=NOW() WHERE id=${event.id}`;return {result:event.result};
  });}
 };
}
