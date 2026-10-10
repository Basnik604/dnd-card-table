import test from 'node:test';
import assert from 'node:assert/strict';
import {fitWindow,changeWindow,readWindows,defaultWindow} from '../src/web/assets/workspace-floating.mjs';
test('window edges keep their opposite edge fixed and remain reachable in a small viewport',()=>{
 const rect={x:100,y:100,w:300,h:250};
 assert.deepEqual(changeWindow(rect,'nw',-20,-30,1000,800),{x:80,y:70,w:320,h:280});
 assert.deepEqual(changeWindow(rect,'se',40,50,1000,800),{x:100,y:100,w:340,h:300});
 assert.deepEqual(changeWindow(rect,'move',2000,-2000,1000,800),{x:700,y:0,w:300,h:250});
 assert.deepEqual(fitWindow(rect,180,100),{x:0,y:0,w:180,h:100});
 for(const edge of ['n','s','e','w','nw','ne','sw','se']){const r=changeWindow(rect,edge,5000,-5000,1000,800);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1000&&r.y+r.h<=800);}
});
test('corrupt geometry and blocked storage recover to floating windows without importing game data',()=>{
 assert.deepEqual(readWindows({getItem:()=>'{bad'},'key',['inspector']),{version:1,mode:'floating',windows:{}});
 assert.deepEqual(readWindows({getItem:()=>JSON.stringify({version:1,mode:'docks',windows:{inspector:{x:1,y:2,w:'invalid',h:3}},tokens:[1]})},'key',['inspector']),{version:1,mode:'docks',windows:{}});
 const r=defaultWindow('inspector',390,600);assert.ok(r.x+r.w<=390&&r.y+r.h<=600);
});
