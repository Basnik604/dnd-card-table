import test from 'node:test';import assert from 'node:assert/strict';import {insideArea,areaTargets,areaSvg} from '../src/web/assets/combat-area.mjs';
const grid={cellSize:50,distance:5};const area={shape:'circle',x:100,y:100,size:10,width:5,angle:0};
test('area shapes use distance units and rotate independently of camera zoom and grid offsets',()=>{
 assert.equal(insideArea({x:200,y:100},area,grid),true);assert.equal(insideArea({x:201,y:100},area,grid),false);
 assert.equal(insideArea({x:100,y:180},{...area,shape:'cone',angle:90},grid),true);assert.equal(insideArea({x:100,y:20},{...area,shape:'cone',angle:90},grid),false);
 assert.equal(insideArea({x:190,y:125},{...area,shape:'line'},grid),true);assert.equal(insideArea({x:190,y:126},{...area,shape:'line'},grid),false);
 assert.equal(insideArea({x:150,y:150},{...area,shape:'square'},grid),true);
 assert.equal(areaSvg(area,grid).attrs.r,100);assert.throws(()=>areaTargets([],{...area,size:NaN},grid));
});
test('large footprints and friendly units are candidates when any part overlaps an area',()=>{
 const tokens=[{id:'large',x:190,y:90,size_cells:2},{id:'far',x:400,y:400,size_cells:1},{id:'friend',x:90,y:90,size_cells:1,relation:'friendly'}];
 assert.deepEqual(areaTargets(tokens,area,grid),['large','friend']);assert.deepEqual(areaTargets(tokens,{...area,shape:'line'},grid),['large','friend']);
});

test('cube begins at its face and emanation includes the caster footprint',()=>{
 assert.equal(insideArea({x:99,y:100},{...area,shape:'cube'},grid),false);assert.equal(insideArea({x:200,y:150},{...area,shape:'cube'},grid),true);
 assert.equal(insideArea({x:220,y:100},{...area,shape:'emanation',width:10},grid),true);assert.equal(insideArea({x:251,y:100},{...area,shape:'emanation',width:10},grid),false);
 for(const shape of ['sphere','cylinder'])assert.equal(insideArea({x:200,y:100},{...area,shape},grid),true);
});

test('sphere and cylinder render and select as circles in the map projection',()=>{
 for(const shape of ['sphere','cylinder']){const zone={...area,shape};assert.equal(areaSvg(zone,grid).tag,'circle');assert.deepEqual(areaTargets([{id:'inside',x:190,y:90,size_cells:1},{id:'outside',x:400,y:400,size_cells:1}],zone,grid),['inside']);}
});
