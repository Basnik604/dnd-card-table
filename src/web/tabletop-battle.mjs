import {randomUUID,createHash} from 'node:crypto';
import {applyHitPointDelta,updateCharacterHp} from './combat-state.mjs';
import {rollWithMode,rollDiceFormula} from './dice.mjs';
import {areaTargets} from './assets/combat-area.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const acNumber=value=>Array.isArray(value)?acNumber(value[0]):value&&typeof value==='object'?acNumber(value.value??value.ac??value.base??10):Math.max(1,Math.min(50,Number(typeof value==='number'?value:String(value??'10').match(/\d+/)?.[0])||10));
export function createBattleStore(sql,{scene,combat,ErrorType,profile,random=Math.random}){
 const fail=(message,status=400)=>{throw new ErrorType(message,status);};
 async function units(db,id,principal){
  await scene(db,id,principal);
  const rows=await db`SELECT t.*,to_jsonb(c) AS character_data,to_jsonb(cr) AS creature_data,v.hp_current AS local_hp,v.hp_max AS local_max,v.temp_hp AS local_temp,v.armor_class AS local_ac,v.revision AS vital_revision
   FROM vtt_tokens t LEFT JOIN characters c ON c.id=t.character_id LEFT JOIN creatures cr ON cr.entity_id=t.entity_id LEFT JOIN vtt_token_vitals v ON v.token_id=t.id WHERE t.scene_id=${id} ORDER BY t.id`;
  return rows.map(row=>{const source=row.character_data||row.creature_data||{},linked=!!row.character_id,max=Math.max(1,Number(linked?source.hp_max:row.local_max??source.hit_points)||1),hp=Math.max(0,Math.min(max,Number(linked?source.hp_current:row.local_hp??max)||0)),temp=Math.max(0,Number(linked?source.temp_hp:row.local_temp)||0),ac=acNumber(linked?source.armor_class:row.local_ac??source.armor_class);
   return {id:row.id,name:row.name,kind:row.kind,character_id:row.character_id,entity_id:row.entity_id,x:Number(row.x),y:Number(row.y),size_cells:Number(row.size_cells),hp_current:hp,hp_max:max,temp_hp:temp,armor_class:ac,source,defenses:{resistances:source.damage_resistances||[],immunities:source.damage_immunities||[],vulnerabilities:source.damage_vulnerabilities||[]},stamp:digest([hp,max,temp,ac,source.updated_at,source.feature_choices?.concentration,row.vital_revision,row.revision])};});
 }
 async function apply(db,unit,delta){
  if(unit.character_id){await updateCharacterHp(db,unit.character_id,delta);return;}
  const next=applyHitPointDelta(unit,delta);await db`INSERT INTO vtt_token_vitals(token_id,hp_current,hp_max,temp_hp,armor_class) VALUES(${unit.id},${next.hp_current},${unit.hp_max},${next.temp_hp},${unit.armor_class}) ON CONFLICT(token_id) DO UPDATE SET hp_current=EXCLUDED.hp_current,temp_hp=EXCLUDED.temp_hp,revision=vtt_token_vitals.revision+1`;
 }
 function safeUnits(rows){return rows.map(({source,...unit})=>unit);}
 async function read(id,p){const current=await combat.read(id,p),list=await units(sql,id,p),actor=list.find(u=>u.id===current.active_token_id);return {combat:current,units:safeUnits(list),actions:actor&&profile?await profile(actor):[],history:await sql`SELECT id,result,status,created_at FROM vtt_battle_actions WHERE scene_id=${id} AND status='applied' ORDER BY created_at DESC LIMIT 30`};}
 async function turn(db,id,p,revision){const current=await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;const [state]=await db`SELECT * FROM vtt_combat WHERE scene_id=${id}`;if(!state?.active_token_id||!state.round)fail('Start combat before using an action.');if(state.revision!==revision)fail('Combat changed elsewhere. Refresh before continuing.',409);return {current,state};}
 return {read,
  async configure(id,p,input){return sql.begin(async db=>{await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;await db`SELECT id FROM vtt_tokens WHERE id=${input.token_id} FOR UPDATE`;const list=await units(db,id,p),unit=list.find(u=>u.id===input.token_id);if(!unit)fail('Target no longer exists.',404);if(unit.stamp!==input.stamp)fail('Hit points changed. Refresh before continuing.',409);
   if(unit.character_id){if(!integer(input.hp_current,0,unit.hp_max))fail('Invalid unit statistics.');await db`SELECT id FROM characters WHERE id=${unit.character_id} FOR UPDATE`;const fresh=(await units(db,id,p)).find(u=>u.id===unit.id);if(fresh.stamp!==input.stamp)fail('Hit points changed. Refresh before continuing.',409);await updateCharacterHp(db,fresh.character_id,input.hp_current-fresh.hp_current,{preserveTemporaryHp:true});return {ok:true};}
   if(!integer(input.hp_max,1,9999)||!integer(input.hp_current,0,input.hp_max)||!integer(input.temp_hp,0,9999)||!integer(input.armor_class,1,50))fail('Invalid unit statistics.');
   await db`INSERT INTO vtt_token_vitals(token_id,hp_current,hp_max,temp_hp,armor_class) VALUES(${unit.id},${input.hp_current},${input.hp_max},${input.temp_hp},${input.armor_class}) ON CONFLICT(token_id) DO UPDATE SET hp_current=EXCLUDED.hp_current,hp_max=EXCLUDED.hp_max,temp_hp=EXCLUDED.temp_hp,armor_class=EXCLUDED.armor_class,revision=vtt_token_vitals.revision+1`;return {ok:true};});},
  async preview(id,p,input){return sql.begin(async db=>{
   const {current,state}=await turn(db,id,p,input.revision);let list=await units(db,id,p),actor=list.find(u=>u.id===state.active_token_id);if(!actor||actor.hp_current===0)fail('The active unit cannot act at zero HP.');
   const catalogue=profile?await profile(actor):[],selected=input.action_id==='manual'?null:catalogue.find(a=>a.id===input.action_id);if(selected?.available===false)fail('No spell slot is available.');if(input.action_id!=='manual'&&!selected)fail('This action is no longer available.',409);
   if(profile){list=await units(db,id,p);actor=list.find(u=>u.id===state.active_token_id);if(!actor||actor.hp_current===0)fail('The active unit cannot act at zero HP.');}
   if(!['attack','save','damage','heal','utility'].includes(input.kind)||!['','advantage','disadvantage'].includes(input.mode||''))fail('Invalid battle action.');
   if(!Array.isArray(input.targets)||input.targets.length>200||new Set(input.targets).size!==input.targets.length)fail('Invalid battle targets.');
   let ids=input.targets;if(input.area){let covered;try{covered=areaTargets(list,input.area,current.grid);}catch{fail('Invalid area.');}if(ids.some(target=>!covered.includes(target)))fail('A target is outside the selected area.');}
   const targets=ids.map(target=>list.find(u=>u.id===target));if(targets.some(u=>!u)||(!targets.length&&input.kind!=='utility'))fail('Select at least one target.');
   const formula=String(input.damage_formula||'0'),attack=String(input.attack_formula||'1d20'),dc=Number(input.save_dc),ability=String(input.save_ability||'dexterity');
   if(input.kind==='save'&&(!integer(dc,1,50)||!['strength','dexterity','constitution','intelligence','wisdom','charisma'].includes(ability)))fail('Invalid saving throw.');
   let base;try{base=rollDiceFormula(formula,random);}catch{fail('Invalid battle action.');}const results=targets.map(target=>{
    let roll=null,hit=true,critical=false;
    if(input.kind==='attack'){if(!/^1d20(?:[+-]\d+)?$/.test(attack.replace(/\s/g,'')))fail('Invalid attack formula.');roll=rollWithMode(attack,input.mode||'',random);const die=roll.dice.find(d=>d.sides===20&&d.kept)?.value;critical=die===20;hit=die!==1&&(critical||roll.total>=target.armor_class);}
    if(input.kind==='save'){const proficient=Array.isArray(target.source.saving_throw_proficiencies)&&target.source.saving_throw_proficiencies.some(value=>String(value).toLowerCase().startsWith(ability.slice(0,3)));const imported=target.source.saving_throws?.[ability]??target.source.saving_throws?.[ability.slice(0,3)];const modifier=Number.isFinite(Number(imported))&&imported!=null?Number(imported):Math.floor((Number(target.source[ability])||10)/2)-5+(proficient?Number(target.source.proficiency_bonus)||0:0);roll=rollDiceFormula('1d20'+(modifier>=0?'+':'')+modifier,random);hit=roll.total<dc;}
    const damage=critical?rollDiceFormula(formula.replace(/(\d+)d/gi,(_,count)=>String(Number(count)*2)+'d'),random):base;
    let amount=input.kind==='utility'?0:Math.max(0,damage.total);if(input.kind==='attack'&&!hit)amount=0;if(input.kind==='save'&&!hit)amount=input.half_on_save?Math.floor(amount/2):0;
    const type=String(input.damage_type||selected?.damage_type||'').toLowerCase().trim(),matches=values=>Array.isArray(values)&&values.some(value=>typeof value==='string'&&value.toLowerCase().trim()===type);let defense='normal';if(type&&input.kind!=='heal'&&input.kind!=='utility'){if(matches(target.defenses.immunities)){amount=0;defense='immunity';}else{const resistant=matches(target.defenses.resistances),vulnerable=matches(target.defenses.vulnerabilities);if(resistant)amount=Math.floor(amount/2);if(vulnerable)amount*=2;defense=resistant&&vulnerable?'resistance and vulnerability':resistant?'resistance':vulnerable?'vulnerability':'normal';}}
    const delta=input.kind==='heal'?amount:-amount;if(!integer(delta,-9999,9999))fail('Damage exceeds supported limits.');const after=applyHitPointDelta(target,delta);
    return {token_id:target.id,name:target.name,stamp:target.stamp,roll,hit,critical,damage,defense,damage_type:type,delta,before:{hp:target.hp_current,temp:target.temp_hp},after:{hp:after.hp_current,temp:after.temp_hp}};
   });
   const actionId=randomUUID(),payload={actor_stamp:actor.stamp,scene_stamp:digest([current.grid,current.revision]),action_id:input.action_id,action_stamp:selected?digest(selected):null,cost:selected?.cost?{...selected.cost,amount:selected.cost.kind==='resource'?Number(input.resource_amount||1):1}:null,targets:ids,area:input.area||null},result={actor:actor.name,label:String(selected?.name||input.label||'Manual ruling').slice(0,120),kind:input.kind,base_roll:base,results,notes:String(input.notes||'').slice(0,2000),requires_gm_confirmation:true};
   await db`INSERT INTO vtt_battle_actions(id,scene_id,actor_token_id,combat_revision,payload,result) VALUES(${actionId},${id},${actor.id},${state.revision},${db.json(payload)},${db.json(result)})`;return {id:actionId,...result};
  });},
  async confirm(id,p,input){return sql.begin(async db=>{
   await scene(db,id,p);await db`SELECT id FROM vtt_scenes WHERE id=${id} FOR UPDATE`;const [action]=await db`SELECT * FROM vtt_battle_actions WHERE id=${input.id} AND scene_id=${id} FOR UPDATE`;if(!action)fail('Battle result not found.',404);if(action.status==='applied')return {id:action.id,already_applied:true,result:action.result};if(action.status!=='pending')fail('This result was cancelled.',409);
   if(input.cancel){await db`UPDATE vtt_battle_actions SET status='cancelled' WHERE id=${action.id}`;return {cancelled:true};}
   const {state,current}=await turn(db,id,p,action.combat_revision);if(digest([current.grid,current.revision])!==action.payload.scene_stamp)fail('The scene changed. Calculate again.',409);if(state.active_token_id!==action.actor_token_id)fail('Combat changed elsewhere. Refresh before continuing.',409);
   const list=await units(db,id,p),actor=list.find(u=>u.id===action.actor_token_id);if(!actor||actor.stamp!==action.payload.actor_stamp)fail('The acting unit changed. Calculate again.',409);
   if(action.payload.action_id!=='manual'&&profile){const catalogue=await profile(actor);if(!catalogue.some(a=>a.id===action.payload.action_id&&a.available!==false&&(!action.payload.action_stamp||digest(a)===action.payload.action_stamp)))fail('This action is no longer available.',409);}
   const affected=action.result.results.map(result=>list.find(u=>u.id===result.token_id));if(affected.some(u=>!u))fail('Target no longer exists.',409);
   const lockedUnits=[actor,...affected].sort((a,b)=>a.id.localeCompare(b.id));for(const unit of lockedUnits)await db`SELECT id FROM vtt_tokens WHERE id=${unit.id} FOR UPDATE`;
   for(const id of [...new Set(lockedUnits.map(u=>u.character_id).filter(Boolean))].sort())await db`SELECT id FROM characters WHERE id=${id} FOR UPDATE`;
   const fresh=await units(db,id,p);if(fresh.find(u=>u.id===actor.id)?.stamp!==action.payload.actor_stamp)fail('The acting unit changed. Calculate again.',409);const results=[];
   const cost=action.payload.cost;if(cost){
    const [character]=await db`SELECT feature_choices FROM characters WHERE id=${actor.character_id}`;const choices={...character.feature_choices};
    if(cost.kind==='resource'){if(!integer(cost.amount,1,9999))fail('Invalid resource cost.');const spent=await db`UPDATE character_resources SET current_value=current_value-${cost.amount} WHERE id=${cost.resource_id} AND character_id=${actor.character_id} AND current_value>=${cost.amount} RETURNING id`;if(!spent.length)fail('Not enough resources remain.',409);}
    if(cost.slot_level>0){const [prepared]=await db`SELECT prepared,always_prepared FROM character_spells WHERE id=${cost.character_spell_id} AND character_id=${actor.character_id}`;if(!prepared||(!prepared.prepared&&!prepared.always_prepared))fail('This action is no longer available.',409);
     const bonus={...(choices.font_bonus_slots||{})};if(Number(bonus[cost.slot_level])>0){bonus[cost.slot_level]--;if(!bonus[cost.slot_level])delete bonus[cost.slot_level];choices.font_bonus_slots=bonus;}else{const slots=await db`UPDATE character_spell_slots SET current_slots=current_slots-1 WHERE character_id=${actor.character_id} AND slot_level=${cost.slot_level} AND current_slots>0 RETURNING slot_level`;if(!slots.length)fail('No spell slot is available.',409);}}
    if(cost.concentration)choices.concentration={spell_id:String(cost.entity_id),name:cost.name,started_at:new Date().toISOString(),check_dc:null,last_damage:null};
    await db`UPDATE characters SET feature_choices=${db.json(choices)},updated_at=NOW() WHERE id=${actor.character_id}`;
   }
   for(const item of action.result.results){const unit=fresh.find(u=>u.id===item.token_id);if(unit.stamp!==item.stamp)fail('Hit points changed. Refresh before continuing.',409);const override=input.overrides?.[unit.id],delta=override===undefined?item.delta:override;if(!integer(delta,-9999,9999))fail('Invalid damage adjustment.');await apply(db,unit,delta);const after=applyHitPointDelta(unit,delta);results.push({...item,delta,gm_override:override!==undefined,before:{hp:unit.hp_current,temp:unit.temp_hp},after:{hp:after.hp_current,temp:after.temp_hp}});}
   const result={...action.result,results};await db`UPDATE vtt_battle_actions SET status='applied',result=${db.json(result)},applied_at=NOW() WHERE id=${action.id}`;return {id:action.id,result};
  });}
 };
}
