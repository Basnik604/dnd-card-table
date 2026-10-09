import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCharacterPanel} from '../src/web/workspace-character.mjs';
import {defaultWorkspace,normalizeWorkspace,applyWorkspacePreset} from '../src/web/assets/workspace-state.mjs';
const document='<html><head><style>.sheet-pane{display:none}</style></head><body><main><header>PRIVATE HEADER</header><div class="sheet-vitals">HP<form action="/character/H/hp" method="post"><input name="delta" value="-1"></form></div><section class="sheet-pane" data-sheet-pane="inventory"><form action="/character/H/inventory/I/equip" method="post"><button>Equip</button></form></section><section class="sheet-pane" data-sheet-pane="spells">SPELLS</section><section class="sheet-pane" data-sheet-pane="features">FEATURES</section><section class="sheet-pane" data-sheet-pane="notes">PRIVATE NOTES</section><div data-workspace-character-resources>RESOURCE</div><script>window.pickerReady=true;</script><footer>FOOTER</footer></main><script>window.actionsReady=true;</script></body></html>';
test('server projection keeps existing forms and handlers but omits unrelated sheet data',()=>{
 const inventory=projectCharacterPanel(document,'inventory','H');
 assert.match(inventory,/\/character\/H\/inventory\/I\/equip/);assert.match(inventory,/pickerReady/);assert.match(inventory,/actionsReady/);
 for(const value of ['PRIVATE HEADER','PRIVATE NOTES','FOOTER','SPELLS','FEATURES','RESOURCE'])assert.ok(!inventory.includes(value),value);
 assert.ok(!inventory.includes('data-sheet-pane'));
 const abilities=projectCharacterPanel(document,'abilities','H');assert.match(abilities,/FEATURES/);assert.match(abilities,/RESOURCE/);assert.match(abilities,/\/character\/H\/hp/);assert.ok(!abilities.includes('PRIVATE NOTES'));
 assert.throws(()=>projectCharacterPanel(document,'notes','H'));
});
test('existing v2 layouts gain hidden panels once and presets never introduce game state',()=>{
 const old={version:2,panels:{locations:false,inspector:true,help:true},docks:{left:['help'],right:['inspector'],bottom:['locations']},sizes:{left:220,right:330,bottom:140},active:{left:'help',right:'inspector',bottom:'locations'},inspectorTab:'tokens'};
 const state=normalizeWorkspace(old);assert.equal(state.panels.inventory,false);assert.equal(state.docks.bottom.includes('locations'),true);assert.equal(state.inspectorTab,'tokens');
 const ids=Object.values(state.docks).flat();assert.equal(new Set(ids).size,7);assert.equal(ids.length,7);
 applyWorkspacePreset(state,'play');assert.equal(state.panels.inventory,true);assert.equal(state.active.bottom,'abilities');assert.equal(state.inspectorTab,'tokens');
 applyWorkspacePreset(state,'prepare');assert.equal(state.active.left,'library');assert.equal('character' in state,false);assert.deepEqual(state.panels,{...defaultWorkspace().panels,library:true});
});
