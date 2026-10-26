import {characterChanged} from './workspace-character-sync.js';
import {tabletopText} from './tabletop-i18n.mjs';
const id=document.body.dataset.workspaceCharacterId;
let language='ru';try{language=localStorage.getItem('dnd-lang')||'ru';}catch{}
const t=text=>tabletopText(text,language),draftKey='dnd-panel-draft:'+location.pathname;
const tell=(type,extra={})=>parent.postMessage({type,characterId:id,...extra},location.origin);
const fieldValue=el=>el.type==='checkbox'||el.type==='radio'?el.checked:el.value;
function fields(){const rows=[],formCounts=new Map();for(const form of document.forms){const action=form.getAttribute("action")||"",formNumber=formCounts.get(action)||0;formCounts.set(action,formNumber+1);const counts=new Map();for(const el of form.elements){if(!el.name||['file','password','submit','button'].includes(el.type))continue;const count=counts.get(el.name)||0;counts.set(el.name,count+1);rows.push({el,form,key:action+'|'+formNumber+'|'+el.name+'|'+count,value:fieldValue(el)});}}return rows;}
const baseline=new Map(fields().map(row=>[row.key,row.value]));
try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'[]');sessionStorage.removeItem(draftKey);for(const [key,value] of saved){const row=fields().find(row=>row.key===key);if(row){if(typeof value==='boolean')row.el.checked=value;else row.el.value=value;}}}catch{}
const dirty=()=>fields().filter(row=>baseline.get(row.key)!==row.value);
function report(){document.body.dataset.workspaceDirty=String(dirty().length>0);tell('workspace-character-dirty',{dirty:dirty().length>0});}
for(const event of ['input','change','click'])document.addEventListener(event,report);
const status=document.createElement('p');status.setAttribute('role','status');document.querySelector('main').prepend(status);
for(const link of document.querySelectorAll('a[href]')){link.target='_blank';link.rel='noopener';}
let busy=false;
document.addEventListener('submit',async event=>{
 const form=event.target;if(!(form instanceof HTMLFormElement)||event.defaultPrevented||form.hasAttribute('data-live-roll')||form.hasAttribute('data-live-action'))return;
 const action=new URL(form.getAttribute('action')||location.href,document.baseURI);
 if(action.origin!==location.origin||!['POST','post'].includes(form.getAttribute('method')||'GET'))return;
 event.preventDefault();if(busy)return;busy=true;
 const controls=[...document.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);
 const body=new URLSearchParams(new FormData(form));if(event.submitter?.name)body.set(event.submitter.name,event.submitter.value);
 controls.forEach(([el])=>el.disabled=true);tell('workspace-character-busy',{busy:true});
 try{
   const response=await fetch(action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
   if(!response.ok)throw Error(t('Could not save character changes.'));
   const remaining=dirty().filter(row=>row.form!==form).map(row=>[row.key,row.value]);
   try{sessionStorage.setItem(draftKey,JSON.stringify(remaining));}catch{if(remaining.length){status.textContent=t('Saved. Other drafts remain; refresh when ready.');characterChanged(id);tell('workspace-character-changed');return;}}
   characterChanged(id);tell('workspace-character-changed');location.reload();
 }catch(error){status.textContent=error.message;}
 finally{busy=false;controls.forEach(([el,disabled])=>el.disabled=disabled);tell('workspace-character-busy',{busy:false});report();}
});
document.addEventListener('dnd-character-changed',()=>tell('workspace-character-changed'));
report();tell('workspace-character-ready');
