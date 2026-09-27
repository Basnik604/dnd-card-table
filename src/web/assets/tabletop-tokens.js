import {TOKEN_ICONS,ICON_GROUPS,tokenIcon,tokenColor,tokenLabel,tokenPosition} from './tabletop-token-model.mjs';
import {initTransferTool} from './tabletop-transfer.js';
import {initArtPicker} from './tabletop-art.js';
import {paintTokenFace} from './tabletop-art-display.mjs';

export function initTokens(ctx) {
  const {root,api,run,t,message,viewport,map,getScene,getCamera,getGrid,isBusy,mapDirty}=ctx;
  const find=s=>root.querySelector(s),panel=find('[data-token-panel]'),layer=find('[data-token-layer]');
  const editor=find('[data-token-editor]'),addForm=find('[data-token-add]'),list=find('[data-token-list]');
  let tokens=ctx.tokens||[],selected=null,saved='',mode='tokens',drag=null,searchSerial=0,searchTimer,transferUi=null,artUi=null;
  const nodes=new Map();
  const selectedToken=()=>tokens.find(token=>token.id===selected);
  const editorData=()=>Object.fromEntries(['name','size_cells','relation','border_color','icon_type','icon_color','image_mode','art_id'].map(key=>[key,key==='size_cells'?Number(editor.elements.namedItem(key).value):key==='art_id'?(editor.elements.namedItem(key).value||null):editor.elements.namedItem(key).value]));
  const snapshot=value=>JSON.stringify(['name','size_cells','relation','border_color','icon_type','icon_color','image_mode','art_id'].map(key=>value[key]));
  const isDirty=()=>!!selected&&snapshot(editorData())!==saved;
  function updateDirty() {
    const dirty=isDirty();find('[data-token-save]').disabled=isBusy()||!dirty;
    find('[data-token-save-state]').textContent=t(dirty?'Unsaved changes':'Saved');
    transferUi?.refresh();
  }
  function previewIcon() {
    const data=editorData(),preview=find('[data-token-icon-preview]');
    preview.innerHTML=tokenIcon(data.icon_type,data.icon_color);preview.style.borderColor=data.border_color;
  }
  const gallery=find('[data-token-gallery]');
  find('[data-token-gallery-open]').addEventListener('click',()=>{
    const container=find('[data-token-gallery-items]'),data=editorData();container.replaceChildren();
    for(const group of ICON_GROUPS) {
      const section=document.createElement('section'),title=document.createElement('h4'),grid=document.createElement('div');
      title.textContent=t(group);grid.className='vtt-icon-grid';section.append(title,grid);
      for(const [key,icon] of Object.entries(TOKEN_ICONS).filter(([,icon])=>icon.group===group&&!icon.aliasOf)) {
        const button=document.createElement('button'),label=document.createElement('span');
        button.type='button';button.dataset.chooseIcon=key;button.setAttribute('aria-pressed',String(key===(TOKEN_ICONS[data.icon_type]?.aliasOf||data.icon_type)));
        button.innerHTML=tokenIcon(key,data.icon_color);label.textContent=t(icon.label);button.append(label);grid.append(button);
      }
      container.append(section);
    }
    gallery.showModal();
  });
  find('[data-token-gallery-close]').addEventListener('click',()=>gallery.close());
  gallery.addEventListener('click',event=>{
    const choice=event.target.closest('[data-choose-icon]');if(!choice)return;
    editor.elements.namedItem('icon_type').value=choice.dataset.chooseIcon;previewIcon();updateDirty();gallery.close();
  });
  find('[data-token-color-reset]').addEventListener('click',()=>{
    editor.elements.namedItem('icon_color').value=tokenColor(editor.elements.namedItem('icon_type').value);previewIcon();updateDirty();
  });
  function tab(value) {
    panel.hidden=value!=='tokens';root.querySelector('[data-vtt-settings]').hidden=value!=='map';
    root.querySelectorAll('[data-inspector-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectorTab===value)));
  }
  root.querySelectorAll('[data-inspector-tab]').forEach(button=>button.addEventListener('click',()=>tab(button.dataset.inspectorTab)));
  root.querySelectorAll('[data-token-tool]').forEach(button=>button.addEventListener('click',()=>{
    mode=button.dataset.tokenTool;layer.classList.toggle('is-pan',mode==='pan');
    root.querySelectorAll('[data-token-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  }));
  const snap=()=>find('[data-token-snap]').checked;
  function canChange() {
    if(isBusy())return false;
    if(mapDirty()&&!ctx.validateMapSettings())return false;
    return true;
  }
  const interactionScene=()=>({...getScene(),grid:getGrid()});
  function runChange(task) {
    return run(async()=>{
      if(mapDirty()) {message('Saving map settings…');await ctx.saveMapSettings();}
      // A new grid can clamp tokens and increment their revisions. Read the
      // current token and scene only after the scene response has been applied.
      return task();
    });
  }
  function drawNode(node,token) {
    const grid=getGrid(),cell=Number.isFinite(grid.cellSize)&&grid.cellSize>=5?grid.cellSize:getScene().grid.cellSize;
    const size=token.size_cells*cell;
    node.style.width=`${size}px`;node.style.height=`${size}px`;node.style.left=`${token.x}px`;node.style.top=`${token.y}px`;
    node.style.borderWidth=`${Math.min(3,size/12)}px`;
    node.style.setProperty('--token-border',token.border_color);
  }
  function render() {
    const floorCount=find(`[data-vtt-floor="${getScene().id}"] small`);
    if(floorCount)floorCount.textContent=t(getScene().has_map?'Map ready':'Empty map')+' · '+t('Tokens')+': '+tokens.length;
    const ids=new Set(tokens.map(token=>token.id));
    for(const [id,node] of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
    for(const token of tokens) {
      let node=nodes.get(token.id);
      if(!node) {
        node=document.createElement('button');node.type='button';node.className='vtt-token';node.dataset.tokenId=token.id;
        const body=document.createElement('span');body.className='vtt-token-face';node.append(body);
        const badge=document.createElement('span');badge.className='vtt-token-relation';node.append(badge);
        const number=document.createElement('span');number.className='vtt-token-number';node.append(number);
        const label=document.createElement('span');label.className='vtt-token-label';node.append(label);
        layer.append(node);nodes.set(token.id,node);
      }
      const appearance=`${token.has_image}:${token.image_mode}:${token.image_revision}:${token.icon_type}:${token.icon_color}:${token.art?.url||''}`;
      if(node.dataset.appearance!==appearance) {
        node.dataset.appearance=appearance;
        paintTokenFace(node.querySelector('.vtt-token-face'),token);
      }
      const label=tokenLabel(token),relation=t({friendly:'Friendly',neutral:'Neutral',hostile:'Hostile'}[token.relation]);
      node.title=label+' · '+relation;node.setAttribute('aria-label',label);node.setAttribute('aria-pressed',String(token.id===selected));node.classList.toggle('is-selected',token.id===selected);
      const badge=node.querySelector('.vtt-token-relation');badge.textContent={friendly:'+',neutral:'·',hostile:'−'}[token.relation];badge.dataset.relation=token.relation;badge.title=relation;
      const number=node.querySelector('.vtt-token-number');number.hidden=!token.ordinal;number.textContent=token.ordinal||'';
      node.querySelector('.vtt-token-label').textContent=label;drawNode(node,token);
    }
    list.replaceChildren();
    for(const token of tokens) {
      const button=document.createElement('button');button.type='button';button.dataset.selectToken=token.id;button.className='vtt-token-list-item';button.setAttribute('aria-pressed',String(token.id===selected));
      const symbol=document.createElement('span');symbol.className='vtt-art-thumb';paintTokenFace(symbol,token,{lazy:true});button.append(symbol);
      const label=document.createElement('span');label.textContent=tokenLabel(token);button.append(label);list.append(button);
    }
    find('[data-vtt-map-empty]').hidden=getScene().has_map||tokens.length>0;
  }
  function fillEditor() {
    const token=selectedToken();editor.hidden=!token;find('[data-token-hint]').hidden=!!token;
    if(!token){saved='';return;}
    for(const key of Object.keys(editorData()))editor.elements.namedItem(key).value=token[key]??'';
    saved=snapshot(token);find('[data-token-custom-option]').disabled=!token.has_custom_image;
    find('[data-token-remove-image]').hidden=!token.has_custom_image;
    const link=find('[data-token-source-link]');link.hidden=!token.character_id&&!token.entity_id;
    if(!link.hidden){link.href=token.character_id?`/character/${token.character_id}`:`/entity/${token.entity_id}`;link.textContent=t(token.character_id?'Open character sheet':'Open creature entry');}
    find('[data-token-source-missing]').hidden=token.kind==='npc'||!link.hidden;
    previewIcon();artUi?.refresh();updateDirty();
  }
  function select(id) {
    if(selected!==id&&isDirty()&&!confirm(t('Discard unsaved token changes?')))return false;
    const changed=selected!==id;selected=id;tab('tokens');if(changed)fillEditor();render();return true;
  }
  function replaceToken(token,fill=true) {
    const index=tokens.findIndex(row=>row.id===token.id);if(index<0)tokens.push(token);else tokens[index]=token;
    if(fill&&selected===token.id)fillEditor();render();
  }
  list.addEventListener('click',event=>{const button=event.target.closest('[data-select-token]');if(button)select(button.dataset.selectToken);});
  editor.addEventListener('input',event=>{
    updateDirty();if(['icon_type','icon_color','border_color'].includes(event.target.name))previewIcon();
    if(event.target.name==='image_mode')artUi?.refresh();
  });
  editor.addEventListener('submit',event=>{
    event.preventDefault();if(!canChange())return;
    const fields=editorData();
    runChange(async()=>{const token=selectedToken(),body={...fields,revision:token.revision,scene_revision:getScene().revision};const result=await api(`/api/tabletop/tokens/${token.id}`,'PUT',body);replaceToken(result.token);message('Token saved');});
  });
  async function search() {
    const serial=++searchSerial,kind=addForm.elements.namedItem('kind').value;
    const custom=kind==='npc';find('[data-token-source-fields]').hidden=custom;find('[data-token-npc-field]').hidden=!custom;
    addForm.elements.namedItem('name').disabled=!custom;
    if(custom)return;
    const select=find('[data-token-sources]'),status=find('[data-token-search-status]');select.replaceChildren();status.textContent=t('Loading sources…');
    try {
      const q=find('[data-token-search]').value;
      const result=await api(`/api/tabletop/scenes/${getScene().id}/sources?kind=${kind}&q=${encodeURIComponent(q)}`,'GET');
      if(serial!==searchSerial)return;
      for(const entry of result.sources) {
        const option=document.createElement('option');option.value=entry.id;option.dataset.size=entry.size_cells||1;
        option.textContent=entry.name+(kind==='creature'?` · ${entry.ruleset||''}`:'');select.append(option);
      }
      status.textContent=result.sources.length?'':t('No matches. Change the search or add an NPC.');
    } catch(error) {if(serial===searchSerial)status.textContent=error.message;}
  }
  addForm.elements.namedItem('kind').addEventListener('change',()=>{find('[data-token-search]').value='';search();});
  find('[data-token-search]').addEventListener('input',()=>{clearTimeout(searchTimer);searchSerial++;searchTimer=setTimeout(search,250);});
  addForm.addEventListener('submit',event=>{
    event.preventDefault();if(!canChange())return;
    if(isDirty()&&!confirm(t('Discard unsaved token changes?')))return;
    const kind=addForm.elements.namedItem('kind').value,source=find('[data-token-sources]');
    if(kind!=='npc'&&!source.value){message('No matches. Change the search or add an NPC.',true);return;}
    runChange(async()=>{
      const camera=getCamera(),cell=getScene().grid.cellSize,size=kind==='npc'?1:Number(source.selectedOptions[0]?.dataset.size||1);
      const body={kind,source_id:source.value,name:addForm.elements.namedItem('name').value,scene_revision:getScene().revision,snap:snap(),
        x:(viewport.clientWidth/2-camera.x)/camera.scale-cell*size/2,y:(viewport.clientHeight/2-camera.y)/camera.scale-cell*size/2};
      const result=await api(`/api/tabletop/scenes/${getScene().id}/tokens`,'POST',body);selected=result.token.id;replaceToken(result.token);tab('tokens');message(result.created?'Token added':'Character already on this map.');
    });
  });
  async function move(token,x,y) {
    const p=tokenPosition(interactionScene(),token.size_cells,x,y,snap());
    drawNode(nodes.get(token.id),{...token,...p});
    const result=await runChange(async()=>{
      const current=tokens.find(row=>row.id===token.id);
      const position=tokenPosition(getScene(),current.size_cells,x,y,snap());
      const result=await api(`/api/tabletop/tokens/${token.id}`,'PUT',{action:'move',...position,snap:snap(),revision:current.revision,scene_revision:getScene().revision});
      replaceToken(result.token,!isDirty());message('Token moved');return result;
    });
    if(!result)render();
  }
  layer.addEventListener('pointerdown',event=>{
    const node=event.target.closest('[data-token-id]');if(!node||mode==='pan'||event.button!==0)return;
    event.stopPropagation();event.preventDefault();if(!canChange()||!select(node.dataset.tokenId))return;
    const token=selectedToken();node.focus({preventScroll:true});node.setPointerCapture(event.pointerId);
    drag={token,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:token.x,y:token.y,moved:false};
  });
  layer.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;event.stopPropagation();
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(Math.hypot(dx,dy)>3)drag.moved=true;
    if(drag.moved){const scale=getCamera().scale;drag.x=drag.token.x+dx/scale;drag.y=drag.token.y+dy/scale;drawNode(nodes.get(drag.token.id),{...drag.token,...tokenPosition(interactionScene(),drag.token.size_cells,drag.x,drag.y,snap())});}
  });
  layer.addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;event.stopPropagation();
    const completed=drag;drag=null;if(completed.moved)move(completed.token,completed.x,completed.y);
  });
  for(const name of ['pointercancel','lostpointercapture'])layer.addEventListener(name,()=>{if(drag){drag=null;render();}});
  layer.addEventListener('click',event=>{if(mode==='pan')return;const node=event.target.closest('[data-token-id]');if(node){event.stopPropagation();select(node.dataset.tokenId);}});
  layer.addEventListener('keydown',event=>{
    const node=event.target.closest('[data-token-id]');if(!node||mode==='pan'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();if(!canChange()||!select(node.dataset.tokenId))return;
    const token=selectedToken(),step=snap()?getGrid().cellSize:event.shiftKey?10:1;
    move(token,token.x+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),token.y+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));
  });
  find('[data-token-delete]').addEventListener('click',()=>{
    if(!canChange()||!confirm(t('Delete this token? Its source will remain.')))return;
    runChange(async()=>{const token=selectedToken();await api(`/api/tabletop/tokens/${token.id}`,'DELETE',{revision:token.revision,scene_revision:getScene().revision});tokens=tokens.filter(row=>row.id!==token.id);selected=null;fillEditor();render();message('Token deleted');});
  });

  const dialog=find('[data-token-crop]'),canvas=find('[data-token-crop-canvas]');let portrait=null,portraitUrl=null;
  function drawCrop() {
    if(!portrait)return;
    const zoom=Number(find('[data-token-crop-zoom]').value),x=Number(find('[data-token-crop-x]').value)/100,y=Number(find('[data-token-crop-y]').value)/100;
    const scale=Math.max(512/portrait.naturalWidth,512/portrait.naturalHeight)*zoom,w=portrait.naturalWidth*scale,h=portrait.naturalHeight*scale;
    const context=canvas.getContext('2d');context.clearRect(0,0,512,512);context.drawImage(portrait,(512-w)*x,(512-h)*y,w,h);
  }
  for(const selector of ['[data-token-crop-zoom]','[data-token-crop-x]','[data-token-crop-y]'])find(selector).addEventListener('input',drawCrop);
  const portraitReady=()=>{if(!canChange())return false;if(isDirty()){message('Save token settings before changing the portrait.',true);return false;}return true;};
  find('[data-token-file]').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||!portraitReady())return;
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(t('Unsupported image format. Use PNG, JPEG or WebP.'));
      if(file.size>20_000_000)throw new Error(t('The image is too large. Choose a file up to 20 MB.'));
      portraitUrl=URL.createObjectURL(file);
      portrait=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(t('The image could not be read.')));img.src=portraitUrl;});
      find('[data-token-crop-status]').textContent='';find('[data-token-crop-zoom]').value='1';find('[data-token-crop-x]').value='50';find('[data-token-crop-y]').value='50';drawCrop();dialog.showModal();
    } catch(error) {if(portraitUrl)URL.revokeObjectURL(portraitUrl);portraitUrl=null;portrait=null;message(error.message,true);}
  });
  dialog.addEventListener('close',()=>{if(portraitUrl)URL.revokeObjectURL(portraitUrl);portraitUrl=null;portrait=null;});
  find('[data-token-crop-cancel]').addEventListener('click',()=>dialog.close());
  find('[data-token-crop-apply]').addEventListener('click',async()=>{
    if(!portraitReady())return;
    const dataUrl=canvas.toDataURL('image/png');
    await runChange(async()=>{const token=selectedToken(),body={revision:token.revision,scene_revision:getScene().revision,data_url:dataUrl};const result=await api(`/api/tabletop/tokens/${token.id}/image`,'POST',body);replaceToken(result.token);dialog.close();message('Portrait saved');});
    if(dialog.open)find('[data-token-crop-status]').textContent=find('[data-vtt-status]').textContent;
  });
  find('[data-token-remove-image]').addEventListener('click',()=>{
    if(!portraitReady())return;
    runChange(async()=>{const token=selectedToken();const result=await api(`/api/tabletop/tokens/${token.id}/image`,'DELETE',{revision:token.revision,scene_revision:getScene().revision});replaceToken(result.token);message('Token saved');});
  });
  artUi=initArtPicker({...ctx,selectedToken,onChoose(){previewIcon();updateDirty();}});
  transferUi=initTransferTool({...ctx,runChange,getTokens:()=>tokens,isDirty,canChange,selectedToken,acceptTokens(next){tokens=next;if(!tokens.some(token=>token.id===selected)){selected=null;fillEditor();}render();}});
  render();search();
  return {isDirty,updateDirty,render,replaceList(next){tokens=next;if(selected&&!tokens.some(row=>row.id===selected)){selected=null;fillEditor();}else if(selected&&!isDirty())fillEditor();render();}};
}
