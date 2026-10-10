import {onCharacterChanged} from './workspace-character-sync.js';
export function initWorkspaceData(root,{sessionId,sceneId,t}){
 const lifecycle=new AbortController(),signal=lifecycle.signal;
 const frames=new Map(),states=new Map();let token=null,serial=0,sourceMissing=false;
 const context=root.querySelector('[data-workspace-character-context]');
 for(const name of ['inventory','spells','abilities']){const panel=root.querySelector(`[data-workspace-panel="${name}"]`);if(!panel)continue;frames.set(name,panel.querySelector('iframe'));states.set(name,{dirty:false,busy:false,loaded:false});}
 const changedText=t('Character changed elsewhere. Refresh this panel when ready.');
 const status=name=>root.querySelector(`[data-workspace-panel="${name}"] [data-character-status]`);
 const source=name=>`/tabletop/${sessionId}/scenes/${sceneId}/tokens/${token.id}/panels/${name}`;
 function stale(id){if(id!==token?.character_id)return;for(const name of frames.keys())status(name).textContent=changedText;}
 const unsubscribe=onCharacterChanged(stale);
 function hasDraft(){return [...states.values()].some(s=>s.dirty||s.busy);}
 function beforeSelect(next){if(next?.id===token?.id)return true;if([...states.values()].some(s=>s.busy))return false;return !hasDraft()||confirm(t('Discard unsaved character panel changes?'));}
 function load(name){const frame=frames.get(name),state=states.get(name);if(!frame||!token?.character_id||state.loaded||sourceMissing)return;state.loaded=true;frame.src=source(name);frame.hidden=false;status(name).textContent='';}
 function select(next){
   if(next?.id===token?.id)return;token=next;sourceMissing=false;
   context.textContent=token?.name||t('Select a token to open its character panels.');
   for(const [name,frame] of frames){frame.inert=false;frame.removeAttribute('src');frame.hidden=true;Object.assign(states.get(name),{dirty:false,busy:false,loaded:false});status(name).textContent=token?.character_id?'':t('This token has no linked character.');}
   refreshVisibility();
 }
 function refreshVisibility(){for(const [name,frame] of frames)if(!frame.closest('[data-workspace-panel]').hidden)load(name);}
 const observer=new MutationObserver(refreshVisibility);observer.observe(root.querySelector('[data-workspace]'),{subtree:true,attributes:true,attributeFilter:['hidden']});
 window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.data?.characterId!==token?.character_id||sourceMissing)return;
   const entry=[...frames].find(([,frame])=>event.source===frame.contentWindow);if(!entry)return;
   const [name]=entry,state=states.get(name);
   if(event.data.type==='workspace-character-dirty')state.dirty=event.data.dirty===true;
   if(event.data.type==='workspace-character-busy')state.busy=event.data.busy===true;
   if(event.data.type==='workspace-character-changed')stale(token.character_id);
   if(event.data.type==='workspace-character-ready'){state.busy=false;status(name).textContent='';}
 },{signal});
 root.querySelectorAll('[data-character-refresh]').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.characterRefresh,state=states.get(name);if(state.busy||!token?.character_id)return;if(state.dirty&&!confirm(t('Discard unsaved character panel changes?')))return;state.dirty=false;state.loaded=false;load(name);},{signal}));
 const library=root.querySelector('[data-workspace-library]');
 if(library)library.addEventListener('submit',async event=>{
   event.preventDefault();const current=++serial,button=library.querySelector('button'),results=root.querySelector('[data-workspace-library-results]');button.disabled=true;
   try{const response=await fetch(`/api/tabletop/scenes/${sceneId}/sources?kind=creature&q=${encodeURIComponent(library.elements.q.value)}`,{signal});const data=await response.json();if(!response.ok)throw Error(data.error);if(current!==serial)return;results.replaceChildren();
   for(const item of data.sources){const link=document.createElement('a');link.href='/entity/'+encodeURIComponent(item.id);link.target='_blank';link.rel='noopener';link.textContent=item.name;results.append(link);}
   if(!data.sources.length)results.textContent=t('No creatures found.');
   }catch(error){if(!signal.aborted)results.textContent=error.message;}finally{button.disabled=false;}
 },{signal});
 select(null);context.textContent=t('Select a token to open its character panels.');
 function syncTokens(tokens){if(!token||tokens.some(row=>row.id===token.id))return;sourceMissing=true;context.textContent=t('Selected token is no longer on this scene. Choose another token.');for(const [name,frame] of frames){frame.inert=true;status(name).textContent=context.textContent;}}
 return {beforeSelect,select,syncTokens,destroy(){lifecycle.abort();observer.disconnect();unsubscribe();}};
}
