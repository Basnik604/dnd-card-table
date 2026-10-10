import {initWorkspace} from './workspace.js';
import {initWorkspaceData} from './workspace-data.js';
import {initTokens} from './tabletop-tokens.js';
import {tabletopText} from './tabletop-i18n.mjs';

const root=document.querySelector('[data-vtt-root]');
if(root) initTabletop(root);

function initTabletop(root) {
  const cfg=JSON.parse(root.querySelector('[data-vtt-config]').textContent);
  const t=text=>tabletopText(text,cfg.lang),find=selector=>root.querySelector(selector);
  const workspace=initWorkspace(root,{sessionId:cfg.session?.id,t});
  const workspaceData=cfg.scene?initWorkspaceData(root,{sessionId:cfg.session.id,sceneId:cfg.scene.id,t}):null;
  const floorName=value=>value==='Ground floor'?t('Ground floor'):value;
  let scene=cfg.scene,busy=false,dirty=false,tokenUi=null;
  const status=find('[data-vtt-status]'),reload=find('[data-vtt-reload]'),form=find('[data-vtt-settings]');
  let saved=scene?JSON.stringify({name:scene.location_name,grid:scene.grid}):'';
  function message(text,error=false,conflict=false) {
    status.textContent=t(text); status.classList.toggle('is-error',error); status.setAttribute('role',error?'alert':'status');
    reload.hidden=!conflict;
  }
  reload.addEventListener('click',()=>location.reload());
  function data() {
    const field=name=>form.elements.namedItem(name);
    const number=name=>field(name).value===''?NaN:Number(field(name).value);
    return {name:field('name').value.trim(),floor_name:field('floor_name').value.trim(),location_revision:scene.location_revision,grid:{cellSize:number('cellSize'),offsetX:number('offsetX'),offsetY:number('offsetY'),opacity:number('opacity'),color:field('color').value,visible:field('visible').checked,distance:number('distance'),unit:field('unit').value}};
  }
  // Explicit key order keeps dirty tracking independent of PostgreSQL jsonb's
  // property ordering.
  const snapshot=value=>JSON.stringify([value.name,value.floor_name,...['cellSize','offsetX','offsetY','opacity','color','visible','distance','unit'].map(key=>value.grid[key])]);
  if(scene) saved=snapshot({name:scene.location_name,floor_name:floorName(scene.floor_name),grid:scene.grid});
  function updateDirty() {
    if(!form) return;
    dirty=snapshot(data())!==saved;
    find('[data-vtt-save]').disabled=busy||!dirty;
    find('[data-vtt-save-state]').textContent=t(busy?'Saving…':dirty?'Unsaved changes':'Saved');
    find('[data-vtt-grid-pending]').hidden=!dirty;
  }
  window.addEventListener('beforeunload',event=>{ if(dirty||busy||tokenUi?.isDirty()){ event.preventDefault(); event.returnValue=''; } });
  async function api(endpoint,method,body) {
    let response;
    try { response=await fetch(endpoint,{method,headers:{'Content-Type':'application/json','X-Tabletop-Request':'1'},body:method==='GET'?undefined:JSON.stringify(body)}); }
    catch { throw new Error(t('Could not reach the server. Your changes have not been saved.')); }
    if(!response.headers.get('content-type')?.includes('application/json')) throw new Error(t('The server returned an unexpected response. Reload the page and try again.'));
    let result;
    try { result=await response.json(); }
    catch { throw new Error(t('The server returned an unexpected response. Reload the page and try again.')); }
    if(!response.ok) { const error=new Error(result.error||t('Could not save the table. Please try again.')); error.status=response.status; throw error; }
    return result;
  }
  async function run(task) {
    if(busy) return;
    busy=true; root.setAttribute('aria-busy','true');
    const controls=[...root.querySelectorAll('button:not([data-workspace-control]),input:not([data-workspace-control]),select:not([data-workspace-control])')].map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true); updateDirty();
    try { return await task(); }
    catch(error) { message(error.message,true,error.status===409); return null; }
    finally { busy=false;root.removeAttribute('aria-busy');controls.forEach(([el,disabled])=>el.disabled=disabled);updateDirty();tokenUi?.updateDirty(); }
  }
  function navigate(url) { busy=false;location.assign(url); }
  root.querySelectorAll('form[data-vtt-api]').forEach(el=>el.addEventListener('submit',event=>{
    event.preventDefault();
    const body=Object.fromEntries(new FormData(el));
    run(async()=>{
      const result=await api(el.dataset.vttApi,el.dataset.vttMethod||'POST',body);
      busy=false;
      if(el.dataset.vttMethod==='PUT' && scene) result.url+=`?location=${scene.location_id}&scene=${scene.id}`;
      navigate(result.url);
    });
  }));
  find('[data-vtt-delete-session]')?.addEventListener('click',()=>{
    if(!confirm(t('Delete this session and all its locations and maps?'))) return;
    run(async()=>{const result=await api(`/api/tabletop/sessions/${cfg.session.id}`,'DELETE',{});dirty=false;busy=false;navigate(result.url);});
  });
  if(!scene) return;

  const viewport=find('[data-vtt-viewport]'),map=find('[data-vtt-map]'),img=find('[data-vtt-map-image]');
  find('.vtt-stage-toolbar').append(find('.vtt-token-tools')); 
  const topbar=document.querySelector('.topbar');
  function headerSpace() {
    if(!topbar)return;
    const style=getComputedStyle(topbar);
    const pinned=['sticky','fixed'].includes(style.position);
    root.style.setProperty('--vtt-sticky-top',`${pinned?topbar.offsetHeight+(parseFloat(style.top)||0)+12:14}px`);
  }
  if(topbar)new ResizeObserver(headerSpace).observe(topbar);
  new MutationObserver(headerSpace).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const gridSvg=find('[data-vtt-grid]'),pattern=gridSvg.querySelector('pattern'),gridPath=pattern.querySelector('path');
  const cameraKey=`dnd-vtt-camera:${scene.id}`;
  let width=scene.map_width||2000,height=scene.map_height||1400,camera={x:0,y:0,scale:1},cameraReady=false;
  let persistFrame=0;
  function drawCamera(persist=true) {
    camera.x=Math.max(48-width*camera.scale,Math.min(viewport.clientWidth-48,camera.x));
    camera.y=Math.max(48-height*camera.scale,Math.min(viewport.clientHeight-48,camera.y));
    map.style.setProperty('--token-label-scale',Math.min(3,Math.max(1,1/camera.scale)));
    map.style.transform=`translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
    find('[data-vtt-zoom-label]').textContent=`${Math.round(camera.scale*100)}%`;
    if(persist && !persistFrame) persistFrame=requestAnimationFrame(()=>{
      persistFrame=0;
      try { localStorage.setItem(cameraKey,JSON.stringify({...camera,width,height})); } catch { /* Viewing remains usable if storage is unavailable. */ }
    });
  }
  function fit() {
    camera={scale:Math.min(1,Math.max(0.02,Math.min((viewport.clientWidth-64)/width,(viewport.clientHeight-64)/height))),x:0,y:0};
    camera.x=(viewport.clientWidth-width*camera.scale)/2;camera.y=(viewport.clientHeight-height*camera.scale)/2;
    drawCamera();
  }
  function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2) {
    const scale=Math.max(0.02,Math.min(6,camera.scale*factor));
    camera.x=cx-(cx-camera.x)*scale/camera.scale;
    camera.y=cy-(cy-camera.y)*scale/camera.scale;
    camera.scale=scale;drawCamera();
  }
  function gridPreview() {
    const g=data().grid;
    if(!Number.isFinite(g.cellSize)||g.cellSize<5||g.cellSize>500||!Number.isFinite(g.offsetX)||!Number.isFinite(g.offsetY)) return;
    pattern.setAttribute('width',g.cellSize);pattern.setAttribute('height',g.cellSize);
    pattern.setAttribute('x',g.offsetX);pattern.setAttribute('y',g.offsetY);
    gridPath.setAttribute('d',`M ${g.cellSize} 0 H 0 V ${g.cellSize}`);
    gridPath.setAttribute('stroke',g.color);gridSvg.style.opacity=g.opacity;gridSvg.style.display=g.visible?'':'none';
    find('[data-vtt-opacity]').textContent=`${Math.round(g.opacity*100)}%`;
    tokenUi?.render();
    find('[data-vtt-cell-label]').textContent=`□ = ${Number.isFinite(g.distance)?g.distance:'—'} ${t(g.unit)}`;
  }
  function mapDimensions() {
    width=scene.map_width||2000;height=scene.map_height||1400;
    map.style.width=`${width}px`;map.style.height=`${height}px`;
    gridSvg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  }
  function mapImage() {
    mapDimensions();img.hidden=true;
    find('[data-vtt-map-empty]').hidden=scene.has_map;
    if(scene.has_map) {
      img.onload=()=>{img.hidden=false;};
      img.onerror=()=>message('Map could not be displayed. Reload the page or replace the image.',true);
      img.src=`/media/tabletop/${scene.id}?v=${scene.revision}`;
    } else img.removeAttribute('src');
  }
  function acceptScene(next,mapChanged=false,nextTokens) {
    scene=next;
    for(const [key,value] of Object.entries(scene.grid)) {
      const input=form.elements.namedItem(key); if(input.type==='checkbox')input.checked=value;else input.value=value;
    }
    form.elements.namedItem('name').value=scene.location_name;
    form.elements.namedItem('floor_name').value=floorName(scene.floor_name);
    saved=snapshot({name:scene.location_name,floor_name:floorName(scene.floor_name),grid:scene.grid});
    find('[data-vtt-location-title]').textContent=scene.location_name;
    find('[data-vtt-floor-title]').textContent=floorName(scene.floor_name);
    find(`[data-vtt-floor="${scene.id}"] strong`).textContent=floorName(scene.floor_name);
    const entry=find(`[data-vtt-location="${scene.location_id}"]`);
    entry.querySelector('strong').textContent=scene.location_name;entry.querySelector('small').textContent=t(scene.location_has_map?'Map ready':'Empty map');
    find('[data-vtt-upload-label]').textContent=t(scene.has_map?'Replace map':'Upload map');
    find('[data-vtt-file-name]').textContent=scene.map_name||'';
    find('[data-vtt-remove-map]').hidden=!scene.has_map;
    if(mapChanged) { mapImage();fit(); }
    if(nextTokens)tokenUi?.replaceList(nextTokens);
    gridPreview();updateDirty();
  }
  form.addEventListener('input',()=>{gridPreview();updateDirty();});
  function validateMapSettings() {
    if(form.checkValidity())return true;
    find('[data-inspector-tab="map"]').click();form.reportValidity();
    message('Check the map settings before continuing.',true);return false;
  }
  async function saveMapSettings() {
    // Called inside run(), including before a token mutation. Never nest run().
    if(!dirty)return;
    const body={...data(),revision:scene.revision};
    const result=await api(`/api/tabletop/scenes/${scene.id}`,'PUT',body);
    acceptScene(result.scene,false,result.tokens);
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!dirty||!validateMapSettings())return;
    run(async()=>{await saveMapSettings();message('Saved');});
  });
  async function readDataUrl(blob) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error(t('The image could not be read.')));reader.readAsDataURL(blob);});
  }
  async function prepareMap(file) {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error(t('Unsupported image format. Use PNG, JPEG or WebP.'));
    if(file.size>20_000_000) throw new Error(t('The image is too large. Choose a file up to 20 MB.'));
    const url=URL.createObjectURL(file);
    try {
      const source=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(t('The image could not be read.')));image.src=url;});
      const scale=Math.min(1,4096/Math.max(source.naturalWidth,source.naturalHeight));
      let blob=file;
      if(scale<1 || file.size>12_000_000) {
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
        canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
        blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.94));
      }
      if(!blob) throw new Error(t('The image could not be read.'));
      if(blob.size>12_000_000) throw new Error(t('The prepared map exceeds the upload limit. Choose a smaller image.'));
      return readDataUrl(blob);
    } finally { URL.revokeObjectURL(url); }
  }
  async function upload(file) {
    if(!file||busy) return;
    if(!validateMapSettings()) return;
    if(scene.has_map && !confirm(t('Replace this map? Its current grid settings will be kept.'))) return;
    const body={...data(),revision:scene.revision,file_name:file.name};
    await run(async()=>{
      message('Loading map…');body.data_url=await prepareMap(file);
      const result=await api(`/api/tabletop/scenes/${scene.id}/map`,'POST',body);
      acceptScene(result.scene,true,result.tokens);message('Map uploaded');
    });
    find('[data-vtt-file]').value='';
  }
  find('[data-vtt-file]').addEventListener('change',event=>upload(event.target.files[0]));
  viewport.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';viewport.classList.add('is-drop-target');});
  viewport.addEventListener('dragleave',()=>viewport.classList.remove('is-drop-target'));
  viewport.addEventListener('drop',event=>{event.preventDefault();viewport.classList.remove('is-drop-target');upload(event.dataTransfer.files[0]);});
  find('[data-vtt-remove-map]').addEventListener('click',()=>{
    if(!form.reportValidity()||!confirm(t('Remove the map image? The location and grid will remain.'))) return;
    const body={...data(),revision:scene.revision};
    run(async()=>{const result=await api(`/api/tabletop/scenes/${scene.id}/map`,'DELETE',body);acceptScene(result.scene,true,result.tokens);message('Map removed');});
  });
  find('[data-vtt-delete-location]').addEventListener('click',()=>{
    if(!confirm(t('Delete this location, all its floors, maps and tokens?'))) return;
    run(async()=>{await api(`/api/tabletop/locations/${scene.location_id}`,'DELETE',{revision:scene.revision,location_revision:scene.location_revision});dirty=false;busy=false;navigate(`/tabletop/${cfg.session.id}`);});
  });
  function floorReady() {
    if(tokenUi?.isDirty()){message('Save token settings before changing floors.',true);return false;}
    return !busy&&validateMapSettings();
  }
  find('[data-floor-add]').addEventListener('submit',event=>{
    event.preventDefault();if(!floorReady())return;
    const name=event.currentTarget.elements.namedItem('name').value;
    run(async()=>{await saveMapSettings();const result=await api(`/api/tabletop/locations/${scene.location_id}/scenes`,'POST',{name,location_revision:scene.location_revision});navigate(result.url);});
  });
  root.querySelectorAll('[data-floor-order]').forEach(button=>button.addEventListener('click',()=>{
    if(!floorReady())return;
    run(async()=>{await saveMapSettings();const result=await api(`/api/tabletop/scenes/${scene.id}/order`,'PUT',{direction:button.dataset.floorOrder,location_revision:scene.location_revision});navigate(result.url);});
  }));
  find('[data-vtt-delete-floor]').addEventListener('click',()=>{
    if(!confirm(t('Delete this floor and its map? Tokens must be moved first.')))return;
    run(async()=>{const result=await api(`/api/tabletop/scenes/${scene.id}`,'DELETE',{revision:scene.revision,location_revision:scene.location_revision});dirty=false;navigate(result.url);});
  });

  find('[data-vtt-fit]').addEventListener('click',fit);
  find('[data-vtt-fill]')?.addEventListener('click',()=>{camera.scale=Math.max(viewport.clientWidth/width,viewport.clientHeight/height);camera.x=(viewport.clientWidth-width*camera.scale)/2;camera.y=(viewport.clientHeight-height*camera.scale)/2;drawCamera();});
  root.querySelectorAll('[data-vtt-zoom]').forEach(button=>button.addEventListener('click',()=>zoom(button.dataset.vttZoom==='in'?1.25:0.8)));
  viewport.addEventListener('wheel',event=>{event.preventDefault();const rect=viewport.getBoundingClientRect();zoom(Math.exp(-Math.max(-300,Math.min(300,event.deltaY))*0.002),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
  const pointers=new Map();
  viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.button!==1) return;
    event.preventDefault();viewport.focus({preventScroll:true});viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const before=[...pointers.values()];pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===1) {camera.x+=event.clientX-previous.x;camera.y+=event.clientY-previous.y;drawCamera();}
    else if(pointers.size===2) {
      const after=[...pointers.values()],rect=viewport.getBoundingClientRect();
      const distance=pair=>Math.hypot(pair[1].x-pair[0].x,pair[1].y-pair[0].y);
      const cx=(before[0].x+before[1].x)/2-rect.left,cy=(before[0].y+before[1].y)/2-rect.top;
      zoom(distance(after)/Math.max(1,distance(before)),cx,cy);
      camera.x+=(after[0].x+after[1].x-before[0].x-before[1].x)/2;
      camera.y+=(after[0].y+after[1].y-before[0].y-before[1].y)/2;drawCamera();
    }
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(name,event=>{pointers.delete(event.pointerId);if(!pointers.size)viewport.classList.remove('is-dragging');});
  viewport.addEventListener('keydown',event=>{
    const delta=event.shiftKey?100:35;
    if(event.key==='ArrowLeft')camera.x+=delta;else if(event.key==='ArrowRight')camera.x-=delta;
    else if(event.key==='ArrowUp')camera.y+=delta;else if(event.key==='ArrowDown')camera.y-=delta;
    else if(['+','='].includes(event.key))zoom(1.25);else if(event.key==='-')zoom(0.8);
    else if(event.key==='0')fit();else return;
    event.preventDefault();drawCamera();
  });
  find('[data-vtt-fullscreen]').addEventListener('click',async()=>{
    try { if(document.fullscreenElement)await document.exitFullscreen();else await find('[data-vtt-stage]').requestFullscreen(); }
    catch {message('Full screen is unavailable in this browser.',true);}
  });
  document.addEventListener('fullscreenchange',()=>{
    const button=find('[data-vtt-fullscreen]'),label=t(document.fullscreenElement?'Exit full screen':'Full screen');
    button.title=label;button.setAttribute('aria-label',label);
  });
  mapImage();gridPreview();
  tokenUi=initTokens({root,workspace,workspaceData,api,run,t,message,viewport,map,navigate,tokens:cfg.tokens,getScene:()=>scene,getCamera:()=>camera,getGrid:()=>data().grid,isBusy:()=>busy,mapDirty:()=>dirty,validateMapSettings,saveMapSettings});
  let previousWidth=0,previousHeight=0;
  const observer=new ResizeObserver(()=>{
    if(!cameraReady) {
      cameraReady=true;
      let stored;
      try { stored=JSON.parse(localStorage.getItem(cameraKey)); } catch { /* First visit or disabled storage. */ }
      if(stored&&stored.width===width&&stored.height===height&&['x','y','scale'].every(key=>Number.isFinite(stored[key]))&&stored.scale>=0.02&&stored.scale<=6) {camera=stored;drawCamera(false);} else fit();
    } else {camera.x+=(viewport.clientWidth-previousWidth)/2;camera.y+=(viewport.clientHeight-previousHeight)/2;drawCamera();}
    previousWidth=viewport.clientWidth;previousHeight=viewport.clientHeight;
  });
  observer.observe(viewport);
}
