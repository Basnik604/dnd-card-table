import { createHash } from 'node:crypto';

export const normalizeText = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
export const contextKey = context => JSON.stringify([context?.ruleset || '', context?.kind || '', context?.source || '']);
export const textId = (text, context = {}) => createHash('sha256').update(contextKey(context) + '\n' + normalizeText(text)).digest('hex');

// Imports may pluralize dice (d20s) or join them to prose (1d10plus,
// Illusions1d100). An explicit count is unambiguous even without a leading space.
const protectedPattern = /https?:\/\/[^\s)<>]+|`[^`\n]+`|\{\{[^}]+\}\}|\{\d+\}|(?:\d+d|\bd)\d+(?:\s*[+−-]\s*\d+)?|[+−-]?\d+(?:[.,/]\d+)*(?:%|\+)?/gi;
export function protectMechanics(text) {
  const tokens = [];
  const raw=String(text);
  const masked = raw.replace(protectedPattern, (token, offset) => {
    // In "5-foot-by-5-foot", the second hyphen joins a dimension; it is not
    // a negative sign. Preserve the punctuation outside the numeric token.
    const dimensionJoin=/^-\d/.test(token) && /\b(?:foot|feet)-by$/i.test(raw.slice(0,offset));
    tokens.push(dimensionJoin?token.slice(1):token);
    return `${dimensionJoin?'-':''}⟦K${tokens.length - 1}⟧`;
  });
  return { text: masked, tokens };
}

export function restoreMechanics(text, tokens) {
  const seen = new Set();
  const restored = String(text).replace(/⟦K(\d+)⟧/g, (_, i) => {
    const n = Number(i);
    if (n >= tokens.length || seen.has(n)) throw new Error('Повреждены числовые маркеры перевода');
    seen.add(n); return tokens[n];
  });
  if (seen.size !== tokens.length || /⟦|⟧/.test(restored)) throw new Error('Потеряны числовые маркеры перевода');
  return restored;
}

export function validateTranslation(source, target) {
  const errors = [];
  if (typeof target !== 'string' || !target.trim()) return ['Пустой перевод'];
  const numbers = x => protectMechanics(x).tokens.map(x => x.replace(/\s/g, '')).sort();
  if (JSON.stringify(numbers(source)) !== JSON.stringify(numbers(target))) errors.push('Изменены числа, формулы или ссылки');
  if (/[A-Za-z]{3}/.test(source) && !/[А-Яа-яЁё]/.test(target)) errors.push('Нет русского текста');
  if (/<\/?[a-z][^>]*>/i.test(target) && !/<\/?[a-z][^>]*>/i.test(source)) errors.push('Добавлен HTML');
  const structure = x => String(x).split('\n').map(l => {
    if (/^\s*\|/.test(l)) return 'table:' + (l.match(/\|/g) || []).length;
    if (/^\s*[-*+]\s/.test(l)) return 'bullet';
    if (/^\s*\d+[.)]\s/.test(l)) return 'ordered';
    if (/^#{1,6}\s/.test(l)) return 'heading';
    return '';
  }).filter(Boolean);
  if (JSON.stringify(structure(source)) !== JSON.stringify(structure(target))) errors.push('Изменена структура списка или таблицы');
  // This is a structural check, not a claim of semantic rules review.
  if (source.length > 180 && target.length < source.length * .35) errors.push('Возможное сокращение текста');
  return errors;
}

const excludedKeys = /^(?:id|entity_id|source_id|external_key|slug|key|url|href|ruleset|source_key|source_hash|raw_source|raw_data|image_.*|.*_id|.*_ids|.*_url|.*_key|formula|.*_formula|damage_dice|versatile_damage_dice|imported_at|updated_at|created_at|provider|license_.*|attribution_text)$/i;

const technicalLeafKeys = new Set([
  'publisher','gamesystem','source_name','source_index','image','index','dexMode','feature_type','trait_type'
]);

export function isTechnicalPath(path='') {
  const parts=String(path??'').split('.').filter(Boolean);
  const leaf=parts.at(-1)||'';
  if(technicalLeafKeys.has(leaf))return true;
  if(parts.includes('mechanics'))return true;
  if(leaf==='type'&&parts.includes('traits'))return true;
  return false;
}

export function isTechnicalSegment(segment) {
  const uses=segment?.uses;
  return Array.isArray(uses)&&uses.length>0&&uses.every(use=>isTechnicalPath(use?.path));
}
export function collectStrings(value, path = [], out = []) {
  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (/[A-Za-z]{2}/.test(text) && !/^https?:\/\//.test(text) && !/^[\d d+−/().-]+$/i.test(text)) out.push({ path: path.join('.'), text });
  } else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, [...path, i], out));
  else if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) {
    if (!excludedKeys.test(key)) collectStrings(v, [...path, key], out);
  }
  return out;
}

export function makeManifest(entities) {
  const segments = new Map();
  for (const entity of entities) {
    const context = { ruleset: entity.ruleset || '', kind: entity.kind || '', source: entity.source || '' };
    for (const field of collectStrings(entity.fields)) {
      const id = textId(field.text, context);
      if (!segments.has(id)) segments.set(id, { id, ...context, text: field.text, uses: [] });
      segments.get(id).uses.push({ entity: entity.key, name: entity.name, path: field.path });
    }
  }
  return { schema: 1, language: 'ru', generatedAt: new Date().toISOString(), entityCount: entities.length, segments: [...segments.values()] };
}

export function validPackEntries(pack) {
  if (pack?.schema !== 1 || !Array.isArray(pack.entries)) throw new Error('Неподдерживаемый формат пакета перевода');
  return pack.entries.filter(e => e.id === textId(e.text, e) && ['reviewed', 'machine'].includes(e.status) && validateTranslation(e.text, e.translation).length === 0);
}

export function translationCoverage(manifest, entries, lookupTerm = () => null) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const result = { entities: manifest.entityCount, total: 0, ignored: 0, reviewed: 0, machine: 0, terms: 0, pending: 0, pendingSegments: [] };
  for (const segment of manifest.segments) {
    if (isTechnicalSegment(segment)) { result.ignored++; continue; }
    result.total++;
    const found = byId.get(segment.id);
    if (found) result[found.status]++;
    else if (lookupTerm(segment.text, segment)) result.terms++;
    else { result.pending++; result.pendingSegments.push(segment); }
  }
  result.complete = result.pending === 0 && result.total > 0;
  return result;
}
