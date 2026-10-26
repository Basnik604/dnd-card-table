const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('dnd-character-data'):null;
export function characterChanged(id){if(!id)return;channel?.postMessage({characterId:id});document.dispatchEvent(new CustomEvent('dnd-character-changed',{detail:{characterId:id}}));}
export function onCharacterChanged(listener){const receive=event=>listener(event.data.characterId);channel?.addEventListener('message',receive);return()=>channel?.removeEventListener('message',receive);}
// Form redirects and JSON actions in the ordinary sheet announce authoritative changes.
const id=location.pathname.match(/^\/character\/([^/]+)$/)?.[1];
if(id){
 const key='dnd-character-action:'+id;
 document.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||event.defaultPrevented||form.hasAttribute('data-live-roll')||form.hasAttribute('data-live-action'))return;try{sessionStorage.setItem(key,'1');}catch{}});
 try{if(sessionStorage.getItem(key)){sessionStorage.removeItem(key);characterChanged(id);}}catch{}
}
document.addEventListener('dnd-character-runtime-changed',event=>characterChanged(event.detail.characterId));
