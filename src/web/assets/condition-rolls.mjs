export function conditionRoll({actor,target,kind,ability,mode=''}){
 const has=(unit,keys)=>(unit?.tactics?.conditions||[]).some(c=>keys.includes(c.key));
 const acting=kind==='save'?target:actor,level=acting?.tactics?.conditions?.find(c=>c.key==='exhaustion')?.level||0;
 let advantage=mode==='advantage',disadvantage=mode==='disadvantage',autoFail=false;
 if(kind==='attack'){
  disadvantage ||=has(actor,['blinded','poisoned','prone','restrained']);
  advantage ||=has(target,['blinded','paralyzed','restrained','stunned','unconscious']);
 }
 if(kind==='save'){
  disadvantage ||=ability==='dexterity'&&has(target,['restrained']);
  autoFail=['strength','dexterity'].includes(ability)&&has(target,['paralyzed','petrified','stunned','unconscious']);
 }
 return {mode:advantage===disadvantage?'':advantage?'advantage':'disadvantage',modifier:-2*level,autoFail};
}
