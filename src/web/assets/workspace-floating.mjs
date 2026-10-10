// Separate personal window geometry. Dock preferences and game records stay intact.
export const floatingKey=key=>key.replace('dnd-workspace:v2:','dnd-workspace-windows:v1:');
export function fitWindow(rect,width,height){
  width=Math.max(1,width);height=Math.max(1,height);
  const w=Math.min(width,Math.max(Math.min(220,width),rect.w)),h=Math.min(height,Math.max(Math.min(140,height),rect.h));
  return {x:Math.max(0,Math.min(width-w,rect.x)),y:Math.max(0,Math.min(height-h,rect.y)),w,h};
}
export function changeWindow(rect,edge,dx,dy,width,height){
  if(edge==='move')return fitWindow({...rect,x:rect.x+dx,y:rect.y+dy},width,height);
  let left=rect.x,top=rect.y,right=left+rect.w,bottom=top+rect.h;
  if(edge.includes('w'))left=Math.max(0,Math.min(right-Math.min(220,width),left+dx));
  if(edge.includes('e'))right=Math.min(width,Math.max(left+Math.min(220,width),right+dx));
  if(edge.includes('n'))top=Math.max(0,Math.min(bottom-Math.min(140,height),top+dy));
  if(edge.includes('s'))bottom=Math.min(height,Math.max(top+Math.min(140,height),bottom+dy));
  return fitWindow({x:left,y:top,w:right-left,h:bottom-top},width,height);
}
export function readWindows(storage,key,names){
  let saved;try{saved=JSON.parse(storage.getItem(floatingKey(key)));}catch{}
  const windows={};for(const name of names){const r=saved?.version===1?saved.windows?.[name]:null;if(r&&['x','y','w','h'].every(k=>Number.isFinite(r[k])))windows[name]={x:r.x,y:r.y,w:r.w,h:r.h};}
  const scales={};for(const name of names){const v=saved?.scales?.[name];if(Number.isFinite(v))scales[name]=Math.min(130,Math.max(70,v));}
  return {version:1,mode:saved?.mode==='docks'?'docks':'floating',windows,scales};
}
export function defaultWindow(name,width,height){
 const presets={locations:[12,12,240,420],inspector:[width-332,12,320,500],help:[32,height-240,340,220],inventory:[width-370,80,350,440],spells:[width-420,120,380,440],abilities:[width-460,160,400,440],library:[280,40,300,380]};
 const [x,y,w,h]=presets[name]||[20,20,300,400];return fitWindow({x,y,w,h},width,height);
}
