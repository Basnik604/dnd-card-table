import { displayText } from "../localization/runtime.mjs";
const escapeHtml = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

export function rulesInline(value) {
  return escapeHtml(value)
    .replace(/\*\*\*([^*]+)\*\*\*/g,"<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g,"$1<em>$2</em>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\[([^\]]+)\]\((?:[^\s)]+)\)/g,"$1");
}

export function plainRulesText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
    .replace(/[*`]/g,"")
    .replace(/^\s{0,3}#{1,6}\s+/gm,"")
    .replace(/\s+/g," ").trim();
}

export function renderRulesText(value) {
  value=displayText(value);
  const lines=String(value ?? "").replace(/\r/g,"").split("\n");
  const chunks=[];
  const cells=line=>line.trim().replace(/^\||\|$/g,"").split("|").map(s=>s.trim());
  const separator=line=>cells(line).every(s=>/^:?-{3,}:?$/.test(s.replace(/\s/g,"")));
  const listItem=line=>/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/.exec(line);
  let i=0;
  while(i<lines.length) {
    if(!lines[i].trim()) { i++; continue; }
    if(lines[i].includes("|") && i+1<lines.length && separator(lines[i+1])) {
      const header=cells(lines[i]); const rows=[]; i+=2;
      while(i<lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      chunks.push(`<div class="rules-table-wrap"><table class="rules-table"><thead><tr>${header.map(x=>`<th>${rulesInline(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${header.map((_,j)=>`<td>${rulesInline(row[j] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const heading=/^\s{0,3}#{1,6}\s+(.+)$/.exec(lines[i]);
    if(heading) { chunks.push(`<h4>${rulesInline(heading[1])}</h4>`); i++; continue; }
    const first=listItem(lines[i]);
    if(first) {
      const tag=first[2]?"ol":"ul"; const items=[];
      while(i<lines.length) {
        const item=listItem(lines[i]);
        if(!item || Boolean(item[2])!==Boolean(first[2])) break;
        items.push(`<li>${rulesInline(item[3])}</li>`); i++;
      }
      chunks.push(`<${tag}>${items.join("")}</${tag}>`); continue;
    }
    const paragraph=[];
    while(i<lines.length && lines[i].trim()) {
      if(listItem(lines[i]) || /^\s{0,3}#{1,6}\s/.test(lines[i])) break;
      if(lines[i].includes("|") && i+1<lines.length && separator(lines[i+1])) break;
      paragraph.push(rulesInline(lines[i++]));
    }
    if(paragraph.length) chunks.push(`<p>${paragraph.join("<br>")}</p>`);
  }
  return chunks.join("");
}
