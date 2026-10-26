export const emptyDeath=()=>({successes:0,failures:0,stable:false,dead:false});
export function deathState(value){return {...emptyDeath(),...value};}
export function deathStatus(hp,state,enabled=true){return state?.dead?'Dead':hp>0?'Alive':!enabled?'Dead':state?.stable?'Stable':'Dying';}
export function deathRoll(state,die,total=die){
 const next=deathState(state);if(next.dead||next.stable)throw Error('This unit does not need a death saving throw.');
 if(!Number.isInteger(die)||die<1||die>20)throw Error('Invalid recovery roll.');
 if(die===20)return {state:{...emptyDeath(),last_turn:next.last_turn},hp:1};
 if(die===1)next.failures+=2;else if(total>=10)next.successes++;else next.failures++;
 next.failures=Math.min(3,next.failures);next.successes=Math.min(3,next.successes);
 if(next.failures>=3)next.dead=true;
 else if(next.successes>=3){next.stable=true;next.successes=0;next.failures=0;}
 return {state:next,hp:0};
}
export function deathAfterDamage(state,{current,hp,maximum,temporary,damage,critical=false,enabled=true}){
 const next=deathState(state);if(next.dead)return next;
 if(hp>0)return {...emptyDeath(),...(next.last_turn?{last_turn:next.last_turn}:{})};
 if(!enabled)return {...next,dead:true};
 if(!damage)return next;
 const lethal=current===0?damage>=maximum:damage-Math.min(temporary,damage)-current>=maximum;
 if(lethal)return {...next,dead:true,stable:false};
 if(current>0)return {...emptyDeath(),...(next.last_turn?{last_turn:next.last_turn}:{})};
 next.stable=false;next.failures=Math.min(3,next.failures+(critical?2:1));if(next.failures===3)next.dead=true;return next;
}
