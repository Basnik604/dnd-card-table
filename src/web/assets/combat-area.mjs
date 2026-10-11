// Positions are map pixels; sizes use the scene's distance units.
export function areaGeometry(area,grid){
 if(!area||!['circle','sphere','cylinder','cone','line','square','cube','emanation'].includes(area.shape))throw Error('Invalid area.');
 for(const key of ['x','y','size','angle','width'])if(!Number.isFinite(area[key]))throw Error('Invalid area.');
 if(area.size<=0||area.size>1000||area.width<=0||area.width>1000||Math.abs(area.x)>100000||Math.abs(area.y)>100000)throw Error('Invalid area.');
 const scale=grid.cellSize/grid.distance,length=area.size*scale,width=area.width*scale,angle=area.angle*Math.PI/180;
 return {...area,length,pixelWidth:width,cos:Math.cos(angle),sin:Math.sin(angle)};
}
export function insideArea(point,area,grid){
 const g=areaGeometry(area,grid),dx=point.x-g.x,dy=point.y-g.y,u=dx*g.cos+dy*g.sin,v=-dx*g.sin+dy*g.cos,e=1e-7;
 if(['circle','sphere','cylinder'].includes(g.shape))return dx*dx+dy*dy<=g.length*g.length+e;
 if(g.shape==='emanation'){const dx=Math.max(0,Math.abs(u)-g.pixelWidth/2),dy=Math.max(0,Math.abs(v)-g.pixelWidth/2);return dx*dx+dy*dy<=g.length*g.length+e;}
 if(g.shape==='cube')return u>=-e&&u<=g.length+e&&Math.abs(v)<=g.length/2+e;
 if(g.shape==='square')return Math.abs(u)<=g.length/2+e&&Math.abs(v)<=g.length/2+e;
 if(g.shape==='cone')return u>=-e&&u<=g.length+e&&Math.abs(v)<=u/2+e;
 return u>=-e&&u<=g.length+e&&Math.abs(v)<=g.pixelWidth/2+e;
}
export function areaTargets(tokens,area,grid){
 const g=areaGeometry(area,grid),spec=areaSvg(area,grid);
 const polygon=spec.tag==='polygon'?spec.attrs.points.split(' ').map(pair=>pair.split(',').map(Number)):null;
 return tokens.filter(token=>{
  const x=Number(token.x),y=Number(token.y),size=Number(token.size_cells)*grid.cellSize;
  if(g.shape==='circle'){const dx=g.x-Math.max(x,Math.min(x+size,g.x)),dy=g.y-Math.max(y,Math.min(y+size,g.y));return dx*dx+dy*dy<=g.length*g.length+1e-7;}
  if(g.shape==='emanation'){const half=g.pixelWidth/2,dx=Math.max(g.x-half-x-size,x-g.x-half,0),dy=Math.max(g.y-half-y-size,y-g.y-half,0);return dx*dx+dy*dy<=g.length*g.length+1e-7;}
  const box=[[x,y],[x+size,y],[x+size,y+size],[x,y+size]];
  for(const points of [box,polygon])for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],axis=[a[1]-b[1],b[0]-a[0]],project=list=>list.map(p=>p[0]*axis[0]+p[1]*axis[1]),p=project(box),q=project(polygon);if(Math.max(...p)<Math.min(...q)-1e-7||Math.max(...q)<Math.min(...p)-1e-7)return false;}
  return true;
 }).map(t=>t.id);
}
export function areaSvg(area,grid){
 const g=areaGeometry(area,grid),turn=point=>`${g.x+point[0]*g.cos-point[1]*g.sin},${g.y+point[0]*g.sin+point[1]*g.cos}`;
 if(g.shape==='circle')return {tag:'circle',attrs:{cx:g.x,cy:g.y,r:g.length}};
 if(g.shape==='emanation')return {tag:'rect',attrs:{x:g.x-g.pixelWidth/2-g.length,y:g.y-g.pixelWidth/2-g.length,width:g.pixelWidth+2*g.length,height:g.pixelWidth+2*g.length,rx:g.length}};
 const points=g.shape==='cone'?[[0,0],[g.length,-g.length/2],[g.length,g.length/2]]:g.shape==='square'?[[-g.length/2,-g.length/2],[g.length/2,-g.length/2],[g.length/2,g.length/2],[-g.length/2,g.length/2]]:[[0,-(g.shape==='cube'?g.length:g.pixelWidth)/2],[g.length,-(g.shape==='cube'?g.length:g.pixelWidth)/2],[g.length,(g.shape==='cube'?g.length:g.pixelWidth)/2],[0,(g.shape==='cube'?g.length:g.pixelWidth)/2]];
 return {tag:'polygon',attrs:{points:points.map(turn).join(' ')}};
}
