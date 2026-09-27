import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tabletopFixture} from './helpers/tabletop-fixture.mjs';
import {seedTokenSources,tokenSourceIds,TOKEN_PNG} from './helpers/token-sources.mjs';
import {LOCAL_GM,createTabletopStore} from '../src/web/tabletop.mjs';
import {TOKEN_ICONS,ICON_GROUPS,characterIcon,creatureIcon,tokenIcon,tokenColor} from '../src/web/assets/tabletop-token-model.mjs';
import {tabletopText} from '../src/web/assets/tabletop-i18n.mjs';
let f,scene;
before(async()=>{
  f=await tabletopFixture({server:true});await seedTokenSources(f);
  const session=await f.store.createSession(LOCAL_GM,'Значки');
  const location=await f.store.createLocation(session.id,LOCAL_GM,'Зал');scene=await f.store.scene(location.scene_id,LOCAL_GM);
});
after(async()=>f?.close());
const create=async(kind='npc',source_id)=> (await f.store.tokens.add(scene.id,LOCAL_GM,{kind,source_id,name:'Жетон',x:300,y:200,snap:true,scene_revision:scene.revision})).token;
const fields=token=>({...token,scene_revision:scene.revision});

test('all catalog choices persist with independently colored symbols and borders through HTTP',async()=>{
  let token=await create();
  const headers={'Content-Type':'application/json','X-Tabletop-Request':'1'};
  for(const icon_type of Object.keys(TOKEN_ICONS)) {
    const response=await fetch(f.origin+'/api/tabletop/tokens/'+token.id,{method:'PUT',headers,body:JSON.stringify({...fields(token),icon_type,icon_color:'#E54183',border_color:'#3FADCA'})});
    assert.equal(response.status,200,icon_type);token=(await response.json()).token;
    assert.equal(token.icon_type,icon_type);assert.equal(token.icon_color,'#e54183');assert.equal(token.border_color,'#3fadca');
  }
  const reloaded=await createTabletopStore(f.sql).tokens.list(scene.id,LOCAL_GM);
  assert.equal(reloaded.find(t=>t.id===token.id).icon_color,'#e54183');
  const legacy=fields(token);delete legacy.icon_color;
  const result=await f.store.tokens.change(token.id,LOCAL_GM,{...legacy,name:'Старый клиент'});
  assert.equal(result.token.icon_color,'#e54183','older clients preserve the chosen color');
});
test('invalid colors and forged icon names cannot overwrite token data or inject SVG markup',async()=>{
  const token=await create();
  for(const icon_color of [null,0,[],{},'#fff','red','#ffffff00','" onload="alert(1)', 'url(https://example.com)']) {
    await assert.rejects(f.store.tokens.change(token.id,LOCAL_GM,{...fields(token),icon_color}),e=>e.status===400);
  }
  for(const icon_type of ['__proto__','constructor','toString','<script>alert(1)</script>']) {
    await assert.rejects(f.store.tokens.change(token.id,LOCAL_GM,{...fields(token),icon_type}),e=>e.status===400);
    assert.match(tokenIcon(icon_type,'" onload="x'),/data-icon="npc"/);
    assert.equal(tokenColor(icon_type),TOKEN_ICONS.npc.color);
    assert.doesNotMatch(tokenIcon(icon_type,'" onload="x'),/onload|<script/);
  }
  assert.equal((await f.store.tokens.list(scene.id,LOCAL_GM)).find(t=>t.id===token.id).revision,token.revision);
});
test('changing a symbol color preserves portrait bytes and the chosen color survives appearance switches',async()=>{
  let token=await create('character',tokenSourceIds.character);
  assert.equal(token.icon_type,'class_wizard');
  token=(await f.store.tokens.change(token.id,LOCAL_GM,{...fields(token),data_url:TOKEN_PNG},'image')).token;
  const original=await f.store.tokens.image(token.id,LOCAL_GM),revision=token.image_revision;
  token=(await f.store.tokens.change(token.id,LOCAL_GM,{...fields(token),icon_type:'class_cleric',icon_color:'#f1cc44'})).token;
  assert.equal(token.has_image,true);assert.deepEqual((await f.store.tokens.image(token.id,LOCAL_GM)).bytes,original.bytes);
  token=(await f.store.tokens.change(token.id,LOCAL_GM,{...fields(token),image_mode:'icon'})).token;
  assert.equal(token.has_image,false);assert.equal(token.icon_color,'#f1cc44');assert.equal(token.image_revision,revision);
});
test('upgrade backfills old default colors without altering positions, numbering or portraits; rerun keeps custom colors',async()=>{
  const db=await tabletopFixture();
  try {
    await seedTokenSources(db);
    const session=await db.store.createSession(LOCAL_GM,'До обновления');
    const location=await db.store.createLocation(session.id,LOCAL_GM,'Зал');
    const token=(await db.store.tokens.add(location.scene_id,LOCAL_GM,{kind:'creature',source_id:tokenSourceIds.zombie,x:140,y:210,snap:true,scene_revision:1})).token;
    await db.store.tokens.change(token.id,LOCAL_GM,{revision:token.revision,scene_revision:1,data_url:TOKEN_PNG},'image');
    await db.sql`ALTER TABLE vtt_tokens DROP COLUMN icon_color`;
    const before=(await db.sql`SELECT * FROM vtt_tokens WHERE id=${token.id}`)[0];
    const upgraded=createTabletopStore(db.sql);await upgraded.ensureSchema();
    const after=(await db.sql`SELECT * FROM vtt_tokens WHERE id=${token.id}`)[0];
    assert.equal(after.icon_color,'#91d573');delete after.icon_color;assert.deepEqual(after,before);
    await db.sql`UPDATE vtt_tokens SET icon_color='#9933aa' WHERE id=${token.id}`;
    await createTabletopStore(db.sql).ensureSchema();
    assert.equal((await upgraded.tokens.list(location.scene_id,LOCAL_GM))[0].icon_color,'#9933aa');
    await assert.rejects(db.sql`UPDATE vtt_tokens SET icon_color='red' WHERE id=${token.id}`);
  } finally {await db.close();}
});
test('catalog assets exist, have translated names and isolate SVG filter ids between colors',()=>{
  assert.equal(Object.values(TOKEN_ICONS).filter(icon=>!icon.aliasOf).length,61);
  for(const group of ICON_GROUPS)assert.notEqual(tabletopText(group),group);
  for(const [key,icon] of Object.entries(TOKEN_ICONS)) {
    assert.notEqual(tabletopText(icon.label),icon.label,key);
    const bytes=readFileSync(new URL('../src/web/assets/'+icon.file,import.meta.url));
    assert.equal(bytes.readUInt32BE(16),icon.width);assert.equal(bytes.readUInt32BE(20),icon.height);
    const a=tokenIcon(key,'#ff0000'),b=tokenIcon(key,'#00ff00');
    const ids=s=>[...s.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(ids(a).some(id=>ids(b).includes(id)),false);
  }
  assert.equal(characterIcon(' Wizard '),'class_wizard');assert.equal(characterIcon('Unknown homebrew'),'character');
  assert.equal(creatureIcon('Fiend (demon)'),'demon');assert.equal(creatureIcon('Swarm of Tiny beasts'),'swarm');
  assert.equal(creatureIcon('Merchant'),'monstrosity','role icons are never inferred as creature types');
});

test('fixed release artwork takes priority while both catalogs and all original image bytes remain supported',async()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/token-icon-compat.json',import.meta.url)));
  for(const key of [...fixture.fixed_branch_keys,...fixture.art_branch_keys])assert.ok(Object.hasOwn(TOKEN_ICONS,key),key);
  for(const [key,entry] of Object.entries(fixture.fixed_branch_catalog))assert.deepEqual(TOKEN_ICONS[key],entry,key+' must retain the fixed-release art');
  for(const [file,hash] of Object.entries(fixture.asset_sha256)) {
    const response=await fetch(f.origin+'/assets/'+file+'?v=0.31.2');
    assert.equal(response.status,200,file);assert.equal(response.headers.get('content-type'),'image/png');
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),hash,file);
  }
  for(const file of ['elf','tiefling','innkeeper'])assert.equal(TOKEN_ICONS[file].file,`token-icons/${file}.png`);
  for(const key of ['character','npc','merchant'])assert.equal(TOKEN_ICONS[key].file,'token-icons-roles-v1.png');
  assert.equal(TOKEN_ICONS.undead.file,'token-icons-creatures-v1.png');
  assert.equal(TOKEN_ICONS.questgiver.file,TOKEN_ICONS.quest_giver.file);
  assert.doesNotMatch(tokenIcon('elf','#8ed8ff'),/<image[^>]*\sfilter=/,'extra race PNG keeps its original pixels at the default color');
  assert.match(tokenIcon('elf','#ff2222'),/<image[^>]*\sfilter=/,'custom colors still tint the filled artwork');
  assert.equal((await fetch(f.origin+'/assets/token-icons/unknown.png')).status,404);
});

