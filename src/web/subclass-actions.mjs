import {rollDiceFormula} from './dice.mjs';

const modifier=value=>Number.isFinite(Number(value))?Math.floor((Number(value)-10)/2):0;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function supportsSubclass2024(c){
  const sources=c.builder_meta?.content_sources||{};
  // Missing provenance follows the existing single-class 2024 engine. Explicit
  // legacy/third-party provenance must never silently receive these rules.
  return ![sources.class?.ruleset,sources.subclass?.ruleset].some(r=>r && r!=='dnd5e-2024');
}

export function subclassActionDefinitions(c){
  if(!supportsSubclass2024(c))return [];
  const level=Number(c.level)||1;
  const cha=modifier(c.charisma),wis=modifier(c.wisdom);
  const actions=[];
  if(c.class_name==='Warlock' && c.subclass_name==='Fiend Patron' && level>=3){
    actions.push({id:'dark_blessing',name:"Dark One's Blessing",amount:Math.max(1,level+cha),formula:'0',
      timing:'After an enemy falls',button:'Gain Temporary HP',
      help:'Use after you reduce an enemy to 0 HP, or another creature does so within 10 feet of you. Keeps the higher Temporary HP value.',
      confirmation:'I confirm that an eligible enemy was reduced to 0 HP.'});
    if(level>=6)actions.push({id:'dark_luck',name:"Dark One's Own Luck",formula:'1d10',
      key:'subclass:fiend:dark-luck',max:Math.max(1,cha),recharge:'long',timing:'After rolling, before resolving',button:'Roll luck bonus',
      help:'Add the result to your ability check or saving throw, once per roll. Apply the bonus to the original roll at the table.',
      confirmation:'This roll has not used this luck bonus yet.'});
  }
  if(c.class_name==='Monk' && c.subclass_name==='Warrior of the Open Hand' && level>=6){
    const sides=level>=17?12:level>=11?10:8;
    actions.push({id:'wholeness',name:'Wholeness of Body',formula:`1d${sides}${wis>=0?'+':''}${wis}`,
      key:'subclass:open-hand:wholeness',max:Math.max(1,wis),recharge:'long',timing:'Bonus Action',button:'Heal yourself',
      help:'Roll your Martial Arts die plus Wisdom. Restore at least 1 HP, up to your maximum.'});
  }
  if(c.class_name==='Bard' && c.subclass_name==='College of Lore' && level>=3){
    const sides=level>=15?12:level>=10?10:level>=5?8:6;
    actions.push({id:'cutting_words',name:'Cutting Words',formula:`1d${sides}`,
      key:'class:bard:bardic-inspiration',max:Math.max(1,cha),recharge:level>=5?'short':'long',timing:'Reaction',button:'Roll Cutting Words',
      help:'For a creature you see within 60 feet: subtract this die from its damage roll, successful ability check, or successful attack roll. Uses Bardic Inspiration.',
      confirmation:'The trigger is valid and my Reaction is available.'});
  }
  if(c.class_name==='Barbarian' && c.subclass_name==='Path of the Berserker' && level>=3){
    actions.push({id:'frenzy',name:'Frenzy',formula:`${level>=16?4:level>=9?3:2}d6`,
      timing:'First qualifying hit on your turn',button:'Roll Frenzy damage',
      help:'Add this damage to the first target hit on your turn with a Strength-based attack while Raging and using Reckless Attack. Use the triggering attack damage type.',
      confirmation:'Rage is active, I used Reckless Attack, and this is my first Strength-based hit this turn.'});
  }
  return actions;
}

export function subclassResourceDefinitions(c){
  return subclassActionDefinitions(c).filter(a=>a.key?.startsWith('subclass:')).map(a=>({
    key:a.key,name:a.name,max:a.max,recharge:a.recharge,shortGain:0,notes:'All uses return on a Long Rest.'
  }));
}

