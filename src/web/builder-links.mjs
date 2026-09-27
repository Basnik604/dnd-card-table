import { displayText, displayContext } from "../localization/runtime.mjs";
import { translateText } from "./assets/i18n-core.mjs";
function escapeHtml(value){
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function escapeRegex(value){
  return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function lookup(refs,name){
  if(!name)return null;
  const exact=refs.get(String(name).toLowerCase());
  if(exact)return exact;
  const base=String(name).replace(/\s*\([^)]*\)\s*$/," ").trim().toLowerCase();
  return refs.get(base)||null;
}

export function linkifyBuilderText(value,refs,currentEntityId=null){
  const raw=String(value||"");
  if(!raw)return "";
  const current=String(currentEntityId||"");
  const entries=[...refs.values()]
    .filter(ref=>ref?.name && ref.name.length>=3 && String(ref.id)!==current)
    .sort((a,b)=>b.name.length-a.name.length || a.name.localeCompare(b.name));
  if(!entries.length)return escapeHtml(raw);
  const alternatives=entries.map(ref=>escapeRegex(ref.name));
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`,`giu`);
  const seen=new Set();
  let html="",last=0;
  for(const match of raw.matchAll(pattern)){
    const index=match.index??0;
    html+=escapeHtml(raw.slice(last,index));
    const text=match[0];
    const ref=lookup(refs,text);
    if(!ref || String(ref.id)===current || seen.has(String(ref.id))){
      html+=escapeHtml(text);
    }else{
      seen.add(String(ref.id));
      const kind=escapeHtml(ref.kind||"entry");
      html+=`<a class="builder-inline-ref" href="/builder-data/entity/${encodeURIComponent(ref.id)}" data-entity-kind="${kind}" title="${kind} · Open entry">${escapeHtml(text)}</a>`;
    }
    last=index+text.length;
  }
  html+=escapeHtml(raw.slice(last));
  return html;
}


function linkedInline(value,refs,currentEntityId=null){
  // Apply entity links first, then a deliberately small Markdown subset.
  // Entity labels are escaped by linkifyBuilderText, so this remains safe.
  return linkifyBuilderText(value,refs,currentEntityId)
    .replace(/\*\*\*([^*]+)\*\*\*/g,"<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g,"$1<em>$2</em>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\[([^\]]+)\]\((?:[^\s)]+)\)/g,"$1");
}

export function renderBuilderLinkedRulesText(value,refs,currentEntityId=null){
  value=displayText(value);
  if(displayContext.getStore()?.language!=="en"){
    refs=new Map(refs);
    for(const ref of [...refs.values()]){
      const name=translateText(ref.name,"ru",{kind:ref.kind,ruleset:ref.ruleset});
      if(name!==ref.name)refs.set(name.toLowerCase(),{...ref,name});
    }
  }
  const lines=String(value??"").replace(/\r/g,"").split("\n");
  const chunks=[];
  const cells=line=>line.trim().replace(/^\||\|$/g,"").split("|").map(x=>x.trim());
  const separator=line=>cells(line).length>0 && cells(line).every(x=>/^:?-{3,}:?$/.test(x.replace(/\s/g,"")));
  const listItem=line=>/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/.exec(line);
  let i=0;
  while(i<lines.length){
    if(!lines[i].trim()){i++;continue;}
    if(lines[i].includes("|") && i+1<lines.length && separator(lines[i+1])){
      const header=cells(lines[i]),rows=[];i+=2;
      while(i<lines.length && lines[i].trim() && lines[i].includes("|"))rows.push(cells(lines[i++]));
      chunks.push(`<div class="rules-table-wrap"><table class="rules-table"><thead><tr>${header.map(x=>`<th>${linkedInline(x,refs,currentEntityId)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${header.map((_,j)=>`<td>${linkedInline(row[j]??"",refs,currentEntityId)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const heading=/^\s{0,3}#{1,6}\s+(.+)$/.exec(lines[i]);
    if(heading){chunks.push(`<h4>${linkedInline(heading[1],refs,currentEntityId)}</h4>`);i++;continue;}
    const first=listItem(lines[i]);
    if(first){
      const tag=first[2]?"ol":"ul",items=[];
      while(i<lines.length){
        const item=listItem(lines[i]);
        if(!item || Boolean(item[2])!==Boolean(first[2]))break;
        items.push(`<li>${linkedInline(item[3],refs,currentEntityId)}</li>`);i++;
      }
      chunks.push(`<${tag}>${items.join("")}</${tag}>`);continue;
    }
    const paragraph=[];
    while(i<lines.length && lines[i].trim()){
      if(listItem(lines[i]) || /^\s{0,3}#{1,6}\s/.test(lines[i]))break;
      if(lines[i].includes("|") && i+1<lines.length && separator(lines[i+1]))break;
      paragraph.push(linkedInline(lines[i++],refs,currentEntityId));
    }
    if(paragraph.length)chunks.push(`<p>${paragraph.join("<br>")}</p>`);
  }
  return chunks.join("");
}
