import { parse, parseFragment, serialize } from 'parse5';
import { lookupTranslation, termTranslation } from './runtime.mjs';

const skipped = new Set(['script','style','noscript','svg','pre','code','textarea','input']);
const attributes = new Set(['title','placeholder','aria-label','alt']);
export function localizeHtml(html, language='ru', context={}) {
  if(language==='en') return html;
  const doc=/<!doctype|<html[\s>]/i.test(html)?parse(html):parseFragment(html);
  function visit(node, blocked=false, ctx=context) {
    const attrs=Object.fromEntries((node.attrs||[]).map(a=>[a.name,a.value]));
    // An option without value submits its visible label. Preserve that canonical
    // value before translating the label (Scholar, skills, land, etc.).
    if(node.tagName==='option'&&!Object.hasOwn(attrs,'value')){
      const text=n=>n.nodeName==='#text'?n.value:(n.childNodes||[]).map(text).join('');
      node.attrs.push({name:'value',value:text(node).replace(/\s+/g,' ').trim()});
    }
    ctx={...ctx};
    if(attrs['data-ruleset'])ctx.ruleset=attrs['data-ruleset'];
    if(attrs['data-content-kind'])ctx.kind=attrs['data-content-kind'];
    if(attrs['data-source-key'])ctx.source=attrs['data-source-key'];
    const skip=blocked||Object.hasOwn(attrs,'data-i18n-skip')||attrs.translate==='no';
    const translate=value=>lookupTranslation(value,ctx)||termTranslation(value,ctx)||value;
    if(!skip && !['script','style'].includes(node.tagName)) for(const attr of node.attrs||[]) {
      if(attributes.has(attr.name))attr.value=translate(attr.value);
    }
    if(node.nodeName==='#text'&&!skip)node.value=translate(node.value);
    for(const child of node.childNodes||[])visit(child,skip||skipped.has(node.tagName),ctx);
  }
  visit(doc);return serialize(doc);
}
