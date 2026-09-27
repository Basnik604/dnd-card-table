import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeText, textId, validPackEntries } from './core.mjs';
import { translateGameEntity, RU_GAME_EXACT, RU_GAME_GENERATED } from '../web/assets/game-ru.mjs';
import { UI_RU_EXTRA } from '../web/assets/ui-ru-extra.mjs';
import { translateText } from '../web/assets/i18n-core.mjs';

export const displayContext = new AsyncLocalStorage();
export const packPath = process.env.LOCALIZATION_PACK || fileURLToPath(new URL('../../data/translations/ru.json', import.meta.url));
let checkedAt = 0, modifiedAt = -1, entries = [], index = new Map();
export function reloadPack(force = false) {
  if (!force && Date.now() - checkedAt < 1500) return;
  checkedAt = Date.now();
  try {
    const mtime = statSync(packPath).mtimeMs;
    if (!force && mtime === modifiedAt) return;
    const next = validPackEntries(JSON.parse(readFileSync(packPath, 'utf8')));
    const map = new Map();
    for (const e of next) {
      const key = normalizeText(e.text);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    entries = next; index = map; modifiedAt = mtime;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Не удалось прочитать пакет локализации:', error.message);
  }
}
export function packEntries() { reloadPack(); return entries; }
const reusableLatinExempt = new Set(['hp','ac','dc','gp','sp','cp','ep','pp','ft','srd','dnd','npc','pc']);
function reusableLatinWords(value) {
  return (String(value??'').toLowerCase().match(/[a-z]{2,}/g)||[]).filter(word=>!reusableLatinExempt.has(word));
}
function safeReusableTranslation(source,target) {
  if(target===source)return false;
  const sourceWords=reusableLatinWords(source);
  if(!sourceWords.length)return true;
  const targetWords=new Set(reusableLatinWords(target));
  const unchanged=sourceWords.filter(word=>targetWords.has(word)).length;
  // UI templates may preserve a proper name (for example, Druid), but a result
  // that leaves most English words untouched is only a partial substitution,
  // not a complete rules/content translation.
  return unchanged/sourceWords.length<=0.4;
}
export function termTranslation(text, context = {}) {
  const raw=String(text??'');
  const game = translateGameEntity(raw, context);
  if (game !== raw) return game;
  // Exact, independently translated labels/paragraphs remain trusted.
  if(Object.hasOwn(UI_RU_EXTRA,raw))return UI_RU_EXTRA[raw];
  const reusable=translateText(raw,'ru',context);
  return safeReusableTranslation(raw,reusable)?reusable:null;
}
export function lookupTranslation(text, context = {}) {
  reloadPack();
  const raw = normalizeText(text);
  const candidates = (index.get(raw) || []).filter(e =>
    (!context.ruleset || e.ruleset === context.ruleset) &&
    (!context.kind || e.kind === context.kind) &&
    (!context.source || e.source === context.source));
  const values = new Set(candidates.map(e => e.translation));
  // Never silently pick one of conflicting edition/source translations.
  if (values.size === 1) return candidates[0].translation;
  return null;
}
export function displayText(text, extra = {}) {
  const context = { ...(displayContext.getStore() || {}), ...extra };
  if (context.language === 'en') return String(text ?? '');
  const raw=String(text??'');
  return lookupTranslation(raw, context) || termTranslation(raw, context) || raw;
}
export function localizedAliases(query, context = {}) {
  const needle = String(query).toLocaleLowerCase('ru').replaceAll('ё','е');
  return packEntries().filter(e => (!context.ruleset || e.ruleset === context.ruleset) &&
    (!context.kind || e.kind === context.kind) && e.uses?.some(u => u.path === 'name_en') &&
    e.translation.toLocaleLowerCase('ru').replaceAll('ё','е').includes(needle)).map(e => e.text);
}
export function glossaryFor(text, context = {}) {
  const source = String(text).toLowerCase();
  return Object.fromEntries(Object.keys({ ...UI_RU_EXTRA, ...RU_GAME_EXACT, ...RU_GAME_GENERATED })
    .filter(k => k.length > 2 && k.length < 65 && source.includes(k.toLowerCase()))
    .sort((a,b) => b.length-a.length).slice(0,100).map(k => [k, termTranslation(k,context)]));
}
