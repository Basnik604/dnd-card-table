import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkspace,normalizeWorkspace,workspaceKey,readWorkspace,writeWorkspace} from '../src/web/assets/workspace-state.mjs';
test('layouts are isolated between sessions and future viewers',()=>{
  const items=new Map(),storage={getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v)};
  const state=defaultWorkspace();state.panels.locations=false;state.mapOnly=true;state.inspectorTab='tokens';
  assert.equal(writeWorkspace(storage,workspaceKey('A'),state),true);
  assert.deepEqual(readWorkspace(storage,workspaceKey('A')),state);
  assert.deepEqual(readWorkspace(storage,workspaceKey('B')),defaultWorkspace());
  assert.deepEqual(readWorkspace(storage,workspaceKey('A','player')),defaultWorkspace());
});
test('corrupt or future layouts recover; game data and unknown panels are ignored',()=>{
  for(const raw of ['{broken','null','[]','{"version":99,"mapOnly":true}'])assert.deepEqual(readWorkspace({getItem:()=>raw},'x'),defaultWorkspace());
  assert.deepEqual(normalizeWorkspace({version:1,panels:{locations:false,inspector:'false',help:true,unknown:true},mapOnly:'yes',inspectorTab:'notes',tokens:[{}]}),{...defaultWorkspace(),panels:{...defaultWorkspace().panels,locations:false,inspector:true,help:true}});
});
test('blocked storage and quota errors do not prevent using a layout',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.deepEqual(readWorkspace(storage,'x'),defaultWorkspace());assert.equal(writeWorkspace(storage,'x',defaultWorkspace()),false);
  assert.deepEqual(readWorkspace(undefined,'x'),defaultWorkspace());assert.equal(writeWorkspace(undefined,'x',defaultWorkspace()),false);
});
