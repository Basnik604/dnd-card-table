import {defaultWorkspace,readWorkspace,writeWorkspace,workspaceKey,WORKSPACE_PANELS,WORKSPACE_DOCKS,DOCK_LIMITS,clampDockSize,moveWorkspacePanel,fitWorkspaceSizes,applyWorkspacePreset} from './workspace-state.mjs';
const instances=new WeakMap();

// Existing forms move as DOM nodes so drafts and handlers remain intact.
export function initWorkspace(root,{sessionId,t}){
  const shell=root.querySelector('[data-workspace]');if(!shell||!sessionId)return null;
  instances.get(shell)?.destroy();
  const lifecycle=new AbortController(),signal=lifecycle.signal;let storage;
  try{storage=window.localStorage;}catch{}
  const key=workspaceKey(sessionId);let state=readWorkspace(storage,key);
  const panels=new Map(WORKSPACE_PANELS.map(name=>[name,shell.querySelector(`[data-workspace-panel="${name}"]`)]));
  const message=root.querySelector('[data-workspace-status]');
  const toggle=name=>root.querySelector(`[data-workspace-toggle="${name}"]`);
  const labels={locations:'Locations',inspector:'Inspector',help:'Table help',inventory:'Inventory',spells:'Spells',abilities:'Abilities and resources',library:'Creature library',left:'Left dock',right:'Right dock',bottom:'Bottom dock'};
  const docks=new Map(),tabs=new Map();let drag=null,resize=null;
  const visible=name=>!!panels.get(name)&&state.panels[name]&&!state.mapOnly;
  const zoneOf=name=>WORKSPACE_DOCKS.find(dock=>state.docks[dock].includes(name));
  const element=(tag,attrs={},text='')=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);el.textContent=text;return el;};
  function clearDrag(){drag=null;shell.classList.remove('workspace-dragging');for(const zone of docks.values())zone.classList.remove('workspace-drop-target');}
  for(const dock of WORKSPACE_DOCKS){
    const zone=element('section',{'class':'workspace-dock','data-workspace-dock':dock,'aria-label':t(labels[dock])});
    zone.classList.add(`workspace-dock-${dock}`);
    zone.append(element('div',{'class':'workspace-tabs','role':'tablist','aria-label':t(labels[dock])}));shell.append(zone);docks.set(dock,zone);
    const splitter=element('div',{'class':'workspace-splitter','data-workspace-resize':dock,'data-workspace-control':'','role':'separator','tabindex':'0','aria-orientation':dock==='bottom'?'horizontal':'vertical','aria-label':t('Resize dock')+' · '+t(labels[dock])});splitter.classList.add(`workspace-splitter-${dock}`);shell.append(splitter);
    splitter.addEventListener('keydown',event=>{
      let delta=0;if(event.key==='Home')delta=DOCK_LIMITS[dock][0]-state.sizes[dock];else if(event.key==='End')delta=DOCK_LIMITS[dock][1]-state.sizes[dock];
      else if(dock==='bottom'&&['ArrowUp','ArrowDown'].includes(event.key))delta=event.key==='ArrowUp'?20:-20;
      else if(dock!=='bottom'&&['ArrowLeft','ArrowRight'].includes(event.key))delta=(event.key==='ArrowRight'?20:-20)*(dock==='right'?-1:1);else return;
      event.preventDefault();state.sizes[dock]=clampDockSize(dock,state.sizes[dock]+delta);save();
    },{signal});
    splitter.addEventListener('pointerdown',event=>{if(event.button!==0||window.matchMedia('(max-width: 900px)').matches)return;event.preventDefault();splitter.setPointerCapture(event.pointerId);resize={dock,x:event.clientX,y:event.clientY,size:state.sizes[dock]};shell.classList.add('workspace-resizing');},{signal});
    splitter.addEventListener('pointermove',event=>{if(resize?.dock!==dock)return;const delta=dock==='bottom'?resize.y-event.clientY:(event.clientX-resize.x)*(dock==='right'?-1:1);state.sizes[dock]=clampDockSize(dock,resize.size+delta);applySizes();},{signal});
    const endResize=()=>{if(resize?.dock!==dock)return;resize=null;shell.classList.remove('workspace-resizing');save();};
    splitter.addEventListener('pointerup',endResize,{signal});splitter.addEventListener('lostpointercapture',endResize,{signal});
    zone.addEventListener('dragover',event=>{if(!drag)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';zone.classList.add('workspace-drop-target');},{signal});
    zone.addEventListener('dragleave',event=>{if(!zone.contains(event.relatedTarget))zone.classList.remove('workspace-drop-target');},{signal});
    zone.addEventListener('drop',event=>{if(!drag)return;event.preventDefault();event.stopPropagation();move(drag,dock);clearDrag();},{signal});
  }
  for(const [name,panel] of panels){
    if(!panel)continue;
    const header=element('div',{'class':'workspace-panel-header'}),handle=element('span',{'class':'workspace-drag-handle','draggable':'true','data-workspace-drag':name,'title':t('Drag panel to a dock')},t(labels[name]));
    handle.addEventListener('dragstart',event=>{drag=name;event.stopPropagation();event.dataTransfer.setData('text/x-dnd-workspace-panel',name);event.dataTransfer.effectAllowed='move';shell.classList.add('workspace-dragging');},{signal});handle.addEventListener('dragend',clearDrag,{signal});
    const select=element('select',{'data-workspace-control':'','data-workspace-location':name,'aria-label':t('Panel location')+' · '+t(labels[name])});
    for(const dock of WORKSPACE_DOCKS)select.append(element('option',{'value':dock},t(labels[dock])));
    select.addEventListener('change',()=>move(name,select.value),{signal});header.append(handle,select);
    const close=panel.querySelector('[data-workspace-close]');if(close)header.append(close);panel.prepend(header);panel.setAttribute('role','tabpanel');
    const tab=element('button',{'type':'button','data-workspace-control':'','data-workspace-tab':name,'role':'tab','id':`workspace-tab-${name}`,'aria-controls':panel.id},t(labels[name]));panel.setAttribute('aria-labelledby',tab.id);tabs.set(name,tab);
    tab.addEventListener('click',()=>{state.active[zoneOf(name)]=name;save();},{signal});
    tab.addEventListener('keydown',event=>{const dock=zoneOf(name),list=state.docks[dock].filter(visible);let index=list.indexOf(name);if(event.key==='Home')index=0;else if(event.key==='End')index=list.length-1;else if(['ArrowLeft','ArrowRight'].includes(event.key))index=(index+(event.key==='ArrowRight'?1:-1)+list.length)%list.length;else return;event.preventDefault();state.active[dock]=list[index];save();tabs.get(list[index])?.focus();},{signal});
  }
  function applySizes(){
    const sizes=fitWorkspaceSizes(state.sizes,shell.clientWidth);
    for(const dock of WORKSPACE_DOCKS){shell.style.setProperty(`--workspace-${dock}`,`${sizes[dock]}px`);const splitter=shell.querySelector(`[data-workspace-resize="${dock}"]`);splitter.setAttribute('aria-valuemin',DOCK_LIMITS[dock][0]);splitter.setAttribute('aria-valuemax',DOCK_LIMITS[dock][1]);splitter.setAttribute('aria-valuenow',Math.round(state.sizes[dock]));}
  }
  function render(){
    for(const dock of WORKSPACE_DOCKS){
      const zone=docks.get(dock),bar=zone.querySelector('[role=tablist]'),list=state.docks[dock].filter(visible);
      if(!state.mapOnly&&!list.includes(state.active[dock]))state.active[dock]=list[0]||null;
      zone.hidden=!list.length;shell.classList.toggle(`workspace-empty-${dock}`,!list.length);shell.querySelector(`[data-workspace-resize="${dock}"]`).hidden=!list.length;
      let tabIndex=0;
      for(const name of state.docks[dock]){
        const panel=panels.get(name),tab=tabs.get(name);if(!panel)continue;
        if(panel.parentElement!==zone){if(zone.moveBefore)zone.moveBefore(panel,null);else zone.append(panel);}if(bar.children[tabIndex]!==tab)bar.insertBefore(tab,bar.children[tabIndex]||null);tabIndex++;
        const active=list.includes(name)&&state.active[dock]===name;
        if(!active&&panel.contains(document.activeElement)){const target=list.length?tabs.get(state.active[dock]):toggle(name);target?.focus({preventScroll:true});}
        panel.hidden=!active;tab.hidden=!list.includes(name);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panel.querySelector('[data-workspace-location]').value=dock;
      }
    }
    for(const [name,panel] of panels){const button=toggle(name);if(button){button.hidden=!panel;button.setAttribute('aria-expanded',String(visible(name)));button.setAttribute('aria-pressed',String(visible(name)));}}
    shell.classList.toggle('workspace-map-only',state.mapOnly);
    const mapOnly=root.querySelector('[data-workspace-map-only]');mapOnly.setAttribute('aria-pressed',String(state.mapOnly));mapOnly.textContent=t(state.mapOnly?'Restore panels':'Map only');
    const settings=root.querySelector('[data-vtt-settings]'),tokens=root.querySelector('[data-token-panel]');if(settings)settings.hidden=state.inspectorTab!=='map';if(tokens)tokens.hidden=state.inspectorTab!=='tokens';
    root.querySelectorAll('[data-inspector-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectorTab===state.inspectorTab)));applySizes();
  }
  function save(){render();message.textContent=writeWorkspace(storage,key,state)?'':t('Layout storage is unavailable. This layout will last until you leave the page.');}
  function move(name,dock){
    const panel=panels.get(name);
    if(!docks.get(dock).moveBefore&&panel?.querySelector('iframe[src]')){panel.querySelector('[data-workspace-location]').value=zoneOf(name);message.textContent=t('Moving loaded character panels requires a browser with state-preserving DOM moves.');return;}
    moveWorkspacePanel(state,name,dock);save();panel?.querySelector('[data-workspace-location]')?.focus({preventScroll:true});
  }
  function showInspector(tab){if(signal.aborted||!panels.get('inspector')||!['map','tokens'].includes(tab))return;state.inspectorTab=tab;state.panels.inspector=true;state.mapOnly=false;state.active[zoneOf('inspector')]='inspector';save();}
  function preset(name,reset=false){
    const next=defaultWorkspace();next.inspectorTab=reset?'map':state.inspectorTab;applyWorkspacePreset(next,name);
    if([...panels].some(([id,panel])=>panel?.querySelector('iframe[src]')&&!shell.moveBefore&&next.docks[zoneOf(id)]?.includes(id)===false)){
      message.textContent=t('Moving loaded character panels requires a browser with state-preserving DOM moves.');return;
    }
    state=next;save();
  }
  root.querySelectorAll('[data-workspace-toggle]').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.workspaceToggle;if(!panels.get(name))return;state.panels[name]=!visible(name);state.mapOnly=false;if(state.panels[name])state.active[zoneOf(name)]=name;save();},{signal}));
  root.querySelectorAll('[data-workspace-close]').forEach(button=>button.addEventListener('click',()=>{state.panels[button.dataset.workspaceClose]=false;save();},{signal}));
  root.querySelector('[data-workspace-map-only]').addEventListener('click',()=>{state.mapOnly=!state.mapOnly;save();},{signal});
  root.querySelector('[data-workspace-preset]').addEventListener('change',event=>preset(event.target.value),{signal});
  root.querySelector('[data-workspace-reset]').addEventListener('click',()=>{preset('default',true);if(!message.textContent)message.textContent=t('Layout reset. Map and token data are unchanged.');},{signal});
  root.querySelectorAll('[data-inspector-tab]').forEach(button=>button.addEventListener('click',()=>showInspector(button.dataset.inspectorTab),{signal}));
  const observer=new ResizeObserver(applySizes);observer.observe(shell);render();
  const instance={showInspector,destroy(){
    lifecycle.abort();observer.disconnect();clearDrag();
    for(const panel of panels.values())if(panel){
      const header=panel.querySelector('.workspace-panel-header'),close=header?.querySelector('[data-workspace-close]');
      if(close)panel.prepend(close);header?.remove();panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');if(shell.moveBefore)shell.moveBefore(panel,null);else shell.append(panel);
    }
    for(const zone of docks.values())zone.remove();shell.querySelectorAll('[data-workspace-resize]').forEach(el=>el.remove());instances.delete(shell);
  }};
  instances.set(shell,instance);return instance;
}
