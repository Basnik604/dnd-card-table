// Personal presentation only; scenes, tokens and characters stay on the server.
export const WORKSPACE_VERSION=1;
export const WORKSPACE_PANELS=['locations','inspector','help'];
export function defaultWorkspace(){return {version:WORKSPACE_VERSION,panels:{locations:true,inspector:true,help:false},mapOnly:false,inspectorTab:'map'};}
export function normalizeWorkspace(value){
  const state=defaultWorkspace();
  if(!value||value.version!==WORKSPACE_VERSION)return state;
  for(const panel of WORKSPACE_PANELS)if(typeof value.panels?.[panel]==='boolean')state.panels[panel]=value.panels[panel];
  if(typeof value.mapOnly==='boolean')state.mapOnly=value.mapOnly;
  if(['map','tokens'].includes(value.inspectorTab))state.inspectorTab=value.inspectorTab;
  return state;
}
export const workspaceKey=(sessionId,viewerId='local-master')=>`dnd-workspace:v${WORKSPACE_VERSION}:${encodeURIComponent(viewerId)}:${encodeURIComponent(sessionId)}`;
export function readWorkspace(storage,key){try{return normalizeWorkspace(JSON.parse(storage.getItem(key)));}catch{return defaultWorkspace();}}
export function writeWorkspace(storage,key,state){try{storage.setItem(key,JSON.stringify(normalizeWorkspace(state)));return true;}catch{return false;}}
