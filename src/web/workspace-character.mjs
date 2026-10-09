import {parse,parseFragment,serialize} from 'parse5';
const attr=(node,name)=>node.attrs?.find(x=>x.name===name)?.value;
function find(node,predicate){if(predicate(node))return node;for(const child of node.childNodes||[]){const found=find(child,predicate);if(found)return found;}}
const hasClass=(node,name)=>String(attr(node,'class')||'').split(/\s+/).includes(name);
// Server-side projection of the existing sheet; no parallel inventory or rules engine.
export function projectCharacterPanel(document,panel,characterId){
  if(!['inventory','spells','abilities'].includes(panel))throw Error('Invalid character panel');
  const tree=parse(document),body=find(tree,n=>n.tagName==='body'),main=find(body,n=>n.tagName==='main');
  if(!body||!main)throw Error('Character panel unavailable');
  const pane=find(main,n=>attr(n,'data-sheet-pane')===(panel==='abilities'?'features':panel));
  if(!pane)throw Error('Character panel unavailable');
  pane.attrs=pane.attrs.filter(a=>a.name!=='data-sheet-pane');pane.attrs.find(a=>a.name==='class').value='workspace-character-content';
  const selected=[pane];
  if(panel==='abilities'){
    for(const predicate of [n=>hasClass(n,'sheet-vitals'),n=>attr(n,'data-workspace-character-resources')!==undefined]){const node=find(main,predicate);if(node)selected.push(node);}
  }
  // Keep existing picker/live-action scripts, but remove all unrelated sheet data.
  const scripts=(main.childNodes||[]).filter(n=>n.tagName==='script');
  main.childNodes=[...selected,...scripts];for(const node of main.childNodes)node.parentNode=main;
  body.childNodes=body.childNodes.filter(n=>n===main||n.tagName==='script');
  const characterAttr='data-workspace-character-id';body.attrs.push({name:characterAttr,value:characterId});
  const additions=parseFragment('<link rel="stylesheet" href="/assets/workspace-character.css?v=0.32.2"><script type="module" src="/assets/workspace-character-frame.js?v=0.32.2"></script>');
  const head=find(tree,n=>n.tagName==='head');for(const node of additions.childNodes){node.parentNode=head;head.childNodes.push(node);}
  return serialize(tree);
}
