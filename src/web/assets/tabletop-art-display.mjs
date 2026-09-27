import {tokenIcon} from './tabletop-token-model.mjs';
export function paintTokenFace(container,token,{lazy=false}={}) {
 container.classList.remove('has-token-image');container.innerHTML=tokenIcon(token.icon_type,token.icon_color);
 const source=token.has_image?`/media/tabletop/tokens/${encodeURIComponent(token.id)}?v=${token.image_revision}`:token.art?.url;
 if(!source)return;
 const image=new Image();image.alt='';image.draggable=false;image.decoding='async';
 if(lazy)image.loading='lazy';
 image.className=token.has_image?'vtt-portrait':'vtt-library-art';
 image.addEventListener('load',()=>{if(image.parentNode===container)container.classList.add('has-token-image');});
 image.addEventListener('error',()=>{image.remove();container.classList.remove('has-token-image');});
 image.src=source;container.append(image);
}
