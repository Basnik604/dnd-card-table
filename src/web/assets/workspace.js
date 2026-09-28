import {defaultWorkspace,readWorkspace,writeWorkspace,workspaceKey,WORKSPACE_PANELS} from './workspace-state.mjs';

// Hidden views stay mounted, preserving unsaved forms and existing listeners.
export function initWorkspace(root,{sessionId,t}){
  const shell=root.querySelector('[data-workspace]');
  if(!shell||!sessionId)return null;
  const lifecycle=new AbortController(),signal=lifecycle.signal;
  let storage;
  try{storage=window.localStorage;}catch{/* Blocked storage. */}
  const key=workspaceKey(sessionId);
  let state=readWorkspace(storage,key);
  const panels=new Map(WORKSPACE_PANELS.map(name=>[name,shell.querySelector(`[data-workspace-panel="${name}"]`)]));
  const message=root.querySelector('[data-workspace-status]');
  const toggle=name=>root.querySelector(`[data-workspace-toggle="${name}"]`);
  const visible=name=>!!panels.get(name)&&state.panels[name]&&!state.mapOnly;
  function render(){
    for(const [name,panel] of panels){
      const shown=visible(name),button=toggle(name);
      if(panel){
        if(!shown&&panel.contains(document.activeElement))button?.focus({preventScroll:true});
        panel.hidden=!shown;
      }
      if(button){button.hidden=!panel;button.setAttribute('aria-expanded',String(shown));button.setAttribute('aria-pressed',String(shown));}
      shell.classList.toggle(`workspace-no-${name}`,!shown);
    }
    shell.classList.toggle('workspace-map-only',state.mapOnly);
    const mapOnly=root.querySelector('[data-workspace-map-only]');
    mapOnly.setAttribute('aria-pressed',String(state.mapOnly));mapOnly.textContent=t(state.mapOnly?'Restore panels':'Map only');
    const settings=root.querySelector('[data-vtt-settings]'),tokens=root.querySelector('[data-token-panel]');
    if(settings)settings.hidden=state.inspectorTab!=='map';
    if(tokens)tokens.hidden=state.inspectorTab!=='tokens';
    root.querySelectorAll('[data-inspector-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectorTab===state.inspectorTab)));
  }
  function save(){message.textContent=writeWorkspace(storage,key,state)?'':t('Layout storage is unavailable. This layout will last until you leave the page.');render();}
  function showInspector(tab){
    if(!panels.get('inspector')||!['map','tokens'].includes(tab))return;
    state.inspectorTab=tab;state.panels.inspector=true;state.mapOnly=false;save();
  }
  root.querySelectorAll('[data-workspace-toggle]').forEach(button=>button.addEventListener('click',()=>{
    const name=button.dataset.workspaceToggle;if(!panels.get(name))return;
    state.panels[name]=!visible(name);state.mapOnly=false;save();
  },{signal}));
  root.querySelectorAll('[data-workspace-close]').forEach(button=>button.addEventListener('click',()=>{state.panels[button.dataset.workspaceClose]=false;save();},{signal}));
  root.querySelector('[data-workspace-map-only]').addEventListener('click',()=>{state.mapOnly=!state.mapOnly;save();},{signal});
  root.querySelector('[data-workspace-reset]').addEventListener('click',()=>{
    state=defaultWorkspace();save();if(!message.textContent)message.textContent=t('Layout reset. Map and token data are unchanged.');
  },{signal});
  root.querySelectorAll('[data-inspector-tab]').forEach(button=>button.addEventListener('click',()=>showInspector(button.dataset.inspectorTab),{signal}));
  render();return {showInspector,destroy(){lifecycle.abort();}};
}
