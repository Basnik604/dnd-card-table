const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const floorLabel=(name,t)=>name==='Ground floor'?t('Ground floor'):name;
export function renderFloorNavigation(scene,floors,sessionId,t) {
  if(!scene)return '';
  const local=floors.filter(s=>s.location_id===scene.location_id),index=local.findIndex(s=>s.id===scene.id);
  return `<section class="vtt-floor-panel"><h3>${t('Floors and scenes')} <small>${local.length}</small></h3>
    <nav class="vtt-floor-list" aria-label="${t('Floors and scenes')}">${local.map(s=>`<a data-vtt-floor="${s.id}" href="/tabletop/${sessionId}?location=${s.location_id}&scene=${s.id}" ${s.id===scene.id?'aria-current="page"':''}><span class="vtt-floor-symbol">▱</span><span><strong>${e(floorLabel(s.floor_name,t))}</strong><small>${t(s.has_map?'Map ready':'Empty map')} · ${t('Tokens')}: ${s.token_count}</small></span></a>`).join('')}</nav>
    <div class="vtt-floor-order"><button type="button" data-floor-order="up" ${index<=0?'disabled':''} title="${t('Move floor up')}">↑ ${t('Move up')}</button><button type="button" data-floor-order="down" ${index>=local.length-1?'disabled':''} title="${t('Move floor down')}">↓ ${t('Move down')}</button></div>
    <details class="vtt-new-floor"><summary>+ ${t('New floor')}</summary><form data-floor-add><label>${t('Floor name')}<input name="name" required maxlength="120" placeholder="${t('For example: Basement')}" autocomplete="off"></label><button type="submit">+ ${t('Add floor')}</button></form></details></section>`;
}
