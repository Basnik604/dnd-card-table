import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkspace,normalizeWorkspace,workspaceKey,readWorkspace,writeWorkspace,moveWorkspacePanel,fitWorkspaceSizes} from '../src/web/assets/workspace-state.mjs';
test('v1 migration preserves hidden panels, inspector tab and map-only; legacy survives quota failure',()=>{
 const key=workspaceKey('A'),old=key.replace(':v2:',':v1:');
 const legacy={version:1,panels:{locations:false,inspector:false,help:true},mapOnly:true,inspectorTab:'tokens'};
 const items=new Map([[old,JSON.stringify(legacy)]]),storage={getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v)};
 const state=readWorkspace(storage,key);assert.equal(state.version,2);assert.deepEqual(state.panels,legacy.panels);assert.equal(state.inspectorTab,'tokens');assert.equal(state.mapOnly,true);assert.ok(items.has(key));assert.equal(items.get(old),JSON.stringify(legacy));
 items.delete(key);storage.setItem=()=>{throw Error('quota');};assert.deepEqual(readWorkspace(storage,key),state);assert.ok(items.has(old));
});
test('invalid docks, duplicate IDs and dimensions normalize without importing game state',()=>{
 const state=normalizeWorkspace({version:2,docks:{left:['help','help','unknown'],right:['help','locations'],bottom:[]},active:{left:'unknown'},sizes:{left:Infinity,right:-20,bottom:9999},tokens:[{}]});
 assert.deepEqual(Object.values(state.docks).flat().sort(),['help','inspector','locations']);assert.equal(state.sizes.left,190);assert.equal(state.sizes.right,240);assert.equal(state.sizes.bottom,420);assert.equal('tokens' in state,false);
});
test('every panel moves to every zone exactly once; active close finds another visible panel',()=>{
 const state=defaultWorkspace();state.panels.help=true;
 for(const panel of ['locations','inspector','help'])for(const dock of ['left','right','bottom']){moveWorkspacePanel(state,panel,dock);assert.equal(Object.values(state.docks).flat().filter(x=>x===panel).length,1);assert.equal(state.active[dock],panel);}
 state.panels.help=false;assert.notEqual(normalizeWorkspace(state).active.bottom,'help');
 const restored=normalizeWorkspace(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.docks,state.docks);
});
test('viewport fitting leaves map width and does not overwrite desktop preferences',()=>{
 const sizes={left:440,right:480,bottom:300},fit=fitWorkspaceSizes(sizes,980);assert.ok(980-fit.left-fit.right-32>=320);assert.deepEqual(sizes,{left:440,right:480,bottom:300});assert.deepEqual(fitWorkspaceSizes(sizes,1500),sizes);
});
