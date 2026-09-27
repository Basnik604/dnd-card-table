import fs from 'node:fs/promises';
import path from 'node:path';
import { translationCoverage } from '../../src/localization/core.mjs';
import { termTranslation } from '../../src/localization/runtime.mjs';

const arg=name=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:null;};
const manifestPath=path.resolve(arg('manifest')||'dnd-translation-input.json');
const requestPath=path.resolve(arg('request')||'dnd-translation-request-review.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
if(manifest?.schema!==1||!Array.isArray(manifest.segments))throw new Error('Неверный manifest');
if(!Array.isArray(request?.texts))throw new Error('Неверный request');
const coverage=translationCoverage(manifest,[],termTranslation);
const pending=[...new Set(coverage.pendingSegments.map(s=>s.text))];
const requestSet=new Set(request.texts);
const pendingSet=new Set(pending);
const missing=pending.filter(text=>!requestSet.has(text));
const obsolete=request.texts.map((text,index)=>({id:index+1,text})).filter(row=>!pendingSet.has(row.text));
console.log(JSON.stringify({
  entities:coverage.entities,
  displaySegments:coverage.total,
  ignored:coverage.ignored,
  bundledTerms:coverage.terms,
  pendingSegments:coverage.pending,
  pendingUniqueTexts:pending.length,
  requestTexts:request.texts.length,
  missingFromRequest:missing,
  noLongerPending:obsolete,
  requestCoversAllPending:missing.length===0
},null,2));
if(missing.length)process.exitCode=2;
