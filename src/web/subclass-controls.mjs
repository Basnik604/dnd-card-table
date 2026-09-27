import {supportsSubclass2024} from './subclass-actions.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wingsKey='subclass:draconic:dragon-wings';
const presenceKey='subclass:berserker:intimidating-presence';
export function subclassControlProfile(c){
  if(!supportsSubclass2024(c) || Number(c.level)<14)return null;
  if(c.class_name==='Sorcerer' && c.subclass_name==='Draconic Sorcery')return {
    kind:'wings',name:'Dragon Wings',key:wingsKey,costKey:'class:sorcerer:sorcery-points',cost:3,costName:'Sorcery Points'
  };
  if(c.class_name==='Barbarian' && c.subclass_name==='Path of the Berserker')return {
    kind:'presence',name:'Intimidating Presence',key:presenceKey,costKey:'class:barbarian:rage',cost:1,costName:'Rage',
    dc:8+Math.floor((Number(c.strength||10)-10)/2)+(Number(c.proficiency_bonus)||Math.ceil(Number(c.level)/4)+1)
  };
  return null;
}
export function dragonWingsActive(c){
  return subclassControlProfile(c)?.kind==='wings' && c.feature_choices?.dragon_wings?.active===true;
}
export function subclassControlResources(c){
  const p=subclassControlProfile(c);
  return p?[{key:p.key,name:p.name,max:1,recharge:'long',shortGain:0,notes:'One use per Long Rest; another class resource can restore the use.'}]:[];
}
export function renderSubclassControls(c,resources,t=x=>x,notice=''){
  const p=subclassControlProfile(c);if(!p)return '';
  const tr=x=>esc(t(x));
  const remaining=Number(resources.find(r=>r.source_key===p.key)?.current_value)||0;
  const costRemaining=Number(resources.find(r=>r.source_key===p.costKey)?.current_value)||0;
  const active=dragonWingsActive(c);
  const form=(effect,label,disabled=false)=>`<form data-live-action data-control-effect="${effect}" method="post" action="/character/${encodeURIComponent(c.id)}/class-action"><input type="hidden" name="action" value="subclass_control"><input type="hidden" name="effect" value="${effect}"><button type="submit" ${disabled?'disabled':''}>${tr(label)}</button></form>`;
  return `<section class="section subclass-actions-panel"><article class="choice-engine-card subclass-action-card"><div class="choice-engine-head"><div><span class="compact-kicker">${tr('Bonus Action')}</span><h3>${tr(p.name)}</h3></div><span class="choice-status" data-resource-key="${p.key}">${remaining} / 1</span></div>
    ${p.kind==='wings'?`<p>${tr('Fly 60 feet for 1 hour. End the wings when the in-game hour expires; either rest also ends them.')}</p><p><b>${tr(active?'Wings active · Fly 60 ft.':'Wings inactive')}</b></p>`:`<p>${tr('Chosen creatures within 30 feet make a Wisdom save. On failure: Frightened for 1 minute, repeating the save at the end of each turn. Resolve targets at the table.')}</p><p><b>${tr('Save DC')}: ${p.dc}</b></p>`}
    <div class="channel-action-row">${active?form('wings_end','Dismiss wings'):form(p.kind==='wings'?'wings_start':'presence_use',p.kind==='wings'?'Manifest wings':'Use Intimidating Presence',remaining<=0)}
    ${form(p.kind==='wings'?'wings_restore':'presence_restore',p.kind==='wings'?'Restore use · 3 Sorcery Points':'Restore use · 1 Rage',remaining>0||costRemaining<p.cost)}</div>
    <p class="small-note">${tr('Recovery cost')}: ${tr(p.costName)} × ${p.cost} · ${tr('Available')}: <span data-resource-key="${p.costKey}">${costRemaining} / ${Number(resources.find(r=>r.source_key===p.costKey)?.max_value)||0}</span></p>
    <p class="small-note">${tr('Restoring a use takes no action and does not activate the feature. A Long Rest restores the use for free.')}</p>
    ${remaining<=0?`<p class="small-note">${tr('No free uses left. Restore a use or take a Long Rest.')}</p>`:''}
    <p role="status" data-control-notice>${tr(notice)}</p></article></section>`;
}
export function useSubclassControl(sql,characterId,form){
 return sql.begin(async tx=>{
  const [c]=await tx`SELECT * FROM characters WHERE id=${characterId} FOR UPDATE`;
  if(!c)throw new Error('Character not found');
  const p=subclassControlProfile(c),effect=String(form.effect||'');
  const allowed=p?.kind==='wings'?['wings_start','wings_end','wings_restore']:p?.kind==='presence'?['presence_use','presence_restore']:[];
  if(!allowed.includes(effect))throw new Error('This subclass action is not available.');
  const [resource]=await tx`SELECT current_value,max_value FROM character_resources WHERE character_id=${characterId} AND source_key=${p.key} FOR UPDATE`;
  if(!resource)throw new Error('Subclass resource is unavailable. Refresh the character sheet.');
  if(['wings_start','presence_use'].includes(effect) && Number(c.hp_current)<=0)throw new Error('You cannot take this Bonus Action at 0 HP.');
  const choices={...(c.feature_choices||{})};
  let outcome;
  if(effect.endsWith('_restore')){
    if(Number(resource.current_value)>0)throw new Error('This feature already has an available use.');
    const spent=await tx`UPDATE character_resources SET current_value=current_value-${p.cost},updated_at=NOW()
      WHERE character_id=${characterId} AND source_key=${p.costKey} AND current_value>=${p.cost} RETURNING current_value`;
    if(!spent.length)throw new Error('Not enough resources to restore this feature.');
    await tx`UPDATE character_resources SET current_value=1,updated_at=NOW() WHERE character_id=${characterId} AND source_key=${p.key}`;
    outcome='One feature use restored. Activate it separately.';
  }else if(effect==='wings_end'){
    delete choices.dragon_wings;
    outcome='Dragon Wings ended. The spent use is not returned.';
  }else{
    if(effect==='wings_start' && dragonWingsActive(c))throw new Error('Dragon Wings are already active.');
    const spent=await tx`UPDATE character_resources SET current_value=current_value-1,updated_at=NOW()
      WHERE character_id=${characterId} AND source_key=${p.key} AND current_value>0 RETURNING current_value`;
    if(!spent.length)throw new Error('No free uses left. Restore a use or take a Long Rest.');
    if(effect==='wings_start'){
      choices.dragon_wings={active:true,started_at:new Date().toISOString()};
      outcome='Dragon Wings active: Fly 60 feet for 1 in-game hour.';
    }else outcome=`Intimidating Presence used. Wisdom save DC ${p.dc}.`;
  }
  await tx`UPDATE characters SET feature_choices=${tx.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
  const resources=await tx`SELECT source_key,current_value,max_value FROM character_resources WHERE character_id=${characterId}`;
  await tx`INSERT INTO roll_log(label,formula,total,detail) VALUES(${`${c.name} — ${p.name}`},${effect},0,${tx.json([outcome])})`;
  const updated={...c,feature_choices:choices};
  return {outcome,effects:{characterId:String(characterId),flight:dragonWingsActive(updated),
    resources:resources.map(r=>({key:r.source_key,current:Number(r.current_value),max:Number(r.max_value)})),
    subclassControlsHtml:renderSubclassControls(updated,resources,x=>x,outcome)}};
 });
}
