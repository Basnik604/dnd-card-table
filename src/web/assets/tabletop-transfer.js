import {tokenLabel} from './tabletop-token-model.mjs';
import {paintTokenFace} from './tabletop-art-display.mjs';

export function initTransferTool(ctx) {
  const {root,t,api,run,runChange,getScene,getTokens,isDirty,isBusy,message,canChange,selectedToken,acceptTokens,navigate}=ctx;
  const find=s=>root.querySelector(s),dialog=find('[data-token-transfer]'),target=find('[data-transfer-target]'),list=find('[data-transfer-list]');
  let destinations=[];
  const chosen=()=>[...list.querySelectorAll('input:checked')].map(input=>input.value);
  function refresh() {
    if(!dialog.open)return;
    const count=chosen().length;
    find('[data-transfer-count]').textContent=t('Selected tokens')+': '+count;
    find('[data-transfer-apply]').disabled=isBusy()||!count||!target.value;
  }
  find('[data-token-transfer-open]').addEventListener('click',()=>{
    if(!canChange())return;
    if(isDirty()){message('Save token settings before changing floors.',true);return;}
    if(!getTokens().length){message('Choose at least one token to transfer.',true);return;}
    run(async()=>{
      const result=await api(`/api/tabletop/sessions/${getScene().session_id}/scenes`,'GET');
      destinations=result.scenes.filter(s=>s.id!==getScene().id);
      if(!destinations.length){message('Add another floor or location first.',true);return;}
      target.replaceChildren();list.replaceChildren();
      const groups=new Map();
      for(const scene of destinations) {
        if(!groups.has(scene.location_id)) {
          const group=document.createElement('optgroup');group.label=scene.location_name;groups.set(scene.location_id,group);target.append(group);
        }
        const option=document.createElement('option');option.value=scene.id;option.textContent=scene.floor_name==='Ground floor'?t('Ground floor'):scene.floor_name;groups.get(scene.location_id).append(option);
      }
      const selected=selectedToken();
      for(const token of getTokens()) {
        const label=document.createElement('label'),input=document.createElement('input'),icon=document.createElement('span'),name=document.createElement('span');
        input.type='checkbox';input.value=token.id;input.dataset.transferKind=token.kind;input.checked=selected?token.id===selected.id:token.kind==='character';
        icon.className='vtt-art-thumb';paintTokenFace(icon,token,{lazy:true});name.textContent=tokenLabel(token);label.append(input,icon,name);list.append(label);
      }
      find('[data-transfer-status]').textContent='';find('[data-transfer-follow]').checked=true;dialog.showModal();refresh();
    });
  });
  list.addEventListener('change',refresh);target.addEventListener('change',refresh);
  find('[data-transfer-characters]').addEventListener('click',()=>{list.querySelectorAll('input').forEach(input=>input.checked=input.dataset.transferKind==='character');refresh();});
  find('[data-transfer-clear]').addEventListener('click',()=>{list.querySelectorAll('input').forEach(input=>input.checked=false);refresh();});
  find('[data-transfer-cancel]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('cancel',event=>{if(isBusy())event.preventDefault();});
  find('[data-transfer-apply]').addEventListener('click',async()=>{
    if(!canChange())return;
    const ids=chosen(),destination=destinations.find(s=>s.id===target.value),follow=find('[data-transfer-follow]').checked;
    if(!ids.length||!destination)return;
    find('[data-transfer-status]').textContent='';
    const result=await runChange(async()=>{
      const data={tokens:ids.map(id=>{const token=getTokens().find(t=>t.id===id);return {id,revision:token?.revision};}),target_scene_id:destination.id,target_revision:destination.revision,scene_revision:getScene().revision,snap:find('[data-token-snap]').checked};
      const result=await api(`/api/tabletop/scenes/${getScene().id}/transfer`,'POST',data);
      acceptTokens(result.tokens);dialog.close();message(t('Transferred tokens')+': '+result.transferred);
      const entry=find(`[data-vtt-floor="${destination.id}"] small`);
      if(entry)entry.textContent=t(destination.has_map?'Map ready':'Empty map')+' · '+t('Tokens')+': '+result.target_token_count;
      if(follow)navigate(result.url);
      return result;
    });
    if(!result&&dialog.open)find('[data-transfer-status]').textContent=find('[data-vtt-status]').textContent;
    refresh();
  });
  return {refresh};
}