export function useSubclassAction(sql,characterId,form,roll=rollDiceFormula){
  return sql.begin(async tx=>{
    const [c]=await tx`SELECT * FROM characters WHERE id=${characterId} FOR UPDATE`;
    if(!c)throw new Error('Character not found');
    const def=subclassActionDefinitions(c).find(a=>a.id===String(form.effect||''));
    if(!def)throw new Error('This subclass action is not available.');
    if(def.confirmation && form.confirmed!=='yes')throw new Error('Confirm the feature trigger before using it.');
    if(def.id==='dark_luck' && !['ability','save'].includes(form.roll_type))throw new Error('Choose an ability check or a saving throw.');
    if(def.id==='cutting_words' && !['ability','attack','damage'].includes(form.roll_type))throw new Error('Choose an ability check, attack roll, or damage roll.');
    if(def.id==='wholeness' && Number(c.hp_current)>=Number(c.hp_max))throw new Error('Your HP is already full.');
    if(def.id==='wholeness' && Number(c.hp_current)<=0)throw new Error('You cannot take this Bonus Action at 0 HP.');
    const effects={characterId:String(characterId)};
    if(def.key){
      const [resource]=await tx`UPDATE character_resources SET current_value=current_value-1,updated_at=NOW()
        WHERE character_id=${characterId} AND source_key=${def.key} AND current_value>0 RETURNING current_value,max_value`;
      if(!resource)throw new Error('No uses remaining. Rest to recover this resource.');
      effects.resource={key:def.key,current:Number(resource.current_value),max:Number(resource.max_value)};
    }
    let result,outcome;
    if(def.id==='dark_blessing'){
      const next=Math.max(Number(c.temp_hp)||0,def.amount);
      await tx`UPDATE characters SET temp_hp=${next},updated_at=NOW() WHERE id=${characterId}`;
      effects.tempHp=next;
      result={total:def.amount,formula:String(def.amount),dice:[],parts:[]};
      outcome='Temporary HP updated; the higher value is kept.';
    }else{
      result=roll(def.formula);
      if(def.id==='wholeness'){
        const healing=Math.max(1,result.total);
        const next=Math.min(Number(c.hp_max),Number(c.hp_current)+healing);
        await tx`UPDATE characters SET hp_current=${next},updated_at=NOW() WHERE id=${characterId}`;
        await tx`UPDATE encounter_combatants SET hp_current=${next},hp_max=${c.hp_max},updated_at=NOW() WHERE character_id=${characterId}`;
        effects.hp={current:next,max:Number(c.hp_max)};
        result={...result,total:healing};
        outcome=`Regained ${next-Number(c.hp_current)} HP`;
      }else outcome=def.id==='frenzy'?'Add this damage to the triggering hit, using the same damage type.':def.id==='dark_luck'?'Add this bonus to your original check or saving throw.':'Subtract this result from the triggering roll. Reaction used.';
    }
    await tx`INSERT INTO roll_log(label,formula,total,detail)
      VALUES(${`${c.name} — ${def.name}`},${result.formula},${result.total},${tx.json([...result.parts,outcome,...(form.roll_type?[form.roll_type]:[])])})`;
    return {...result,label:def.name,outcome,effects};
  });
}

export function renderSubclassActionPanel(c,resources,t=x=>x){
  const actions=subclassActionDefinitions(c);
  if(!actions.length)return '';
  const tr=value=>escape(t(value));
  const cards=actions.map(a=>{
    const resource=resources.find(r=>r.source_key===a.key);
    const current=Number(resource?.current_value)||0,max=Number(resource?.max_value)||a.max;
    const empty=Boolean(a.key)&&current<=0;
    const rest=a.recharge==='short'?'No uses left. Take a Short or Long Rest.':'No uses left. Take a Long Rest.';
    const options=a.id==='dark_luck'?[['ability','Ability check'],['save','Saving throw']]:a.id==='cutting_words'?[['ability','Ability check'],['attack','Attack roll'],['damage','Damage roll']]:[];
    return `<article class="choice-engine-card subclass-action-card" ${a.key?`data-resource-consumer="${escape(a.key)}"`:''}>
      <div class="choice-engine-head"><div><span class="compact-kicker">${tr(a.timing)}</span><h4>${tr(a.name)}</h4></div>
      ${a.key?`<span class="choice-status" data-resource-key="${escape(a.key)}">${current} / ${max}</span>`:`<span class="choice-status">${a.amount!==undefined?`${a.amount} ${tr('Temporary HP')}`:escape(a.formula)}</span>`}</div>
      <p>${tr(a.help)}</p>
      <form data-live-roll data-subclass-action="${a.id}" data-roll-formula="${escape(a.formula)}" data-roll-label="${tr(a.name)}" method="post" action="/character/${encodeURIComponent(c.id)}/class-action">
        <input type="hidden" name="action" value="subclass_action"><input type="hidden" name="effect" value="${a.id}">
        ${options.length?`<label>${tr('Triggering roll')}<select name="roll_type">${options.map(([v,n])=>`<option value="${v}">${tr(n)}</option>`).join('')}</select></label>`:''}
        ${a.confirmation?`<label class="subclass-confirm"><input type="checkbox" name="confirmed" value="yes" required> ${tr(a.confirmation)}</label>`:''}
        <button type="submit" ${a.key?'data-spend-resource':''} ${empty?'disabled':''}>${tr(a.button)}</button>
      </form>
      ${a.key?`<p class="small-note" data-resource-empty="${escape(a.key)}" ${empty?'':'hidden'}>${tr(rest)}</p>`:''}
    </article>`;
  }).join('');
  return `<section class="section subclass-actions-panel"><div class="unlocked-feature-head"><div><h3>${tr('Subclass Actions')}</h3><p>${tr('Check the trigger before using a feature. Target rolls and Reactions are resolved at the table.')}</p></div></div><div class="choice-engine-grid">${cards}</div></section>`;
}