test('upgrading the other icon branch preserves stored race/role keys, portraits, colors and floors through editing and transfer',async()=>{
  const db=await tabletopFixture();
  try {
    const session=await db.store.createSession(LOCAL_GM,'Другая ветка'),location=await db.store.createLocation(session.id,LOCAL_GM,'Таверна');
    const floor=await db.store.floors.create(location.id,LOCAL_GM,{name:'Подвал',location_revision:1});
    let token=(await db.store.tokens.add(location.scene_id,LOCAL_GM,{kind:'npc',name:'Проводник',x:210,y:140,snap:true,scene_revision:1})).token;
    token=(await db.store.tokens.change(token.id,LOCAL_GM,{...token,scene_revision:1,data_url:TOKEN_PNG},'image')).token;
    // Recreate the released art branch schema: icon_color exists already, but
    // location revisions and remembered floor positions do not yet exist.
    await db.sql`ALTER TABLE vtt_tokens DROP COLUMN icon_color`;
    await db.sql`ALTER TABLE vtt_tokens ADD COLUMN icon_color text NOT NULL DEFAULT '#8ed8ff'`;
    await db.sql`UPDATE vtt_tokens SET icon_type='questgiver',icon_color='#a1b2c3',border_color='#112233' WHERE id=${token.id}`;
    await db.sql`DROP TABLE vtt_token_positions`;await db.sql`ALTER TABLE vtt_locations DROP COLUMN revision`;
    const beforeTokens=await db.sql`SELECT * FROM vtt_tokens`,beforeScenes=await db.sql`SELECT * FROM vtt_scenes`;
    const updated=createTabletopStore(db.sql);await updated.ensureSchema();await createTabletopStore(db.sql).ensureSchema();
    assert.deepEqual(await db.sql`SELECT * FROM vtt_tokens`,beforeTokens);assert.deepEqual(await db.sql`SELECT * FROM vtt_scenes`,beforeScenes);
    token=(await updated.tokens.list(location.scene_id,LOCAL_GM))[0];
    token=(await updated.tokens.change(token.id,LOCAL_GM,{...token,scene_revision:1,name:'Проводник после обновления'})).token;
    assert.equal(token.icon_type,'questgiver');assert.equal(token.icon_color,'#a1b2c3');
    for(const icon_type of ['elf','questgiver']) {
      token=(await updated.tokens.change(token.id,LOCAL_GM,{...token,scene_revision:1,icon_type})).token;
      const target=token.scene_id===location.scene_id?floor.id:location.scene_id;
      await updated.tokens.transfer(token.scene_id,LOCAL_GM,{tokens:[{id:token.id,revision:token.revision}],target_scene_id:target,scene_revision:1,target_revision:1,snap:true});
      token=(await updated.tokens.list(target,LOCAL_GM))[0];
      assert.equal(token.icon_type,icon_type);assert.equal(token.icon_color,'#a1b2c3');assert.equal(token.border_color,'#112233');
      assert.deepEqual((await updated.tokens.image(token.id,LOCAL_GM)).bytes,Buffer.from(TOKEN_PNG.split(',')[1],'base64'));
    }
    assert.equal(token.x,210);assert.equal(token.y,140);
  } finally {await db.close();}
});
