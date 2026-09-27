import {TOKEN_ICONS,ICON_GROUPS} from './assets/tabletop-token-model.mjs';
import {renderArtControl,renderArtDialog} from './tabletop-art-view.mjs';
export function renderTokenPanel(t,{canTransfer=false}={}) {
  const types=ICON_GROUPS.map(group=>`<optgroup label="${t(group)}">${Object.entries(TOKEN_ICONS).filter(([,icon])=>icon.group===group).map(([key,icon])=>`<option value="${key}" ${icon.aliasOf?'hidden':''}>${t(icon.label)}</option>`).join('')}</optgroup>`).join('');
  return `<section class="vtt-token-panel" data-token-panel hidden><h3>${t('Tokens')}</h3>
    <details class="vtt-add-token" open><summary>+ ${t('Add token')}</summary><form data-token-add>
    <label>${t('Token kind')}<select name="kind"><option value="character">${t('Character')}</option><option value="creature">${t('Monster')}</option><option value="npc">${t('NPC')}</option></select></label>
    <div data-token-source-fields><label>${t('Search by name')}<input data-token-search type="search" autocomplete="off"></label><label>${t('Choose source')}<select name="source_id" data-token-sources></select></label><p class="vtt-note" data-token-search-status aria-live="polite"></p></div>
    <label data-token-npc-field hidden>${t('Token name')}<input name="name" maxlength="120" value="${t('NPC')}" required disabled></label><button type="submit">${t('Add to map')}</button></form></details>
    <div class="vtt-token-list" data-token-list></div><p class="vtt-note" data-token-hint>${t('Select a token to customize it. Drag it to move.')}</p>
    <form data-token-editor hidden><h4>${t('Selected token')}</h4><a class="vtt-source-link" data-token-source-link target="_blank" rel="noopener"></a><p class="vtt-note" data-token-source-missing hidden>${t('Source no longer exists.')}</p>
    <label>${t('Token name')}<input name="name" maxlength="120" required></label><label>${t('Token size')}<select name="size_cells"><option value="0.5">${t('Tiny (½ cell)')}</option><option value="1">${t('Small / Medium (1 cell)')}</option><option value="2">${t('Large (2 × 2)')}</option><option value="3">${t('Huge (3 × 3)')}</option><option value="4">${t('Gargantuan (4 × 4)')}</option></select></label>
    <label>${t('Relationship')}<select name="relation"><option value="friendly">${t('Friendly')}</option><option value="neutral">${t('Neutral')}</option><option value="hostile">${t('Hostile')}</option></select></label>
    <label>${t('Symbol')}<select name="icon_type">${types}</select></label>
    <div class="vtt-icon-preview-row"><span class="vtt-icon-preview" data-token-icon-preview aria-hidden="true"></span><button type="button" data-token-gallery-open>${t('Symbol catalog')}</button></div>
    <div class="vtt-input-pair"><label>${t('Symbol color')}<input name="icon_color" type="color"></label><label>${t('Border color')}<input name="border_color" type="color"></label></div>
    <button type="button" class="vtt-text-button" data-token-color-reset>${t('Use default symbol color')}</button>
    <p class="vtt-note">${t('Colors affect symbols. To show one instead of a portrait, choose Symbol only.')}</p>
    <label>${t('Appearance')}<select name="image_mode"><option value="auto">${t('Automatic: portrait / collection / symbol')}</option><option value="catalog" data-token-catalog-option disabled>${t('Collection artwork')}</option><option value="icon">${t('Symbol only')}</option><option value="custom" data-token-custom-option>${t('Custom portrait')}</option></select></label>
    ${renderArtControl(t)}
    <button type="submit" data-token-save>${t('Save token')}</button><span class="vtt-save-state" data-token-save-state></span>
    <label class="vtt-upload"><span>${t('Upload token portrait')}</span><input data-token-file type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" class="vtt-text-button" data-token-remove-image hidden>${t('Remove custom portrait')}</button>
    <button type="button" class="vtt-text-button vtt-danger" data-token-delete>${t('Delete token')}</button></form>
    <button type="button" class="vtt-transfer-open" data-token-transfer-open ${canTransfer?'':'disabled'} title="${t(canTransfer?'Transfer tokens':'Add another floor or location first.')}">${t('Transfer tokens')}</button>
    <dialog class="vtt-transfer-dialog" data-token-transfer aria-labelledby="vtt-transfer-title"><h3 id="vtt-transfer-title">${t('Transfer tokens')}</h3>
      <p class="vtt-note">${t('Tokens move to another floor. Returning restores their previous positions when space is free.')}</p>
      <label>${t('Destination floor')}<select data-transfer-target></select></label>
      <div class="vtt-transfer-shortcuts"><button type="button" data-transfer-characters>${t('Select characters')}</button><button type="button" data-transfer-clear>${t('Clear selection')}</button></div>
      <div class="vtt-transfer-list" data-transfer-list></div><p class="vtt-note" data-transfer-count aria-live="polite"></p>
      <label class="vtt-check"><input type="checkbox" data-transfer-follow checked>${t('Open the destination after transfer')}</label>
      <p class="vtt-transfer-status" data-transfer-status role="alert"></p><div class="vtt-crop-actions"><button type="button" data-transfer-cancel>${t('Cancel')}</button><button type="button" data-transfer-apply>${t('Transfer selected')}</button></div></dialog>
    <dialog class="vtt-icon-dialog" data-token-gallery aria-labelledby="vtt-icon-gallery-title"><div class="vtt-icon-dialog-header"><h3 id="vtt-icon-gallery-title">${t('Symbol catalog')}</h3><button type="button" data-token-gallery-close>${t('Close')}</button></div><p class="vtt-note">${t('Choose a symbol, then save the token.')}</p><div data-token-gallery-items></div></dialog>
    ${renderArtDialog(t)}<dialog class="vtt-crop-dialog" data-token-crop><h3>${t('Crop token portrait')}</h3><canvas width="512" height="512" data-token-crop-canvas></canvas>
      <label>${t('Portrait zoom')}<input data-token-crop-zoom type="range" min="1" max="3" step="0.01" value="1"></label><label>${t('Horizontal framing')}<input data-token-crop-x type="range" min="0" max="100" value="50"></label><label>${t('Vertical framing')}<input data-token-crop-y type="range" min="0" max="100" value="50"></label>
      <p class="vtt-note" data-token-crop-status role="alert"></p><div class="vtt-crop-actions"><button type="button" data-token-crop-cancel>${t('Cancel')}</button><button type="button" data-token-crop-apply>${t('Use portrait')}</button></div></dialog></section>`;
}
