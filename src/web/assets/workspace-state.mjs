// Personal presentation only; no game data belongs in this schema.
export const WORKSPACE_VERSION=2;
export const WORKSPACE_PANELS=['locations','inspector','help','inventory','spells','abilities','library','combat'];
export const WORKSPACE_DOCKS=['left','right','bottom'];
export const DOCK_LIMITS={left:[180,440],right:[240,480],bottom:[120,420]};
const home={locations:'left',inspector:'right',help:'bottom',inventory:'right',spells:'right',abilities:'bottom',library:'left',combat:'right'};
export function defaultWorkspace(){return {version:2,panels:{locations:true,inspector:true,help:false,inventory:false,spells:false,abilities:false,library:false,combat:false},mapOnly:false,inspectorTab:'map',sizes:{left:190,right:260,bottom:180},docks:{left:['locations','library'],right:['inspector','inventory','spells','combat'],bottom:['help','abilities']},active:{left:'locations',right:'inspector',bottom:'help'}};}
export function clampDockSize(dock,value){const [min,max]=DOCK_LIMITS[dock];return Math.min(max,Math.max(min,value));}
export function normalizeWorkspace(value){
  const state=defaultWorkspace();
  if(!value||![1,2].includes(value.version))return state;
  for(const panel of WORKSPACE_PANELS)if(typeof value.panels?.[panel]==='boolean')state.panels[panel]=value.panels[panel];
  if(typeof value.mapOnly==='boolean')state.mapOnly=value.mapOnly;
  if(['map','tokens'].includes(value.inspectorTab))state.inspectorTab=value.inspectorTab;
  if(value.version===2){
    const seen=new Set();
    for(const dock of WORKSPACE_DOCKS){
      state.docks[dock]=[];
      for(const panel of Array.isArray(value.docks?.[dock])?value.docks[dock]:[]){
        if(WORKSPACE_PANELS.includes(panel)&&!seen.has(panel)){state.docks[dock].push(panel);seen.add(panel);}
      }
      if(typeof value.sizes?.[dock]==='number'&&Number.isFinite(value.sizes[dock]))state.sizes[dock]=clampDockSize(dock,value.sizes[dock]);
    }
    for(const panel of WORKSPACE_PANELS)if(!seen.has(panel))state.docks[home[panel]].push(panel);
    for(const dock of WORKSPACE_DOCKS)state.active[dock]=state.docks[dock].includes(value.active?.[dock])?value.active[dock]:state.docks[dock][0]||null;
  }
  for(const dock of WORKSPACE_DOCKS)if(!state.panels[state.active[dock]])state.active[dock]=state.docks[dock].find(panel=>state.panels[panel])||state.docks[dock][0]||null;
  return state;
}
export const workspaceKey=(sessionId,viewerId='local-master')=>`dnd-workspace:v2:${encodeURIComponent(viewerId)}:${encodeURIComponent(sessionId)}`;
export function readWorkspace(storage,key){
  try{
    const current=storage.getItem(key);
    if(current!=null)return normalizeWorkspace(JSON.parse(current));
    const legacy=storage.getItem(key.replace('dnd-workspace:v2:','dnd-workspace:v1:'));
    const state=normalizeWorkspace(JSON.parse(legacy));
    if(legacy!=null)writeWorkspace(storage,key,state);
    return state;
  }catch{return defaultWorkspace();}
}
export function writeWorkspace(storage,key,state){try{storage.setItem(key,JSON.stringify(normalizeWorkspace(state)));return true;}catch{return false;}}
export function moveWorkspacePanel(state,panel,dock){
  if(!WORKSPACE_PANELS.includes(panel)||!WORKSPACE_DOCKS.includes(dock))return;
  for(const zone of WORKSPACE_DOCKS)state.docks[zone]=state.docks[zone].filter(id=>id!==panel);
  state.docks[dock].push(panel);state.active[dock]=panel;state.panels[panel]=true;state.mapOnly=false;
  Object.assign(state,normalizeWorkspace(state));
}
export function applyWorkspacePreset(state,preset){
  const next=defaultWorkspace();
  if(preset==='prepare'){next.panels.library=true;next.active.left='library';}
  else if(preset==='play'){next.panels.abilities=true;next.panels.inventory=true;next.panels.spells=true;next.panels.combat=true;next.active.right='inventory';next.active.bottom='abilities';}
  else if(preset!=='default')return;
  next.inspectorTab=state.inspectorTab;Object.assign(state,next);
}
// Clamp the rendered desktop layout without overwriting the user's saved sizes.
export function fitWorkspaceSizes(sizes,width){
  const result={...sizes},budget=Math.max(0,width-320-32),total=sizes.left+sizes.right;
  if(total>budget){
    const leftMin=DOCK_LIMITS.left[0],rightMin=DOCK_LIMITS.right[0];
    if(budget>=leftMin+rightMin){
      const extra=budget-leftMin-rightMin,wanted=total-leftMin-rightMin;
      result.left=leftMin+extra*(sizes.left-leftMin)/wanted;result.right=budget-result.left;
    }else{result.left=budget*sizes.left/total;result.right=budget*sizes.right/total;}
  }
  return result;
}
