import { normalizeLanguage, translateText } from './i18n-core.mjs';

(() => {
  const originals=new WeakMap();
  let contentDictionary=Object.create(null);
  const translate=(value,context={})=>contentDictionary[value]||translateText(value,'ru',context);
  const lastApplied=new WeakMap();
  const originalAttrs=new WeakMap();
  const attrLast=new WeakMap();
  let lang=normalizeLanguage(localStorage.getItem('dnd-lang') || document.documentElement.dataset.lang || 'ru');

  const skipElement=el=>{
    if(!el) return false;
    if(el.closest?.('script,style,noscript,svg,pre,code,textarea,input,[data-i18n-skip],[translate="no"]')) return true;
    return false;
  };

  function rememberText(node){
    const current=node.nodeValue??'';
    const last=lastApplied.get(node);
    let original=originals.get(node);
    if(original===undefined || (current!==last && current!==original)){
      original=current; originals.set(node,original);
    }
    return original;
  }

  function applyText(node){
    if(skipElement(node.parentElement)) return;
    const option=node.parentElement?.closest('option');
    if(option&&!option.hasAttribute('value'))option.setAttribute('value',option.textContent.trim());
    const original=rememberText(node);
    const target=lang==='en' ? original : translate(original,{ruleset:node.parentElement?.closest('[data-ruleset]')?.dataset.ruleset,kind:node.parentElement?.closest('[data-content-kind]')?.dataset.contentKind});
    if(node.nodeValue!==target) node.nodeValue=target;
    lastApplied.set(node,target);
  }

  const attrs=['placeholder','title','aria-label'];
  function applyAttrs(el){
    if(!(el instanceof Element) || el.closest('script,style,noscript,svg,pre,code,[data-i18n-skip],[translate="no"]')) return;
    let original=originalAttrs.get(el); if(!original){original={}; originalAttrs.set(el,original);}
    let last=attrLast.get(el); if(!last){last={}; attrLast.set(el,last);}
    for(const attr of attrs){
      if(!el.hasAttribute(attr)) continue;
      const current=el.getAttribute(attr)??'';
      if(!(attr in original) || (current!==last[attr] && current!==original[attr])) original[attr]=current;
      const target=lang==='en' ? original[attr] : translate(original[attr]);
      if(current!==target) el.setAttribute(attr,target);
      last[attr]=target;
    }
  }

  function walk(root=document.body){
    if(!root) return;
    if(root.nodeType===Node.TEXT_NODE){applyText(root);return;}
    if(root instanceof Element) applyAttrs(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    let node; while((node=walker.nextNode())){
      if(node.nodeType===Node.TEXT_NODE) applyText(node); else applyAttrs(node);
    }
  }

  function applyTitle(){
    if(document.querySelector("title[data-i18n-skip]"))return;
    const original=document.documentElement.dataset.originalTitle || document.title;
    document.documentElement.dataset.originalTitle=original;
    const suffix=' · D&D Card Table';
    if(original.endsWith(suffix)){
      const head=original.slice(0,-suffix.length);
      document.title=(lang==='en'?head:translate(head))+suffix;
    }else document.title=lang==='en'?original:translate(original);
  }

  function persist(next){
    const previous=lang;
    lang=normalizeLanguage(next);
    localStorage.setItem('dnd-lang',lang);
    document.cookie=`dnd-lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if(document.documentElement.dataset.serverLanguage && (previous!==lang || document.documentElement.dataset.serverLanguage!==lang)){location.reload();return;}
    document.documentElement.lang=lang;
    document.documentElement.dataset.lang=lang;
    const picker=document.getElementById('language-picker'); if(picker) picker.value=lang;
    walk(document.body); applyTitle();
    document.dispatchEvent(new CustomEvent('dnd-language-change',{detail:{language:lang}}));
  }

  const nativeAlert=window.alert.bind(window);
  const nativeConfirm=window.confirm.bind(window);
  window.alert=message=>nativeAlert(lang==='en'?String(message):translate(String(message)));
  window.confirm=message=>nativeConfirm(lang==='en'?String(message):translate(String(message)));

  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData') applyText(record.target);
      if(record.type==='attributes') applyAttrs(record.target);
      for(const node of record.addedNodes||[]) walk(node);
    }
  });

  function init(){
    const picker=document.getElementById('language-picker');
    if(picker){picker.value=lang;picker.addEventListener('change',()=>persist(picker.value));}
    persist(lang);
    if(lang==='ru')fetch('/api/localization/dictionary').then(r=>r.ok?r.json():null).then(data=>{if(data?.dictionary){contentDictionary=Object.assign(Object.create(null),data.dictionary);walk();}}).catch(()=>{});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  }

  window.DndI18n={get language(){return lang;},setLanguage:persist,t:value=>lang==='en'?String(value):translate(String(value)),translateText};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
