export {TOKEN_ICONS,ICON_GROUPS,tokenIcon,tokenColor,characterIcon} from './tabletop-icon-art.mjs';
export const tokenLabel=token=>token.name+(token.ordinal?` #${token.ordinal}`:'');
export function creatureIcon(value) {
  const word=String(value||'').toLowerCase();
  return ['swarm','demon','devil','undead','beast','dragon','construct','aberration','celestial','elemental','fey','fiend','giant','humanoid','monstrosity','ooze','plant'].find(key=>new RegExp('\\b'+key+'\\b').test(word))||'monstrosity';
}
export function creatureSize(value) {
  const text=String(value||'').toLowerCase();
  for(const [label,size] of [['gargantuan',4],['huge',3],['large',2],['tiny',0.5]])if(text.includes(label))return size;
  return 1;
}
export function tokenPosition(scene,size,x,y,snap=true) {
  const cell=Number(scene.grid.cellSize),extent=Number(size)*cell;
  const axis=(value,limit,offset)=>{
    const max=Math.max(0,limit-extent);
    if(snap){const lo=Math.ceil(-offset/cell),hi=Math.floor((max-offset)/cell);if(lo<=hi)return Math.round((offset+Math.max(lo,Math.min(hi,Math.round((value-offset)/cell)))*cell)*100)/100;}
    return Math.round(Math.max(0,Math.min(max,value))*100)/100;
  };
  return {x:axis(x,scene.map_width||2000,scene.grid.offsetX),y:axis(y,scene.map_height||1400,scene.grid.offsetY)};
}
