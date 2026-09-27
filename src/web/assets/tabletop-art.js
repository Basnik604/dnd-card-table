export function initArtPicker({root,api,t,getScene,selectedToken,onChoose}) {
 const find=s=>root.querySelector(s),dialog=find('[data-token-art-dialog]'),editor=find('[data-token-editor]');
 const query=find('[data-art-query]'),category=find('[data-art-category]'),grid=find('[data-art-grid]'),status=find('[data-art-status]');
 const picked=new Map();let serial=0,page=1,pages=1,timer,loadedCategories=false,loading=false;
 const field=name=>editor.elements.namedItem(name);
 function controls() {find('[data-art-prev]').disabled=loading||page<=1;find('[data-art-next]').disabled=loading||page>=pages;}
 function refresh() {
  const token=selectedToken();if(!token)return;
  const selected=field('art_id').value,mode=field('image_mode').value;
  const art=mode==='auto'?token.auto_art:picked.get(selected)||(token.selected_art?.key===selected?token.selected_art:null);
  const preview=find('[data-token-art-preview]');preview.replaceChildren();preview.hidden=!art;
  if(art){const image=new Image();image.alt='';image.src=art.url;image.addEventListener('error',()=>{preview.hidden=true;});preview.append(image);}
  find('[data-token-art-name]').textContent=art?((mode==='auto'?t('Automatic artwork'):t('Selected artwork'))+': '+art.name):t(mode==='catalog'?'Token artwork is unavailable.':'No artwork selected');
  find('[data-token-art-warning]').hidden=mode!=='catalog'||!selected||!!art;
  find('[data-token-catalog-option]').disabled=!selected;
 }
 async function load(next=1) {
  const request=++serial;page=next;loading=true;grid.inert=true;controls();status.textContent=t('Loading artwork…');find('[data-art-retry]').hidden=true;
  try {
   const params=new URLSearchParams({q:query.value,category:category.value,page:String(page)});
   const result=await api(`/api/tabletop/scenes/${getScene().id}/art?${params}`,'GET');if(request!==serial||!dialog.open)return;
   page=result.page;pages=result.pages;
   if(!loadedCategories){for(const group of result.categories){const option=document.createElement('option');option.value=group.id;option.textContent=(result.language==='en'?group.label:group.label_ru)+' · '+group.count;category.append(option);}loadedCategories=true;}
   grid.replaceChildren();grid.scrollTop=0;
   for(const art of result.items) {
    const button=document.createElement('button'),image=new Image(),label=document.createElement('span'),group=document.createElement('small');
    button.type='button';button.dataset.chooseArt=art.key;button.setAttribute('aria-pressed',String(art.key===(field('art_id').value||selectedToken()?.auto_art?.key)));
    image.src=art.url;image.alt='';image.loading='lazy';image.decoding='async';image.width=256;image.height=256;
    image.addEventListener('error',()=>{button.disabled=true;image.hidden=true;group.textContent=t('Token artwork is unavailable.');});
    label.textContent=art.name;group.textContent=result.language==='en'?art.category:art.category_ru;button.append(image,label,group);button.title=art.name;
    button.addEventListener('click',()=>{picked.set(art.key,art);field('art_id').value=art.key;find('[data-token-catalog-option]').disabled=false;field('image_mode').value='catalog';dialog.close();refresh();onChoose();});grid.append(button);
   }
   find('[data-art-count]').textContent=t('Artwork found')+': '+result.total;
   find('[data-art-page]').textContent=t('Page')+' '+page+' / '+pages;
   status.textContent=!result.packs.length?t(result.warnings.length?'Token pack could not be read.':'Install the image pack and restart the server to use this collection.'):!result.items.length?t('No artwork found. Try another name or category.'):result.relaxed?t('Showing the base creature without age or size qualifiers.'):'';
  } catch(error) {if(request===serial){status.textContent=error.message;find('[data-art-retry]').hidden=false;}}
  finally{if(request===serial){loading=false;grid.inert=false;controls();}}
 }
 find('[data-token-art-open]').addEventListener('click',()=>{
  const token=selectedToken();if(!token)return;
  query.value=token.source_name||token.class_name||'';category.value='';grid.replaceChildren();dialog.showModal();load(1);
 });
 find('[data-art-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{serial++;clearTimeout(timer);loading=false;});
 query.addEventListener('input',()=>{serial++;clearTimeout(timer);grid.inert=true;loading=true;controls();timer=setTimeout(()=>load(1),250);});
 category.addEventListener('change',()=>{clearTimeout(timer);load(1);});
 find('[data-art-clear]').addEventListener('click',()=>{clearTimeout(timer);query.value='';category.value='';load(1);});
 find('[data-art-prev]').addEventListener('click',()=>load(page-1));find('[data-art-next]').addEventListener('click',()=>load(page+1));find('[data-art-retry]').addEventListener('click',()=>load(page));
 return {refresh};
}
