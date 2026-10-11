import {spawnSync} from 'node:child_process';
for(const suite of ['tabletop','tabletop-tokens','tabletop-grid-tokens','tabletop-icons','tabletop-floors','tabletop-art','workspace','workspace-data','workspace-floating','tabletop-combat','tabletop-battle','tabletop-tactics','tabletop-recovery','tabletop-effects','tabletop-simple']){
  console.log(`\nBrowser suite: ${suite}`);
  const r=spawnSync(process.execPath,[`tests/${suite}.browser.mjs`],{env:process.env,stdio:'inherit',timeout:180000});
  if(r.error)console.error(r.error.message);
  if(r.status!==0)process.exit(r.status||1);
}
