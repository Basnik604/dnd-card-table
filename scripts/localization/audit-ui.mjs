import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseFragment} from 'parse5';
import {translateText} from '../../src/web/assets/i18n-core.mjs';
import {TABLETOP_RU} from '../../src/web/assets/tabletop-i18n.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const catalog=new Map();
const allowed=/^(?:D&D Card Table(?: v[\d.]+)?|SRD [\d.]+|Tal'Dorei Campaign Setting|RU|EN|A5E|NFKD|Aldric|Rustem|Content-Type|Content-Disposition|Cache-Control|Html|GET|POST|DELETE|SIGINT|SIGTERM|Escape|ArrowUp|ArrowDown|Enter|viewBox|en-US|en-CA|tab active|[\d ,+/−.d%-]+)$/;
function add(text,file){
 const value=text.trim().replace(/\s+/g,' ');
 // Raster format signatures and CSS transforms are protocol/style values.
 if(/^\((?:max|min)-width:/.test(value))return;
 if(value==='dnd-character-runtime-changed')return;
 if(value==='VP8'||/^translate\(.*\) scale\(/.test(value))return;
 if(/^(?:data-i18n-skip|feature-\{\d+\}-\{\d+\}|[·\s]*D&D Card Table(?: v[\d.]+)?|\{\d+\} · D&D Card Table|D&D Card Table Library running at http:|Health check: http:|\(prefers-reduced-motion:|\" data-legacy-species-choice)/.test(value))return;
 if(value.length<2||!/[A-Za-z]{2}/.test(value)||/[А-Яа-я]/.test(value)||allowed.test(value)||/^(?:https?:|\/|\.|#|\[|INSERT |SELECT |UPDATE |DELETE |ALTER |CREATE |RETURNING )/.test(value))return;
 if(/=>|\b(?:const|return|function|WHERE|COALESCE|LIMIT|OFFSET|ORDER BY)\b|[;{}=]|\+escape|\+html|document\.|localStorage|\[data-/.test(value.replace(/\{\d+\}/g,'')))return;
 if(!catalog.has(value))catalog.set(value,{text:value,file});
}
function htmlText(text,file){
 const doc=parseFragment(text);
 function walk(n,skip=false){
  const attrs=Object.fromEntries((n.attrs||[]).map(a=>[a.name,a.value]));
  skip=skip||Object.hasOwn(attrs,'data-i18n-skip')||['pre','code','style','svg','textarea'].includes(n.tagName);
  if(n.tagName==='script'){for(const c of n.childNodes||[])if(c.value)sourceText(c.value,file+':inline',false);return;}
  if(n.nodeName==='#text'&&!skip)add(n.value,file);
  if(!skip)for(const a of n.attrs||[])if(['title','placeholder','aria-label','alt'].includes(a.name))add(a.value,file);
  for(const c of n.childNodes||[])walk(c,skip);
 }walk(doc);
}
function sourceText(source,file,allowScripts=true){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 function read(value,node){
  if(value.includes('<')&&value.includes('>'))htmlText(value,file);
  else if(!value.includes('<')&&!value.includes('>')){
   const parent=node.parent;
   const label=ts.isPropertyAssignment(parent)&&/^(?:name|label|title|description|summary|notes|help)$/.test(parent.name?.getText(ast)||'');
   if(label||ts.isReturnStatement(parent)||ts.isNewExpression(parent)||/\s/.test(value))add(value,file);
  }
 }
 function walk(n){
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))read(n.text,n);
  if(ts.isTemplateExpression(n))read(n.head.text+n.templateSpans.map((s,i)=>'{'+i+'}'+s.literal.text).join(''),n);
  ts.forEachChild(n,walk);
 }walk(ast);
}
for(const file of ['src/web/server.mjs','src/web/assets/table-ui.js','src/web/class-progression.mjs','src/web/combat-state.mjs','src/web/subclass-actions.mjs','src/web/subclass-controls.mjs','src/web/tabletop.mjs','src/web/tabletop-view.mjs','src/web/workspace-view.mjs','src/web/assets/workspace.js','src/web/assets/tabletop-combat.js','src/web/assets/tabletop-battle.js','src/web/tabletop-battle.mjs','src/web/tabletop-combat.mjs','src/web/assets/workspace-data.js','src/web/assets/workspace-character-frame.js','src/web/workspace-character.mjs','src/web/assets/tabletop.js','src/web/tabletop-tokens.mjs','src/web/tabletop-token-view.mjs','src/web/tabletop-art-view.mjs','src/web/assets/tabletop-art.js','src/web/assets/tabletop-tokens.js'])sourceText(fs.readFileSync(path.join(root,file),'utf8'),file);
for(const text of Object.keys(TABLETOP_RU))add(text,'src/web/assets/tabletop-i18n.mjs');
const pending=[...catalog.values()].filter(x=>translateText(x.text,'ru')===x.text);
const report={scope:'Extracted interface strings and built-in summaries; imported database coverage is a separate audit.',total:catalog.size,translated:catalog.size-pending.length,pending:pending.length,missing:pending};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{console.log(JSON.stringify({...report,missing:undefined},null,2));for(const item of pending)console.log(item.text);}
if(pending.length)process.exitCode=2;
