import "dotenv/config";
import {builderDatabaseError} from "./database-errors.mjs";
import {createTabletopHandler} from "./tabletop.mjs";
import {projectCharacterPanel} from "./workspace-character.mjs";
import {TOKEN_ICONS} from "./assets/tabletop-icon-art.mjs";
import {subclassControlResources, renderSubclassControls, useSubclassControl, dragonWingsActive} from "./subclass-controls.mjs";
import {subclassResourceDefinitions, useSubclassAction, renderSubclassActionPanel} from "./subclass-actions.mjs";
import { statusContent } from "../localization/status.mjs";
import { startTranslationWorker } from "../localization/worker.mjs";
import { UI_RU_EXTRA } from "./assets/ui-ru-extra.mjs";
import { displayContext, displayText, lookupTranslation, localizedAliases, packEntries } from "../localization/runtime.mjs";
import { localizeHtml } from "../localization/html.mjs";
import { readCatalog } from "../localization/catalog.mjs";
import http from "node:http";
import { URL, fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { spellClassNames, spellHasClass } from "./spell-classes.mjs";
import { renderRulesText, plainRulesText, rulesInline } from "./rules-text.mjs";
import { rollDiceFormula, rollWithMode } from "./dice.mjs";
import { adjustCharacterHitPoints, adjustEncounterHitPoints, setTemporaryHitPoints, pendingConcentrationChecks, resolveConcentrationCheck } from "./combat-state.mjs";
import { linkifyBuilderText, renderBuilderLinkedRulesText } from "./builder-links.mjs";
import { coreClassFeatures, coreClassProgressionData, progressionAnchorTarget, groupClassVariants, compactRulesetLabel } from "./class-progression.mjs";
import { normalizeLanguage, translateText } from "./assets/i18n-core.mjs";
import { translateGameEntity, englishAliasesForRussianQuery } from "./assets/game-ru.mjs";
import {
  applyLegacySpeciesBonuses,
  dedupeGuidedRows,
  scopeAllows,
  sourceLabel
} from "../shared/builder-content.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Make sure .env exists in the project root.");
}

const PORT = Number(process.env.WEB_PORT ?? 3000);
const sql = postgres(DATABASE_URL, { max: 5, idle_timeout: 20 });
const PAGE_SIZE = 30;

const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const THEME_ASSETS = new Map([
  ["/assets/workspace-data.js", ["text/javascript; charset=utf-8", "workspace-data.js"]],
  ["/assets/workspace-character-frame.js", ["text/javascript; charset=utf-8", "workspace-character-frame.js"]],
  ["/assets/workspace-character.css", ["text/css; charset=utf-8", "workspace-character.css"]],
  ["/assets/workspace-character-sync.js", ["text/javascript; charset=utf-8", "workspace-character-sync.js"]],
  ["/assets/tabletop-combat.js", ["text/javascript; charset=utf-8", "tabletop-combat.js"]],
  ["/assets/workspace.js", ["text/javascript; charset=utf-8", "workspace.js"]],
  ["/assets/workspace-floating.mjs", ["text/javascript; charset=utf-8", "workspace-floating.mjs"]],
  ["/assets/workspace-state.mjs", ["text/javascript; charset=utf-8", "workspace-state.mjs"]],
  ["/assets/workspace.css", ["text/css; charset=utf-8", "workspace.css"]],
  ["/assets/tabletop-art.js", ["text/javascript; charset=utf-8", "tabletop-art.js"]],
  ["/assets/tabletop-art-display.mjs", ["text/javascript; charset=utf-8", "tabletop-art-display.mjs"]],
  ["/assets/tabletop-transfer.js", ["text/javascript; charset=utf-8", "tabletop-transfer.js"]],
  ["/assets/tabletop-icon-art.mjs", ["text/javascript; charset=utf-8", "tabletop-icon-art.mjs"]],
  ...[...new Set(Object.values(TOKEN_ICONS).map(icon=>icon.file))].map(file=>["/assets/"+file,["image/png",file]]),
  ["/assets/tavern-table.webp", ["image/webp", "tavern-table.webp"]],
  ["/assets/parchment.webp", ["image/webp", "parchment.webp"]],
  ["/assets/tabletop-tokens.js", ["text/javascript; charset=utf-8", "tabletop-tokens.js"]],
  ["/assets/tabletop-token-model.mjs", ["text/javascript; charset=utf-8", "tabletop-token-model.mjs"]],
  ["/assets/tabletop-tokens.css", ["text/css; charset=utf-8", "tabletop-tokens.css"]],
  ["/assets/tabletop.css", ["text/css; charset=utf-8", "tabletop.css"]],
  ["/assets/tabletop.js", ["text/javascript; charset=utf-8", "tabletop.js"]],
  ["/assets/tabletop-i18n.mjs", ["text/javascript; charset=utf-8", "tabletop-i18n.mjs"]],
  ["/assets/table-ui.css", ["text/css; charset=utf-8", "table-ui.css"]],
  ["/assets/table-ui.js", ["text/javascript; charset=utf-8", "table-ui.js"]],
  ["/assets/i18n.js", ["text/javascript; charset=utf-8", "i18n.js"]],
  ["/assets/i18n-core.mjs", ["text/javascript; charset=utf-8", "i18n-core.mjs"]],
  ["/assets/ui-ru-extra.mjs", ["text/javascript; charset=utf-8", "ui-ru-extra.mjs"]],
  ["/assets/game-ru.mjs", ["text/javascript; charset=utf-8", "game-ru.mjs"]]
]);

function serveThemeAsset(res, pathname) {
  const asset = THEME_ASSETS.get(pathname);
  if (!asset) return false;
  const [mime, filename] = asset;
  try {
    const bytes = readFileSync(path.join(WEB_DIR, "assets", filename));
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-cache"
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
  return true;
}

function requestLanguage(req){
  const cookies=String(req?.headers?.cookie||"").split(";").map(x=>x.trim());
  const raw=cookies.find(x=>x.startsWith("dnd-lang="))?.slice("dnd-lang=".length);
  return normalizeLanguage(raw||"ru");
}

function entityDisplayName(row,lang="ru",kind=null){
  const raw=String(row?.name_en??row?.name??"");
  if(lang!=="ru")return raw;
  const ctx={ruleset:row?.ruleset||null,kind:kind||row?.content_kind||row?.entity_type||null,source:row?.source_key||null};
  return displayText(raw,{...ctx,language:lang});
}

function russianSearchAliases(term,{ruleset=null,kind=null}={}){
  return [...new Set([...englishAliasesForRussianQuery(term,{ruleset,kind,limit:120}), ...localizedAliases(term,{ruleset,kind}), ...Object.entries(UI_RU_EXTRA).filter(([k,v])=>k.length<80&&!/[.!{}]/.test(k)&&v.toLocaleLowerCase('ru').replaceAll('ё','е').includes(String(term).toLocaleLowerCase('ru').replaceAll('ё','е'))).map(([k])=>k)])].slice(0,500);
}


const TABS = [
  ["creature", "Monsters"],
  ["spell", "Spells"],
  ["equipment", "Equipment"],
  ["magic_item", "Magic Items"],
  ["condition", "Conditions"],
  ["all", "All"]
];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pretty(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value.map(pretty).filter(v => v !== "—").join(", ") || "—";
  }
  if (typeof value === "object") {
    if ("as_string" in value && value.as_string) return pretty(value.as_string);
    if ("display" in value && value.display) return pretty(value.display);
    if ("name" in value) return pretty(value.name);
    if ("value" in value && Object.keys(value).length <= 3) return pretty(value.value);
    return Object.entries(value)
      .filter(([k, v]) => !["unit", "as_string", "display"].includes(k) && v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${pretty(v)}`)
      .join(" · ") || "—";
  }
  return String(value);
}


function numberText(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, "").replace(/\.$/, "");
}

function abilityModifier(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return Math.floor((n - 10) / 2);
}

function abilityText(score) {
  if (score === null || score === undefined || score === "") return "—";
  const mod = abilityModifier(score);
  return mod === null ? String(score) : `${score} (${mod >= 0 ? "+" : ""}${mod})`;
}

function speedText(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return pretty(value);
  if (value.as_string) return pretty(value.as_string);
  const unit = String(value.unit || "ft").replace(/^feet$/i, "ft");
  const labels = [["walk", ""], ["fly", "fly "], ["swim", "swim "], ["burrow", "burrow "], ["climb", "climb "]];
  const parts = [];
  for (const [key, prefix] of labels) {
    if (value[key] !== null && value[key] !== undefined && value[key] !== "") {
      parts.push(`${prefix}${numberText(value[key])} ${unit}${key === "fly" && value.hover ? " (hover)" : ""}`);
    }
  }
  return parts.length ? parts.join(", ") : "—";
}

function sensesText(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return pretty(value);
  if (value.as_string) return pretty(value.as_string);
  const labels = [["blindsight", "Blindsight"], ["darkvision", "Darkvision"], ["tremorsense", "Tremorsense"], ["truesight", "Truesight"], ["telepathy", "Telepathy"]];
  const parts = [];
  for (const [key, label] of labels) {
    if (value[key] !== null && value[key] !== undefined && value[key] !== "") parts.push(`${label} ${numberText(value[key])} ft.`);
  }
  if (value.passive_perception !== null && value.passive_perception !== undefined) parts.push(`Passive Perception ${numberText(value.passive_perception)}`);
  return parts.length ? parts.join(", ") : pretty(value);
}

function bonusesText(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return pretty(value);
  const short = { strength:"Str", dexterity:"Dex", constitution:"Con", intelligence:"Int", wisdom:"Wis", charisma:"Cha" };
  const parts = [];
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Number(raw);
    const label = short[key] || key.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
    parts.push(`${label} ${Number.isFinite(n) && n >= 0 ? "+" : ""}${raw}`);
  }
  return parts.length ? parts.join(", ") : "—";
}

function acText(value) {
  if (Array.isArray(value)) {
    const parts = value.map(entry => {
      if (typeof entry === "number") return String(entry);
      if (entry && typeof entry === "object") {
        const val = entry.value ?? entry.ac ?? entry.armor_class;
        const note = entry.condition ?? entry.type ?? entry.desc;
        if (val !== undefined) return note ? `${val} (${pretty(note)})` : String(val);
      }
      return pretty(entry);
    });
    return parts.join(" / ") || "—";
  }
  return pretty(value);
}


function costText(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" || typeof value === "string") return numberText(value);
  if (typeof value === "object" && !Array.isArray(value)) {
    const amount = value.amount ?? value.quantity ?? value.value ?? value.cost;
    const unit = value.unit ?? value.currency ?? value.denomination;
    if (amount !== undefined && amount !== null) return `${numberText(amount)}${unit ? ` ${String(unit).toUpperCase()}` : ""}`;
    if (value.as_string) return String(value.as_string);
  }
  return pretty(value);
}

function rangeText(normal, long) {
  if (normal === null || normal === undefined) return "—";
  return long !== null && long !== undefined ? `${numberText(normal)}/${numberText(long)} ft.` : `${numberText(normal)} ft.`;
}

function armorDexText(mode, max) {
  if (!mode) return "—";
  if (mode === "none") return "No DEX bonus";
  if (mode === "full") return "Full DEX bonus";
  if (mode === "capped") return `DEX bonus (max +${numberText(max ?? 2)})`;
  return pretty(mode);
}


function normalizedMetaText(value){
  if(value===null || value===undefined) return "";
  const s=String(value).trim().toLowerCase();
  if(["","null","none","n/a","na","false","0","—","-","not applicable","undefined"].includes(s)) return "";
  return s;
}

function diceMetadata(value){
  const s=normalizedMetaText(value);
  return /^(?:[0-9]+\s*d\s*[0-9]+(?:\s*[+-]\s*[0-9]+)?|[1-9][0-9]*)$/i.test(s);
}

function positiveMetadataNumber(value){
  if(value===null || value===undefined || String(value).trim()==="") return false;
  const n=Number(value);
  return Number.isFinite(n) && n>0;
}

function weaponCategoryMetadata(value){
  const s=normalizedMetaText(value);
  return /\b(simple|martial)\b/.test(s) || /\b(melee|ranged)\s+weapon/.test(s);
}

function toolMetadata(text){
  return /\btools?\b|\bsupplies\b|\binstrument\b|\bartisan\b/.test(text);
}

function equipmentText(...parts){
  return parts.map(normalizedMetaText).filter(Boolean).join(" ");
}

function effectiveEntityItemType(e){
  const raw=normalizedMetaText(e?.item_type) || (e?.item_kind==="magic_item"?"magic_item":"gear");
  const haystack=equipmentText(e?.name_en,e?.category,e?.subcategory,e?.base_item_name);
  const magic=String(e?.item_kind||"").toLowerCase()==="magic_item" || raw.startsWith("magic_");

  /* These original types were not touched by the v0.13.1 repair and are safe. */
  if(["ammunition","magic_ammunition","consumable"].includes(raw)) return raw;

  /* Strong evidence wins over a possibly corrupted broad/weapon/armor label. */
  if(/\bshield\b/.test(haystack) && positiveMetadataNumber(e?.armor_class_base)) return "shield";
  if(positiveMetadataNumber(e?.armor_class_base)) return magic?"magic_armor":"armor";
  if(diceMetadata(e?.damage_dice) || weaponCategoryMetadata(e?.weapon_category)) return magic?"magic_weapon":"weapon";

  /* Tools and ordinary adventuring gear must never become equippable merely
     because Open5e supplied 0/null-like weapon/armor placeholders. */
  if(raw==="tool" || toolMetadata(haystack)) return "tool";
  if(e?.consumable===true || raw==="consumable") return "consumable";
  if(magic) return "magic_item";
  return "gear";
}

function itemTypeLabel(value) {
  const labels = {
    weapon: "Weapon", armor: "Armor", shield: "Shield", ammunition: "Ammunition",
    magic_weapon: "Magic Weapon", magic_armor: "Magic Armor", magic_ammunition: "Magic Ammunition",
    consumable: "Consumable", tool: "Tool", gear: "Adventuring Gear", magic_item: "Magic Item"
  };
  return labels[value] || String(value || "Item").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function propertiesText(value) {
  if (!Array.isArray(value)) return pretty(value);
  const names = value.map(v => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") return v.name ?? v.display_name ?? v.label ?? v.key ?? v.slug ?? pretty(v);
    return pretty(v);
  }).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

function itemDetail(e) {
  const type = effectiveEntityItemType(e);
  const isWeapon = ["weapon","magic_weapon","ammunition","magic_ammunition"].includes(type);
  const isArmor = ["armor","magic_armor","shield"].includes(type);
  const stats = [];

  if (isWeapon) {
    stats.push(["Damage", [e.damage_dice, e.damage_type].filter(Boolean).join(" ") || "—"]);
    if (e.versatile_damage_dice) stats.push(["Versatile", [e.versatile_damage_dice, e.damage_type].filter(Boolean).join(" ")]);
    if (e.mastery) stats.push(["Mastery", e.mastery]);
    if (e.normal_range !== null && e.normal_range !== undefined) stats.push(["Range", rangeText(e.normal_range, e.long_range)]);
  } else if (isArmor) {
    stats.push([type==="shield" ? "AC Bonus" : "Armor Class", type==="shield" && e.armor_class_base != null ? `+${e.armor_class_base}` : (e.armor_class_base ?? "—")]);
    if (type!=="shield" && e.dex_bonus_mode) stats.push(["DEX", armorDexText(e.dex_bonus_mode, e.max_dex_bonus)]);
    if (e.strength_requirement) stats.push(["Strength", e.strength_requirement]);
    if (e.stealth_disadvantage !== null && e.stealth_disadvantage !== undefined) stats.push(["Stealth", e.stealth_disadvantage ? "Disadvantage" : "Normal"]);
  } else {
    if (e.magic_bonus !== null && e.magic_bonus !== undefined) stats.push(["Magic Bonus", `+${e.magic_bonus}`]);
    if (e.rarity) stats.push(["Rarity", e.rarity]);
    if (e.consumable) stats.push(["Use", "Consumable"]);
  }

  if (e.magic_bonus !== null && e.magic_bonus !== undefined && !stats.some(([k]) => k === "Magic Bonus")) {
    stats.push(["Magic Bonus", `+${e.magic_bonus}`]);
  }

  const statHtml = stats.length ? `<section class="section"><div class="stats">${stats.slice(0,4).map(([k,v]) => `<div class="stat"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div></section>` : "";
  const cd=e.canonical_data && typeof e.canonical_data==="object" ? e.canonical_data : {};
  const utilize=Array.isArray(cd.utilize) ? cd.utilize.map(u=>`${u?.name||"Use"}${u?.dc?.dc_value?` (DC ${u.dc.dc_value})`:""}`).join("; ") : null;
  const contents=Array.isArray(cd.contents) ? cd.contents.map(x=>`${x?.quantity&&x.quantity!==1?`${x.quantity} × `:""}${x?.name||""}`).filter(Boolean).join(", ") : null;

  const detailRows = [
    ["Type", itemTypeLabel(type)],
    ["Category", e.category],
    ["Subtype", e.subcategory],
    ["Weapon category", e.weapon_category],
    ["Properties", propertiesText(e.properties)],
    ["Mastery", e.mastery],
    ["Don", cd.don_time],
    ["Doff", cd.doff_time],
    ["Tool ability", cd.ability],
    ["Utilize", utilize],
    ["Craft", Array.isArray(cd.craft)&&cd.craft.length?cd.craft:null],
    ["Contents", contents],
    ["Quantity", cd.quantity],
    ["Storage", cd.storage],
    ["Ammunition", cd.ammunition],
    ["Base item", e.base_item_name],
    ["Charges", e.charges],
    ["Consumable", e.consumable ? "Yes" : null]
  ];
  const extra = detailRows.filter(([,v]) => v !== null && v !== undefined && v !== "" && v !== "—" && !(Array.isArray(v)&&v.length===0));

  const statusLabels={
    "verified-3-source":"Verified · official SRD + 2 structured sources",
    "verified-2-source":"Cross-checked · 2 structured sources",
    "open5e-only":"Open5e only · needs manual reconciliation"
  };
  const verified=e.audit_status ? `<div class="verification ${e.audit_status==="open5e-only"?"warning":""}"><b>${esc(statusLabels[e.audit_status]||e.audit_status)}</b>${e.audited_at?`<span>Audited ${esc(new Date(e.audited_at).toLocaleDateString("en-CA"))}</span>`:""}</div>`:"";

  return verified + statHtml + (extra.length ? `<section class="section"><h3>Item Data</h3><div class="description">${kv(extra)}</div></section>` : "");
}
function truncate(value, max = 150) {
  value=displayText(value);
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  if(displayContext.getStore()?.language!=="en" && data && typeof data==="object"){
    data={...data};
    for(const key of ["error","outcome"])if(typeof data[key]==="string")data[key]=translateText(data[key],"ru");
    if(data.effects){data.effects={...data.effects};for(const key of Object.keys(data.effects))if(key.endsWith("Html")&&typeof data.effects[key]==="string")data.effects[key]=localizeHtml(data.effects[key],"ru");}
  }
  res.end(JSON.stringify(data, null, 2));
}


function binary(res,status,mime,bytes){
  res.writeHead(status,{"Content-Type":mime||"application/octet-stream","Cache-Control":"no-store"});
  res.end(bytes);
}
async function parseJson(req,maxBytes=7_000_000){
  let raw="";
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>maxBytes) throw new Error("Request body too large");
  }
  return raw?JSON.parse(raw):{};
}
function decodeImageDataUrl(dataUrl){
  const match=String(dataUrl||"").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match) throw new Error("Unsupported image format");
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length>4_500_000) throw new Error("Image too large after compression");
  return {mime:match[1],bytes};
}
async function saveCharacterImage(id,payload){
  const image=decodeImageDataUrl(payload.data_url);
  await sql`UPDATE characters SET portrait_bytes=${image.bytes},portrait_mime=${image.mime},portrait_name=${String(payload.name||"portrait").slice(0,180)},updated_at=NOW() WHERE id=${id}`;
}
async function saveEntityImage(id,payload){
  const image=decodeImageDataUrl(payload.data_url);
  await sql`UPDATE content_entities SET image_bytes=${image.bytes},image_mime=${image.mime},image_name=${String(payload.name||"art").slice(0,180)},updated_at=NOW() WHERE id=${id}`;
}
async function saveCardImage(id,payload){
  const image=decodeImageDataUrl(payload.data_url);
  await sql`UPDATE card_templates SET image_bytes=${image.bytes},image_mime=${image.mime},image_name=${String(payload.name||"art").slice(0,180)},updated_at=NOW() WHERE id=${id}`;
}
async function mediaCharacter(id){
  const r=await sql`SELECT portrait_bytes AS bytes,portrait_mime AS mime FROM characters WHERE id=${id} LIMIT 1`; return r[0]||null;
}
async function mediaEntity(id){
  const r=await sql`SELECT image_bytes AS bytes,image_mime AS mime FROM content_entities WHERE id=${id} LIMIT 1`; return r[0]||null;
}
async function mediaCard(id){
  const r=await sql`
    SELECT COALESCE(ct.image_bytes,ce.image_bytes) AS bytes,
           COALESCE(ct.image_mime,ce.image_mime) AS mime
    FROM card_templates ct LEFT JOIN content_entities ce ON ce.id=ct.source_entity_id
    WHERE ct.id=${id} LIMIT 1`; return r[0]||null;
}
function html(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(localizeHtml(body,displayContext.getStore()?.language||"ru",displayContext.getStore()||{}));
}

function layout({ title, content, activeTab = "", query = "", userTitle = false }) {
  const nav = TABS.map(([key, label]) => {
    const cls = activeTab === key ? "tab active" : "tab";
    const q = query ? `&q=${encodeURIComponent(query)}` : "";
    return `<a class="${cls}" href="/library?tab=${key}${q}">${esc(label)}</a>`;
  }).join("");

  return `<!doctype html>
<html lang="${displayContext.getStore()?.language||"ru"}" data-server-language="${displayContext.getStore()?.language||"ru"}">
<head>
<meta charset="utf-8" />
<script>
(()=>{const t=localStorage.getItem("dnd-theme");document.documentElement.dataset.theme=(t==="tavern"?"tavern":"base");const l=(localStorage.getItem("dnd-lang")||"ru").toLowerCase().startsWith("en")?"en":"ru";document.documentElement.lang=l;document.documentElement.dataset.lang=l;document.cookie="dnd-lang="+l+"; Path=/; Max-Age=31536000; SameSite=Lax";})();
</script>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title${userTitle?' data-i18n-skip':''}>${esc(title)} · D&D Card Table</title>
<style>
:root{--bg:#0d1110;--panel:#151b18;--panel2:#1a221e;--line:#2a3730;--text:#edf3ef;--muted:#91a198;--gold:#d4b16a;--green:#74b98b;--danger:#d87979;--shadow:0 18px 60px rgba(0,0,0,.28)}
*{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at 12% 0,#18221d 0,transparent 28%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.45} a{color:inherit;text-decoration:none}
.shell{max-width:1440px;margin:0 auto;padding:0 28px 48px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:26px 0 20px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:13px}.mark{width:40px;height:40px;border:1px solid #806f4e;border-radius:12px;display:grid;place-items:center;color:var(--gold);font-family:Georgia,serif;font-weight:700;background:linear-gradient(145deg,#26251f,#121714);box-shadow:var(--shadow)}.brand h1{font:600 20px/1.1 Georgia,serif;margin:0;letter-spacing:.02em}.brand small{display:block;color:var(--muted);font-size:11px;margin-top:5px;letter-spacing:.1em;text-transform:uppercase}
.status{color:var(--muted);font-size:12px;padding:7px 10px;border:1px solid var(--line);border-radius:999px}.status b{color:var(--green)}
.hero{padding:34px 0 24px;display:flex;align-items:end;justify-content:space-between;gap:28px}.hero h2{font:500 34px/1.05 Georgia,serif;margin:0 0 10px}.hero p{color:var(--muted);margin:0;max-width:660px}.count{font:500 30px/1 Georgia,serif;color:var(--gold)}.count-label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em;margin-top:7px;text-align:right}
.tabs{display:flex;gap:8px;overflow:auto;padding:0 0 18px}.tab{white-space:nowrap;color:var(--muted);border:1px solid var(--line);padding:9px 13px;border-radius:10px;font-size:13px;background:#111613}.tab:hover{color:var(--text);border-color:#425147}.tab.active{color:#171712;background:var(--gold);border-color:var(--gold);font-weight:700}
.toolbar{display:flex;gap:12px;margin:0 0 22px}.search{flex:1;display:flex;gap:10px}.search input{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--text);outline:none}.search input:focus{border-color:#657760;box-shadow:0 0 0 3px rgba(116,185,139,.08)}button,.button{border:1px solid #685c43;background:#2a281f;color:var(--gold);border-radius:11px;padding:10px 15px;cursor:pointer;font-weight:650}.button.secondary{background:var(--panel);border-color:var(--line);color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.card{display:flex;flex-direction:column;min-height:196px;padding:19px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(155deg,var(--panel2),var(--panel));box-shadow:0 8px 24px rgba(0,0,0,.12);transition:.16s ease}.card:hover{transform:translateY(-2px);border-color:#4b5b51;box-shadow:var(--shadow)}.eyebrow{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.09em}.card h3{font:500 21px/1.15 Georgia,serif;margin:12px 0 8px}.summary{color:#a8b5ad;font-size:13px;margin:0 0 16px;flex:1}.chips{display:flex;flex-wrap:wrap;gap:7px}.chip{font-size:11px;color:#c8d1cc;border:1px solid #344139;background:#111713;border-radius:999px;padding:4px 8px}.chip.gold{color:var(--gold);border-color:#5a503a}.chip.green{color:#9ad0aa;border-color:#355544}
.pager{display:flex;justify-content:space-between;align-items:center;margin-top:24px;color:var(--muted);font-size:13px}.pager-actions{display:flex;gap:8px}.disabled{opacity:.35;pointer-events:none}
.empty{padding:64px 24px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);text-align:center;background:rgba(21,27,24,.45)}
.back{display:inline-flex;margin:28px 0 18px;color:var(--muted);font-size:13px}.detail-head{display:flex;justify-content:space-between;gap:28px;align-items:start;padding:22px 0 28px;border-bottom:1px solid var(--line)}.detail-head h2{font:500 38px/1 Georgia,serif;margin:8px 0 12px}.meta{color:var(--muted);font-size:13px}.detail-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.65fr);gap:26px;padding-top:26px}.section{margin-bottom:28px}.section h3{font:500 18px Georgia,serif;margin:0 0 12px;color:#e8dfcd}.description{white-space:pre-wrap;color:#c3cec7;background:var(--panel);border:1px solid var(--line);padding:18px;border-radius:14px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat{padding:13px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.stat b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin-bottom:5px}.stat span{font:500 18px Georgia,serif}.stat-note{font:400 12px/1.2 Inter,ui-sans-serif,system-ui;color:var(--muted);margin-left:4px}.abilities{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.ability{text-align:center;padding:11px 6px;border:1px solid var(--line);background:#121814;border-radius:11px}.ability b{font-size:10px;color:var(--muted);letter-spacing:.08em}.ability span{display:block;font:500 18px Georgia,serif;margin-top:3px}.blocks{display:grid;gap:10px}.block{padding:14px 15px;border-left:2px solid #786a4d;background:var(--panel);border-radius:4px 12px 12px 4px}.block-title{font-weight:700;margin-bottom:5px;color:#eee3c9}.block p{margin:0;color:#b7c3bb;font-size:13px;white-space:pre-wrap}.aside-card{position:sticky;top:18px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}.kv{display:grid;grid-template-columns:105px 1fr;gap:9px 12px;font-size:13px}.kv dt{color:var(--muted)}.kv dd{margin:0;word-break:break-word}.raw{margin-top:16px}.raw summary{cursor:pointer;color:var(--muted);font-size:12px}.raw pre{overflow:auto;max-height:420px;font-size:11px;background:#0a0e0c;padding:12px;border-radius:10px;color:#9eb0a5}
.footer{color:#68766e;border-top:1px solid var(--line);font-size:11px;margin-top:42px;padding-top:18px}
@media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-layout{grid-template-columns:1fr}.aside-card{position:static}.abilities{grid-template-columns:repeat(3,1fr)}}@media(max-width:640px){.shell{padding:0 16px 34px}.topbar,.hero{align-items:flex-start;flex-direction:column}.status{display:none}.hero h2{font-size:29px}.count-label{text-align:left}.grid{grid-template-columns:1fr}.toolbar{flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.detail-head{flex-direction:column}.detail-head h2{font-size:32px}}

.mainnav{display:flex;gap:8px;margin-left:auto;margin-right:8px}.mainnav a{font-size:12px;color:var(--muted);border:1px solid var(--line);padding:8px 11px;border-radius:9px;background:#101512}.mainnav a:hover{color:var(--text);border-color:#526157}
.cta-row{display:flex;gap:10px;align-items:center;margin-top:14px}.inline-form{display:inline}.primary-action{background:var(--gold);color:#171712;border-color:var(--gold)}
.card-library-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.game-card-wrap{display:flex;flex-direction:column;gap:10px}.game-card{position:relative;min-height:390px;border:1px solid #4a4434;border-radius:20px;background:linear-gradient(160deg,#182019 0%,#111713 56%,#0e120f 100%);box-shadow:0 18px 45px rgba(0,0,0,.23);overflow:hidden}.game-card:before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:var(--gold)}.game-card.monster:before{background:#8f5d54}.game-card.spell:before{background:#6879a8}.game-card.weapon:before,.game-card.item:before{background:#a17e49}.game-card.condition:before{background:#7f6a91}.game-card-head{padding:20px 20px 14px;border-bottom:1px solid var(--line)}.game-card-type{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.game-card h3{font:500 26px/1.05 Georgia,serif;margin:7px 0 4px}.game-card-sub{color:#9faea5;font-size:12px}.game-card-body{padding:16px 20px}.game-card-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:15px}.mini-stat{border:1px solid #2d3932;border-radius:10px;padding:9px;background:rgba(9,13,10,.35)}.mini-stat b{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}.mini-stat span{font:500 16px Georgia,serif}.card-copy{font-size:12px;color:#afbbb4;line-height:1.45}.card-action-list{display:grid;gap:8px;margin-top:16px}.card-action{border-top:1px solid #2a342e;padding-top:9px}.card-action-title{font-weight:700;color:#e8dfcd;font-size:13px}.card-action p{margin:4px 0 7px;color:#9eaba3;font-size:11px}.roll-form button{padding:7px 10px;font-size:11px}.card-footer-actions{display:flex;gap:8px;justify-content:space-between;align-items:center}.card-count{font-size:11px;color:var(--muted)}
.card-detail-grid{display:grid;grid-template-columns:minmax(300px,420px) 1fr;gap:28px;padding-top:28px;align-items:start}.card-panel{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:18px}.card-panel h3{font:500 19px Georgia,serif;margin:0 0 12px}.instance-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding:10px 0;font-size:12px}.instance-main{display:flex;align-items:center;gap:8px;min-width:0}.instance-actions{display:flex;align-items:center;gap:8px}.danger-button{background:#241513;color:#e9aaa2;border:1px solid #60332f;border-radius:8px;padding:6px 9px;cursor:pointer;font-size:11px}.danger-button:hover{background:#321a17;border-color:#8a4740}.danger-zone{margin-top:28px;padding-top:18px;border-top:1px solid #51302d}.danger-zone h3{color:#e6aaa3}.roll-result{max-width:520px;margin:40px auto;border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:26px;text-align:center}.roll-total{font:600 64px/1 Georgia,serif;color:var(--gold);margin:14px 0}.roll-parts{color:var(--muted);word-break:break-word}.small-note{font-size:11px;color:var(--muted);margin-top:8px}
.character-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(300px,.7fr);gap:24px;padding-top:26px}.character-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.character-tile{padding:18px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(155deg,var(--panel2),var(--panel))}.character-tile h3{font:500 22px Georgia,serif;margin:7px 0}.character-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.character-form label{display:grid;gap:5px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.character-form input,.character-form select,.character-form textarea{width:100%;box-sizing:border-box;background:#101512;border:1px solid var(--line);color:var(--text);border-radius:9px;padding:9px}.character-form .wide{grid-column:1/-1}.character-form textarea{min-height:78px;resize:vertical}.inventory-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.inventory-item{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:14px}.inventory-item h4{font:500 18px Georgia,serif;margin:0 0 5px}.inventory-item .meta{margin-bottom:10px}.inventory-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.inventory-actions form{display:inline}.quick-rolls{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.quick-roll{border:1px solid var(--line);border-radius:11px;background:#121814;padding:10px;text-align:center}.quick-roll b{display:block;color:var(--muted);font-size:10px}.quick-roll span{display:block;font:500 18px Georgia,serif;margin:4px 0}.quick-roll button{font-size:10px;padding:6px 8px}.hp-bar{height:10px;background:#171d19;border:1px solid var(--line);border-radius:999px;overflow:hidden;margin-top:8px}.hp-fill{height:100%;background:linear-gradient(90deg,#76514b,#9b6860)}.form-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.form-row input,.form-row select{background:#101512;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px}.owner-pill{color:#9ad0aa}.character-header-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.assign-form{display:flex;gap:8px;align-items:center;margin-top:12px}.assign-form select{flex:1;min-width:160px;background:#101512;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px}
.encounter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.encounter-card{border:1px solid var(--line);background:linear-gradient(155deg,var(--panel2),var(--panel));border-radius:16px;padding:18px}.encounter-card h3{font:500 22px Georgia,serif;margin:7px 0 10px}.encounter-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.65fr);gap:22px;padding-top:24px}.initiative-list{display:grid;gap:8px}.combatant-row{display:grid;grid-template-columns:48px minmax(0,1fr) 170px;gap:10px;align-items:center;border:1px solid var(--line);border-radius:13px;background:var(--panel);padding:10px 12px}.combatant-row.current{border-color:#8c7548;box-shadow:0 0 0 2px rgba(212,177,106,.08);background:linear-gradient(90deg,#242319,#151b18)}.initiative-badge{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;border:1px solid #4d4634;color:var(--gold);font:600 18px Georgia,serif;background:#111512}.combatant-name{font-weight:700}.combatant-meta{color:var(--muted);font-size:11px;margin-top:3px}.combatant-hp{display:flex;align-items:center;gap:7px;justify-content:flex-end;flex-wrap:wrap}.combatant-hp strong{min-width:54px;text-align:right}.tiny-form{display:inline-flex;gap:5px;align-items:center}.tiny-form input,.tiny-form select{background:#101512;border:1px solid var(--line);color:var(--text);border-radius:7px;padding:6px 7px;max-width:70px}.tiny-form button{padding:6px 8px;font-size:10px}.turn-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}.round-badge{border:1px solid #5c5038;color:var(--gold);border-radius:999px;padding:8px 12px;font-size:12px}.encounter-setup{display:grid;gap:16px}.encounter-setup select,.encounter-setup input{width:100%;background:#101512;border:1px solid var(--line);color:var(--text);border-radius:9px;padding:9px}.current-panel{border:1px solid #5c5038;border-radius:16px;background:linear-gradient(155deg,#201f17,var(--panel));padding:17px;margin-bottom:18px}.current-panel h3{font:500 24px Georgia,serif;margin:5px 0 10px}.action-stack{display:grid;gap:9px}.enc-action{border-top:1px solid var(--line);padding-top:9px}.enc-action:first-child{border-top:0;padding-top:0}.enc-action b{display:block;color:#e9dec5;margin-bottom:4px}.enc-action p{font-size:11px;color:#aebbb3;margin:0;white-space:pre-wrap}.encounter-form{display:grid;gap:9px}.encounter-form input,.encounter-form select{width:100%;background:#101512;border:1px solid var(--line);color:var(--text);border-radius:9px;padding:9px}.status-chip{font-size:10px;text-transform:uppercase;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:var(--muted)}.status-chip.active{color:#9ad0aa;border-color:#355544}.hp-zero{color:#d87979}.encounter-danger{margin-top:18px;border-top:1px solid #51302d;padding-top:14px}
@media(max-width:980px){.encounter-layout{grid-template-columns:1fr}.encounter-grid{grid-template-columns:1fr}.combatant-row{grid-template-columns:44px minmax(0,1fr)}.combatant-hp{grid-column:1/-1;justify-content:flex-start}}
@media(max-width:980px){.character-layout{grid-template-columns:1fr}.character-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inventory-grid{grid-template-columns:1fr}.quick-rolls{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.character-grid{grid-template-columns:1fr}.character-form{grid-template-columns:1fr}.character-form .wide{grid-column:auto}.quick-rolls{grid-template-columns:repeat(2,1fr)}}
@media(max-width:980px){.card-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.card-detail-grid{grid-template-columns:1fr}.mainnav{margin-left:0}}@media(max-width:640px){.card-library-grid{grid-template-columns:1fr}.mainnav{width:100%;order:3}.topbar{flex-wrap:wrap}}


.builder-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 22px}.builder-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.builder-card{display:block;border:1px solid var(--line);border-radius:15px;background:linear-gradient(155deg,var(--panel2),var(--panel));padding:17px}.builder-card h3{font:500 20px Georgia,serif;margin:8px 0}.builder-kinds{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px}.builder-kind{border:1px solid var(--line);border-radius:12px;padding:13px;background:var(--panel)}.builder-kind b{display:block;font:500 22px Georgia,serif;color:var(--gold)}.builder-kind span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.builder-detail-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:24px;padding-top:24px}.builder-json{background:#0b0f0d;border:1px solid var(--line);padding:14px;border-radius:12px;white-space:pre-wrap;word-break:break-word;max-height:650px;overflow:auto;font-size:11px;color:#aab8af}
@media(max-width:980px){.builder-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.builder-kinds{grid-template-columns:repeat(2,1fr)}.builder-detail-grid{grid-template-columns:1fr}}
@media(max-width:640px){.builder-grid{grid-template-columns:1fr}.builder-kinds{grid-template-columns:1fr}}


.builder-shell{padding-top:24px}
.builder-stepper{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px}
.builder-step-pill{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--muted);font-size:11px;text-align:center}
.builder-step-pill.active{border-color:#8c784e;color:var(--gold);background:#1b1a14}
.builder-panel{display:none}.builder-panel.active{display:block}
.builder-panel-card{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:20px}
.builder-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.builder-choice{display:block;border:1px solid var(--line);border-radius:13px;padding:14px;background:#101612}
.builder-choice input{margin-right:7px}
.builder-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.builder-form-grid label{display:grid;gap:6px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.builder-form-grid input,.builder-form-grid select{width:100%;box-sizing:border-box;background:#0f1511;border:1px solid var(--line);color:var(--text);border-radius:9px;padding:10px}
.builder-form-grid .wide{grid-column:1/-1}
.builder-ability-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.builder-ability{border:1px solid var(--line);border-radius:12px;background:#101612;padding:12px;text-align:center}
.builder-ability b{display:block;color:var(--muted);font-size:10px;letter-spacing:.08em}
.builder-ability input{width:70px;text-align:center;background:#0c110e;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px;margin:8px 0}
.builder-ability span{display:block;color:var(--gold);font-size:12px}
.builder-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
.builder-score-status{padding:9px 12px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:12px}
.builder-score-status.bad{border-color:#7d3d37;color:#e4a49c}
.builder-score-status.good{border-color:#355544;color:#9ad0aa}
.builder-nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}
.builder-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.builder-summary-box{border:1px solid var(--line);border-radius:13px;background:#101612;padding:14px}
.builder-summary-box h4{font:500 16px Georgia,serif;margin:0 0 8px}
.builder-skill-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.builder-skill{border:1px solid var(--line);border-radius:9px;padding:9px;background:#101612;font-size:12px}
.builder-note{padding:12px 14px;border-left:2px solid #786a4d;background:#121713;border-radius:4px 10px 10px 4px;color:#aeb9b2;font-size:12px}
.builder-review{display:grid;gap:10px}
.builder-review-row{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid var(--line);padding:8px 0;font-size:12px}
.builder-review-row span:first-child{color:var(--muted)}
.builder-hidden{display:none!important}
@media(max-width:980px){.builder-choice-grid{grid-template-columns:repeat(2,1fr)}.builder-ability-grid{grid-template-columns:repeat(3,1fr)}.builder-skill-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.builder-stepper{grid-template-columns:1fr}.builder-choice-grid,.builder-form-grid,.builder-summary-grid,.builder-skill-grid{grid-template-columns:1fr}.builder-form-grid .wide{grid-column:auto}.builder-ability-grid{grid-template-columns:repeat(2,1fr)}}


.entity-ref{display:inline-flex;align-items:center;gap:4px;color:#e4c478;border:1px solid #5b5138;border-radius:999px;padding:2px 7px;text-decoration:none;background:#161711}.entity-ref:hover{border-color:#9b824e;background:#211f16;color:#f0d58e}
.builder-human-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.builder-human-box{border:1px solid var(--line);border-radius:12px;background:#101612;padding:13px}.builder-human-box h4{font:600 11px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 9px}.builder-human-box p{margin:0;color:#c5cec8;font-size:12px;line-height:1.55}.builder-human-box.wide{grid-column:1/-1}.builder-dev-details{margin-top:12px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#0d120f}.builder-dev-details summary{cursor:pointer;color:var(--muted);font-size:11px}.builder-dev-details pre{white-space:pre-wrap;word-break:break-word;font-size:10px;color:#8d9b92;max-height:380px;overflow:auto}
.builder-search-wrap{position:relative;flex:1}.builder-search-wrap input{width:100%;box-sizing:border-box}.search-suggestions{position:absolute;z-index:50;left:0;right:0;top:calc(100% + 5px);display:none;border:1px solid #37453c;border-radius:11px;background:#101612;box-shadow:0 14px 35px rgba(0,0,0,.45);overflow:hidden}.search-suggestions.open{display:block}.search-suggestion{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #263129;text-decoration:none}.search-suggestion:last-child{border-bottom:0}.search-suggestion:hover,.search-suggestion.selected{background:#1a211c}.search-suggestion b{font:500 14px Georgia,serif;color:#eee5d4}.search-suggestion span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.builder-linked-text{white-space:pre-wrap;line-height:1.6}
@media(max-width:640px){.builder-human-grid{grid-template-columns:1fr}.builder-human-box.wide{grid-column:auto}}


.search-suggestion-main{display:grid;gap:3px;min-width:0}
.search-suggestion small{display:block;color:#89978e;font-size:10px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:720px}
.search-suggestion .match-source{align-self:center;white-space:nowrap}


.catalog-search-wrap{position:relative;flex:1}.catalog-search-wrap input{width:100%;box-sizing:border-box}
.search-suggestion .suggestion-meta{align-self:center;white-space:nowrap}
.search-fallback-note{font-size:10px;color:#9aa79f;text-transform:uppercase;letter-spacing:.08em}


.runtime-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.runtime-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.runtime-card{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:14px}
.runtime-card h4{font:500 18px Georgia,serif;margin:0 0 5px}
.runtime-card .description{font-size:11px;line-height:1.45}
.spell-slot-grid{display:flex;gap:8px;flex-wrap:wrap}.spell-slot{border:1px solid var(--line);border-radius:11px;background:#101612;padding:10px 12px;min-width:105px}.spell-slot b{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.spell-slot strong{display:block;font:500 20px Georgia,serif;margin:4px 0}.slot-pips{display:flex;gap:4px;flex-wrap:wrap}.slot-pip{width:10px;height:10px;border-radius:50%;border:1px solid #6c5b38;background:#191a14}.slot-pip.full{background:#c39b52}
.condition-list{display:flex;gap:7px;flex-wrap:wrap}.condition-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #674c59;color:#d8aabe;background:#1d151a;border-radius:999px;padding:5px 8px;font-size:11px}.condition-pill form{display:inline}.condition-pill button{padding:1px 5px;font-size:9px;background:transparent;border:0;color:#d8aabe}
.resource-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-top:1px solid var(--line);padding:10px 0}.resource-row:first-child{border-top:0}.resource-value{font:500 18px Georgia,serif;color:#e7dec9}.resource-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.resource-actions form{display:inline-flex;gap:4px;align-items:center}.resource-actions button{padding:5px 7px;font-size:10px}
.spellbook-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.spellbook-add{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.spellbook-add select,.spellbook-add input,.runtime-card select,.runtime-card input{background:#101512;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px}.spell-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.spell-actions form{display:inline-flex;gap:5px;align-items:center}.spell-actions select{max-width:115px;padding:6px}.spell-meta{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.spell-stat{font-size:10px;border:1px solid var(--line);border-radius:999px;padding:3px 6px;color:var(--muted)}.prepared-on{color:#9ad0aa;border-color:#355544}.runtime-danger{color:#d58c84}.rest-box{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
@media(max-width:800px){.runtime-grid{grid-template-columns:1fr}}


html[data-theme="base"]{--bg:#0d1110;--panel:#151b18;--panel2:#1a221e;--line:#2a3730;--text:#edf3ef;--muted:#91a198;--gold:#d4b16a;--green:#74b98b;--danger:#d87979;--surface:#101512;--paper:#151b18;--wood:none}
html[data-theme="tavern"]{--bg:#160f0a;--panel:#241a12;--panel2:#302116;--line:#57442f;--text:#f3e8d3;--muted:#b9a58b;--gold:#d7a957;--green:#8cad72;--danger:#cf7770;--surface:#1b130d;--paper:#2a1e14;--wood:repeating-linear-gradient(90deg,rgba(255,255,255,.018) 0 2px,transparent 2px 72px),linear-gradient(180deg,#20150d,#120c08)}
html[data-theme="tavern"] body{background:radial-gradient(circle at 50% 0,rgba(190,117,48,.10),transparent 35%),var(--wood),var(--bg)}
html[data-theme="tavern"] .panelish,html[data-theme="tavern"] .sheet-panel,html[data-theme="tavern"] .card,html[data-theme="tavern"] .runtime-card{box-shadow:inset 0 1px rgba(255,231,186,.04),0 12px 30px rgba(0,0,0,.24)}
.theme-picker,.language-picker{display:flex;align-items:center;gap:6px}.theme-picker select,.language-picker select{background:var(--surface);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:7px 9px;font-size:11px}.language-picker select{min-width:58px;font-weight:700;letter-spacing:.06em}
.nav-cluster{display:flex;gap:5px;align-items:center}.nav-cluster-label{font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:#66756d;margin-right:1px}
.media-frame{position:relative;overflow:hidden;border:1px solid var(--line);background:linear-gradient(145deg,var(--panel2),var(--panel));border-radius:16px}
.media-frame img{width:100%;height:100%;object-fit:cover;display:block}.media-fallback{height:100%;min-height:160px;display:grid;place-items:center;background:radial-gradient(circle at 50% 25%,rgba(212,177,106,.13),transparent 30%),linear-gradient(145deg,var(--panel2),var(--surface));color:var(--gold);font:700 38px Georgia,serif;letter-spacing:.08em}
.media-tools{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.media-tools label{cursor:pointer}.media-tools input[type=file]{display:none}
.content-card-visual{height:112px;margin:-19px -19px 14px;border-bottom:1px solid var(--line);overflow:hidden;background:linear-gradient(145deg,var(--panel2),var(--surface))}.content-card-visual img{width:100%;height:100%;object-fit:cover}.content-card-visual .media-fallback{min-height:112px;height:112px;border-radius:0;font-size:24px}
.game-card-art{height:150px;border-bottom:1px solid var(--line);overflow:hidden;background:linear-gradient(145deg,#23291f,#101512)}.game-card-art img{width:100%;height:100%;object-fit:cover}.game-card-art .media-fallback{min-height:150px;height:150px;border-radius:0;font-size:30px}
.entity-hero-art{height:260px;margin-bottom:22px}
.sheet-shell{margin-top:24px}.sheet-header{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(300px,1.2fr) minmax(260px,.8fr);gap:16px;align-items:stretch}.sheet-panel{border:1px solid var(--line);border-radius:16px;background:var(--paper);padding:16px}.sheet-identity h2{font:500 36px/1 Georgia,serif;margin:6px 0 10px}.sheet-portrait{min-height:300px}.sheet-portrait img{width:100%;height:300px;object-fit:cover}.sheet-core{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.sheet-core .core-stat{border:1px solid var(--line);border-radius:11px;padding:11px;background:var(--surface)}.core-stat b{display:block;font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}.core-stat strong{font:500 22px Georgia,serif}
.sheet-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:18px 0}.sheet-tab{border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:9px 13px;border-radius:10px;cursor:pointer}.sheet-tab.active{background:var(--gold);border-color:var(--gold);color:#17130d}.sheet-pane{display:none}.sheet-pane.active{display:block}
.ability-sheet-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}.ability-sheet{border:1px solid var(--line);border-radius:14px;padding:12px;text-align:center;background:var(--panel)}.ability-sheet b{font-size:10px;color:var(--muted)}.ability-sheet strong{display:block;font:600 25px Georgia,serif}.ability-sheet span{display:block;color:var(--gold)}
.skill-columns{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.skill-list{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:12px}.skill-row{display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px solid rgba(128,128,128,.12);font-size:12px}.skill-row:last-child{border-bottom:0}.skill-row.prof{color:#ead6a7}.skill-row.prof:before{content:"◆";font-size:8px;margin-right:5px;color:var(--gold)}
.feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.feature-tile{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:14px}.feature-tile h4{margin:0 0 7px;font:500 17px Georgia,serif}.feature-source{font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
.sheet-view-switch{display:flex;gap:6px;flex-wrap:wrap}.sheet-view-switch form{display:inline}.sheet-view-switch button.active{background:var(--gold);color:#17130d}
.sheet-mode-compact .sheet-header{grid-template-columns:1fr 180px 1fr}.sheet-mode-compact .sheet-portrait{min-height:180px}.sheet-mode-compact .sheet-portrait img{height:180px}.sheet-mode-compact .ability-sheet-grid{grid-template-columns:repeat(6,1fr)}
.sheet-mode-illustrated .sheet-header{grid-template-columns:minmax(220px,.65fr) minmax(420px,1.7fr) minmax(260px,.65fr)}.sheet-mode-illustrated .sheet-portrait{min-height:430px}.sheet-mode-illustrated .sheet-portrait img{height:430px}.sheet-mode-illustrated .media-fallback{min-height:430px}
@media(max-width:1000px){.sheet-header{grid-template-columns:1fr 1fr}.sheet-portrait{grid-row:1/3}.ability-sheet-grid{grid-template-columns:repeat(3,1fr)}.feature-grid{grid-template-columns:1fr}.nav-cluster-label{display:none}}
@media(max-width:680px){.sheet-header,.sheet-mode-compact .sheet-header,.sheet-mode-illustrated .sheet-header{grid-template-columns:1fr}.sheet-portrait{grid-row:auto}.ability-sheet-grid{grid-template-columns:repeat(2,1fr)}.skill-columns{grid-template-columns:1fr}}


/* =========================================================
   v0.11 IMMERSIVE TAVERN SKIN
   This skin is deliberately more than a palette swap:
   the application is presented as physical game material
   lying on a wooden tavern table.
   ========================================================= */

html[data-theme="tavern"]{
  --bg:#140a04;
  --panel:#d8b878;
  --panel2:#e2c78e;
  --line:#5b3518;
  --text:#24170c;
  --muted:#6d4b2b;
  --gold:#d7982f;
  --green:#446a2d;
  --danger:#7e241c;
  --surface:#23150b;
  --paper:#ddbf82;
  --wood:
    radial-gradient(ellipse at 19% 12%,rgba(255,151,48,.10),transparent 26%),
    repeating-linear-gradient(0deg,rgba(24,8,2,.25) 0 2px,rgba(125,57,17,.10) 2px 4px,transparent 4px 32px),
    repeating-linear-gradient(90deg,#391a0a 0 3px,#4b220d 3px 68px,#2b1308 68px 73px);
  --tavern-ink:#2a170a;
  --tavern-paper:#d9b875;
  --tavern-paper-light:#e7ca8c;
  --tavern-paper-dark:#b98b4b;
  --tavern-brass:#b47722;
  --tavern-brass-light:#e4b750;
  --tavern-leather:#2a160b;
  --tavern-shadow:0 12px 20px rgba(0,0,0,.42),0 2px 0 rgba(255,220,153,.12) inset;
}

html[data-theme="tavern"] body{
  min-height:100vh;
  color:var(--tavern-ink);
  font-family:Georgia,"Times New Roman",serif;
  background:
    radial-gradient(circle at 8% 4%,rgba(255,144,42,.20),transparent 12%),
    radial-gradient(circle at 92% 9%,rgba(255,178,61,.10),transparent 13%),
    linear-gradient(rgba(37,13,4,.06),rgba(16,5,1,.18)),
    var(--wood);
  background-attachment:fixed;
}

html[data-theme="tavern"] body:before{
  content:"";
  position:fixed;
  inset:0;
  z-index:-2;
  pointer-events:none;
  background:
    repeating-linear-gradient(90deg,transparent 0 8.4%,rgba(0,0,0,.22) 8.45% 8.7%,transparent 8.8% 16.7%),
    repeating-linear-gradient(0deg,transparent 0 85px,rgba(0,0,0,.12) 86px 88px,transparent 90px 178px);
  mix-blend-mode:multiply;
  opacity:.8;
}

html[data-theme="tavern"] .shell{
  max-width:1180px;
  min-height:100vh;
  padding:0 24px 58px;
  position:relative;
  z-index:2;
}

html[data-theme="tavern"] .topbar{
  position:sticky;
  top:8px;
  z-index:100;
  margin:10px -8px 22px;
  padding:8px 12px;
  gap:10px;
  border:2px solid #6b3d18;
  border-radius:8px;
  background:
    linear-gradient(180deg,rgba(255,214,129,.10),transparent 16%),
    repeating-linear-gradient(0deg,#30180c 0 2px,#211006 2px 8px,#35190a 8px 10px);
  box-shadow:
    0 8px 22px rgba(0,0,0,.58),
    0 0 0 2px #1a0d06,
    inset 0 0 0 1px #9b6028,
    inset 0 2px 0 rgba(255,206,108,.18);
}

html[data-theme="tavern"] .topbar:before,
html[data-theme="tavern"] .topbar:after{
  content:"";
  position:absolute;
  width:10px;height:10px;border-radius:50%;
  top:8px;
  background:radial-gradient(circle at 35% 30%,#e1b35a 0 14%,#7c4b19 34%,#261208 75%);
  box-shadow:0 1px 2px #000;
}
html[data-theme="tavern"] .topbar:before{left:8px}
html[data-theme="tavern"] .topbar:after{right:8px}

html[data-theme="tavern"] .brand{padding-left:8px}
html[data-theme="tavern"] .brand h1{color:#f2d58d;text-shadow:0 1px #000;font-size:19px}
html[data-theme="tavern"] .brand small{color:#bda26f;font-family:Georgia,serif;letter-spacing:.07em}
html[data-theme="tavern"] .mark{
  width:44px;height:44px;border-radius:50%;
  color:#f0c761;
  border:2px solid #b17727;
  background:radial-gradient(circle at 38% 28%,#563416,#1c1008 70%);
  box-shadow:0 0 0 3px #241208,0 2px 7px #000,inset 0 0 0 2px rgba(224,174,75,.15);
}

html[data-theme="tavern"] .mainnav{gap:5px;margin-right:6px}
html[data-theme="tavern"] .nav-cluster{gap:4px}
html[data-theme="tavern"] .nav-cluster-label{display:none}
html[data-theme="tavern"] .mainnav a,
html[data-theme="tavern"] .theme-picker select,
html[data-theme="tavern"] .language-picker select,
html[data-theme="tavern"] .status{
  color:#ead6a4;
  font-family:Georgia,serif;
  border:1px solid #8b5724;
  border-radius:5px;
  background:
    linear-gradient(180deg,rgba(255,211,121,.09),transparent 34%),
    linear-gradient(#2b1a0e,#171008);
  box-shadow:inset 0 0 0 1px #140a05,0 2px 4px rgba(0,0,0,.45);
}
html[data-theme="tavern"] .mainnav a{padding:8px 10px}
html[data-theme="tavern"] .mainnav a:hover{color:#fff0bd;border-color:#c18a37;transform:translateY(-1px)}
html[data-theme="tavern"] .mainnav a[href="/characters"]:before{content:"♙ ";color:#d9ad54}
html[data-theme="tavern"] .mainnav a[href="/encounters"]:before{content:"⚔ ";color:#d9ad54}
html[data-theme="tavern"] .mainnav a[href="/library"]:before{content:"▣ ";color:#d9ad54}
html[data-theme="tavern"] .mainnav a[href="/cards"]:before{content:"▱ ";color:#d9ad54}
html[data-theme="tavern"] .mainnav a[href="/character-builder"]:before{content:"⚒ ";color:#d9ad54}
html[data-theme="tavern"] .mainnav a[href="/builder-data"]:before{content:"▦ ";color:#d9ad54}
html[data-theme="tavern"] .status{font-size:10px;padding:7px 9px}
html[data-theme="tavern"] .status b{color:#75ad47}

html[data-theme="tavern"] .tavern-decor{display:block}
.tavern-decor{display:none;position:fixed;pointer-events:none;z-index:1;filter:drop-shadow(0 12px 12px rgba(0,0,0,.55))}
html[data-theme="tavern"] .decor-candle{left:10px;top:34px;width:126px;height:260px}
html[data-theme="tavern"] .decor-book{left:0;bottom:18px;width:205px;height:315px;transform:rotate(-7deg)}
html[data-theme="tavern"] .decor-mug{right:7px;top:23px;width:150px;height:230px;transform:rotate(5deg)}
html[data-theme="tavern"] .decor-sword{right:-22px;top:330px;width:185px;height:445px;transform:rotate(8deg)}
html[data-theme="tavern"] .decor-dice{right:24px;bottom:24px;width:145px;height:132px}
html[data-theme="tavern"] .decor-coins{left:52px;top:300px;width:130px;height:150px}
html[data-theme="tavern"] .tavern-decor svg{width:100%;height:100%;overflow:visible}

html[data-theme="tavern"] .hero,
html[data-theme="tavern"] .sheet-panel,
html[data-theme="tavern"] .card-panel,
html[data-theme="tavern"] .aside-card,
html[data-theme="tavern"] .builder-panel-card,
html[data-theme="tavern"] .builder-card,
html[data-theme="tavern"] .skill-list,
html[data-theme="tavern"] .feature-tile,
html[data-theme="tavern"] .runtime-card,
html[data-theme="tavern"] .description,
html[data-theme="tavern"] .stat{
  color:var(--tavern-ink);
  border:1px solid #70451f;
  background:
    radial-gradient(circle at 8% 14%,rgba(93,52,19,.12) 0 1px,transparent 2px),
    radial-gradient(circle at 88% 24%,rgba(92,50,18,.08) 0 1px,transparent 2px),
    linear-gradient(100deg,rgba(255,244,199,.14),transparent 28%,rgba(112,62,21,.06)),
    #d9b978;
  box-shadow:var(--tavern-shadow),inset 0 0 20px rgba(91,45,12,.11);
}

html[data-theme="tavern"] .hero{
  position:relative;
  margin:22px 16px 22px;
  padding:25px 30px 23px;
  border-radius:3px 7px 4px 8px;
  clip-path:polygon(1% 2%,98.8% 0,99.6% 9%,99.2% 91%,98% 99%,2% 98%,0 89%,.5% 9%);
}
html[data-theme="tavern"] .hero:before,
html[data-theme="tavern"] .hero:after,
html[data-theme="tavern"] .sheet-panel:before,
html[data-theme="tavern"] .card-panel:before{
  content:"";
  position:absolute;
  width:12px;height:12px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#e6b957 0 14%,#80501d 35%,#2a1408 78%);
  box-shadow:0 1px 3px rgba(0,0,0,.55);
  z-index:3;
}
html[data-theme="tavern"] .hero:before{left:8px;top:8px}
html[data-theme="tavern"] .hero:after{right:8px;top:8px}
html[data-theme="tavern"] .hero h2,
html[data-theme="tavern"] .detail-head h2,
html[data-theme="tavern"] .sheet-identity h2{color:#281407;text-shadow:0 1px rgba(255,238,190,.5)}
html[data-theme="tavern"] .hero p,
html[data-theme="tavern"] .summary,
html[data-theme="tavern"] .small-note,
html[data-theme="tavern"] .meta{color:#624226}
html[data-theme="tavern"] .count{color:#8c271d}
html[data-theme="tavern"] .count-label{color:#573318}

html[data-theme="tavern"] .tabs,
html[data-theme="tavern"] .builder-tabs,
html[data-theme="tavern"] .sheet-tabs{
  gap:6px;
}
html[data-theme="tavern"] .tab,
html[data-theme="tavern"] .builder-tabs .tab,
html[data-theme="tavern"] .sheet-tab{
  font-family:Georgia,serif;
  color:#ead5a0;
  border:1px solid #7f4d1e;
  border-radius:5px;
  background:linear-gradient(#2f1c0f,#191008);
  box-shadow:inset 0 0 0 1px #110904,0 2px 4px rgba(0,0,0,.38);
}
html[data-theme="tavern"] .tab.active,
html[data-theme="tavern"] .builder-tabs .tab.active,
html[data-theme="tavern"] .sheet-tab.active{
  color:#2b1607;
  border-color:#a9681d;
  background:linear-gradient(#efc15a,#c58427);
  box-shadow:inset 0 1px #ffe5a1,0 2px 5px rgba(0,0,0,.38);
}

html[data-theme="tavern"] button,
html[data-theme="tavern"] .button,
html[data-theme="tavern"] .primary-action{
  font-family:Georgia,serif;
  color:#f4d98e;
  border:1px solid #7e4d20;
  border-radius:5px;
  background:
    linear-gradient(180deg,rgba(255,213,120,.09),transparent 34%),
    linear-gradient(#3a220f,#211208);
  box-shadow:inset 0 0 0 1px #170a04,0 2px 4px rgba(0,0,0,.42);
}
html[data-theme="tavern"] button:hover,
html[data-theme="tavern"] .button:hover{border-color:#bf7b29;color:#ffe5a3}
html[data-theme="tavern"] .button.secondary{color:#ead3a2;background:linear-gradient(#322013,#1c120b)}
html[data-theme="tavern"] .danger-button{color:#f0b0a1;border-color:#71271e;background:linear-gradient(#4b1b13,#25100b)}

html[data-theme="tavern"] .toolbar{
  position:relative;
  padding:8px;
  border:2px solid #6f4019;
  border-radius:5px;
  background:linear-gradient(#3a210f,#1d1007);
  box-shadow:0 6px 12px rgba(0,0,0,.42),inset 0 0 0 1px #171007;
}
html[data-theme="tavern"] .search input,
html[data-theme="tavern"] .builder-form-grid input,
html[data-theme="tavern"] .builder-form-grid select,
html[data-theme="tavern"] .spellbook-add select,
html[data-theme="tavern"] .spellbook-add input,
html[data-theme="tavern"] .runtime-card select,
html[data-theme="tavern"] .runtime-card input{
  font-family:Georgia,serif;
  color:#ead7ad;
  border:1px solid #64401f;
  border-radius:4px;
  background:linear-gradient(#24170f,#171008);
  box-shadow:inset 0 1px 5px rgba(0,0,0,.65);
}
html[data-theme="tavern"] .search input::placeholder{color:#987f61}
html[data-theme="tavern"] .search input:focus{border-color:#bf7b29;box-shadow:0 0 0 2px rgba(224,159,56,.15),inset 0 1px 5px rgba(0,0,0,.65)}

html[data-theme="tavern"] .grid{gap:11px}
html[data-theme="tavern"] .card{
  position:relative;
  min-height:205px;
  color:#28170a;
  border:1px solid #78481d;
  border-radius:4px;
  background:
    radial-gradient(circle at 88% 18%,rgba(86,49,19,.10) 0 1px,transparent 2px),
    linear-gradient(110deg,rgba(255,242,193,.18),transparent 34%,rgba(91,46,14,.07)),
    #d9b875;
  clip-path:polygon(1% 1%,99% 0,100% 8%,99.4% 93%,97.5% 100%,2% 99%,0 90%,.6% 8%);
  box-shadow:0 7px 12px rgba(0,0,0,.38),inset 0 0 18px rgba(102,52,15,.10);
}
html[data-theme="tavern"] .card:before,
html[data-theme="tavern"] .card:after{
  content:"";
  position:absolute;
  width:10px;height:10px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#e0ad49 0 12%,#7d4918 35%,#251107 77%);
  box-shadow:0 1px 2px #000;
  z-index:3;
}
html[data-theme="tavern"] .card:before{left:6px;top:6px}
html[data-theme="tavern"] .card:after{right:6px;top:6px}
html[data-theme="tavern"] .card:hover{
  transform:translateY(-3px) rotate(-.15deg);
  border-color:#a56624;
  box-shadow:0 13px 19px rgba(0,0,0,.46),inset 0 0 18px rgba(102,52,15,.09);
}
html[data-theme="tavern"] .card h3{color:#271307}
html[data-theme="tavern"] .card .eyebrow{color:#6a4727}
html[data-theme="tavern"] .card .summary{color:#4f321b}
html[data-theme="tavern"] .content-card-visual{
  margin:-19px -19px 12px;
  height:104px;
  border-bottom:1px solid #8a5b2a;
  filter:sepia(.22) saturate(.8) contrast(.98);
}
html[data-theme="tavern"] .content-card-visual .media-fallback{
  color:#583216;
  background:
    radial-gradient(circle at 70% 45%,transparent 0 25%,rgba(85,44,14,.06) 26% 27%,transparent 28%),
    #cfac69;
}
html[data-theme="tavern"] .chip{
  color:#ead59e;
  border-color:#5e3b1c;
  background:#2a1a0e;
  box-shadow:inset 0 0 0 1px rgba(255,210,122,.05);
}
html[data-theme="tavern"] .chip.gold{color:#ffd978;border-color:#956524}
html[data-theme="tavern"] .chip.green{color:#cbe2a0;border-color:#45622d;background:#243014}

html[data-theme="tavern"] .detail-head{
  margin-top:10px;
  padding:19px 22px;
  border:1px solid #70451f;
  border-radius:5px;
  background:#dab978;
  box-shadow:var(--tavern-shadow);
}
html[data-theme="tavern"] .back{color:#e4c78d;text-shadow:0 1px #000}
html[data-theme="tavern"] .entity-hero-art{
  border-radius:5px;
  border:2px solid #70451f;
  box-shadow:0 9px 16px rgba(0,0,0,.45);
  background:#2a170b;
}
html[data-theme="tavern"] .media-frame{border-color:#72451d;border-radius:5px;background:#26150b}
html[data-theme="tavern"] .media-fallback{color:#81501f;background:#caa867}
html[data-theme="tavern"] .aside-card{position:sticky}
html[data-theme="tavern"] .kv dt{color:#714b28}
html[data-theme="tavern"] .kv dd{color:#28170b}
html[data-theme="tavern"] .section h3{color:#38200e}
html[data-theme="tavern"] .block{
  color:#2b170a;
  border-left:3px solid #7b4217;
  background:#d3ae68;
}
html[data-theme="tavern"] .block-title{color:#301a0a}
html[data-theme="tavern"] .block p{color:#51321a}
html[data-theme="tavern"] .raw pre,
html[data-theme="tavern"] .builder-dev-details{color:#d8c39a;background:#1d1109;border-color:#53321a}

html[data-theme="tavern"] .game-card{
  color:#2a170a;
  border:2px solid #75471d;
  border-radius:5px;
  background:
    linear-gradient(105deg,rgba(255,241,192,.18),transparent 36%),
    #d5b36f;
  box-shadow:0 9px 16px rgba(0,0,0,.45);
}
html[data-theme="tavern"] .game-card:before{height:4px;background:#7b3f19!important}
html[data-theme="tavern"] .game-card-head{border-color:#8a5c2b}
html[data-theme="tavern"] .game-card h3,
html[data-theme="tavern"] .card-action-title{color:#2b1608}
html[data-theme="tavern"] .game-card-sub,
html[data-theme="tavern"] .card-copy,
html[data-theme="tavern"] .card-action p,
html[data-theme="tavern"] .card-count{color:#5f3e20}
html[data-theme="tavern"] .mini-stat{background:#caa566;border-color:#8e5a27}
html[data-theme="tavern"] .mini-stat b{color:#6f4725}
html[data-theme="tavern"] .game-card-art{background:#2d180b;border-color:#815020}
html[data-theme="tavern"] .game-card-art img{filter:sepia(.12) saturate(.9)}

html[data-theme="tavern"] .sheet-shell{position:relative}
html[data-theme="tavern"] .sheet-header{gap:10px}
html[data-theme="tavern"] .sheet-panel{
  position:relative;
  border-radius:4px;
  background:
    radial-gradient(circle at 72% 22%,rgba(80,45,17,.07) 0 1px,transparent 2px),
    linear-gradient(110deg,rgba(255,244,203,.18),transparent 32%),
    #d9b875;
  box-shadow:0 7px 13px rgba(0,0,0,.43),inset 0 0 18px rgba(99,52,17,.10);
}
html[data-theme="tavern"] .sheet-panel:before{left:7px;top:7px}
html[data-theme="tavern"] .sheet-portrait{
  border:2px solid #71431a;
  box-shadow:0 8px 15px rgba(0,0,0,.48),inset 0 0 0 2px #b88137;
}
html[data-theme="tavern"] .sheet-portrait img{filter:saturate(.88) contrast(1.04) sepia(.07)}
html[data-theme="tavern"] .sheet-core .core-stat{
  color:#ead5a1;
  border:1px solid #5f391b;
  border-radius:4px;
  background:
    linear-gradient(180deg,rgba(255,213,119,.05),transparent 28%),
    #24150c;
  box-shadow:inset 0 0 0 1px #110904,inset 0 4px 10px rgba(0,0,0,.30);
}
html[data-theme="tavern"] .core-stat b{color:#b79c70}
html[data-theme="tavern"] .core-stat strong{color:#f3dfae}
html[data-theme="tavern"] .hp-bar{background:#100905}
html[data-theme="tavern"] .hp-fill{background:#7e2c21}
html[data-theme="tavern"] .ability-sheet{
  position:relative;
  border:1px solid #6f431d;
  border-radius:4px;
  background:#d7b573;
  box-shadow:0 5px 9px rgba(0,0,0,.34),inset 0 0 14px rgba(94,48,13,.08);
}
html[data-theme="tavern"] .ability-sheet b{color:#65411f}
html[data-theme="tavern"] .ability-sheet strong{color:#2c1709}
html[data-theme="tavern"] .ability-sheet span{color:#7a3d18}
html[data-theme="tavern"] .ability-sheet:after{
  content:"◆";
  position:absolute;
  left:8px;top:8px;
  color:#805122;
  opacity:.65;
  font-size:9px;
}
html[data-theme="tavern"] .skill-list h3{color:#2e1809}
html[data-theme="tavern"] .skill-row{color:#4d3018;border-color:rgba(70,35,10,.16)}
html[data-theme="tavern"] .skill-row.prof{color:#2c1608;font-weight:700}
html[data-theme="tavern"] .skill-row.prof:before{color:#7d3818}
html[data-theme="tavern"] .feature-tile h4{color:#2c1608}
html[data-theme="tavern"] .feature-source{color:#774b26}
html[data-theme="tavern"] .condition-pill{background:#4d1d16;border-color:#7c3126;color:#f2c3a4}
html[data-theme="tavern"] .spell-stat{color:#65411f;border-color:#8c5a2a;background:#cfaa68}
html[data-theme="tavern"] .prepared-on{color:#315222;border-color:#58763b}
html[data-theme="tavern"] .resource-value{color:#462410}
html[data-theme="tavern"] .spell-slot{color:#ead5a1;background:#26170d;border-color:#66401e;border-radius:4px}
html[data-theme="tavern"] .spell-slot b{color:#baa173}
html[data-theme="tavern"] .spell-slot strong{color:#f2dca7}
html[data-theme="tavern"] .slot-pip{border-color:#8f642e;background:#130b06}
html[data-theme="tavern"] .slot-pip.full{background:#dfa43c}

html[data-theme="tavern"] .builder-kind,
html[data-theme="tavern"] .builder-summary-box,
html[data-theme="tavern"] .builder-choice,
html[data-theme="tavern"] .builder-ability,
html[data-theme="tavern"] .builder-skill{
  color:#2b1709;
  border-color:#75491f;
  background:#d3ae69;
}
html[data-theme="tavern"] .builder-kind span,
html[data-theme="tavern"] .builder-summary-box h4,
html[data-theme="tavern"] .builder-ability b{color:#714a28}
html[data-theme="tavern"] .builder-step-pill{
  color:#c5aa77;
  border-color:#61401f;
  background:#2a190e;
  border-radius:4px;
}
html[data-theme="tavern"] .builder-step-pill.active{
  color:#2b1507;
  background:#d89c35;
  border-color:#a26420;
}

html[data-theme="tavern"] .search-suggestions{
  border-color:#75491f;
  background:#25160c;
  box-shadow:0 10px 18px rgba(0,0,0,.55);
}
html[data-theme="tavern"] .search-suggestion{border-color:#513018}
html[data-theme="tavern"] .search-suggestion:hover,
html[data-theme="tavern"] .search-suggestion.selected{background:#3a2210}
html[data-theme="tavern"] .search-suggestion b{color:#f0d9a5}
html[data-theme="tavern"] .search-suggestion span,
html[data-theme="tavern"] .search-suggestion small{color:#b89b6a}

html[data-theme="tavern"] .footer{
  color:#c5aa78;
  border-color:#6a411e;
  text-shadow:0 1px #000;
}

@media(max-width:1430px){
  html[data-theme="tavern"] .decor-book,
  html[data-theme="tavern"] .decor-sword{opacity:.58}
  html[data-theme="tavern"] .decor-candle{left:-28px;opacity:.7}
  html[data-theme="tavern"] .decor-mug{right:-28px;opacity:.7}
}
@media(max-width:1180px){
  html[data-theme="tavern"] .tavern-decor{display:none}
  html[data-theme="tavern"] .shell{max-width:100%;padding-left:18px;padding-right:18px}
}
@media(max-width:760px){
  html[data-theme="tavern"] .topbar{position:relative;top:0}
  html[data-theme="tavern"] .hero{margin-left:0;margin-right:0}
}


/* =========================================================
   v0.12 TAVERN VISUAL POLISH
   Real table reference + parchment surfaces + contrast pass.
   ========================================================= */

/* The uploaded realistic reference is now the actual scene.
   v0.11 vector edge decorations are disabled to avoid duplicates. */
html[data-theme="tavern"] body{
  color:#2b190c;
  background-color:#1d0d04;
  background-image:
    linear-gradient(rgba(30,12,3,.05),rgba(18,7,2,.14)),
    url("/assets/tavern-table.webp");
  background-position:center top;
  background-size:cover;
  background-repeat:no-repeat;
  background-attachment:fixed;
}
html[data-theme="tavern"] body:before{
  background:
    radial-gradient(ellipse at center,transparent 42%,rgba(13,5,2,.22) 100%);
  opacity:1;
  mix-blend-mode:normal;
}
html[data-theme="tavern"] .tavern-decor{display:none!important}

/* Genuine-wood top navigation, sampled from the same tavern scene. */
html[data-theme="tavern"] .topbar{
  border:2px solid #6f3b15;
  border-radius:8px;
  background-image:
    linear-gradient(180deg,rgba(255,190,73,.11),rgba(19,7,2,.22)),
    linear-gradient(90deg,rgba(8,3,1,.10),transparent 16%,transparent 84%,rgba(8,3,1,.12)),
    url("/assets/tavern-table.webp");
  background-size:auto,auto,1500px auto;
  background-position:center,center,center 43%;
  background-repeat:no-repeat;
  box-shadow:
    0 11px 24px rgba(0,0,0,.62),
    0 0 0 2px #160904,
    inset 0 0 0 1px #b07429,
    inset 0 2px 2px rgba(255,221,142,.16),
    inset 0 -8px 15px rgba(13,5,2,.30);
}
html[data-theme="tavern"] .topbar:before,
html[data-theme="tavern"] .topbar:after{
  width:11px;height:11px;
  background:radial-gradient(circle at 35% 30%,#efd076 0 11%,#96601f 32%,#321505 70%);
}

/* Parchment material. Reused everywhere a physical paper panel makes sense. */
html[data-theme="tavern"] .hero,
html[data-theme="tavern"] .card,
html[data-theme="tavern"] .encounter-card,
html[data-theme="tavern"] .character-tile,
html[data-theme="tavern"] .sheet-panel,
html[data-theme="tavern"] .card-panel,
html[data-theme="tavern"] .aside-card,
html[data-theme="tavern"] .builder-panel-card,
html[data-theme="tavern"] .builder-card,
html[data-theme="tavern"] .builder-kind,
html[data-theme="tavern"] .builder-summary-box,
html[data-theme="tavern"] .builder-choice,
html[data-theme="tavern"] .builder-ability,
html[data-theme="tavern"] .builder-skill,
html[data-theme="tavern"] .builder-human-box,
html[data-theme="tavern"] .description,
html[data-theme="tavern"] .stat,
html[data-theme="tavern"] .ability,
html[data-theme="tavern"] .skill-list,
html[data-theme="tavern"] .feature-tile,
html[data-theme="tavern"] .inventory-item{
  color:#28170a;
  background-color:#d8b876;
  background-image:
    linear-gradient(110deg,rgba(255,247,208,.15),transparent 32%,rgba(79,37,10,.045)),
    url("/assets/parchment.webp");
  background-size:auto,420px 420px;
  background-repeat:no-repeat,repeat;
  border-color:#795022;
  box-shadow:
    0 8px 15px rgba(0,0,0,.34),
    inset 0 0 22px rgba(91,48,13,.09);
}

/* Nested paper boxes should not become dark rectangles. */
html[data-theme="tavern"] .builder-human-box,
html[data-theme="tavern"] .builder-summary-box,
html[data-theme="tavern"] .builder-choice,
html[data-theme="tavern"] .builder-ability,
html[data-theme="tavern"] .builder-skill{
  border-radius:10px;
}

/* Explicit light/dark-surface text rules. These override Base leftovers. */
html[data-theme="tavern"] .hero h2,
html[data-theme="tavern"] .card h3,
html[data-theme="tavern"] .encounter-card h3,
html[data-theme="tavern"] .character-tile h3,
html[data-theme="tavern"] .sheet-panel h3,
html[data-theme="tavern"] .card-panel h3,
html[data-theme="tavern"] .builder-card h3,
html[data-theme="tavern"] .builder-summary-box h4,
html[data-theme="tavern"] .builder-human-box h4,
html[data-theme="tavern"] .skill-list h3,
html[data-theme="tavern"] .feature-tile h4,
html[data-theme="tavern"] .description,
html[data-theme="tavern"] .stat span,
html[data-theme="tavern"] .ability span,
html[data-theme="tavern"] .ability-sheet strong,
html[data-theme="tavern"] .inventory-item h4{
  color:#291609!important;
  text-shadow:none;
}
html[data-theme="tavern"] .hero p,
html[data-theme="tavern"] .card .summary,
html[data-theme="tavern"] .encounter-card .summary,
html[data-theme="tavern"] .character-tile .summary,
html[data-theme="tavern"] .description .summary,
html[data-theme="tavern"] .builder-human-box p,
html[data-theme="tavern"] .builder-card .summary,
html[data-theme="tavern"] .small-note,
html[data-theme="tavern"] .meta{
  color:#654321!important;
}
html[data-theme="tavern"] .builder-human-box h4,
html[data-theme="tavern"] .builder-summary-box h4,
html[data-theme="tavern"] .stat b,
html[data-theme="tavern"] .ability b,
html[data-theme="tavern"] .ability-sheet b,
html[data-theme="tavern"] .feature-source{
  color:#734719!important;
}

/* Headings that sit directly on the wooden table must be light. */
html[data-theme="tavern"] .section > h3,
html[data-theme="tavern"] .detail-layout main > .section > h3,
html[data-theme="tavern"] .builder-detail-grid article > .section > h3{
  color:#f3d99e!important;
  text-shadow:0 2px 2px rgba(0,0,0,.78);
}
html[data-theme="tavern"] .sheet-panel .section > h3,
html[data-theme="tavern"] .card-panel .section > h3,
html[data-theme="tavern"] .description h3{
  color:#321c0c!important;
  text-shadow:none;
}

/* Entity ability scores: previously Base dark tiles + dark Tavern text. */
html[data-theme="tavern"] .abilities{gap:9px}
html[data-theme="tavern"] .ability{
  border-radius:9px;
  padding:12px 7px;
}
html[data-theme="tavern"] .ability b{
  font-weight:700;
  letter-spacing:.08em;
}
html[data-theme="tavern"] .ability span{
  font-size:19px;
  font-weight:600;
}

/* ACTIVE and other statuses get opaque, readable material treatment. */
html[data-theme="tavern"] .status-chip{
  color:#4f3116;
  border:1px solid #815624;
  background:#d3ae67;
  font-weight:800;
  text-shadow:none;
  box-shadow:inset 0 0 10px rgba(92,45,11,.08);
}
html[data-theme="tavern"] .status-chip.active{
  color:#f3e4b8!important;
  border-color:#557531!important;
  background:linear-gradient(#527331,#30481f)!important;
  box-shadow:
    inset 0 1px rgba(255,255,255,.12),
    0 2px 4px rgba(0,0,0,.25);
}
html[data-theme="tavern"] .round-badge{
  color:#f5db91;
  border-color:#865a24;
  background:linear-gradient(#3a210f,#211208);
  font-weight:700;
}

/* Encounter cards become paper mission cards instead of flat beige blocks. */
html[data-theme="tavern"] .encounter-card{
  position:relative;
  border-radius:5px;
  clip-path:polygon(.7% 1%,99% 0,100% 8%,99.3% 93%,97.8% 100%,1.8% 99%,0 91%,.5% 8%);
}
html[data-theme="tavern"] .encounter-card .eyebrow,
html[data-theme="tavern"] .encounter-card .combatant-meta{
  color:#66421f;
}

/* Generic dark runtime panels keep their leather look, but force light text. */
html[data-theme="tavern"] .runtime-card,
html[data-theme="tavern"] .current-panel,
html[data-theme="tavern"] .combatant-row,
html[data-theme="tavern"] .spell-slot,
html[data-theme="tavern"] .builder-dev-details,
html[data-theme="tavern"] .raw pre{
  color:#ead6a5;
  background:
    linear-gradient(180deg,rgba(255,205,105,.045),transparent 30%),
    #211309;
  border-color:#68401d;
}
html[data-theme="tavern"] .runtime-card h4,
html[data-theme="tavern"] .current-panel h3,
html[data-theme="tavern"] .combatant-name,
html[data-theme="tavern"] .resource-value,
html[data-theme="tavern"] .spell-slot strong{
  color:#f2dfad!important;
}
html[data-theme="tavern"] .runtime-card .description{
  color:#5a381b!important;
}
html[data-theme="tavern"] .combatant-meta,
html[data-theme="tavern"] .runtime-card .small-note,
html[data-theme="tavern"] .spell-slot b{
  color:#bca477!important;
}

/* Proficiencies/Choices now use parchment rather than an accidental Base panel. */
html[data-theme="tavern"] .builder-human-grid{
  gap:12px;
}
html[data-theme="tavern"] .builder-human-box{
  border-color:#8a5c2b;
}
html[data-theme="tavern"] .builder-human-box .builder-human-box{
  background-size:auto,360px 360px;
  box-shadow:inset 0 0 16px rgba(82,40,10,.07);
}
html[data-theme="tavern"] .builder-dev-details{
  margin-top:14px;
}
html[data-theme="tavern"] .builder-dev-details summary{
  color:#d1b37d!important;
}

/* Dark chips on parchment, with reliable high contrast. */
html[data-theme="tavern"] .chip,
html[data-theme="tavern"] .entity-ref{
  color:#f0d69b!important;
  background:linear-gradient(#3a210f,#211208)!important;
  border-color:#87561f!important;
  text-shadow:0 1px #140803;
}
html[data-theme="tavern"] .chip.gold,
html[data-theme="tavern"] .entity-ref{
  color:#f7dc83!important;
  border-color:#a36b22!important;
}

/* Form controls are deliberately dark leather/wood. */
html[data-theme="tavern"] input,
html[data-theme="tavern"] select,
html[data-theme="tavern"] textarea{
  color:#f1ddb0;
}
html[data-theme="tavern"] input::placeholder,
html[data-theme="tavern"] textarea::placeholder{
  color:#9f8766;
}

/* Character sheet: paper data cells, dark leather combat core. */
html[data-theme="tavern"] .sheet-core .core-stat{
  color:#f2ddaa!important;
  background:
    linear-gradient(180deg,rgba(255,215,129,.05),transparent 34%),
    #201108!important;
}
html[data-theme="tavern"] .core-stat b{color:#bca374!important}
html[data-theme="tavern"] .core-stat strong{color:#f5e0ac!important}
html[data-theme="tavern"] .sheet-identity .eyebrow{color:#6d4520}
html[data-theme="tavern"] .sheet-identity h2{color:#261308!important}

/* Search results remain dark overlay, all text readable. */
html[data-theme="tavern"] .search-suggestion b{color:#f4dcaa!important}
html[data-theme="tavern"] .search-suggestion span,
html[data-theme="tavern"] .search-suggestion small{color:#bfa575!important}

/* Slight glass/dark veil only beneath the central app area on very wide displays,
   preserving the realism of the table at the sides. */
html[data-theme="tavern"] .shell:before{
  content:"";
  position:fixed;
  z-index:-1;
  top:0;
  bottom:0;
  left:50%;
  width:min(1240px,calc(100vw - 110px));
  transform:translateX(-50%);
  pointer-events:none;
  background:linear-gradient(90deg,rgba(15,5,1,.09),transparent 7%,transparent 93%,rgba(15,5,1,.09));
}

/* Mobile uses the same real table but avoids fixed-background rendering issues. */
@media(max-width:760px){
  html[data-theme="tavern"] body{background-attachment:scroll}
  html[data-theme="tavern"] .topbar{background-size:auto,auto,1100px auto}
}


.equipment-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}.equipment-controls form{display:inline}.equipment-state{font-size:9px;text-transform:uppercase;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:#a8d6b2}.equipment-state.attuned{color:#d7b6ef}.equipment-on{border-color:#466b4f!important;color:#b7e5bf!important}.equipment-attuned{border-color:#664477!important;color:#dfc2ef!important}.inventory-equipped{outline:1px solid rgba(121,182,135,.28);box-shadow:inset 3px 0 rgba(121,182,135,.35)}.auto-resource{display:inline-flex;margin-left:7px;padding:2px 6px;border-radius:999px;font-size:8px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);color:var(--gold)}.resource-title{display:flex;align-items:center;gap:4px}.ac-control{display:grid;grid-template-columns:1fr 70px auto;gap:5px;margin-top:7px}.ac-control select,.ac-control input{min-width:0;padding:5px 6px;font-size:9px}.ac-control button{padding:5px 7px;font-size:9px}
html[data-theme="tavern"] .equipment-state{color:#f2dba6;border-color:#8a5927;background:#332010}html[data-theme="tavern"] .equipment-state.attuned{color:#e8c6ef;border-color:#775178;background:#352137}html[data-theme="tavern"] .inventory-equipped{outline-color:#647f3f;box-shadow:inset 4px 0 #557337,0 8px 15px rgba(0,0,0,.34)}html[data-theme="tavern"] .auto-resource{color:#5b3717;border-color:#8a5926;background:#d0aa66;text-shadow:none}html[data-theme="tavern"] .equipment-on{color:#e7e8b0!important;border-color:#6d8139!important;background:#334019!important}html[data-theme="tavern"] .equipment-attuned{color:#efcbed!important;border-color:#754a76!important;background:#3b203c!important}
@media(max-width:680px){.ac-control{grid-template-columns:1fr 64px}.ac-control button{grid-column:1/-1}}


/* v0.13.2 inventory readability hotfix */
html[data-theme="tavern"] .sheet-pane > .section > .spellbook-head h3,
html[data-theme="tavern"] .sheet-pane > .section > h3{
  color:#f3d99e!important;
  text-shadow:0 2px 2px rgba(0,0,0,.78)!important;
}
html[data-theme="tavern"] .sheet-pane > .section > .spellbook-head .chip{
  text-shadow:0 1px #140803!important;
}


.verification{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 18px;padding:10px 12px;border:1px solid #3b6749;border-radius:10px;background:rgba(80,132,93,.10);color:#9fd0ab;font-size:11px}.verification span{color:var(--muted);font-size:10px}.verification.warning{border-color:#755c35;background:rgba(151,112,48,.10);color:#d1b47b}
html[data-theme="tavern"] .verification{border-color:#5c7739;background:rgba(48,74,31,.88);color:#e3e7ad;box-shadow:0 4px 10px rgba(0,0,0,.2)}html[data-theme="tavern"] .verification span{color:#cdb98a}html[data-theme="tavern"] .verification.warning{border-color:#9a6728;background:rgba(72,39,14,.9);color:#e5c17f}


/* v0.15 — progression and class-choice engine */
.feature-engine-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:20px}
.feature-choice-panel{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:16px}
.feature-choice-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}
.feature-choice-head h4{margin:0 0 5px;font:600 16px Georgia,serif}.feature-choice-head p{margin:0;color:var(--muted);font-size:11px;line-height:1.5}
.choice-count{white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--gold);font-size:10px}
.choice-add-form{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px}.choice-add-form select{flex:1;min-width:190px}
.mastery-selection{display:grid;gap:7px}.mastery-choice{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:rgba(255,255,255,.02)}.mastery-choice b{display:block}.mastery-choice span{display:block;color:var(--muted);font-size:10px;line-height:1.45;margin-top:2px}
.choice-chips{display:flex;gap:6px;flex-wrap:wrap}.choice-chip{border-radius:999px;padding:6px 9px}.choice-chip.expert{border-color:#67508c;color:#d6c0ef}
.progression-form{display:grid;grid-template-columns:90px 120px minmax(160px,1fr) auto;gap:8px;align-items:end}.progression-form label{display:grid;gap:5px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}.progression-form input,.progression-form select{width:100%;box-sizing:border-box}
.feature-warning{margin-top:10px;padding:9px 11px;border:1px solid #795a34;border-radius:9px;background:rgba(139,97,44,.08);color:#d5b77d;font-size:11px}
.mastery-badge{display:grid;gap:3px;border:1px solid #4c6650;border-radius:9px;background:rgba(76,105,80,.09);padding:8px 9px;margin:8px 0}.mastery-badge b{color:#a8d8b0}.mastery-badge span{color:var(--muted);font-size:10px;line-height:1.45}.mastery-badge.compact{padding:6px 8px}.mastery-inline{display:inline-block;margin-left:5px;border:1px solid #47614c;border-radius:999px;padding:2px 6px;color:#a8d8b0;font-size:9px}
.skill-row.expert{box-shadow:inset 3px 0 #70528c}.skill-row.expert em{font-style:normal;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#c8afe1;margin-left:4px}
.feature-source a{color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,.22);text-underline-offset:2px}
html[data-theme="tavern"] .feature-choice-panel{color:#28170a;background-color:#d8b876;background-image:linear-gradient(110deg,rgba(255,247,208,.15),transparent 32%,rgba(79,37,10,.045)),url("/assets/parchment.webp");background-size:auto,420px 420px;border-color:#795022;box-shadow:0 8px 15px rgba(0,0,0,.34),inset 0 0 22px rgba(91,48,13,.09)}
html[data-theme="tavern"] .feature-choice-head h4{color:#291609}html[data-theme="tavern"] .feature-choice-head p,html[data-theme="tavern"] .mastery-choice span{color:#694721}html[data-theme="tavern"] .choice-count{color:#f3d58f;background:#311b0c;border-color:#8b5a24}
html[data-theme="tavern"] .mastery-choice{background:rgba(255,247,208,.20);border-color:#9a6b36}html[data-theme="tavern"] .mastery-badge{background:#34461f;border-color:#6f813d}html[data-theme="tavern"] .mastery-badge b,html[data-theme="tavern"] .mastery-inline{color:#eff0b6}html[data-theme="tavern"] .mastery-badge span{color:#d1c398}
@media(max-width:900px){.feature-engine-grid{grid-template-columns:1fr}.progression-form{grid-template-columns:1fr 1fr}.progression-form label:nth-child(3){grid-column:1/-1}.progression-form button{grid-column:1/-1}}
@media(max-width:560px){.progression-form{grid-template-columns:1fr}.progression-form label:nth-child(3),.progression-form button{grid-column:auto}.feature-choice-head{display:block}.choice-count{display:inline-block;margin-top:8px}}


/* v0.15.1 — level-gated compact feature list */
.unlocked-feature-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:11px}
.unlocked-feature-head h3{margin:0 0 3px}.unlocked-feature-head p{margin:0;color:var(--muted);font-size:10px}
.unlocked-feature-head>span{font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:var(--gold);white-space:nowrap}
.feature-accordion{display:grid;gap:7px}
.feature-disclosure{border:1px solid var(--line);border-radius:10px;background:var(--panel);overflow:hidden}
.feature-disclosure summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;user-select:none}
.feature-disclosure summary::-webkit-details-marker{display:none}
.feature-summary-main{display:flex;align-items:center;gap:9px;min-width:0}
.feature-summary-main b{display:block;font:600 14px Georgia,serif;color:var(--text)}
.feature-arrow{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid var(--line);border-radius:50%;font:700 17px/1 Georgia,serif;color:var(--gold);transition:transform .14s ease}
.feature-disclosure[open] .feature-arrow{transform:rotate(90deg)}
.feature-level-badge{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:var(--gold);font-size:9px;white-space:nowrap}
.feature-level-badge.core{color:var(--muted)}
.feature-expanded{border-top:1px solid var(--line);padding:11px 38px 12px 38px}
.feature-expanded p{margin:0;white-space:pre-wrap;line-height:1.58;color:var(--text);font-size:11px}
.feature-expanded-footer{display:flex;justify-content:flex-end;margin-top:9px}
.progression-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
html[data-theme="tavern"] .feature-disclosure{color:#291609;background-color:#d8b876;background-image:linear-gradient(110deg,rgba(255,247,208,.15),transparent 32%,rgba(79,37,10,.045)),url("/assets/parchment.webp");background-size:auto,420px 420px;border-color:#805226;box-shadow:0 5px 11px rgba(0,0,0,.27),inset 0 0 16px rgba(91,48,13,.07)}
html[data-theme="tavern"] .feature-summary-main b,html[data-theme="tavern"] .feature-expanded p{color:#291609}
html[data-theme="tavern"] .feature-disclosure .feature-source{color:#734719}
html[data-theme="tavern"] .feature-arrow{color:#f3d58f;background:#321b0d;border-color:#8d5b26}
html[data-theme="tavern"] .feature-level-badge{color:#f1d593;background:#321b0d;border-color:#8d5b26}
html[data-theme="tavern"] .feature-level-badge.core{color:#cbb27d}
html[data-theme="tavern"] .feature-expanded{border-color:rgba(119,75,31,.35);background:rgba(255,248,214,.16)}
html[data-theme="tavern"] .unlocked-feature-head p{color:#d7c39a}
html[data-theme="tavern"] .unlocked-feature-head>span{color:#f0d18c}
@media(max-width:620px){.unlocked-feature-head{align-items:flex-start;flex-direction:column}.feature-expanded{padding-left:20px;padding-right:20px}.feature-disclosure summary{align-items:flex-start}}


/* v0.16 — XP progression, guided level-up and rules tables */
.xp-compact{margin-top:13px;max-width:430px}.xp-compact-label{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
.xp-bar{height:9px;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:rgba(0,0,0,.22);box-shadow:inset 0 1px 3px rgba(0,0,0,.25)}.xp-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#7d6840,#b69a58);transition:width .2s ease}.xp-fill.ready{background:linear-gradient(90deg,#567a3f,#9bb758);box-shadow:0 0 10px rgba(137,176,85,.42)}
.xp-panel{border:1px solid var(--line);border-radius:12px;padding:13px;background:rgba(0,0,0,.06)}.xp-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:9px}.xp-panel-head b{display:block;font-size:14px}.xp-panel-head span{display:block;color:var(--muted);font-size:10px;margin-top:2px}.xp-panel-head strong{color:var(--gold);font:600 18px Georgia,serif}.xp-thresholds{display:flex;justify-content:space-between;color:var(--muted);font-size:9px;margin-top:5px}.xp-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.xp-actions form{display:flex;gap:6px}.xp-actions input{min-width:0;flex:1}.level-action-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.level-up-ready{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 0 0 1px rgba(170,194,87,.2),0 0 18px rgba(126,160,69,.18)}.tiny-rollback{padding:5px 8px!important;font-size:9px!important;opacity:.76}
.rules-table-wrap{overflow:auto;margin:10px 0 12px;border:1px solid var(--line);border-radius:10px}.rules-table{width:100%;border-collapse:collapse;min-width:340px}.rules-table th,.rules-table td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);border-right:1px solid var(--line);vertical-align:top}.rules-table th:last-child,.rules-table td:last-child{border-right:0}.rules-table tr:last-child td{border-bottom:0}.rules-table th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);background:rgba(0,0,0,.08)}.rules-table td{font-size:11px}.feature-expanded p+p{margin-top:9px}.feature-expanded code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em;padding:1px 4px;border-radius:4px;background:rgba(0,0,0,.09)}
.levelup-stepper{grid-template-columns:repeat(4,1fr)}.levelup-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.levelup-stat{border:1px solid var(--line);border-radius:11px;padding:13px;background:rgba(255,255,255,.025)}.levelup-stat span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.07em}.levelup-stat b{display:block;margin-top:5px;font:600 17px Georgia,serif}.levelup-stat small{display:block;color:var(--muted);font-size:9px;margin-top:4px}.levelup-hp-choice{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.levelup-hp-method{text-align:left;cursor:pointer}.levelup-hp-method b,.levelup-hp-method span,.levelup-hp-method strong{display:block}.levelup-hp-method span{color:var(--muted);font-size:10px;margin:4px 0 9px}.levelup-hp-method strong{color:var(--gold);font:600 14px Georgia,serif}.levelup-hp-method.active{outline:2px solid rgba(172,145,77,.65)}.levelup-choice-list{display:grid;gap:8px}
html[data-theme="tavern"] .xp-bar{border-color:#765022;background:#2a1609}.xp-fill{}
html[data-theme="tavern"] .xp-panel{border-color:#91612c;background:rgba(255,248,214,.18)}html[data-theme="tavern"] .xp-panel-head span,html[data-theme="tavern"] .xp-thresholds{color:#74502c}html[data-theme="tavern"] .xp-panel-head strong{color:#5b3211}
html[data-theme="tavern"] .rules-table-wrap{border-color:#8b5d2d}html[data-theme="tavern"] .rules-table th{color:#4b2810;background:rgba(84,45,15,.13)}html[data-theme="tavern"] .rules-table th,html[data-theme="tavern"] .rules-table td{border-color:rgba(110,67,28,.25)}
html[data-theme="tavern"] .levelup-stat{background:rgba(255,247,211,.2);border-color:#91612d}html[data-theme="tavern"] .levelup-stat span,html[data-theme="tavern"] .levelup-stat small{color:#76512c}html[data-theme="tavern"] .levelup-hp-method.active{outline-color:#9d6b2b;background:rgba(229,196,125,.18)}
@media(max-width:800px){.xp-actions{grid-template-columns:1fr}.levelup-summary-grid,.levelup-hp-choice{grid-template-columns:1fr}.levelup-stepper{grid-template-columns:1fr 1fr}.level-action-row{align-items:stretch;flex-direction:column}.tiny-rollback{align-self:flex-end}}


/* v0.16.1 — compact tavern progression ledger */
.feature-engine-grid{align-items:start}
.progression-ledger{grid-column:1/-1;padding:0!important;overflow:visible}
.progression-ledger-main{display:grid;grid-template-columns:112px minmax(0,1fr) 150px;gap:16px;align-items:center;padding:15px 17px}
.level-medallion{width:88px;height:88px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid var(--line);background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.09),transparent 34%),rgba(0,0,0,.2);box-shadow:inset 0 0 0 4px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.13)}
.level-medallion span,.level-medallion small{font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.level-medallion b{font:700 33px/1 Georgia,serif;color:var(--gold);margin:2px 0}
.progression-track{min-width:0}.progression-track-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:7px}.progression-track-head b{display:block;font:600 19px Georgia,serif}.compact-kicker{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.13em;color:var(--muted);margin-bottom:3px}
.progression-track-right{text-align:right}.progression-track-right strong{display:block;font:700 20px Georgia,serif;color:var(--gold)}.progression-track-right span{display:block;font-size:9px;color:var(--muted);margin-top:1px}
.xp-bar-ornate{position:relative;height:12px;overflow:visible}.xp-bar-ornate:before,.xp-bar-ornate:after{content:"";position:absolute;top:50%;width:7px;height:7px;border:1px solid var(--line);background:var(--panel);transform:translateY(-50%) rotate(45deg);z-index:2}.xp-bar-ornate:before{left:-4px}.xp-bar-ornate:after{right:-4px}.xp-gem{position:absolute;top:50%;width:10px;height:10px;border-radius:50%;transform:translate(-50%,-50%);background:var(--gold);border:2px solid rgba(30,20,8,.75);box-shadow:0 0 0 1px var(--gold),0 0 8px rgba(197,161,79,.35);z-index:3}
.xp-quick-row{display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap}.xp-quick-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-right:2px}.xp-quick-row form{margin:0}.xp-quick-button{padding:5px 9px!important;border-radius:999px!important;font-size:10px!important;min-width:auto!important}
.xp-more{position:relative}.xp-more>summary{list-style:none;cursor:pointer;border:1px solid var(--line);border-radius:999px;padding:5px 9px;font-size:10px;color:var(--muted);background:rgba(0,0,0,.08)}.xp-more>summary::-webkit-details-marker{display:none}.xp-more-popover{position:absolute;z-index:30;top:calc(100% + 7px);right:0;width:270px;padding:11px;border:1px solid var(--line);border-radius:11px;background:var(--panel);box-shadow:0 13px 30px rgba(0,0,0,.28)}.xp-more-popover form{display:flex;gap:6px;align-items:end;margin:0 0 8px}.xp-more-popover form:last-child{margin-bottom:0}.xp-more-popover label{display:grid;gap:4px;flex:1;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.xp-more-popover input{width:100%;box-sizing:border-box}
.progression-action{display:flex;justify-content:flex-end}.level-up-seal{width:128px;min-height:82px;box-sizing:border-box;border-radius:12px;border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none!important;text-align:center;padding:9px;background:rgba(0,0,0,.15);box-shadow:inset 0 0 0 3px rgba(255,255,255,.025)}.level-up-seal span,.level-up-seal small{font-size:8px;text-transform:uppercase;letter-spacing:.11em;color:var(--muted)}.level-up-seal b{font:700 18px Georgia,serif;color:var(--text);margin:3px 0}.level-up-seal.level-up-ready{border-color:#718844;background:linear-gradient(#5e7539,#3f5227);box-shadow:inset 0 0 0 2px rgba(222,226,158,.12),0 0 16px rgba(104,137,62,.25)}.level-up-seal.level-up-ready span,.level-up-seal.level-up-ready small{color:#dce4b0}.level-up-seal.level-up-ready b{color:#fff1b8}.level-up-seal.locked{opacity:.64}.level-up-seal.max{border-color:#8e6e31}
.progression-ledger-foot{display:flex;justify-content:space-between;gap:14px;padding:8px 17px;border-top:1px solid var(--line);color:var(--muted);font-size:9px}
.compact-choice-panel{padding:13px 15px!important}.compact-choice-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.compact-choice-head h4{margin:0;font:600 17px Georgia,serif}.compact-choice-body{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.expertise-chips{margin:0}.choice-chip.expert{display:inline-flex;align-items:center;gap:6px}.choice-chip.expert span{opacity:.68;font-size:9px}.choice-chip.expert i{font-style:normal;opacity:.58}.compact-editor{margin-left:auto;position:relative}.compact-editor>summary{list-style:none;cursor:pointer;border:1px solid var(--line);border-radius:999px;padding:5px 9px;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.compact-editor>summary::-webkit-details-marker{display:none}.compact-add-form{margin-top:8px}
html[data-theme="tavern"] .progression-ledger{background-image:linear-gradient(90deg,rgba(255,247,214,.18),transparent 32%,rgba(115,59,15,.035)),url("/assets/parchment.webp");background-size:auto,420px 420px}
html[data-theme="tavern"] .level-medallion{border-color:#8f5d24;background:radial-gradient(circle at 35% 27%,#5d3517,#2b1608 72%);box-shadow:inset 0 0 0 4px #b17b33,inset 0 0 0 6px #3a1d0a,0 5px 10px rgba(0,0,0,.28)}html[data-theme="tavern"] .level-medallion b{color:#f2d28c}html[data-theme="tavern"] .level-medallion span,html[data-theme="tavern"] .level-medallion small{color:#c7a873}
html[data-theme="tavern"] .progression-track-head b{color:#2c190d}html[data-theme="tavern"] .compact-kicker,html[data-theme="tavern"] .progression-track-right span,html[data-theme="tavern"] .xp-quick-label,html[data-theme="tavern"] .progression-ledger-foot{color:#77512c}html[data-theme="tavern"] .progression-track-right strong{color:#6d3d13}
html[data-theme="tavern"] .xp-more>summary,html[data-theme="tavern"] .compact-editor>summary{border-color:#95652f;background:#42240f;color:#e2c78f}html[data-theme="tavern"] .xp-more-popover{background:#e0c487 url("/assets/parchment.webp");background-size:420px 420px;border-color:#825321;color:#2b190d}
html[data-theme="tavern"] .progression-ledger-foot{border-color:rgba(117,72,28,.32);background:rgba(84,42,12,.04)}
html[data-theme="tavern"] .compact-choice-panel{min-height:0}
@media(max-width:900px){.progression-ledger-main{grid-template-columns:92px minmax(0,1fr)}.progression-action{grid-column:1/-1;justify-content:stretch}.level-up-seal{width:100%;min-height:54px;flex-direction:row;gap:7px}.level-up-seal b{margin:0}.progression-ledger-foot{flex-direction:column;gap:3px}.xp-more-popover{left:0;right:auto}}
@media(max-width:620px){.progression-ledger-main{grid-template-columns:1fr;text-align:center}.level-medallion{margin:auto}.progression-track-head{align-items:center}.xp-quick-row{justify-content:center}.progression-track-right{text-align:right}.compact-choice-body{align-items:flex-start;flex-direction:column}.compact-editor{margin-left:0}.xp-more-popover{left:50%;transform:translateX(-50%);width:min(280px,80vw)}}


/* v0.17 — full spellcasting engine */
.spellcasting-panel{overflow:visible}.spellcasting-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:14px}.spellcasting-hero h3{margin:2px 0 8px}.spell-ledger{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.spell-ledger-stat{min-width:68px;border:1px solid var(--line);border-radius:10px;padding:7px 9px;text-align:center;background:rgba(0,0,0,.06)}.spell-ledger-stat b{display:block;font:600 17px Georgia,serif;color:var(--gold)}.spell-ledger-stat small{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.08em;margin-top:2px}.spell-ledger-stat.always b{color:#9fc98f}
.spell-manager{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:11px;padding:9px 10px;margin-bottom:12px;background:rgba(0,0,0,.04)}.spell-manager .spellbook-add{flex:1}.spell-manager .spellbook-add select{min-width:260px;max-width:560px;flex:1}.spell-manager>.small-note{max-width:430px}
.spell-slot{position:relative}.slot-note{display:block;margin-top:5px;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.07em}
.spell-always{box-shadow:inset 3px 0 #66814b}.always-prepared{color:#b7d99d;border-color:#597342;background:rgba(89,115,66,.08)}.ritual-ready{color:#c4b0db;border-color:#65527d}
.spell-runtime-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
html[data-theme="tavern"] .spellcasting-hero{border-bottom:1px solid rgba(109,67,29,.28);padding-bottom:12px}html[data-theme="tavern"] .spell-ledger-stat{background:#43250f;border-color:#95632b}html[data-theme="tavern"] .spell-ledger-stat b{color:#f0d08a}html[data-theme="tavern"] .spell-ledger-stat small{color:#c4a775}html[data-theme="tavern"] .spell-ledger-stat.always b{color:#d9e7a8}
html[data-theme="tavern"] .spell-manager{background:rgba(255,247,211,.17);border-color:#93622d}html[data-theme="tavern"] .spell-manager>.small-note{color:#74502c}
html[data-theme="tavern"] .spell-always{box-shadow:inset 4px 0 #6d813e,0 5px 12px rgba(0,0,0,.18)}html[data-theme="tavern"] .always-prepared{background:#405126;color:#eff1b8;border-color:#708344}
@media(max-width:900px){.spellcasting-hero{flex-direction:column}.spell-ledger{justify-content:flex-start}.spell-manager{align-items:stretch;flex-direction:column}.spell-manager>.small-note{max-width:none}.spell-runtime-grid{grid-template-columns:1fr}}
@media(max-width:560px){.spell-ledger-stat{min-width:60px}.spell-manager .spellbook-add select{min-width:0;width:100%}}


.subclass-actions-panel,.subclass-controls{grid-column:1/-1}.subclass-controls:empty{display:none}.subclass-action-card form{display:grid;gap:10px}.subclass-confirm{display:flex;align-items:flex-start;gap:8px;font-size:12px}.subclass-confirm input{width:auto;flex:none;margin-top:3px}
/* v0.18 — persistent class/subclass choice engine */
.choice-pending-chip{border-color:#9c6528!important;background:#5a2d12!important;color:#f2cf83!important}
.class-choice-section{margin-top:18px}.choice-engine-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.choice-engine-card{border:1px solid var(--line);border-radius:13px;background:var(--panel);padding:14px;min-width:0}.choice-engine-card.wide{grid-column:1/-1}.choice-engine-card.choice-pending{border-color:#8b642e;box-shadow:inset 3px 0 rgba(184,130,49,.65)}.choice-engine-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.choice-engine-head h4{margin:1px 0 0;font:600 18px Georgia,serif}.choice-engine-card>p{margin:8px 0 11px;color:var(--muted);font-size:10px;line-height:1.55}.choice-status{border:1px solid var(--line);border-radius:999px;padding:5px 8px;font-size:9px;color:var(--gold);white-space:nowrap}.choice-engine-form{display:flex;gap:7px;align-items:center;margin-top:10px}.choice-engine-form select{min-width:0;flex:1}.choice-preview{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.choice-preview span{border:1px solid var(--line);border-radius:999px;padding:4px 7px;font-size:9px;color:var(--muted)}
.choice-token-list{display:grid;gap:7px;margin-top:10px}.choice-token{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:rgba(255,255,255,.02)}.choice-token b{display:block;font-size:12px}.choice-token span{display:block;color:var(--muted);font-size:9px;line-height:1.45;margin-top:2px}.choice-token-actions{display:flex;gap:5px;align-items:center;flex:0 0 auto}.choice-token form{margin:0}
.channel-divinity-panel{grid-column:1/-1}.channel-action-row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.channel-card form{margin-top:9px}.channel-action-row form{margin-top:0}.channel-divinity-panel.compact .choice-engine-grid{grid-template-columns:1fr}.channel-divinity-panel.compact .channel-card{padding:11px}.channel-divinity-panel.compact .channel-card>p{margin-bottom:8px}
html[data-theme="tavern"] .choice-engine-card{color:#2c190c;background-color:#d9b977;background-image:linear-gradient(110deg,rgba(255,247,208,.16),transparent 36%,rgba(79,37,10,.04)),url("/assets/parchment.webp");background-size:auto,420px 420px;border-color:#825526;box-shadow:0 6px 13px rgba(0,0,0,.28),inset 0 0 18px rgba(92,49,14,.07)}
html[data-theme="tavern"] .choice-engine-card.choice-pending{border-color:#a56b25;box-shadow:inset 4px 0 #8d571d,0 6px 13px rgba(0,0,0,.28)}
html[data-theme="tavern"] .choice-engine-card>p,html[data-theme="tavern"] .choice-token span{color:#714923}html[data-theme="tavern"] .choice-status{background:#3b1f0d;border-color:#8d5b26;color:#f1d18d}.choice-token{}
html[data-theme="tavern"] .choice-token{background:rgba(255,247,211,.22);border-color:#9a6933}html[data-theme="tavern"] .choice-preview span{color:#613d1e;border-color:#9a6933;background:rgba(255,248,217,.2)}
@media(max-width:900px){.choice-engine-grid{grid-template-columns:1fr}.choice-engine-card.wide{grid-column:auto}}
@media(max-width:560px){.choice-engine-form{align-items:stretch;flex-direction:column}.choice-engine-form select,.choice-engine-form button{width:100%}.choice-token{align-items:flex-start;flex-direction:column}.choice-token-actions{width:100%;justify-content:flex-end}}


/* v0.18.1 — searchable spell picker & Magical Discoveries polish */
.spell-search-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;width:100%;position:relative}
.spell-search-shell{position:relative;min-width:0}.spell-search-field{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:10px;background:#101512;padding:0 8px;min-height:42px}.spell-search-icon{font-size:21px;color:var(--muted);line-height:1}.spell-search-input{flex:1;min-width:0;border:0!important;background:transparent!important;outline:0!important;box-shadow:none!important;padding:9px 1px!important;color:var(--text)!important}.spell-search-clear{border:0!important;background:transparent!important;box-shadow:none!important;color:var(--muted)!important;padding:4px!important;font-size:17px!important}.spell-picker-submit{height:42px;white-space:nowrap}.spell-picker-submit:disabled{opacity:.46;cursor:not-allowed}
.spell-search-help{grid-column:1/-1;color:var(--muted);font-size:9px;line-height:1.45;padding:0 2px}
.spell-search-popover{position:absolute;z-index:90;left:0;right:0;top:calc(100% + 6px);max-height:470px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#101512;box-shadow:0 18px 42px rgba(0,0,0,.48)}
.spell-search-tabs{display:flex;gap:5px;padding:8px;border-bottom:1px solid var(--line);overflow:auto;background:rgba(255,255,255,.025)}.spell-search-tab{font-size:9px!important;padding:5px 8px!important;white-space:nowrap!important;border-radius:999px!important}.spell-search-tab.active{border-color:var(--gold)!important;color:var(--gold)!important}
.spell-search-results{max-height:405px;overflow:auto;padding:7px}.spell-search-group+.spell-search-group{margin-top:8px}.spell-search-group-title{display:flex;justify-content:space-between;align-items:center;padding:5px 7px;color:var(--gold);font-size:9px;text-transform:uppercase;letter-spacing:.09em;position:sticky;top:0;background:#101512;z-index:1}.spell-search-fallback{text-transform:none;letter-spacing:0;color:var(--muted);font-size:8px}
.spell-search-result{display:block!important;width:100%!important;text-align:left!important;border:1px solid transparent!important;border-radius:9px!important;background:transparent!important;box-shadow:none!important;padding:8px 9px!important;color:var(--text)!important}.spell-search-result:hover,.spell-search-result:focus{border-color:var(--line)!important;background:rgba(255,255,255,.045)!important}.spell-search-result-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.spell-search-result-top b{font:600 13px Georgia,serif}.spell-search-result-top>span{font-size:9px;color:var(--gold)}.spell-search-result-tags{display:flex;gap:5px;flex-wrap:wrap;margin:4px 0}.spell-search-result-tags span{font-size:8px;border:1px solid var(--line);border-radius:999px;padding:2px 5px;color:var(--muted)}.spell-search-result p{margin:0!important;font-size:9px!important;color:var(--muted)!important;line-height:1.4!important;font-weight:400!important}.spell-search-empty{padding:18px;color:var(--muted);text-align:center;font-size:10px}
.spell-manager-search{display:block!important}.spell-manager-search .spell-search-form{grid-template-columns:minmax(0,1fr) auto}.spell-manager-search .spell-search-help{max-width:none!important}

.discovery-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:11px 0}.discovery-card{border:1px solid var(--line);border-radius:11px;padding:11px;background:rgba(255,255,255,.035);min-width:0}.discovery-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.discovery-card-head>div>span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.discovery-card-head b{display:block;font:600 15px Georgia,serif;margin-top:2px}.discovery-seal{display:inline-flex;width:34px;height:34px;border-radius:50%;align-items:center;justify-content:center;border:1px solid var(--line);color:var(--gold);font:700 9px Georgia,serif}.discovery-card-meta{font-size:9px;color:var(--muted);margin-top:7px}.discovery-card-actions{display:flex;gap:6px;align-items:center;margin-top:9px}.discovery-card-actions form{margin:0}.discovery-empty{border:1px dashed var(--line);border-radius:10px;padding:13px;color:var(--muted);font-size:10px;margin:10px 0}
.lore-spell-picker{margin-top:11px}.lore-spell-picker .spell-search-popover{max-height:520px}.lore-spell-picker .spell-search-results{max-height:450px}

.spell-status-stack{display:flex;flex-direction:column;gap:4px;align-items:flex-end}.spell-source-badge{font-size:8px;text-transform:uppercase;letter-spacing:.07em;border:1px solid var(--line);border-radius:999px;padding:3px 6px;color:var(--gold)}.spell-source-badge.discovery{background:#3f2c59;color:#e6d5ff;border-color:#79659a}.spell-discovery{box-shadow:inset 4px 0 #70558f!important}

html[data-theme="tavern"] .spell-search-field{background:#2d1609;border-color:#8a5928;box-shadow:inset 0 1px 3px rgba(0,0,0,.45)}html[data-theme="tavern"] .spell-search-input{color:#f0d79b!important}html[data-theme="tavern"] .spell-search-input::placeholder{color:#c1a46e!important}
html[data-theme="tavern"] .spell-search-popover{background:#241208;border-color:#9b672e;box-shadow:0 18px 42px rgba(0,0,0,.58),inset 0 0 24px rgba(113,59,18,.15)}html[data-theme="tavern"] .spell-search-tabs,html[data-theme="tavern"] .spell-search-group-title{background:#241208;border-color:#6e421e}html[data-theme="tavern"] .spell-search-result{color:#f1d9a2!important}html[data-theme="tavern"] .spell-search-result:hover,html[data-theme="tavern"] .spell-search-result:focus{background:#3b210f!important;border-color:#8a5928!important}html[data-theme="tavern"] .spell-search-result p,html[data-theme="tavern"] .spell-search-result-tags span{color:#c9ab77!important}
html[data-theme="tavern"] .discovery-card{background-color:#d6b675;background-image:linear-gradient(115deg,rgba(255,249,220,.18),transparent 42%,rgba(96,49,15,.05)),url("/assets/parchment.webp");background-size:auto,420px 420px;border-color:#855626;color:#2c190d;box-shadow:0 4px 10px rgba(0,0,0,.2)}html[data-theme="tavern"] .discovery-card-head>div>span,html[data-theme="tavern"] .discovery-card-meta{color:#76502a}html[data-theme="tavern"] .discovery-seal{background:#3a1d0c;border-color:#97632b;color:#efcf8b}
html[data-theme="tavern"] .spell-source-badge.discovery{background:#49345f;color:#eadcff;border-color:#8b73ac}

@media(max-width:760px){.spell-search-form{grid-template-columns:1fr}.spell-picker-submit{width:100%}.discovery-card-grid{grid-template-columns:1fr}.spell-status-stack{align-items:flex-start}.spell-search-popover{position:fixed;left:12px;right:12px;top:15vh;max-height:70vh}.spell-search-results{max-height:58vh}}


/* v0.19 — combat action automation */
.concentration-panel{grid-column:1/-1;border-color:#6d5489!important;box-shadow:inset 4px 0 #6d5489}.concentration-head{display:flex;justify-content:space-between;gap:14px;align-items:center}.concentration-head h3{margin:2px 0}.concentration-orb{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid #80679c;background:#3b294f;color:#eadcff;font:700 18px Georgia,serif}.concentration-alert{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;border:1px solid #7b5f91;border-radius:10px;padding:9px 10px;background:rgba(91,65,119,.1)}.concentration-alert b{color:#d8c5e9}.concentration-alert span{color:var(--muted);font-size:9px;margin-right:auto}.concentration-chip{border-color:#78608f!important;background:#3d2b50!important;color:#e8d8fb!important}
.active-magic-chip{border-color:#8f6a2b!important;background:#563415!important;color:#f2d186!important}
.resource-active{font-size:8px;color:#a7ca7e;max-width:180px}.resource-spend-form input{width:58px!important}
.pact-weapon-box{margin-top:13px;border-top:1px solid var(--line);padding-top:12px}.pact-weapon-box h5{margin:2px 0 4px;font:600 15px Georgia,serif}.pact-weapon-box p{margin:0;color:var(--muted);font-size:9px}.pact-weapon-badge{display:inline-flex;border:1px solid #6b527e;border-radius:999px;background:#352444;color:#e0cff0;font-size:8px;text-transform:uppercase;letter-spacing:.07em;padding:4px 7px;margin:6px 0}
.pact-runtime-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:13px}.pact-runtime-box{min-width:0;border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(0,0,0,.045)}.pact-runtime-box.pact-weapon-box{margin-top:0;border-top:1px solid var(--line);padding-top:12px}.pact-tome-box,.pact-familiar-box{grid-column:1/-1}.pact-runtime-box.choice-pending{border-color:#8b642e;box-shadow:inset 3px 0 rgba(184,130,49,.65)}.pact-runtime-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.pact-runtime-head h5{margin:2px 0 0;font:600 16px Georgia,serif}.pact-runtime-box>p,.gift-protectors-box>p{margin:6px 0 10px;color:var(--muted);font-size:9px;line-height:1.5}.pact-spell-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:10px 0}.pact-spell-groups>div{border:1px solid var(--line);border-radius:10px;padding:9px;min-width:0}.pact-spell-groups>div>b{font-size:10px}.pact-spell-list{display:grid;gap:5px;margin-top:7px}.pact-spell-card{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid rgba(128,128,128,.2);padding-top:6px}.pact-spell-card:first-child{border-top:0;padding-top:0}.pact-spell-card span{display:block;color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.07em}.pact-spell-card b{display:block;font-size:10px;margin-top:1px}.pact-inline-actions{display:flex;align-items:center;gap:5px;flex:0 0 auto}.pact-inline-actions form{margin:0}.pact-inline-actions .button,.pact-inline-actions button{font-size:8px!important;padding:5px 7px!important}.pact-tome-picker{margin-top:9px}.gift-protectors-box,.investment-box{margin-top:12px;border-top:1px solid var(--line);padding-top:11px}.protector-name-list{display:flex;gap:5px;flex-wrap:wrap}.protector-name-list form{margin:0}.choice-status.spent{color:#d88479;border-color:#7d4740}.familiar-runtime-card{display:grid;gap:9px;margin-top:11px}.familiar-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.familiar-stats span{border:1px solid var(--line);border-radius:9px;padding:7px 8px;font-size:9px}.familiar-stats b{display:block;color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}.familiar-hp-form{display:flex;gap:6px}.familiar-hp-form input{width:85px}.familiar-attack{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:9px}.familiar-attack b{display:block;font-size:11px}.familiar-attack span{display:block;color:var(--muted);font-size:8px;margin-top:2px}.investment-box>b{display:block}.investment-box .choice-engine-form label{display:grid;gap:4px;flex:1;color:var(--muted);font-size:8px}.investment-box .choice-engine-form label select{width:100%}
.wild-shape-box{grid-column:1/-1}.wild-shape-known{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:11px}.wild-shape-form{border:1px solid var(--line);border-radius:11px;padding:10px;background:rgba(0,0,0,.035);min-width:0}.wild-shape-form.active{border-color:#5f855e;box-shadow:inset 3px 0 rgba(92,145,89,.7)}.wild-shape-form.ineligible{border-color:#7d5540;opacity:.82}.wild-shape-form-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.wild-shape-form-head h5{margin:1px 0 0;font:600 15px Georgia,serif}.wild-shape-form-head span{font-size:8px;color:var(--muted)}.wild-shape-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:8px}.wild-shape-stats span{border:1px solid var(--line);border-radius:8px;padding:6px;font-size:9px}.wild-shape-stats b{display:block;color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px}.wild-shape-form-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}.wild-shape-form-actions form{margin:0}.wild-shape-active{margin-top:11px;border:1px solid #52734f;border-radius:12px;padding:11px;background:rgba(69,113,65,.09)}.wild-shape-active-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.wild-shape-active-head h4{margin:1px 0 0;font:600 18px Georgia,serif}.wild-shape-action-list{display:grid;gap:7px;margin-top:9px}.wild-shape-action{border-top:1px solid var(--line);padding-top:8px}.wild-shape-action:first-child{border-top:0;padding-top:0}.wild-shape-action-head{display:flex;justify-content:space-between;gap:9px;align-items:flex-start}.wild-shape-action b{font-size:11px}.wild-shape-action p{font-size:9px;color:var(--muted);line-height:1.45;margin:4px 0 0}.wild-shape-physical{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.wild-shape-physical span{font-size:8px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:var(--muted)}.wild-shape-combat{grid-column:1/-1}.wild-shape-combat .wild-shape-active{margin-top:0}.wild-shape-empty{border:1px dashed var(--line);border-radius:10px;padding:10px;color:var(--muted);font-size:10px;margin-top:9px}
.font-magic-panel{border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:13px;background:rgba(0,0,0,.04)}.font-magic-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.font-magic-head h4{margin:2px 0;font:600 17px Georgia,serif}.font-points{border:1px solid var(--line);border-radius:999px;padding:5px 8px;color:var(--gold);font-size:10px}.font-magic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.font-magic-grid form{border:1px solid var(--line);border-radius:10px;padding:9px;display:grid;gap:7px}.font-magic-grid label{display:grid;gap:5px;color:var(--muted);font-size:9px}.font-magic-panel>p{margin:8px 1px 0;color:var(--muted);font-size:8px}
.spell-slot strong em{font-style:normal;color:#b6d97f;margin-left:4px}.slot-pip.bonus{background:#7857a2!important;border-color:#b18fd5!important;box-shadow:0 0 5px rgba(151,112,194,.45)}.spell-slot-bonus{border-color:#73598d!important}
html[data-theme="tavern"] .concentration-panel{background-color:#d5b474;background-image:url("/assets/parchment.webp");background-size:420px 420px;border-color:#755388!important}html[data-theme="tavern"] .concentration-alert{background:rgba(87,50,111,.12)}html[data-theme="tavern"] .pact-weapon-box{border-color:#98672e}html[data-theme="tavern"] .pact-weapon-badge{background:#40294f;color:#edddff;border-color:#7e6294}
html[data-theme="tavern"] .pact-runtime-box{background:rgba(255,247,211,.16);border-color:#93622d}html[data-theme="tavern"] .pact-spell-groups>div,html[data-theme="tavern"] .familiar-stats span,html[data-theme="tavern"] .familiar-attack{border-color:#95642f;background:rgba(255,248,216,.12)}html[data-theme="tavern"] .gift-protectors-box,html[data-theme="tavern"] .investment-box{border-color:#98672e}html[data-theme="tavern"] .wild-shape-form,html[data-theme="tavern"] .wild-shape-stats span,html[data-theme="tavern"] .wild-shape-active{border-color:#95642f;background:rgba(255,248,216,.12)}
html[data-theme="tavern"] .font-magic-panel{background:rgba(79,38,10,.05);border-color:#95642f}html[data-theme="tavern"] .font-magic-grid form{background:rgba(255,248,216,.14);border-color:#96642f}html[data-theme="tavern"] .font-points{background:#3d210e;border-color:#98642d;color:#f0d08b}
@media(max-width:800px){.font-magic-grid{grid-template-columns:1fr}.concentration-alert{align-items:stretch;flex-direction:column}.concentration-alert span{margin-right:0}}
@media(max-width:800px){.pact-runtime-grid,.pact-spell-groups,.wild-shape-known{grid-template-columns:1fr}.pact-tome-box,.pact-familiar-box,.wild-shape-box{grid-column:auto}.familiar-stats,.wild-shape-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.familiar-attack,.wild-shape-action-head{align-items:flex-start;flex-direction:column}}


/* v0.22.0 — localized topbar layout
   Russian labels are longer than English ones, so the header uses explicit
   alignment zones and equal-height navigation controls instead of allowing
   translated text to determine each button's geometry independently. */
.topbar{
  min-width:0;
}
.brand{
  flex:0 0 auto;
  min-width:0;
}
.mainnav{
  min-width:0;
  align-items:stretch;
}
.nav-cluster{
  align-items:stretch;
}
.mainnav a{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  line-height:1.15;
  min-height:40px;
  white-space:nowrap;
}
.topbar-tools{
  display:flex;
  align-items:stretch;
  justify-content:flex-end;
  gap:6px;
  flex:0 0 auto;
}
.theme-picker,
.language-picker{
  display:flex;
  align-items:stretch;
}
.theme-picker select,
.language-picker select{
  height:100%;
  min-height:40px;
}
.topbar .status{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:5px;
  min-height:40px;
  text-align:center;
  line-height:1.15;
}

/* Russian desktop header. Keep short labels on one line, reserve intentional
   two-line space only for the genuinely long system/status labels. */
html[data-lang="ru"] .topbar{
  gap:8px;
}
html[data-lang="ru"] .brand{
  flex:0 0 218px;
}
html[data-lang="ru"] .mainnav{
  gap:4px;
  margin-right:2px;
}
html[data-lang="ru"] .nav-cluster{
  gap:4px;
}
html[data-lang="ru"] .mainnav a{
  min-height:44px;
  padding:7px 9px;
  font-size:11px;
}
html[data-lang="ru"] .mainnav a[href="/builder-data"]{
  width:112px;
  white-space:normal;
}
html[data-lang="ru"] .topbar-tools{
  gap:5px;
}
html[data-lang="ru"] .theme-picker select{
  width:86px;
}
html[data-lang="ru"] .language-picker select{
  width:58px;
}
html[data-lang="ru"] .topbar .status{
  width:132px;
  padding:6px 8px;
  white-space:normal;
}

/* Tavern-specific sizing: preserve the wooden-button look while making every
   control share the same vertical rhythm. */
html[data-theme="tavern"] .mainnav a,
html[data-theme="tavern"] .theme-picker select,
html[data-theme="tavern"] .language-picker select,
html[data-theme="tavern"] .status{
  min-height:44px;
}
html[data-theme="tavern"] .topbar .status b{
  flex:0 0 auto;
}
html[data-theme="tavern"] .topbar .status span{
  display:block;
}

/* When the viewport genuinely gets tight, move navigation to a second row
   rather than crushing Russian labels. */
@media(max-width:1120px){
  .topbar{
    flex-wrap:wrap;
  }
  .mainnav{
    order:3;
    width:100%;
    margin-left:0;
    margin-right:0;
    justify-content:center;
    flex-wrap:wrap;
  }
  .topbar-tools{
    margin-left:auto;
  }
  html[data-lang="ru"] .brand{
    flex-basis:auto;
  }
}
@media(max-width:720px){
  .topbar-tools{
    width:100%;
    justify-content:flex-start;
    flex-wrap:wrap;
  }
  html[data-lang="ru"] .topbar .status{
    width:auto;
  }
  .mainnav{
    justify-content:flex-start;
  }
}


/* v0.22.0 — wide low header + Builder Data class-page overhaul */
.builder-inline-ref{color:inherit;font-weight:650;text-decoration-line:underline;text-decoration-style:dotted;text-decoration-thickness:1px;text-decoration-color:color-mix(in srgb,var(--gold) 62%,transparent);text-underline-offset:3px;background:none!important;border:0!important;border-radius:0!important;padding:0!important;white-space:normal}.builder-inline-ref:hover{color:var(--gold);text-decoration-style:solid;text-shadow:0 0 8px color-mix(in srgb,var(--gold) 22%,transparent)}html[data-theme="tavern"] .builder-inline-ref{color:#704019;text-decoration-color:rgba(116,65,20,.55)}html[data-theme="tavern"] .builder-inline-ref:hover{color:#9a551b;text-shadow:0 0 8px rgba(183,111,35,.18)}
@media(min-width:1321px){html[data-theme="tavern"] .topbar{width:min(1420px,calc(100vw - 34px));max-width:none;margin:10px 50% 22px;transform:translateX(-50%);flex-wrap:nowrap;min-height:58px;padding:6px 12px;gap:7px}html[data-theme="tavern"] .brand{flex:0 0 auto;padding-left:8px;min-width:218px}html[data-theme="tavern"] .brand h1{white-space:nowrap;font-size:18px}html[data-theme="tavern"] .brand small{white-space:nowrap;font-size:9px;margin-top:2px}html[data-theme="tavern"] .mainnav{flex:1 1 auto;justify-content:center;flex-wrap:nowrap;gap:4px;margin:0;min-width:0}html[data-theme="tavern"] .nav-cluster{flex-wrap:nowrap;gap:4px}html[data-theme="tavern"] .mainnav a,html[data-theme="tavern"] .theme-picker select,html[data-theme="tavern"] .language-picker select,html[data-theme="tavern"] .status{min-height:36px;height:36px}html[data-theme="tavern"] .mainnav a{padding:6px 9px;font-size:10px;white-space:nowrap;width:auto!important}html[data-lang="ru"][data-theme="tavern"] .mainnav a[href="/builder-data"]{white-space:nowrap;width:auto;padding-left:11px;padding-right:11px}html[data-theme="tavern"] .topbar-tools{flex:0 0 auto;gap:4px;align-items:center}html[data-theme="tavern"] .theme-picker select{width:82px}html[data-theme="tavern"] .language-picker select{width:54px}html[data-lang="ru"][data-theme="tavern"] .topbar .status{width:auto;min-width:156px;white-space:nowrap;padding:5px 9px}html[data-theme="tavern"] .topbar .status span{white-space:nowrap}}
.builder-class-page{width:min(1280px,calc(100vw - 48px));margin-left:50%;transform:translateX(-50%);padding-bottom:20px}.builder-class-back{margin-top:18px}.builder-class-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:start;padding:24px 26px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.builder-class-hero h2{font:500 44px/1 Georgia,serif;margin:8px 0 13px}.class-source-mini{min-width:260px;border-left:1px solid var(--line);padding-left:22px}.class-toc{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0 18px;position:sticky;top:78px;z-index:20;padding:8px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--panel) 94%,transparent);backdrop-filter:blur(8px)}.class-toc a{border:1px solid var(--line);border-radius:999px;padding:6px 10px;font-size:11px;color:var(--muted)}.class-toc a:hover{color:var(--gold);border-color:var(--gold)}.class-intro{font-size:14px;line-height:1.68;padding:20px 24px;margin-bottom:18px;border-left:3px solid var(--gold);background:var(--panel);border-radius:4px 14px 14px 4px}.class-intro p{margin:0;white-space:pre-wrap}.class-page-section{scroll-margin-top:135px;margin:0 0 24px;padding:22px 24px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.class-section-head{display:flex;gap:13px;align-items:flex-start;margin-bottom:16px;padding-bottom:13px;border-bottom:1px solid var(--line)}.class-section-head>span{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--line);border-radius:50%;font:700 11px Georgia,serif;color:var(--gold)}.class-section-head h3{font:500 24px Georgia,serif;margin:0 0 3px}.class-section-head p{margin:0;color:var(--muted);font-size:11px}.class-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.class-overview-stat{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.class-overview-stat>b{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.09em;margin-bottom:7px}.class-overview-stat>span{font:600 20px Georgia,serif}.class-rules-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.class-rules-grid>section{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface)}.class-rules-grid>section:last-child:nth-child(3){grid-column:1/-1}.class-rules-grid h4{font:600 16px Georgia,serif;margin:0 0 10px}.class-rules-grid .builder-human-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.class-rules-grid .builder-human-box{background:transparent;padding:8px;border-color:color-mix(in srgb,var(--line) 70%,transparent)}.class-progression-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}.class-progression-table{width:100%;border-collapse:collapse;min-width:820px;font-size:12px}.class-progression-table th,.class-progression-table td{padding:10px 11px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}.class-progression-table thead th{position:sticky;top:0;background:var(--surface);color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.09em;z-index:2}.class-progression-table tbody tr:last-child>*{border-bottom:0}.class-progression-table tbody tr:hover{background:color-mix(in srgb,var(--gold) 6%,transparent)}.class-progression-table tbody th{width:58px;color:var(--gold);font:700 15px Georgia,serif}.class-progression-table td:nth-child(2){width:58px;font-weight:700}.class-feature-cell{min-width:270px}.progression-feature-link{font-weight:650;text-decoration:underline dotted;text-underline-offset:3px;color:inherit}.progression-feature-link:hover{color:var(--gold);text-decoration-style:solid}.progression-sep{color:var(--muted);padding:0 6px}.class-progression-data{display:flex;gap:5px;flex-wrap:wrap;max-width:430px}.class-progression-data span{display:inline-flex;gap:4px;border:1px solid var(--line);border-radius:999px;padding:2px 6px;font-size:9px;color:var(--muted)}.class-progression-data b{font-weight:700;color:var(--text);text-transform:capitalize}.class-feature-level{display:grid;grid-template-columns:100px minmax(0,1fr);gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}.class-feature-level:last-child{border-bottom:0}.class-feature-level-title{font:600 14px Georgia,serif;color:var(--gold);padding-top:9px;position:sticky;top:135px;align-self:start}.class-feature-list{display:grid;gap:7px}.class-feature-disclosure{scroll-margin-top:140px;border:1px solid var(--line);border-radius:10px;background:var(--surface);overflow:hidden}.class-feature-disclosure summary{display:flex;justify-content:space-between;gap:12px;align-items:center;list-style:none;cursor:pointer;padding:11px 13px;font:600 15px Georgia,serif}.class-feature-disclosure summary::-webkit-details-marker{display:none}.class-feature-disclosure .feature-arrow{transition:transform .16s;color:var(--muted)}.class-feature-disclosure[open] .feature-arrow{transform:rotate(90deg)}.class-feature-copy{padding:0 13px 13px;border-top:1px solid var(--line);font-size:12px;line-height:1.62}.class-feature-copy p{margin:11px 0 0;white-space:pre-wrap}.class-subclass-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.class-subclass-card{display:flex;justify-content:space-between;gap:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:14px;transition:.14s}.class-subclass-card:hover{transform:translateY(-1px);border-color:var(--gold)}.class-subclass-card h4{font:600 17px Georgia,serif;margin:3px 0 5px}.class-subclass-card p{margin:0;color:var(--muted);font-size:10px;line-height:1.45}.subclass-open{align-self:center;font-size:20px;color:var(--gold)}.builder-source-drawer{margin-top:10px;border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:0 14px}.builder-source-drawer>summary{cursor:pointer;padding:12px 0;color:var(--muted);font-size:11px}.builder-source-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.6fr);gap:16px;padding:2px 0 14px}.builder-source-grid .aside-card{position:static}
html[data-theme="tavern"] .builder-class-hero,html[data-theme="tavern"] .class-page-section,html[data-theme="tavern"] .class-intro,html[data-theme="tavern"] .builder-source-drawer{color:var(--tavern-ink);border-color:#744821;background-color:#dec181;background-image:linear-gradient(115deg,rgba(255,249,220,.17),transparent 42%,rgba(96,49,15,.04)),url("/assets/parchment.webp");background-size:auto,420px 420px;box-shadow:0 5px 12px rgba(0,0,0,.18)}html[data-theme="tavern"] .class-toc{top:72px;background:#2b170b;border-color:#80501f;box-shadow:0 4px 9px rgba(0,0,0,.28)}html[data-theme="tavern"] .class-toc a{color:#e8ce95;border-color:#80501f;background:#1e1008}html[data-theme="tavern"] .class-overview-stat,html[data-theme="tavern"] .class-rules-grid>section,html[data-theme="tavern"] .class-feature-disclosure,html[data-theme="tavern"] .class-subclass-card{background:rgba(255,248,222,.34);border-color:#9a6a37}html[data-theme="tavern"] .class-progression-wrap{border-color:#8c5a2a}html[data-theme="tavern"] .class-progression-table thead th{background:#3b210f;color:#e6c98d}html[data-theme="tavern"] .class-progression-table th,html[data-theme="tavern"] .class-progression-table td{border-color:rgba(101,58,24,.28)}html[data-theme="tavern"] .class-progression-data span{border-color:#a16f3c;color:#704b2b;background:rgba(255,250,225,.22)}html[data-theme="tavern"] .class-progression-data b{color:#3a210f}html[data-theme="tavern"] .class-feature-copy{border-color:rgba(101,58,24,.28)}html[data-theme="tavern"] .class-source-mini{border-color:#a27649}
@media(max-width:980px){.builder-class-page{width:100%;margin-left:0;transform:none}.builder-class-hero{grid-template-columns:1fr}.class-source-mini{border-left:0;border-top:1px solid var(--line);padding-left:0;padding-top:14px;min-width:0}.class-overview-grid{grid-template-columns:1fr}.class-rules-grid{grid-template-columns:1fr}.class-rules-grid>section:last-child:nth-child(3){grid-column:auto}.class-feature-level{grid-template-columns:1fr}.class-feature-level-title{position:static;padding-top:0}.class-subclass-grid{grid-template-columns:1fr}.builder-source-grid{grid-template-columns:1fr}.class-toc{position:static}}


/* v0.22.0 — grouped class editions, richer progression, rules-text cleanup */
.builder-card-has-variants{position:relative}.builder-variant-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}.builder-version-count{font-weight:700}.builder-version-chip{opacity:.88}.class-variant-switch{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px}.class-variant-switch>span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-right:2px}.class-variant-switch a{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:999px;padding:5px 9px;font-size:10px;color:var(--muted);background:var(--surface)}.class-variant-switch a:hover,.class-variant-switch a.active{border-color:var(--gold);color:var(--gold)}.class-variant-switch a.active{font-weight:700;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gold) 32%,transparent)}
.class-progression-note{margin:0 0 9px;padding:8px 10px;border-left:3px solid var(--gold);border-radius:3px 9px 9px 3px;background:color-mix(in srgb,var(--gold) 5%,var(--surface));color:var(--muted);font-size:10px;line-height:1.45}.class-feature-cell{line-height:1.75}.class-progression-data{max-width:560px}.class-progression-data span{font-size:9px;padding:3px 7px}.class-progression-table td:last-child{min-width:270px}.class-progression-table tbody tr:nth-child(5n) td,.class-progression-table tbody tr:nth-child(5n) th{border-bottom-color:color-mix(in srgb,var(--gold) 42%,var(--line))}
.builder-rules-text{line-height:1.58}.builder-rules-text p{margin:7px 0}.builder-rules-text p:first-child{margin-top:0}.builder-rules-text p:last-child{margin-bottom:0}.builder-rules-text ul,.builder-rules-text ol{margin:7px 0 7px 20px;padding:0}.builder-rules-text li{margin:3px 0}.builder-rules-text strong{font-weight:750}.builder-rules-text em{font-style:italic}.builder-rules-text code{font:inherit;background:color-mix(in srgb,var(--gold) 9%,transparent);border-radius:4px;padding:1px 3px}.builder-rules-text .rules-table-wrap{overflow:auto;margin:8px 0}.builder-rules-text .rules-table{width:100%;border-collapse:collapse}.builder-rules-text .rules-table th,.builder-rules-text .rules-table td{padding:6px 8px;border:1px solid var(--line);text-align:left}.class-feature-copy.builder-rules-text p{white-space:normal}
html[data-theme="tavern"] .builder-variant-badges{border-color:rgba(101,58,24,.24)}html[data-theme="tavern"] .class-variant-switch a{background:#2a160a;border-color:#865624;color:#e7ce98}html[data-theme="tavern"] .class-variant-switch a.active{background:#4a2a11;color:#f2d58d;border-color:#c58c37}html[data-theme="tavern"] .class-progression-note{background:rgba(86,48,18,.08);color:#6f4b2c;border-left-color:#9c641f}
/* Do not inherit parchment ink into dark interactive pills. */
html[data-theme="tavern"] .stat .entity-ref,
html[data-theme="tavern"] .stat .chip,
html[data-theme="tavern"] .class-overview-stat .entity-ref,
html[data-theme="tavern"] .class-overview-stat .chip,
html[data-theme="tavern"] .builder-human-box .entity-ref,
html[data-theme="tavern"] .builder-human-box .chip,
html[data-theme="tavern"] .builder-card .chip,
html[data-theme="tavern"] .builder-variant-badges .chip{
  color:#f3dc9f!important;-webkit-text-fill-color:#f3dc9f!important;text-shadow:0 1px #160a03!important;
}
@media(max-width:760px){.class-progression-table{min-width:720px}.class-progression-data{max-width:420px}}

.localized-original-name{margin-top:-2px;margin-bottom:7px;font-size:10px;line-height:1.2;color:var(--muted);font-style:italic;opacity:.86}
</style>
<link rel="stylesheet" href="/assets/table-ui.css?v=0.32.2">
<script src="/assets/table-ui.js?v=0.35.0" defer></script>
<script type="module" src="/assets/workspace-character-sync.js?v=0.32.2"></script>
<script type="module" src="/assets/i18n.js?v=0.32.2"></script>
</head>
<body>
<div class="tavern-decor decor-candle" aria-hidden="true">
<svg viewBox="0 0 130 260">
  <defs>
    <radialGradient id="cg"><stop offset="0" stop-color="#ffd36b" stop-opacity=".88"/><stop offset=".45" stop-color="#ff8b22" stop-opacity=".25"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient>
    <linearGradient id="cw" x2="1" y2="1"><stop stop-color="#ffe3a3"/><stop offset=".55" stop-color="#e7b764"/><stop offset="1" stop-color="#9e6328"/></linearGradient>
  </defs>
  <circle cx="56" cy="58" r="54" fill="url(#cg)"/>
  <ellipse cx="56" cy="231" rx="42" ry="15" fill="#1a0c05" opacity=".7"/>
  <path d="M26 98 Q34 82 49 87 L76 87 Q88 87 88 103 L84 224 Q57 239 30 224Z" fill="url(#cw)" stroke="#744018" stroke-width="3"/>
  <path d="M37 93 Q43 113 49 97 Q57 116 62 94 Q71 110 77 91" fill="none" stroke="#fff1bd" stroke-width="4" opacity=".8"/>
  <path d="M58 87 C43 71 47 52 61 40 C76 54 72 72 58 87Z" fill="#ffb02e"/>
  <path d="M58 79 C51 68 53 58 60 51 C67 60 66 70 58 79Z" fill="#fff3a8"/>
  <rect x="56" y="77" width="3" height="13" rx="1" fill="#3a1a08"/>
</svg></div>

<div class="tavern-decor decor-book" aria-hidden="true">
<svg viewBox="0 0 220 330">
  <g transform="rotate(-5 110 165)">
    <path d="M25 35 Q111 13 192 35 L198 286 Q110 304 22 285Z" fill="#241209" stroke="#0c0502" stroke-width="8"/>
    <path d="M35 42 Q109 25 184 43 L187 275 Q110 291 31 275Z" fill="#3a1a0b" stroke="#8a4e1d" stroke-width="3"/>
    <path d="M52 66 Q111 52 168 66 L168 248 Q110 262 51 248Z" fill="#2b150a" stroke="#a2662b" stroke-width="2"/>
    <path d="M72 107 C92 84 129 84 149 108 C130 115 123 129 111 148 C100 129 92 115 72 107Z" fill="none" stroke="#b4772e" stroke-width="4"/>
    <text x="110" y="184" text-anchor="middle" font-family="Georgia" font-size="18" fill="#c99240">GREAT</text>
    <text x="110" y="207" text-anchor="middle" font-family="Georgia" font-size="18" fill="#c99240">STORIES</text>
    <text x="110" y="230" text-anchor="middle" font-family="Georgia" font-size="14" fill="#b77c32">ARE ROLLED</text>
    <text x="110" y="249" text-anchor="middle" font-family="Georgia" font-size="14" fill="#b77c32">TOGETHER</text>
  </g>
</svg></div>

<div class="tavern-decor decor-mug" aria-hidden="true">
<svg viewBox="0 0 160 235">
  <ellipse cx="76" cy="27" rx="52" ry="22" fill="#1b0d07" stroke="#6f3b17" stroke-width="6"/>
  <ellipse cx="76" cy="26" rx="43" ry="15" fill="#2c170b"/>
  <circle cx="52" cy="23" r="4" fill="#d29a55" opacity=".6"/><circle cx="72" cy="18" r="6" fill="#c78643" opacity=".5"/><circle cx="93" cy="27" r="4" fill="#e1af68" opacity=".5"/>
  <path d="M25 28 Q26 174 43 209 Q75 226 110 207 Q127 144 126 27Z" fill="#3a1b0c" stroke="#160904" stroke-width="7"/>
  <path d="M43 37 L48 194 M68 42 L69 209 M95 42 L92 207 M115 37 L108 194" stroke="#875024" stroke-width="4" opacity=".7"/>
  <path d="M123 61 Q157 66 150 109 Q145 145 124 145" fill="none" stroke="#311408" stroke-width="15"/>
  <path d="M128 69 Q147 73 142 107 Q138 130 126 132" fill="none" stroke="#835027" stroke-width="6"/>
  <rect x="23" y="73" width="105" height="9" rx="3" fill="#8a5529"/><rect x="28" y="159" width="94" height="9" rx="3" fill="#8a5529"/>
</svg></div>

<div class="tavern-decor decor-sword" aria-hidden="true">
<svg viewBox="0 0 190 470">
  <defs><linearGradient id="blade" x2="1"><stop stop-color="#4c4a45"/><stop offset=".5" stop-color="#d0c4a5"/><stop offset="1" stop-color="#4b4640"/></linearGradient></defs>
  <path d="M96 18 L126 318 L96 371 L67 318Z" fill="url(#blade)" stroke="#1e1510" stroke-width="5"/>
  <path d="M96 27 L98 330" stroke="#eee4c9" stroke-width="2" opacity=".5"/>
  <path d="M37 329 Q95 311 151 329 L143 350 Q95 338 47 350Z" fill="#7b4a1e" stroke="#2a1408" stroke-width="5"/>
  <rect x="86" y="343" width="20" height="85" rx="8" fill="#42200e" stroke="#1b0c05" stroke-width="5"/>
  <path d="M82 359 L110 371 M82 378 L110 390 M82 397 L110 409" stroke="#a36a2c" stroke-width="4"/>
  <circle cx="96" cy="438" r="19" fill="#7d4c1d" stroke="#2a1308" stroke-width="6"/>
</svg></div>

<div class="tavern-decor decor-dice" aria-hidden="true">
<svg viewBox="0 0 150 135">
  <path d="M31 44 L70 20 L111 43 L104 91 L66 117 L27 91Z" fill="#4b1f10" stroke="#170906" stroke-width="6"/>
  <path d="M70 20 L66 117 M31 44 L104 91 M111 43 L27 91" stroke="#c27e2b" stroke-width="3"/>
  <text x="69" y="77" text-anchor="middle" font-family="Georgia" font-size="22" fill="#e2ad4d">20</text>
  <path d="M105 86 L137 76 L145 108 L114 127Z" fill="#2a170d" stroke="#7a4d21" stroke-width="4"/>
  <circle cx="125" cy="101" r="4" fill="#d7a044"/><circle cx="135" cy="111" r="4" fill="#d7a044"/>
</svg></div>

<div class="tavern-decor decor-coins" aria-hidden="true">
<svg viewBox="0 0 135 150">
  <g fill="#9d5d15" stroke="#d49a32" stroke-width="3">
    <circle cx="49" cy="29" r="22"/><circle cx="82" cy="47" r="21"/><circle cx="40" cy="73" r="20"/><circle cx="88" cy="91" r="21"/><circle cx="52" cy="120" r="20"/>
  </g>
  <g fill="none" stroke="#4f2b0c" stroke-width="2">
    <circle cx="49" cy="29" r="12"/><path d="M45 20 L54 38 M57 23 L41 34"/>
    <circle cx="82" cy="47" r="12"/><path d="M74 47 H91 M82 38 V56"/>
    <circle cx="40" cy="73" r="11"/><path d="M31 73 H49"/>
    <circle cx="88" cy="91" r="12"/><path d="M82 83 L94 99 M94 83 L82 99"/>
    <circle cx="52" cy="120" r="11"/><path d="M45 114 L59 126 M59 114 L45 126"/>
  </g>
</svg></div>
<main class="shell">
<header class="topbar"><a class="brand" href="/library"><div class="mark">D20</div><div><h1>D&D Card Table</h1><small>Tabletop VTT</small></div></a>
<nav class="mainnav">
  <span class="nav-cluster"><span class="nav-cluster-label">Play</span><a href="/tabletop">Game Table</a><a href="/characters">Characters</a><a href="/encounters">Encounters</a></span>
  <span class="nav-cluster"><span class="nav-cluster-label">Library</span><a href="/library">Content</a><a href="/cards">Cards</a></span>
  <span class="nav-cluster"><span class="nav-cluster-label">Build</span><a href="/character-builder">Builder</a></span>
  <span class="nav-cluster"><span class="nav-cluster-label">System</span><a href="/builder-data">Builder Data</a></span>
</nav>
<div class="topbar-tools">
  <div class="theme-picker"><select id="theme-picker" aria-label="Theme"><option value="base">Base</option><option value="tavern">Tavern</option></select></div>
  <div class="language-picker"><select id="language-picker" aria-label="Language"><option value="ru">RU</option><option value="en">EN</option></select></div>
  <div class="status"><b>●</b><span>Local database connected</span></div>
</div></header>
${content}
<footer class="footer"><a href="/localization">Translation</a> · D&D Card Table v0.35.0</footer>
</main>
<script>
(()=>{
  const picker=document.getElementById("theme-picker");
  if(picker){
    picker.value=document.documentElement.dataset.theme||"base";
    picker.addEventListener("change",()=>{document.documentElement.dataset.theme=picker.value;localStorage.setItem("dnd-theme",picker.value);});
  }
  async function dataUrlFromFile(file){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=url;});
      const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      return canvas.toDataURL("image/webp",.86);
    } finally {URL.revokeObjectURL(url);}
  }
  window.uploadDndImage=async(endpoint,input)=>{
    const file=input.files?.[0]; if(!file)return;
    try{
      input.disabled=true;
      const data_url=await dataUrlFromFile(file);
      const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data_url,name:file.name})});
      if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||"Upload failed");
      location.reload();
    }catch(e){alert(e.message||String(e));input.disabled=false;}
  };
  window.removeDndImage=async(endpoint)=>{
    if(!confirm("Remove this image?"))return;
    const r=await fetch(endpoint,{method:"DELETE"});
    if(r.ok)location.reload(); else alert("Could not remove image");
  };
})();
</script>
</body></html>`;
}

async function getStats() {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE ce.entity_type = 'creature')::int AS creatures,
      COUNT(*) FILTER (WHERE ce.entity_type = 'spell')::int AS spells,
      COUNT(*) FILTER (WHERE ce.entity_type = 'item' AND i.item_kind = 'equipment')::int AS equipment,
      COUNT(*) FILTER (WHERE ce.entity_type = 'item' AND i.item_kind = 'magic_item')::int AS magic_items,
      COUNT(*) FILTER (WHERE ce.entity_type = 'condition')::int AS conditions,
      COUNT(*)::int AS total
    FROM content_entities ce
    LEFT JOIN items i ON i.entity_id = ce.id
  `;
  return rows[0];
}

function normalizeTab(value) {
  return TABS.some(([key]) => key === value) ? value : "creature";
}

async function listEntities({ tab, q, page }) {
  const offset=(page-1)*PAGE_SIZE;
  const term=String(q||"").trim().replace(/\s+/g," ").slice(0,120);
  const contains=`%${term}%`;
  const prefix=`${term}%`;
  const translatedAliases=russianSearchAliases(term);
  const translatedAliasLower=translatedAliases.length?translatedAliases.map(value=>value.toLowerCase()):["__no_translation_alias__"];

  const tabFilter = sql`
    (${tab}='all'
      OR (${tab}='creature' AND ce.entity_type='creature')
      OR (${tab}='spell' AND ce.entity_type='spell')
      OR (${tab}='condition' AND ce.entity_type='condition')
      OR (${tab}='equipment' AND ce.entity_type='item' AND i.item_kind='equipment')
      OR (${tab}='magic_item' AND ce.entity_type='item' AND i.item_kind='magic_item'))
  `;

  let matchSource="all";
  let total=0;

  if(!term){
    const countRows=await sql`
      SELECT COUNT(*)::int AS count
      FROM content_entities ce
      LEFT JOIN items i ON i.entity_id=ce.id
      WHERE ${tabFilter}
    `;
    total=countRows[0].count;
  }else{
    const nameCount=await sql`
      SELECT COUNT(*)::int AS count
      FROM content_entities ce
      LEFT JOIN items i ON i.entity_id=ce.id
      WHERE ${tabFilter}
        AND (ce.name_en ILIKE ${contains} OR LOWER(ce.name_en) IN ${sql(translatedAliasLower)})
    `;
    if(nameCount[0].count>0){
      matchSource="name";
      total=nameCount[0].count;
    }else{
      matchSource="description";
      const descriptionCount=await sql`
        SELECT COUNT(*)::int AS count
        FROM content_entities ce
        LEFT JOIN items i ON i.entity_id=ce.id
        WHERE ${tabFilter}
          AND COALESCE(ce.description_en,'') ILIKE ${contains}
      `;
      total=descriptionCount[0].count;
    }
  }

  const baseSelect=sql`
    SELECT
      ce.id::text,
      ce.entity_type,
      ce.name_en,
      ce.description_en,
      ce.ruleset,
      cs.document_key AS source_key,
      (ce.image_bytes IS NOT NULL) AS has_image,
      c.creature_type,
      c.challenge_rating,
      c.hit_points,
      c.armor_class,
      s.level AS spell_level,
      s.school,
      s.concentration,
      i.item_kind,
      i.item_type,
      i.category,
      i.rarity,
      i.requires_attunement,
      i.damage_dice,
      i.damage_type,
      i.magic_bonus,
      i.mastery
    FROM content_entities ce
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    LEFT JOIN creatures c ON c.entity_id=ce.id
    LEFT JOIN spells s ON s.entity_id=ce.id
    LEFT JOIN items i ON i.entity_id=ce.id
  `;

  let rows;

  if(matchSource==="name"){
    rows=await sql`
      ${baseSelect}
      WHERE ${tabFilter}
        AND (ce.name_en ILIKE ${contains} OR LOWER(ce.name_en) IN ${sql(translatedAliasLower)})
      ORDER BY
        CASE
          WHEN LOWER(ce.name_en)=LOWER(${term}) THEN 0
          WHEN ce.name_en ILIKE ${prefix} THEN 1
          ELSE 2
        END,
        POSITION(LOWER(${term}) IN LOWER(ce.name_en)),
        LENGTH(ce.name_en),
        ce.name_en
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  }else if(matchSource==="description"){
    rows=await sql`
      ${baseSelect}
      WHERE ${tabFilter}
        AND COALESCE(ce.description_en,'') ILIKE ${contains}
      ORDER BY
        POSITION(LOWER(${term}) IN LOWER(COALESCE(ce.description_en,''))),
        LENGTH(COALESCE(ce.description_en,'')),
        ce.name_en
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  }else{
    rows=await sql`
      ${baseSelect}
      WHERE ${tabFilter}
      ORDER BY ce.name_en
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `;
  }

  return {
    rows:rows.map(row=>({...row,match_source:matchSource})),
    total,
    matchSource
  };
}

function categoryLabel(row) {
  if (row.entity_type === "creature") return row.creature_type || "Creature";
  if (row.entity_type === "spell") return `Level ${row.spell_level ?? 0} ${row.school || "Spell"}`;
  if (row.entity_type === "condition") return "Condition";
  if (row.entity_type === "item") {
    if (row.item_type) return itemTypeLabel(row.item_type);
    if (row.item_kind === "magic_item") return row.rarity || "Magic Item";
    return row.category || "Equipment";
  }
  return "Entry";
}

function entityChips(row) {
  const chips = [];
  if (row.entity_type === "creature") {
    chips.push(`<span class="chip gold">CR ${esc(numberText(row.challenge_rating))}</span>`);
    chips.push(`<span class="chip">HP ${esc(row.hit_points ?? "—")}</span>`);
    chips.push(`<span class="chip">AC ${esc(acText(row.armor_class))}</span>`);
  } else if (row.entity_type === "spell") {
    chips.push(`<span class="chip gold">Level ${esc(row.spell_level ?? 0)}</span>`);
    if (row.school) chips.push(`<span class="chip">${esc(row.school)}</span>`);
    if (row.concentration) chips.push(`<span class="chip green">Concentration</span>`);
  } else if (row.entity_type === "item") {
    if (row.rarity) chips.push(`<span class="chip gold">${esc(row.rarity)}</span>`);
    if (row.damage_dice) chips.push(`<span class="chip">${esc(row.damage_dice)}${row.damage_type ? ` ${esc(row.damage_type)}` : ""}</span>`);
    else if (row.category) chips.push(`<span class="chip">${esc(row.category)}</span>`);
    if (row.magic_bonus !== null && row.magic_bonus !== undefined) chips.push(`<span class="chip gold">+${esc(row.magic_bonus)}</span>`);
    if (row.mastery) chips.push(`<span class="chip green">${esc(row.mastery)}</span>`);
    if (row.requires_attunement) chips.push(`<span class="chip green">Attunement</span>`);
  } else {
    chips.push(`<span class="chip">Rules Glossary</span>`);
  }
  if(row.match_source==="description") chips.push(`<span class="chip">description match</span>`);
  return chips.join("");
}

function card(row,lang="ru") {
  const mark=String(row.entity_type||"??").slice(0,2).toUpperCase();
  return `<a class="card" href="/entity/${encodeURIComponent(row.id)}">
    <div class="content-card-visual">${row.has_image?`<img src="/media/entity/${encodeURIComponent(row.id)}" alt="">`:`<div class="media-fallback">${esc(mark)}</div>`}</div>
    <div class="eyebrow"><span>${esc(categoryLabel(row))}</span><span>${esc(row.entity_type)}</span></div>
    <h3 data-i18n-skip>${esc(entityDisplayName(row,lang))}</h3>
    <p class="summary">${esc(truncate(plainRulesText(displayText(row.description_en,{ruleset:row.ruleset,kind:row.content_kind||row.entity_type,source:row.source_key})) || "Open entry to view complete game data."))}</p>
    <div class="chips">${entityChips(row)}</div>
  </a>`;
}

async function libraryPage(url,lang="ru") {
  const tab=normalizeTab(url.searchParams.get("tab")||"creature");
  const q=(url.searchParams.get("q")||"").trim().replace(/\s+/g," ").slice(0,120);
  const page=Math.max(1,Number.parseInt(url.searchParams.get("page")||"1",10)||1);

  const [{rows,total,matchSource},stats]=await Promise.all([
    listEntities({tab,q,page}),
    getStats()
  ]);

  const maxPage=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const safePage=Math.min(page,maxPage);
  const params=new URLSearchParams({tab});
  if(q)params.set("q",q);
  const prevParams=new URLSearchParams(params);prevParams.set("page",String(Math.max(1,safePage-1)));
  const nextParams=new URLSearchParams(params);nextParams.set("page",String(Math.min(maxPage,safePage+1)));

  const content=`
    <section class="hero tavern-scroll"><div><h2>Content Library</h2><p>Imported SRD content normalized into one local database. Search stays inside the selected content category, checks names first, and falls back to descriptions only when no name matches.</p></div><div><span class="count">${esc(total)}</span><span class="count-label">matches</span></div></section>
    <nav class="tabs">${TABS.map(([key,label])=>`<a class="${tab===key?"tab active":"tab"}" href="/library?tab=${key}${q?`&q=${encodeURIComponent(q)}`:""}">${esc(label)}${key==="creature"?` · ${stats.creatures}`:key==="spell"?` · ${stats.spells}`:key==="equipment"?` · ${stats.equipment}`:key==="magic_item"?` · ${stats.magic_items}`:key==="condition"?` · ${stats.conditions}`:""}</a>`).join("")}</nav>
    <form class="toolbar" method="get" action="/library" id="content-search-form">
      <input type="hidden" name="tab" value="${esc(tab)}">
      <div class="search catalog-search-wrap">
        <input id="content-search-input" aria-label="Search" type="search" name="q" value="${esc(q)}" placeholder="Search ${esc(TABS.find(([key])=>key===tab)?.[1]||"content")}…" autocomplete="off" aria-autocomplete="list" aria-controls="content-search-suggestions">
        <div id="content-search-suggestions" class="search-suggestions" role="listbox"></div>
        <button type="submit">Search</button>
      </div>
      ${q?`<a class="button secondary" href="/library?tab=${tab}">Clear</a>`:""}
    </form>
    ${q&&matchSource==="description"?`<div class="small-note" style="margin-bottom:12px">No matching names in this category. Showing matches found in descriptions.</div>`:""}
    ${rows.length?`<section class="grid">${rows.map(row=>card(row,lang)).join("")}</section>`:`<div class="empty">Nothing matched this search.</div>`}
    <div class="pager"><span>Page ${safePage} of ${maxPage} · ${total} entries</span><div class="pager-actions"><a class="button secondary ${safePage<=1?"disabled":""}" href="/library?${prevParams}">Previous</a><a class="button secondary ${safePage>=maxPage?"disabled":""}" href="/library?${nextParams}">Next</a></div></div>

    <script>
    (() => {
      const input=document.getElementById('content-search-input');
      const box=document.getElementById('content-search-suggestions');
      if(!input||!box)return;
      const tab=${JSON.stringify(tab)};
      let timer=null,items=[],selected=-1,requestNumber=0,activeController=null;

      const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      const close=()=>{box.classList.remove('open');box.innerHTML='';items=[];selected=-1;};
      const selectIndex=index=>{
        selected=index;
        items.forEach((el,i)=>el.classList.toggle('selected',i===selected));
        if(items[selected])items[selected].scrollIntoView({block:'nearest'});
      };

      async function update(){
        const q=input.value.trim().replace(/\s+/g,' ');
        if(!q){
          requestNumber++;
          activeController?.abort();
          activeController=null;
          close();
          return;
        }

        const myRequest=++requestNumber;
        activeController?.abort();
        const controller=new AbortController();
        activeController=controller;

        try{
          const res=await fetch('/api/content-search?q='+encodeURIComponent(q)+'&tab='+encodeURIComponent(tab),{signal:controller.signal,cache:'no-store'});
          if(!res.ok)return;
          const data=await res.json();

          if(myRequest!==requestNumber||input.value.trim().replace(/\s+/g,' ')!==q)return;

          box.innerHTML=data.map(x=>{
            const snippet=x.match_source==='description'&&x.snippet?'<small>'+escapeHtml(x.snippet)+'</small>':'';
            const source=x.match_source==='description'?'description':escapeHtml(x.label||x.entity_type);
            return '<a class="search-suggestion" role="option" href="/entity/'+encodeURIComponent(x.id)+'"><span class="search-suggestion-main"><b>'+escapeHtml(x.name)+'</b>'+snippet+'</span><span class="suggestion-meta">'+source+'</span></a>';
          }).join('');

          items=[...box.querySelectorAll('.search-suggestion')];
          selected=-1;
          box.classList.toggle('open',items.length>0);
        }catch(error){
          if(error?.name!=='AbortError'&&myRequest===requestNumber)close();
        }
      }

      input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,120);});
      input.addEventListener('focus',()=>{if(input.value.trim())update();});
      input.addEventListener('keydown',e=>{
        if(!box.classList.contains('open'))return;
        if(e.key==='ArrowDown'){e.preventDefault();selectIndex(Math.min(items.length-1,selected+1));}
        else if(e.key==='ArrowUp'){e.preventDefault();selectIndex(Math.max(0,selected-1));}
        else if(e.key==='Escape'){close();}
        else if(e.key==='Enter'&&selected>=0&&items[selected]){e.preventDefault();location.href=items[selected].href;}
      });
      document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==input)close();});
    })();
    </script>`;

  return layout({title:"Library",content,activeTab:tab,query:q});
}

async function getEntity(id) {
  const rows = await sql`
    SELECT
      ce.id::text,
      ce.entity_type,
      ce.name_en,
      ce.description_en,
      ce.ruleset,
      ce.raw_source,
      (ce.image_bytes IS NOT NULL) AS has_image,
      cs.name AS source_name,
      cs.document_key AS source_key,
      cs.license_code,
      c.*,
      s.level AS spell_level,
      s.school,
      s.casting_time,
      s.range_text,
      s.duration,
      s.ritual,
      s.concentration,
      s.components,
      s.material,
      s.attack_type AS spell_attack_type,
      s.saving_throw_ability,
      s.damage AS spell_damage,
      s.area_of_effect,
      s.higher_levels_en,
      s.classes,
      i.item_kind,
      i.category,
      i.subcategory,
      i.rarity,
      i.requires_attunement,
      i.attunement_detail,
      i.cost,
      i.weight,
      i.damage AS item_damage,
      i.armor AS item_armor,
      i.properties,
      i.item_type,
      i.weapon_category,
      i.damage_dice,
      i.versatile_damage_dice,
      i.damage_type,
      i.normal_range,
      i.long_range,
      i.mastery,
      i.armor_class_base,
      i.dex_bonus_mode,
      i.max_dex_bonus,
      i.strength_requirement,
      i.stealth_disadvantage,
      i.magic_bonus,
      i.consumable,
      i.base_item_name,
      i.charges,
      i.detail_source,
      i.canonical_data,
      i.audit_sources,
      i.audit_status,
      i.audited_at,
      co.mechanics AS condition_mechanics
    FROM content_entities ce
    LEFT JOIN content_sources cs ON cs.id = ce.source_id
    LEFT JOIN creatures c ON c.entity_id = ce.id
    LEFT JOIN spells s ON s.entity_id = ce.id
    LEFT JOIN items i ON i.entity_id = ce.id
    LEFT JOIN conditions co ON co.entity_id = ce.id
    WHERE ce.id = ${id}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const [actions, traits, tags] = await Promise.all([
    sql`SELECT action_type, name_en, description_en, raw_data FROM entity_actions WHERE entity_id=${id} ORDER BY sort_order, name_en`,
    sql`SELECT trait_type, name_en, description_en, mechanics, raw_data FROM entity_traits WHERE entity_id=${id} ORDER BY sort_order, name_en`,
    sql`SELECT tag FROM entity_tags WHERE entity_id=${id} ORDER BY tag`
  ]);
  return { entity: rows[0], actions, traits, tags: tags.map(t => t.tag) };
}

function kv(entries) {
  return `<dl class="kv">${entries.filter(([,v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v)&&v.length===0)).map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(pretty(v))}</dd>`).join("")}</dl>`;
}

function blocks(title, rows) {
  if (!rows?.length) return "";
  return `<section class="section"><h3>${esc(title)}</h3><div class="blocks">${rows.map(row => `<div class="block"><div class="block-title">${esc(row.name_en)}${row.action_type?` <span class="chip">${esc(row.action_type)}</span>`:""}</div>${row.description_en?`<p>${esc(displayText(row.description_en,{ruleset:row.ruleset,kind:row.content_kind||row.entity_type,source:row.source_key}))}</p>`:""}</div>`).join("")}</div></section>`;
}

function creatureDetail(e, traits, actions) {
  const statNames = [["STR",e.strength],["DEX",e.dexterity],["CON",e.constitution],["INT",e.intelligence],["WIS",e.wisdom],["CHA",e.charisma]];
  return `
    <section class="section"><div class="stats"><div class="stat"><b>Armor Class</b><span>${esc(acText(e.armor_class))}</span></div><div class="stat"><b>Hit Points</b><span>${esc(e.hit_points ?? "—")}${e.hit_dice?` <small class="stat-note">(${esc(e.hit_dice)})</small>`:""}</span></div><div class="stat"><b>Challenge</b><span>${esc(numberText(e.challenge_rating))}</span></div></div></section>
    <section class="section"><div class="abilities">${statNames.map(([n,v])=>`<div class="ability"><b>${n}</b><span>${esc(abilityText(v))}</span></div>`).join("")}</div></section>
    ${blocks("Traits", traits)}${blocks("Actions", actions)}`;
}

function spellDetail(e) {
  return `<section class="section"><div class="stats"><div class="stat"><b>Level</b><span>${esc(e.spell_level ?? 0)}</span></div><div class="stat"><b>School</b><span>${esc(e.school || "—")}</span></div><div class="stat"><b>Range</b><span>${esc(e.range_text || "—")}</span></div></div></section>${e.higher_levels_en?`<section class="section"><h3>At Higher Levels</h3><div class="description rules-text">${renderRulesText(e.higher_levels_en)}</div></section>`:""}`;
}

async function entityPage(id, lang=displayContext.getStore()?.language||"ru") {
  const data = await getEntity(id);
  if (!data) return { status: 404, body: layout({ title: "Not found", content: `<a class="back" href="/library">← Library</a><div class="empty">Entry not found.</div>` }) };
  const { entity: e, traits, actions, tags } = data;
  Object.assign(displayContext.getStore()||{}, {ruleset:e.ruleset,kind:e.entity_type,source:e.source_key});

  let mainExtra = "";
  let sideEntries = [["Type", e.entity_type], ["Ruleset", e.ruleset], ["Source", e.source_name], ["License", e.license_code]];
  if (e.entity_type === "creature") {
    mainExtra = creatureDetail(e, traits, actions);
    sideEntries = [
      ["Creature type", e.creature_type],
      ["Size", e.size],
      ["Alignment", e.alignment],
      ["Speed", speedText(e.speed)],
      ["Saving Throws", bonusesText(e.saving_throws)],
      ["Skills", bonusesText(e.skills)],
      ["Damage Vulnerabilities", e.damage_vulnerabilities],
      ["Damage Resistances", e.damage_resistances],
      ["Damage Immunities", e.damage_immunities],
      ["Condition Immunities", e.condition_immunities],
      ["Languages", e.languages],
      ["Senses", sensesText(e.senses)],
      ["Proficiency Bonus", e.proficiency_bonus == null ? null : `${Number(e.proficiency_bonus) >= 0 ? "+" : ""}${e.proficiency_bonus}`],
      ["XP", e.experience_points],
      ...sideEntries
    ];
  } else if (e.entity_type === "spell") {
    mainExtra = spellDetail(e);
    sideEntries = [["Casting time", e.casting_time],["Duration", e.duration],["Components", e.components],["Material", e.material],["Concentration", e.concentration],["Ritual", e.ritual],["Save", e.saving_throw_ability],["Damage", e.spell_damage],["Classes", spellClassNames(e.classes).join(", ")], ...sideEntries];
  } else if (e.entity_type === "item") {
    mainExtra = itemDetail(e);
    sideEntries = [
      ["Kind", e.item_kind],
      ["Item type", itemTypeLabel(effectiveEntityItemType(e))],
      ["Category", e.category],
      ["Subcategory", e.subcategory],
      ["Rarity", e.rarity],
      ["Attunement", e.requires_attunement ? (e.attunement_detail || "Required") : "No"],
      ["Cost", costText(e.cost)],
      ["Weight", e.weight == null ? null : `${numberText(e.weight)} lb.`],
      ["Properties", propertiesText(e.properties)],
      ["Verification", e.audit_status ? e.audit_status.replaceAll("-"," ") : null],
      ...sideEntries
    ];
  } else if (e.entity_type === "condition") {
    sideEntries = [["Mechanics", e.condition_mechanics], ...sideEntries];
  }

  const content = `<a class="back" href="/library">← Back to library</a>
    <section class="detail-head"><div><div class="eyebrow"><span>${esc(e.entity_type)}</span><span>${esc(e.ruleset)}</span></div><h2 data-i18n-skip>${esc(entityDisplayName(e,lang,e.entity_type))}</h2><div class="chips">${tags.slice(0,8).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}</div></div><div class="cta-row"><form class="inline-form" method="post" action="/cards/from-entity/${encodeURIComponent(e.id)}"><button class="primary-action" type="submit">Create / refresh card</button></form><a class="button secondary" href="/cards">Card Library</a></div></section>
    <div class="detail-layout"><article>${e.description_en?`<section class="section"><h3>Description</h3><div class="description rules-text">${renderRulesText(e.description_en)}</div></section>`:""}${mainExtra}</article><aside><div class="aside-card">${kv(sideEntries)}<details class="raw"><summary>Raw imported source</summary><pre>${esc(JSON.stringify(e.raw_source,null,2))}</pre></details></div></aside></div>`;
  return { status: 200, body: layout({ title: e.name_en, content }) };
}

async function apiEntity(id) {
  const data = await getEntity(id);
  return data;
}



function firstDiceFormula(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const match = text.match(/\b\d{1,3}d\d{1,4}(?:\s*[+-]\s*\d+)?\b/i);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function safeCardClass(cardType) {
  const type = String(cardType || "item").toLowerCase();
  if (type.includes("monster") || type.includes("creature")) return "monster";
  if (type.includes("spell")) return "spell";
  if (type.includes("condition")) return "condition";
  if (type.includes("weapon") || type.includes("armor") || type==="shield" || type.includes("ammunition") || type.includes("item")) return "weapon";
  return "item";
}

function cardEntityKind(card) {
  const explicit=String(card?.entity_type||card?.content_kind||card?.data?.entityType||"").trim();
  if(explicit)return explicit;
  const type=String(card?.card_type||"").toLowerCase();
  if(type.includes("monster")||type.includes("creature"))return "creature";
  if(type.includes("spell"))return "spell";
  if(type.includes("condition"))return "condition";
  return "item";
}

function cardDisplayName(card,lang="ru") {
  const kind=cardEntityKind(card);
  return entityDisplayName({
    name_en:card?.name_en??card?.name??"",
    ruleset:card?.ruleset||card?.data?.ruleset||null,
    content_kind:kind,
    source_key:card?.source_key||null
  },lang,kind);
}

function buildCardSnapshot(data) {
  const { entity: e, actions, traits } = data;
  const base = {
    sourceEntityId: e.id,
    entityType: e.entity_type,
    ruleset: e.ruleset,
    source: e.source_name
  };
  let cardType = e.entity_type;
  let subtitle = e.entity_type;
  let cardData = { ...base };
  let cardActions = [];

  if (e.entity_type === "creature") {
    cardType = "monster";
    subtitle = `${e.creature_type || "Creature"} · CR ${numberText(e.challenge_rating)}`;
    cardData = {
      ...base,
      ac: acText(e.armor_class), hp: e.hit_points, hitDice: e.hit_dice,
      challengeRating: numberText(e.challenge_rating), creatureType: e.creature_type,
      size: e.size, speed: speedText(e.speed),
      abilities: { STR:e.strength, DEX:e.dexterity, CON:e.constitution, INT:e.intelligence, WIS:e.wisdom, CHA:e.charisma },
      traits: (traits || []).map(t => ({ name:t.name_en, description:t.description_en }))
    };
    cardActions = (actions || []).map(a => ({
      name: a.name_en,
      kind: a.action_type || "action",
      description: a.description_en || "",
      formula: firstDiceFormula(a.raw_data) || firstDiceFormula(a.description_en)
    }));
  } else if (e.entity_type === "spell") {
    cardType = "spell";
    subtitle = `Level ${e.spell_level ?? 0} · ${e.school || "Spell"}`;
    cardData = {
      ...base,
      level:e.spell_level, school:e.school, castingTime:e.casting_time,
      range:e.range_text, duration:e.duration, ritual:e.ritual,
      concentration:e.concentration, components:e.components, material:e.material,
      save:e.saving_throw_ability, damage:e.spell_damage, area:e.area_of_effect,
      classes:e.classes
    };
    cardActions = [{
      name: "Cast",
      kind: "cast",
      description: e.description_en || "",
      formula: firstDiceFormula(e.spell_damage) || firstDiceFormula(e.description_en)
    }];
  } else if (e.entity_type === "item") {
    const type = effectiveEntityItemType(e);
    cardType = type;
    subtitle = [itemTypeLabel(type), e.rarity].filter(Boolean).join(" · ");
    cardData = {
      ...base,
      itemType:type, category:e.category, weaponCategory:e.weapon_category, rarity:e.rarity, attunement:e.requires_attunement,
      cost:costText(e.cost), weight:e.weight, damageDice:e.damage_dice,
      versatileDamageDice:e.versatile_damage_dice, damageType:e.damage_type,
      range:rangeText(e.normal_range, e.long_range), mastery:e.mastery,
      armorClass:e.armor_class_base, dexBonusMode:e.dex_bonus_mode, maxDexBonus:e.max_dex_bonus,
      strengthRequirement:e.strength_requirement, stealthDisadvantage:e.stealth_disadvantage,
      magicBonus:e.magic_bonus, consumable:e.consumable, charges:e.charges,
      properties:e.properties, baseItem:e.base_item_name,
      canonical:e.canonical_data, auditStatus:e.audit_status
    };
    const weaponish = ["weapon","magic_weapon","ammunition","magic_ammunition"].includes(type);
    const armorish = ["armor","magic_armor","shield"].includes(type);
    if (weaponish && e.damage_dice) {
      cardActions.push({ name:"Roll base damage", kind:"damage", description:"Base weapon dice only. Character ability modifiers are added later by the Character Engine.", formula:e.damage_dice });
      if (e.versatile_damage_dice) cardActions.push({ name:"Roll versatile damage", kind:"damage", description:"Versatile base weapon dice only.", formula:e.versatile_damage_dice });
    } else if (armorish) {
      cardActions.push({ name:"Equip", kind:"equip", description:"Equipment state will be connected to characters in the next stage.", formula:null });
    } else if (e.consumable) {
      cardActions.push({ name:"Use", kind:"use", description:"Resource consumption will be connected to card instances later.", formula:firstDiceFormula(e.description_en) });
    }
  } else if (e.entity_type === "condition") {
    cardType = "condition";
    subtitle = "Condition";
    cardData = { ...base, mechanics:e.condition_mechanics };
  }

  return {
    sourceEntityId: e.id,
    cardType,
    name: e.name_en,
    subtitle,
    description: e.description_en || "",
    data: cardData,
    actions: cardActions
  };
}

async function upsertCardFromEntity(entityId) {
  const data = await getEntity(entityId);
  if (!data) return null;
  const card = buildCardSnapshot(data);
  const rows = await sql`
    INSERT INTO card_templates (
      source_entity_id, card_type, name_en, subtitle_en, description_en, data, actions, is_system, updated_at
    ) VALUES (
      ${card.sourceEntityId}, ${card.cardType}, ${card.name}, ${card.subtitle}, ${card.description},
      ${sql.json(card.data)}, ${sql.json(card.actions)}, TRUE, NOW()
    )
    ON CONFLICT (source_entity_id) WHERE source_entity_id IS NOT NULL
    DO UPDATE SET
      card_type=EXCLUDED.card_type,
      name_en=EXCLUDED.name_en,
      subtitle_en=EXCLUDED.subtitle_en,
      description_en=EXCLUDED.description_en,
      data=EXCLUDED.data,
      actions=EXCLUDED.actions,
      updated_at=NOW()
    RETURNING id::text
  `;
  return rows[0]?.id ?? null;
}

async function listCards(q="",lang="ru") {
  const term=String(q||"").trim().replace(/\s+/g," ").slice(0,120);

  if(!term){
    return sql`
      SELECT ct.id::text,ct.card_type,ct.name_en,ct.subtitle_en,ct.description_en,
             ct.data,ct.actions,ct.updated_at,ce_src.entity_type,ce_src.ruleset,
             cs_src.document_key AS source_key,
             (ct.image_bytes IS NOT NULL OR EXISTS(SELECT 1 FROM content_entities ce_img WHERE ce_img.id=ct.source_entity_id AND ce_img.image_bytes IS NOT NULL)) AS has_image,
             (SELECT COUNT(*)::int FROM card_instances ci WHERE ci.template_id=ct.id) AS instance_count,
             'all'::text AS match_source
      FROM card_templates ct
      LEFT JOIN content_entities ce_src ON ce_src.id=ct.source_entity_id
      LEFT JOIN content_sources cs_src ON cs_src.id=ce_src.source_id
      ORDER BY ct.name_en
      LIMIT 200
    `;
  }

  const contains=`%${term}%`;
  const prefix=`${term}%`;
  const aliases=lang==="ru"?russianSearchAliases(term):[];
  const aliasLower=aliases.length?aliases.map(value=>value.toLowerCase()):["__no_translation_alias__"];

  const titleRows=await sql`
    SELECT ct.id::text,ct.card_type,ct.name_en,ct.subtitle_en,ct.description_en,
           ct.data,ct.actions,ct.updated_at,ce_src.entity_type,ce_src.ruleset,
           cs_src.document_key AS source_key,
           (ct.image_bytes IS NOT NULL OR EXISTS(SELECT 1 FROM content_entities ce_img WHERE ce_img.id=ct.source_entity_id AND ce_img.image_bytes IS NOT NULL)) AS has_image,
           (SELECT COUNT(*)::int FROM card_instances ci WHERE ci.template_id=ct.id) AS instance_count,
           'name'::text AS match_source
    FROM card_templates ct
    LEFT JOIN content_entities ce_src ON ce_src.id=ct.source_entity_id
    LEFT JOIN content_sources cs_src ON cs_src.id=ce_src.source_id
    WHERE ct.name_en ILIKE ${contains} OR LOWER(ct.name_en) IN ${sql(aliasLower)}
    ORDER BY
      CASE
        WHEN LOWER(ct.name_en)=LOWER(${term}) THEN 0
        WHEN LOWER(ct.name_en) IN ${sql(aliasLower)} THEN 1
        WHEN ct.name_en ILIKE ${prefix} THEN 2
        ELSE 3
      END,
      POSITION(LOWER(${term}) IN LOWER(ct.name_en)),
      LENGTH(ct.name_en),
      ct.name_en
    LIMIT 200
  `;

  if(titleRows.length)return titleRows;

  return sql`
    SELECT ct.id::text,ct.card_type,ct.name_en,ct.subtitle_en,ct.description_en,
           ct.data,ct.actions,ct.updated_at,ce_src.entity_type,ce_src.ruleset,
           cs_src.document_key AS source_key,
           (ct.image_bytes IS NOT NULL OR EXISTS(SELECT 1 FROM content_entities ce_img WHERE ce_img.id=ct.source_entity_id AND ce_img.image_bytes IS NOT NULL)) AS has_image,
           (SELECT COUNT(*)::int FROM card_instances ci WHERE ci.template_id=ct.id) AS instance_count,
           'description'::text AS match_source
    FROM card_templates ct
    LEFT JOIN content_entities ce_src ON ce_src.id=ct.source_entity_id
    LEFT JOIN content_sources cs_src ON cs_src.id=ce_src.source_id
    WHERE COALESCE(ct.description_en,'') ILIKE ${contains}
    ORDER BY
      POSITION(LOWER(${term}) IN LOWER(COALESCE(ct.description_en,''))),
      LENGTH(COALESCE(ct.description_en,'')),
      ct.name_en
    LIMIT 200
  `;
}

async function getCardTemplate(id) {
  const rows = await sql`
    SELECT ct.id::text, ct.source_entity_id::text, ct.card_type, ct.name_en, ct.subtitle_en,
           ct.description_en, ct.data, ct.actions, ct.created_at, ct.updated_at,
           ce_src.entity_type,ce_src.ruleset,cs_src.document_key AS source_key,
           (ct.image_bytes IS NOT NULL OR EXISTS(SELECT 1 FROM content_entities ce_img WHERE ce_img.id=ct.source_entity_id AND ce_img.image_bytes IS NOT NULL)) AS has_image,
           (SELECT COUNT(*)::int FROM card_instances ci WHERE ci.template_id=ct.id) AS instance_count
    FROM card_templates ct
    LEFT JOIN content_entities ce_src ON ce_src.id=ct.source_entity_id
    LEFT JOIN content_sources cs_src ON cs_src.id=ce_src.source_id
    WHERE ct.id = ${id}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const instances = await sql`
    SELECT ci.id::text, ci.owner_type, ci.owner_ref, ci.quantity, ci.state, ci.created_at,
           ch.name AS owner_name
    FROM card_instances ci
    LEFT JOIN characters ch ON ci.owner_type='character' AND ch.id::text=ci.owner_ref
    WHERE ci.template_id=${id} ORDER BY ci.created_at DESC LIMIT 30
  `;
  return { card: rows[0], instances };
}

function cardDataRows(card) {
  const d = card.data || {};
  const type = String(card.card_type || "");
  if (type === "monster") return [["AC", d.ac],["HP", d.hp],["CR", d.challengeRating],["Speed", d.speed]];
  if (type === "spell") return [["Level", d.level],["Range", d.range],["Save", d.save],["Concentration", d.concentration ? "Yes" : null]];
  if (type.includes("weapon") || type.includes("ammunition")) return [["Damage", [d.damageDice,d.damageType].filter(Boolean).join(" ")],["Versatile", d.versatileDamageDice],["Mastery", d.mastery],["Magic", d.magicBonus != null ? `+${d.magicBonus}` : null]];
  if (type.includes("armor") || type === "shield") return [["AC", d.armorClass],["STR", d.strengthRequirement],["Stealth", d.stealthDisadvantage ? "Disadvantage" : null],["Rarity", d.rarity]];
  return [["Rarity", d.rarity],["Category", d.category],["Magic Bonus", d.magicBonus != null ? `+${d.magicBonus}` : null],["Charges", d.charges ? pretty(d.charges) : null]];
}

function renderGameCard(card, { link = true, showActions = true, lang = displayContext.getStore()?.language||"ru" } = {}) {
  const cls = safeCardClass(card.card_type);
  const displayName=cardDisplayName(card,lang);
  const localization={ruleset:card.ruleset||card.data?.ruleset||null,kind:cardEntityKind(card),source:card.source_key||null};
  const rows = cardDataRows(card).filter(([,v]) => v !== null && v !== undefined && v !== "" && v !== "—").slice(0,4);
  const actions = Array.isArray(card.actions) ? card.actions : [];
  const body = `<div class="game-card ${esc(cls)}">
    <div class="game-card-art">${card.has_image?`<img src="/media/card/${encodeURIComponent(card.id)}" alt="">`:`<div class="media-fallback">${esc(String(card.card_type||"C").slice(0,2).toUpperCase())}</div>`}</div>
    <div class="game-card-head"><div class="game-card-type">${esc(itemTypeLabel(card.card_type))}</div><h3 data-i18n-skip>${esc(displayName)}</h3>${lang==="ru"&&displayName!==card.name_en?`<div class="localized-original-name" data-i18n-skip>${esc(card.name_en)}</div>`:""}<div class="game-card-sub">${esc(card.subtitle_en || "")}</div></div>
    <div class="game-card-body">
      ${rows.length ? `<div class="game-card-stats">${rows.map(([k,v])=>`<div class="mini-stat"><b>${esc(k)}</b><span>${esc(pretty(v))}</span></div>`).join("")}</div>` : ""}
      <div class="card-copy">${esc(truncate(plainRulesText(displayText(card.description_en,localization)), 260))}</div>
      ${showActions && actions.length ? `<div class="card-action-list">${actions.slice(0,5).map(a=>`<div class="card-action"><div class="card-action-title">${esc(a.name || "Action")}</div>${a.description?`<p>${esc(truncate(a.description,120))}</p>`:""}${a.formula?`<form class="roll-form" method="post" action="/roll"><input type="hidden" name="formula" value="${esc(a.formula)}"><input type="hidden" name="label" value="${esc(`${card.name_en} — ${a.name}`)}"><input type="hidden" name="back" value="/card/${esc(card.id)}"><button type="submit">Roll ${esc(a.formula)}</button></form>`:""}</div>`).join("")}</div>` : ""}
    </div>
  </div>`;
  return link ? `<a href="/card/${encodeURIComponent(card.id)}" class="game-card-wrap">${body}</a>` : body;
}

async function cardsPage(url,lang="ru") {
  const q=(url.searchParams.get("q")||"").trim().replace(/\s+/g," ").slice(0,120);
  const cards=await listCards(q,lang);
  const descriptionFallback=q&&cards.length&&cards[0].match_source==="description";

  const content=`<section class="hero tavern-scroll"><div><h2>Card Library</h2><p>Card templates generated from normalized D&D content. Search names first; if none match, the search falls back to card descriptions.</p></div><div><span class="count">${cards.length}</span><span class="count-label">cards</span></div></section>
    <form class="toolbar" method="get" action="/cards">
      <div class="search catalog-search-wrap">
        <input id="card-search-input" type="search" name="q" value="${esc(q)}" placeholder="Search cards…" autocomplete="off" aria-autocomplete="list" aria-controls="card-search-suggestions">
        <div id="card-search-suggestions" class="search-suggestions" role="listbox"></div>
        <button type="submit">Search</button>
      </div>
      <a class="button secondary" href="/library">Create from content</a>
    </form>
    ${descriptionFallback?`<div class="small-note" style="margin-bottom:12px">No matching card names. Showing matches found in descriptions.</div>`:""}
    ${cards.length?`<section class="card-library-grid">${cards.map(c=>`<div class="game-card-wrap">${renderGameCard(c,{link:false,showActions:false,lang})}<div class="card-footer-actions"><span class="card-count">${c.instance_count} instances${c.match_source==="description"?" · description match":""}</span><a class="button secondary" href="/card/${encodeURIComponent(c.id)}">Open card</a></div></div>`).join("")}</section>`:`<div class="empty"><b>No cards matched.</b><br><br>Open an entry in the Content Library and choose “Create / refresh card”.</div>`}

    <script>
    (() => {
      const input=document.getElementById('card-search-input');
      const box=document.getElementById('card-search-suggestions');
      if(!input||!box)return;
      let timer=null,items=[],selected=-1,requestNumber=0,activeController=null;

      const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      const close=()=>{box.classList.remove('open');box.innerHTML='';items=[];selected=-1;};
      const selectIndex=index=>{
        selected=index;
        items.forEach((el,i)=>el.classList.toggle('selected',i===selected));
        if(items[selected])items[selected].scrollIntoView({block:'nearest'});
      };

      async function update(){
        const q=input.value.trim().replace(/\s+/g,' ');
        if(!q){
          requestNumber++;
          activeController?.abort();
          activeController=null;
          close();
          return;
        }

        const myRequest=++requestNumber;
        activeController?.abort();
        const controller=new AbortController();
        activeController=controller;

        try{
          const res=await fetch('/api/card-search?q='+encodeURIComponent(q),{signal:controller.signal,cache:'no-store'});
          if(!res.ok)return;
          const data=await res.json();
          if(myRequest!==requestNumber||input.value.trim().replace(/\s+/g,' ')!==q)return;

          box.innerHTML=data.map(x=>{
            const snippet=x.match_source==='description'&&x.snippet?'<small>'+escapeHtml(x.snippet)+'</small>':'';
            const source=x.match_source==='description'?'description':escapeHtml(x.card_type||'card');
            return '<a class="search-suggestion" role="option" href="/card/'+encodeURIComponent(x.id)+'"><span class="search-suggestion-main"><b>'+escapeHtml(x.name)+'</b>'+snippet+'</span><span class="suggestion-meta">'+source+'</span></a>';
          }).join('');

          items=[...box.querySelectorAll('.search-suggestion')];
          selected=-1;
          box.classList.toggle('open',items.length>0);
        }catch(error){
          if(error?.name!=='AbortError'&&myRequest===requestNumber)close();
        }
      }

      input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,120);});
      input.addEventListener('focus',()=>{if(input.value.trim())update();});
      input.addEventListener('keydown',e=>{
        if(!box.classList.contains('open'))return;
        if(e.key==='ArrowDown'){e.preventDefault();selectIndex(Math.min(items.length-1,selected+1));}
        else if(e.key==='ArrowUp'){e.preventDefault();selectIndex(Math.max(0,selected-1));}
        else if(e.key==='Escape'){close();}
        else if(e.key==='Enter'&&selected>=0&&items[selected]){e.preventDefault();location.href=items[selected].href;}
      });
      document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==input)close();});
    })();
    </script>`;

  return layout({title:"Cards",content});
}

async function cardPage(id,lang="ru") {
  const result = await getCardTemplate(id);
  if (!result) return { status:404, body:layout({title:"Card not found",content:`<a class="back" href="/cards">← Cards</a><div class="empty">Card not found.</div>`}) };
  const { card, instances } = result;
  const displayName=cardDisplayName(card,lang);
  const characters = await listCharacters();
  const actions = Array.isArray(card.actions) ? card.actions : [];
  const content = `<a class="back" href="/cards">← Card Library</a><section class="detail-head"><div><div class="eyebrow"><span>Card Template</span><span>${esc(card.card_type)}</span></div><h2 data-i18n-skip>${esc(displayName)}</h2>${lang==="ru"&&displayName!==card.name_en?`<div class="localized-original-name" data-i18n-skip>${esc(card.name_en)}</div>`:""}<div class="meta">${esc(card.subtitle_en || "")}</div></div><div class="media-tools">${card.source_entity_id?`<a class="button secondary" href="/entity/${encodeURIComponent(card.source_entity_id)}">Source content</a>`:""}<label class="button secondary">Upload card art<input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadDndImage('/api/card/${encodeURIComponent(card.id)}/image',this)"></label>${card.has_image?`<button class="button secondary" type="button" onclick="removeDndImage('/api/card/${encodeURIComponent(card.id)}/image')">Remove override</button>`:""}</div></section>
  <div class="card-detail-grid"><div>${renderGameCard(card,{link:false,showActions:true})}<div class="small-note">Dice buttons currently roll only fixed formulas such as 1d8 or 2d6+3. Character ability modifiers come in the Character Engine.</div></div><div class="card-panel"><h3>Template & Instances</h3><p class="summary">Templates describe what a card is. Instances are concrete copies that can later belong to a character, merchant, chest or encounter.</p><form method="post" action="/card/${encodeURIComponent(card.id)}/instance"><button class="primary-action" type="submit">Create world instance</button></form>${characters.length?`<form class="assign-form" method="post" action="/card/${encodeURIComponent(card.id)}/instance-character"><select name="character_id" required><option value="">Choose character…</option>${characters.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · Lv ${esc(c.level)} ${esc(c.class_name || "")}</option>`).join("")}</select><button type="submit">Give to character</button></form>`:`<div class="small-note">Create a character first to assign this card directly.</div>`}<div style="margin-top:14px">${instances.length?instances.map(i=>`<div class="instance-row"><div class="instance-main"><span class="${i.owner_type==="character"?"owner-pill":""}">${esc(i.owner_type)}${i.owner_type==="character"&&i.owner_name?` · ${esc(i.owner_name)}`:(i.owner_ref?` · ${esc(i.owner_ref)}`:"")}</span><span>x${esc(i.quantity)}</span>${stateBool(i.state,"equipped")?`<span class="equipment-state">Equipped</span>`:""}${stateBool(i.state,"attuned")?`<span class="equipment-state attuned">Attuned</span>`:""}</div><div class="instance-actions"><form method="post" action="/instance/${encodeURIComponent(i.id)}/delete" onsubmit="return confirm('Delete this card instance?')"><button class="danger-button" type="submit">Delete</button></form></div></div>`).join(""):`<div class="small-note">No concrete copies yet.</div>`}</div><h3 style="margin-top:24px">Actions</h3>${actions.length?actions.map(a=>`<div class="block"><div class="block-title">${esc(a.name)} <span class="chip">${esc(a.kind)}</span></div>${a.description?`<p>${esc(a.description)}</p>`:""}${a.formula?`<div class="small-note">Formula: ${esc(a.formula)}</div>`:""}</div>`).join(""):`<div class="small-note">This card has no executable actions yet.</div>`}<div class="danger-zone"><h3>Delete card template</h3><p class="small-note">Deletes this gameplay card and all of its instances. The original Content Library entry is not deleted and can generate the card again.</p><form method="post" action="/card/${encodeURIComponent(card.id)}/delete" onsubmit="return confirm('Delete this card template and all of its instances?')"><button class="danger-button" type="submit">Delete card template</button></form></div></div></div>`;
  return { status:200, body:layout({title:displayName,content}) };
}

async function createInstance(templateId) {
  const rows = await sql`
    INSERT INTO card_instances(template_id, owner_type, owner_ref, quantity, state)
    VALUES (${templateId}, 'world', NULL, 1, '{}'::jsonb)
    RETURNING id::text
  `;
  return rows[0]?.id;
}

async function deleteInstance(instanceId) {
  const rows = await sql`
    DELETE FROM card_instances
    WHERE id = ${instanceId}
    RETURNING template_id::text
  `;
  return rows[0]?.template_id ?? null;
}

async function deleteCardTemplate(templateId) {
  const rows = await sql`
    DELETE FROM card_templates
    WHERE id = ${templateId}
    RETURNING id::text
  `;
  return rows[0]?.id ?? null;
}


function proficiencyBonusForLevel(level) {
  const n = Math.max(1, Math.min(20, Number(level) || 1));
  return 2 + Math.floor((n - 1) / 4);
}

async function listCharacters() {
  return sql`
    SELECT id::text, name, class_name, subclass_name, species, background_name, origin_feat,
           level, hp_current, hp_max, temp_hp, armor_class, ac_mode,
           strength, dexterity, constitution, intelligence, wisdom, charisma,
           proficiency_bonus, skill_proficiencies, tool_proficiencies,
           saving_throw_proficiencies, currency_gp, weapon_masteries, expertise_skills, feature_choices, builder_meta, notes, sheet_layout,
           (portrait_bytes IS NOT NULL) AS has_portrait, created_at
    FROM characters
    ORDER BY name
  `;
}

async function createCharacter(form) {
  const name = String(form.name || "").trim().slice(0, 100);
  if (!name) throw new Error("Character name is required");
  const level = Math.max(1, Math.min(20, Number(form.level) || 1));
  const hpMax = Math.max(1, Number(form.hp_max) || 10);
  const hpCurrent = Math.max(0, Math.min(hpMax, Number(form.hp_current) || hpMax));
  const ac = Math.max(1, Math.min(40, Number(form.armor_class) || 10));
  const score = key => Math.max(1, Math.min(30, Number(form[key]) || 10));
  const rows = await sql`
    INSERT INTO characters(
      name, class_name, species, level, hp_current, hp_max, armor_class,
      strength, dexterity, constitution, intelligence, wisdom, charisma,
      proficiency_bonus, notes
    ) VALUES (
      ${name}, ${String(form.class_name || "").trim().slice(0,100) || null},
      ${String(form.species || "").trim().slice(0,100) || null},
      ${level}, ${hpCurrent}, ${hpMax}, ${ac},
      ${score("strength")}, ${score("dexterity")}, ${score("constitution")},
      ${score("intelligence")}, ${score("wisdom")}, ${score("charisma")},
      ${proficiencyBonusForLevel(level)}, ${String(form.notes || "").trim().slice(0,4000) || null}
    )
    RETURNING id::text
  `;
  return rows[0].id;
}


function stateBool(state,key){
  if(!state || typeof state!=="object") return false;
  const v=state[key];
  return v===true || v==="true" || v===1 || v==="1";
}

function inventoryType(item){
  const d=item?.data||{};
  const raw=normalizedMetaText(d.itemType || item?.card_type) || "gear";
  const haystack=equipmentText(item?.name_en,item?.subtitle_en,d.category,d.baseItem);
  const magic=raw.startsWith("magic_") || /\bmagic\b/.test(haystack);

  if(["ammunition","magic_ammunition","consumable"].includes(raw)) return raw;
  if(/\bshield\b/.test(haystack) && positiveMetadataNumber(d.armorClass)) return "shield";
  if(positiveMetadataNumber(d.armorClass)) return magic?"magic_armor":"armor";
  if(diceMetadata(d.damageDice) || weaponCategoryMetadata(d.weaponCategory)) return magic?"magic_weapon":"weapon";
  if(raw==="tool" || toolMetadata(haystack)) return "tool";
  if(d.consumable===true || raw==="consumable") return "consumable";
  if(magic) return "magic_item";
  return "gear";
}

function isArmorCard(item){
  const type=inventoryType(item);
  return type==="armor" || type==="magic_armor";
}

function isShieldCard(item){
  return inventoryType(item)==="shield";
}

function isWeaponCard(item){
  const type=inventoryType(item);
  return type==="weapon" || type==="magic_weapon";
}

function isEquippableCard(item){
  return isArmorCard(item) || isShieldCard(item) || isWeaponCard(item);
}

function requiresAttunement(item){
  const value=item?.data?.attunement;
  if(value===true || value===1) return true;
  const text=String(value??"").trim().toLowerCase();
  return !!text && !["false","no","none","0","—"].includes(text);
}

function itemStateLabel(item){
  const labels=[];
  if(stateBool(item.state,"equipped")) labels.push("Equipped");
  if(stateBool(item.state,"attuned")) labels.push("Attuned");
  return labels;
}

function unarmoredBase(character,hasShield=false){
  const dex=abilityModifier(character.dexterity)??0;
  if(character.class_name==="Barbarian"){
    const con=abilityModifier(character.constitution)??0;
    return 10+dex+con;
  }
  if(character.class_name==="Monk" && !hasShield){
    const wis=abilityModifier(character.wisdom)??0;
    return 10+dex+wis;
  }
  return 10+dex;
}

function armorFromItem(character,item){
  const d=item.data||{};
  let base=Number(d.armorClass);
  if(!Number.isFinite(base)) return null;
  const dex=abilityModifier(character.dexterity)??0;
  const mode=String(d.dexBonusMode||"").toLowerCase();
  if(mode==="full") base+=dex;
  else if(mode==="capped") base+=Math.min(dex,Number.isFinite(Number(d.maxDexBonus))?Number(d.maxDexBonus):2);
  base+=Number(d.magicBonus)||0;
  return base;
}

function calculateCharacterArmorClass(character,inventory){
  const equipped=(inventory||[]).filter(i=>stateBool(i.state,"equipped"));
  const armor=equipped.find(isArmorCard);
  const shield=equipped.find(isShieldCard);
  let ac=armor ? armorFromItem(character,armor) : unarmoredBase(character,!!shield);
  if(!Number.isFinite(ac)) ac=10+(abilityModifier(character.dexterity)??0);

  if(shield){
    const d=shield.data||{};
    let shieldBonus=Number(d.armorClass);
    if(!Number.isFinite(shieldBonus) || shieldBonus<=0) shieldBonus=2;
    shieldBonus+=Number(d.magicBonus)||0;
    ac+=shieldBonus;
  }
  if(armor && fightingStyleName(character).toLowerCase()==="defense") ac+=1;
  return Math.max(1,Math.min(40,Math.round(ac)));
}

async function syncAutoArmorClass(character,inventory){
  if(character.ac_mode!=="auto") return character;
  const next=calculateCharacterArmorClass(character,inventory);
  if(Number(character.armor_class)!==next){
    await sql`UPDATE characters SET armor_class=${next},updated_at=NOW() WHERE id=${character.id}`;
    character.armor_class=next;
  }
  return character;
}

async function setCharacterAc(characterId,form){
  const mode=String(form.ac_mode||"manual")==="auto"?"auto":"manual";
  if(mode==="manual"){
    const ac=Math.max(1,Math.min(40,Number(form.armor_class)||10));
    await sql`UPDATE characters SET ac_mode='manual',armor_class=${ac},updated_at=NOW() WHERE id=${characterId}`;
    return;
  }
  await sql`UPDATE characters SET ac_mode='auto',updated_at=NOW() WHERE id=${characterId}`;
  const data=await getCharacter(characterId);
  if(data) await syncAutoArmorClass(data.character,data.inventory);
}

async function setInventoryEquipped(characterId,instanceId){
  const rows=await sql`
    SELECT ci.id::text,ci.state,ct.card_type,ct.data
    FROM card_instances ci
    JOIN card_templates ct ON ct.id=ci.template_id
    WHERE ci.id=${instanceId}
      AND ci.owner_type='character'
      AND ci.owner_ref=${characterId}
    LIMIT 1
  `;
  if(!rows.length) throw new Error("Inventory item not found");
  const item=rows[0];
  if(!isEquippableCard(item)) throw new Error("This card cannot be equipped");

  const equip=!stateBool(item.state,"equipped");
  if(equip && isArmorCard(item)){
    await sql`
      UPDATE card_instances ci
      SET state=COALESCE(ci.state,'{}'::jsonb) || '{"equipped":false}'::jsonb,updated_at=NOW()
      FROM card_templates ct
      WHERE ci.template_id=ct.id
        AND ci.owner_type='character'
        AND ci.owner_ref=${characterId}
        AND COALESCE(ct.data->>'itemType',ct.card_type) IN ('armor','magic_armor')
    `;
  }
  if(equip && isShieldCard(item)){
    await sql`
      UPDATE card_instances ci
      SET state=COALESCE(ci.state,'{}'::jsonb) || '{"equipped":false}'::jsonb,updated_at=NOW()
      FROM card_templates ct
      WHERE ci.template_id=ct.id
        AND ci.owner_type='character'
        AND ci.owner_ref=${characterId}
        AND COALESCE(ct.data->>'itemType',ct.card_type)='shield'
    `;
  }

  await sql`
    UPDATE card_instances
    SET state=COALESCE(state,'{}'::jsonb) || jsonb_build_object('equipped',${equip}),updated_at=NOW()
    WHERE id=${instanceId}
      AND owner_type='character'
      AND owner_ref=${characterId}
  `;
  await sql`UPDATE characters SET ac_mode='auto',updated_at=NOW() WHERE id=${characterId}`;
}

async function setInventoryAttuned(characterId,instanceId){
  const rows=await sql`
    SELECT ci.id::text,ci.state,ct.card_type,ct.data
    FROM card_instances ci
    JOIN card_templates ct ON ct.id=ci.template_id
    WHERE ci.id=${instanceId}
      AND ci.owner_type='character'
      AND ci.owner_ref=${characterId}
    LIMIT 1
  `;
  if(!rows.length) throw new Error("Inventory item not found");
  const item=rows[0];
  if(!requiresAttunement(item)) throw new Error("This item does not require attunement");

  const next=!stateBool(item.state,"attuned");
  if(next){
    const countRows=await sql`
      SELECT COUNT(*)::int AS count
      FROM card_instances
      WHERE owner_type='character'
        AND owner_ref=${characterId}
        AND COALESCE((state->>'attuned')::boolean,FALSE)=TRUE
    `;
    if(Number(countRows[0]?.count||0)>=3) throw new Error("A character can be attuned to at most 3 items");
  }

  await sql`
    UPDATE card_instances
    SET state=COALESCE(state,'{}'::jsonb) || jsonb_build_object('attuned',${next}),updated_at=NOW()
    WHERE id=${instanceId}
      AND owner_type='character'
      AND owner_ref=${characterId}
  `;
}

function automaticResourceDefinitions(character){
  const cls=String(character.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character.level)||1));
  const cha=Math.max(1,abilityModifier(character.charisma)??1);
  const defs=[];

  if(cls==="Barbarian"){
    const max=level>=17?6:level>=12?5:level>=6?4:level>=3?3:2;
    defs.push({key:"class:barbarian:rage",name:"Rage",max,recharge:"long",shortGain:1,notes:"2024 Rage uses. Short Rest restores 1; Long Rest restores all."});
  }
  if(cls==="Bard"){
    const die=level>=15?"d12":level>=10?"d10":level>=5?"d8":"d6";
    defs.push({key:"class:bard:bardic-inspiration",name:"Bardic Inspiration",max:cha,recharge:level>=5?"short":"long",shortGain:0,notes:`Bardic Inspiration ${die}. Uses equal Charisma modifier (minimum 1).`});
  }
  if(cls==="Cleric" && level>=2){
    const max=level>=18?4:level>=6?3:2;
    defs.push({key:"class:cleric:channel-divinity",name:"Channel Divinity",max,recharge:"long",shortGain:1,notes:"Short Rest restores 1 use; Long Rest restores all."});
  }
  if(cls==="Druid" && level>=2){
    const max=level>=17?4:level>=6?3:2;
    defs.push({key:"class:druid:wild-shape",name:"Wild Shape",max,recharge:"long",shortGain:1,notes:"Short Rest restores 1 use; Long Rest restores all."});
  }
  if(cls==="Fighter"){
    const swMax=level>=10?4:level>=4?3:2;
    defs.push({key:"class:fighter:second-wind",name:"Second Wind",max:swMax,recharge:"long",shortGain:1,notes:`Bonus Action: regain 1d10 + ${level} HP. Short Rest restores 1 use.`});
    if(level>=2) defs.push({key:"class:fighter:action-surge",name:"Action Surge",max:level>=17?2:1,recharge:"short",shortGain:0,notes:"Take one additional action, except the Magic action."});
  }
  if(cls==="Monk" && level>=2){
    defs.push({key:"class:monk:focus-points",name:"Focus Points",max:level,recharge:"short",shortGain:0,notes:"Regain all expended Focus Points on a Short or Long Rest."});
  }
  if(cls==="Paladin"){
    defs.push({key:"class:paladin:lay-on-hands",name:"Lay on Hands",max:level*5,recharge:"long",shortGain:0,notes:"Healing pool: 5 × Paladin level. Spend 5 to remove Poisoned."});
    if(level>=3){
      const max=level>=11?3:2;
      defs.push({key:"class:paladin:channel-divinity",name:"Channel Divinity",max,recharge:"long",shortGain:1,notes:"Short Rest restores 1 use; Long Rest restores all."});
    }
  }
  if(cls==="Ranger"){
    const max=level>=17?6:level>=13?5:level>=9?4:level>=5?3:2;
    defs.push({key:"class:ranger:favored-enemy",name:"Favored Enemy — Hunter's Mark",max,recharge:"long",shortGain:0,notes:"Free Hunter's Mark casts granted by Favored Enemy."});
  }
  if(cls==="Sorcerer"){
    defs.push({key:"class:sorcerer:innate-sorcery",name:"Innate Sorcery",max:2,recharge:"long",shortGain:0,notes:"Bonus Action; 1 minute. Sorcerer spell save DC +1 and Advantage on Sorcerer spell attacks."});
    if(level>=2) defs.push({key:"class:sorcerer:sorcery-points",name:"Sorcery Points",max:level,recharge:"long",shortGain:0,notes:"Font of Magic and Metamagic resource."});
  }
  if(cls==="Warlock" && level>=2){
    defs.push({key:"class:warlock:magical-cunning",name:"Magical Cunning",max:1,recharge:"long",shortGain:0,notes:level>=20?"1-minute rite; regain all expended Pact Magic slots.":"1-minute rite; regain up to half your Pact Magic slots (round up)."});
  }
  if(cls==="Druid" && String(character.subclass_name||"")==="Circle of the Land" && level>=6){
    defs.push({key:"subclass:land:natural-recovery",name:"Natural Recovery",max:1,recharge:"long",shortGain:0,notes:"Cast one prepared Circle Spell of level 1+ without expending a spell slot."});
  }
  if(cls==="Wizard"){
    defs.push({key:"class:wizard:arcane-recovery",name:"Arcane Recovery",max:1,recharge:"long",shortGain:0,notes:`After a Short Rest, recover spell-slot levels totaling up to ${Math.ceil(level/2)}. Usable once per Long Rest.`});
  }
  defs.push(...subclassResourceDefinitions(character),...subclassControlResources(character));
  return defs;
}

async function ensureAutomaticResources(character){
  const defs=automaticResourceDefinitions(character);
  const keys=defs.map(d=>d.key);

  for(const d of defs){
    await sql`
      INSERT INTO character_resources(
        character_id,name,current_value,max_value,recharge,notes,
        source_key,auto_managed,short_rest_gain
      )
      VALUES(
        ${character.id},${d.name},${d.max},${d.max},${d.recharge},${d.notes},
        ${d.key},TRUE,${d.shortGain}
      )
      ON CONFLICT(character_id,source_key) WHERE source_key IS NOT NULL
      DO UPDATE SET
        name=EXCLUDED.name,
        max_value=EXCLUDED.max_value,
        current_value=LEAST(character_resources.current_value,EXCLUDED.max_value),
        recharge=EXCLUDED.recharge,
        notes=EXCLUDED.notes,
        auto_managed=TRUE,
        short_rest_gain=EXCLUDED.short_rest_gain,
        updated_at=NOW()
    `;
  }

  if(keys.length){
    await sql`
      DELETE FROM character_resources
      WHERE character_id=${character.id}
        AND auto_managed=TRUE
        AND source_key IS NOT NULL
        AND source_key NOT IN ${sql(keys)}
    `;
  }else{
    await sql`
      DELETE FROM character_resources
      WHERE character_id=${character.id}
        AND auto_managed=TRUE
        AND source_key IS NOT NULL
    `;
  }
}
async function getCharacter(id) {
  const rows = await sql`
    SELECT id::text, name, class_name, subclass_name, species, background_name, origin_feat,
           level, hp_current, hp_max, temp_hp, armor_class, ac_mode,
           strength, dexterity, constitution, intelligence, wisdom, charisma,
           proficiency_bonus, skill_proficiencies, tool_proficiencies,
           saving_throw_proficiencies, currency_gp, xp, weapon_masteries, expertise_skills, feature_choices, builder_meta, sheet_layout,
           (portrait_bytes IS NOT NULL) AS has_portrait,
           notes, created_at, updated_at
    FROM characters WHERE id=${id} LIMIT 1
  `;
  if (!rows.length) return null;
  const inventory = await sql`
    SELECT ci.id::text AS instance_id, ci.quantity, ci.state,
           ct.id::text AS template_id, ct.card_type, ct.name_en, ct.subtitle_en,
           ct.description_en, ct.data, ct.actions
    FROM card_instances ci
    JOIN card_templates ct ON ct.id=ci.template_id
    WHERE ci.owner_type='character' AND ci.owner_ref=${id}
    ORDER BY ct.name_en, ci.created_at
  `;
  await ensureAutomaticResources(rows[0]);
  await syncAutoArmorClass(rows[0],inventory);
  const runtime = await getCharacterRuntime(rows[0]);
  return { character: rows[0], inventory, ...runtime };
}

async function setCharacterLayout(id,layout){
  const value=["standard","compact","illustrated"].includes(String(layout))?String(layout):"standard";
  await sql`UPDATE characters SET sheet_layout=${value},updated_at=NOW() WHERE id=${id}`;
}

async function adjustCharacterHp(id, delta) {
  return adjustCharacterHitPoints(sql,id,delta);
}

async function deleteCharacter(id) {
  await sql.begin(async tx => {
    await tx`
      UPDATE card_instances SET owner_type='world', owner_ref=NULL, updated_at=NOW()
      WHERE owner_type='character' AND owner_ref=${id}
    `;
    await tx`DELETE FROM characters WHERE id=${id}`;
  });
}

async function createCharacterInstance(templateId, characterId) {
  const chars = await sql`SELECT id::text FROM characters WHERE id=${characterId} LIMIT 1`;
  if (!chars.length) throw new Error("Character not found");
  const rows = await sql`
    INSERT INTO card_instances(template_id, owner_type, owner_ref, quantity, state)
    VALUES (${templateId}, 'character', ${characterId}, 1, '{}'::jsonb)
    RETURNING id::text
  `;
  return rows[0]?.id;
}

async function unassignInstance(instanceId) {
  const rows = await sql`
    UPDATE card_instances
    SET owner_type='world', owner_ref=NULL, updated_at=NOW()
    WHERE id=${instanceId}
    RETURNING template_id::text
  `;
  return rows[0]?.template_id ?? null;
}

function normalizedPropertyText(value) {
  try { return JSON.stringify(value ?? "").toLowerCase(); }
  catch { return String(value ?? "").toLowerCase(); }
}



const XP_LEVEL_THRESHOLDS=[
  0,       // 1
  300,     // 2
  900,     // 3
  2700,    // 4
  6500,    // 5
  14000,   // 6
  23000,   // 7
  34000,   // 8
  48000,   // 9
  64000,   // 10
  85000,   // 11
  100000,  // 12
  120000,  // 13
  140000,  // 14
  165000,  // 15
  195000,  // 16
  225000,  // 17
  265000,  // 18
  305000,  // 19
  355000   // 20
];

function xpForLevel(level){
  const n=Math.max(1,Math.min(20,Number(level)||1));
  return XP_LEVEL_THRESHOLDS[n-1] ?? 0;
}

function xpProgressState(character){
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  const xp=Math.max(0,Number(character?.xp)||0);
  const current=xpForLevel(level);
  const next=level>=20?current:xpForLevel(level+1);
  const span=Math.max(1,next-current);
  const pct=level>=20?100:Math.max(0,Math.min(100,((xp-current)/span)*100));
  return {
    level,xp,current,next,pct,
    canLevel:level<20 && xp>=next,
    remaining:level>=20?0:Math.max(0,next-xp),
    maxLevel:level>=20
  };
}

function classHitDie(character){
  return Number(CLASS_BUILDER_RULES?.[character?.class_name]?.hitDie)||8;
}

function fixedHpGain(character){
  const die=classHitDie(character);
  const con=abilityModifier(character?.constitution)??0;
  return Math.max(1,Math.floor(die/2)+1+con);
}

async function adjustCharacterXp(characterId,form){
  const rows=await sql`SELECT xp FROM characters WHERE id=${characterId} LIMIT 1`;
  if(!rows.length) throw new Error("Character not found");
  const mode=String(form.mode||"add");
  const amount=Math.trunc(Number(form.xp)||0);
  const current=Math.max(0,Number(rows[0].xp)||0);
  const next=mode==="set" ? amount : current+amount;
  await sql`
    UPDATE characters SET xp=${Math.max(0,Math.min(999999999,next))},updated_at=NOW()
    WHERE id=${characterId}
  `;
}

async function lastLevelUpHistory(characterId){
  const rows=await sql`
    SELECT id::text,from_level,to_level,snapshot,created_at
    FROM character_level_history
    WHERE character_id=${String(characterId)}
    ORDER BY id DESC
    LIMIT 1
  `;
  return rows[0]||null;
}

async function completeCharacterLevelUp(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  const state=xpProgressState(c);
  if(!state.canLevel) throw new Error("Not enough XP to level up");
  if(state.level>=20) throw new Error("Character is already level 20");

  const toLevel=state.level+1;
  const hpGain=Math.max(1,Math.min(100,Math.trunc(Number(form.hp_gain)||fixedHpGain(c))));
  let subclassName=c.subclass_name||null;
  let subclassChoice=null;

  if(toLevel>=3){
    const options=await subclassOptionsForCharacter({...c,level:toLevel});
    const subclassId=String(form.subclass_id||"");
    if(subclassId){
      const chosen=options.find(x=>String(x.id)===subclassId);
      if(!chosen) throw new Error("Invalid subclass for this class");
      subclassName=chosen.name_en;
      subclassChoice=chosen;
    }else if(c.builder_meta?.subclass_entity_id){
      subclassChoice=options.find(x=>String(x.id)===String(c.builder_meta.subclass_entity_id))||null;
    }else if(c.subclass_name){
      subclassChoice=options.find(x=>x.name_en===c.subclass_name)||null;
    }
  }

  const builderMeta=c.builder_meta&&typeof c.builder_meta==="object"?{...c.builder_meta}:{};
  if(subclassChoice){
    builderMeta.subclass_entity_id=subclassChoice.id;
    builderMeta.content_sources={...(builderMeta.content_sources||{}),subclass:{key:subclassChoice.source_key,ruleset:subclassChoice.ruleset}};
  }

  const snapshot={
    level:Number(c.level),
    hp_current:Number(c.hp_current),
    hp_max:Number(c.hp_max),
    subclass_name:c.subclass_name||null,
    proficiency_bonus:Number(c.proficiency_bonus),
    weapon_masteries:Array.isArray(c.weapon_masteries)?c.weapon_masteries:[],
    expertise_skills:Array.isArray(c.expertise_skills)?c.expertise_skills:[],
    feature_choices:c.feature_choices&&typeof c.feature_choices==="object"?c.feature_choices:{},
    builder_meta:c.builder_meta&&typeof c.builder_meta==="object"?c.builder_meta:{}
  };

  await sql.begin(async tx=>{
    await tx`
      INSERT INTO character_level_history(character_id,from_level,to_level,snapshot)
      VALUES(${String(c.id)},${state.level},${toLevel},${tx.json(snapshot)})
    `;
    const newMax=Math.max(1,Number(c.hp_max)+hpGain);
    const newCurrent=Math.min(newMax,Math.max(0,Number(c.hp_current)+hpGain));
    await tx`
      UPDATE characters SET
        level=${toLevel},
        hp_max=${newMax},
        hp_current=${newCurrent},
        subclass_name=${subclassName},
        proficiency_bonus=${proficiencyBonusForLevel(toLevel)},
        builder_meta=${tx.json(builderMeta)},
        updated_at=NOW()
      WHERE id=${c.id}
    `;
  });

  const refreshed=await getCharacter(characterId);
  if(refreshed){
    await ensureAutomaticResources(refreshed.character);
    await ensureCharacterSpellSlots(refreshed.character);
  }
}

async function rollbackCharacterLevel(characterId){
  const currentRows=await sql`
    SELECT id::text,level FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!currentRows.length) throw new Error("Character not found");
  const current=currentRows[0];
  const history=await lastLevelUpHistory(characterId);
  if(!history) throw new Error("No level-up history to undo");
  if(Number(history.to_level)!==Number(current.level)) throw new Error("The last level-up no longer matches the current level");

  const s=history.snapshot&&typeof history.snapshot==="object"?history.snapshot:{};
  await sql.begin(async tx=>{
    await tx`
      UPDATE characters SET
        level=${Math.max(1,Number(s.level)||Number(history.from_level)||1)},
        hp_current=${Math.max(0,Number(s.hp_current)||0)},
        hp_max=${Math.max(1,Number(s.hp_max)||1)},
        subclass_name=${s.subclass_name??null},
        proficiency_bonus=${Math.max(2,Number(s.proficiency_bonus)||2)},
        weapon_masteries=${tx.json(Array.isArray(s.weapon_masteries)?s.weapon_masteries:[])},
        expertise_skills=${tx.json(Array.isArray(s.expertise_skills)?s.expertise_skills:[])},
        feature_choices=${tx.json(s.feature_choices&&typeof s.feature_choices==="object"?s.feature_choices:{})},
        builder_meta=${tx.json(s.builder_meta&&typeof s.builder_meta==="object"?s.builder_meta:{})},
        updated_at=NOW()
      WHERE id=${characterId}
    `;
    await tx`DELETE FROM character_level_history WHERE id=${history.id}`;
  });

  const refreshed=await getCharacter(characterId);
  if(refreshed){
    await ensureAutomaticResources(refreshed.character);
    await ensureCharacterSpellSlots(refreshed.character);
  }
}

function featureChoiceValue(character,key){
  const choices=character?.feature_choices && typeof character.feature_choices==="object"
    ? character.feature_choices : {};
  return choices[key] ?? null;
}

function featureChoiceArray(character,key){
  const value=featureChoiceValue(character,key);
  return Array.isArray(value)?value:[];
}

function featureChoiceObject(character,key){
  const value=featureChoiceValue(character,key);
  return value && typeof value==="object" && !Array.isArray(value) ? value : {};
}

function hasInvocation(character,name){
  return invocationSelections(character).some(x=>x.name===name);
}

function concentrationState(character){
  const value=featureChoiceObject(character,"concentration");
  return value && value.name ? value : null;
}

function fontBonusSlots(character){
  const raw=featureChoiceObject(character,"font_bonus_slots");
  const out={};
  for(let level=1;level<=5;level++){
    const n=Math.max(0,Math.min(99,Number(raw[level] ?? raw[String(level)])||0));
    if(n) out[level]=n;
  }
  return out;
}

function innateSorceryActive(character){
  return featureChoiceValue(character,"innate_sorcery_active")===true;
}

function pactWeaponChoice(character){
  const value=featureChoiceObject(character,"pact_weapon");
  return value.instance_id ? value : null;
}

function channelDivinityState(character){
  const value=featureChoiceObject(character,"channel_divinity_state");
  return {
    divine_sense:value.divine_sense&&typeof value.divine_sense==="object"?value.divine_sense:null,
    sacred_weapon:value.sacred_weapon&&typeof value.sacred_weapon==="object"?value.sacred_weapon:null
  };
}

function channelDivinityProfile(character){
  const cls=String(character?.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  const abilityKey=cls==="Cleric"?"wisdom":cls==="Paladin"?"charisma":null;
  const mod=abilityKey ? (abilityModifier(character?.[abilityKey])??0) : 0;
  const saveDc=abilityKey ? 8+Number(character?.proficiency_bonus||0)+mod : null;
  const sourceKey=cls==="Cleric"&&level>=2?"class:cleric:channel-divinity"
    :cls==="Paladin"&&level>=3?"class:paladin:channel-divinity":null;
  const sparkDice=cls==="Cleric"?(level>=18?4:level>=13?3:level>=7?2:1):0;
  const searDice=cls==="Cleric"&&level>=5?Math.max(1,mod):0;
  const abjureTargets=cls==="Paladin"&&level>=9?Math.max(1,mod):0;
  return {available:Boolean(sourceKey),className:cls,level,abilityKey,mod,saveDc,sourceKey,sparkDice,searDice,abjureTargets};
}

async function patchCharacterFeatureChoices(characterId,patch={},removeKeys=[]){
  return sql.begin(async tx=>{
    const rows=await tx`SELECT feature_choices FROM characters WHERE id=${characterId} FOR UPDATE`;
    if(!rows.length) throw new Error("Character not found");
    const choices=rows[0].feature_choices && typeof rows[0].feature_choices==="object"
      ? {...rows[0].feature_choices} : {};
    for(const key of removeKeys) delete choices[key];
    for(const [key,value] of Object.entries(patch)){
      if(value===undefined) delete choices[key];
      else choices[key]=value;
    }
    await tx`UPDATE characters SET feature_choices=${tx.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
    return choices;
  });
}

async function startConcentration(characterId,spell){
  if(!spell?.concentration) return;
  await patchCharacterFeatureChoices(characterId,{
    concentration:{
      spell_id:String(spell.entity_id||""),
      name:String(spell.name_en||"Concentration spell"),
      started_at:new Date().toISOString(),
      check_dc:null,
      last_damage:null
    }
  });
}

async function endConcentration(characterId){
  await patchCharacterFeatureChoices(characterId,{},["concentration"]);
}

async function concentrationSavingThrow(characterId,checkId,back){
  const {character:c,roll,dc,success}=await resolveConcentrationCheck(sql,characterId,checkId,character=>{
    const bonus=saveBonus(character,"constitution","Constitution");
    return rollWithMode(`1d20${bonus>=0?"+":""}${bonus}`,hasInvocation(character,"Eldritch Mind")?"advantage":"");
  });
  return {...roll,label:`${c.name} — Concentration`,outcome:`${success?"Concentration maintained":"Concentration ended"} · DC ${dc}`,effects:{characterId:String(characterId),concentrationHtml:renderConcentrationPanel(c,back)}};
}

const FONT_SLOT_COST={1:2,2:3,3:5,4:6,5:7};

async function fontOfMagic(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,level,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  if(c.class_name!=="Sorcerer" || Number(c.level)<2) throw new Error("Font of Magic is not available");

  const resourceRows=await sql`
    SELECT id::text,current_value,max_value
    FROM character_resources
    WHERE character_id=${characterId}
      AND source_key='class:sorcerer:sorcery-points'
    LIMIT 1
  `;
  if(!resourceRows.length) throw new Error("Sorcery Points resource is unavailable");
  const points=resourceRows[0];
  const action=String(form.action||"");
  const slotLevel=Math.max(1,Math.min(5,Number(form.slot_level)||1));
  const bonus=fontBonusSlots(c);

  if(action==="points_to_slot"){
    const cost=FONT_SLOT_COST[slotLevel];
    if(Number(points.current_value)<cost) throw new Error(`Creating a level ${slotLevel} slot costs ${cost} Sorcery Points`);
    await sql`
      UPDATE character_resources
      SET current_value=current_value-${cost},updated_at=NOW()
      WHERE id=${points.id} AND character_id=${characterId}
    `;
    bonus[slotLevel]=(bonus[slotLevel]||0)+1;
    await patchCharacterFeatureChoices(characterId,{font_bonus_slots:bonus});
    return;
  }

  if(action==="slot_to_points"){
    const gain=slotLevel;
    if(Number(points.current_value)+gain>Number(points.max_value)){
      throw new Error(`Sorcery Points cannot exceed ${points.max_value}`);
    }

    if((bonus[slotLevel]||0)>0){
      bonus[slotLevel]-=1;
      if(bonus[slotLevel]<=0) delete bonus[slotLevel];
      await patchCharacterFeatureChoices(characterId,{font_bonus_slots:bonus});
    }else{
      const spent=await sql`
        UPDATE character_spell_slots
        SET current_slots=current_slots-1
        WHERE character_id=${characterId}
          AND slot_level=${slotLevel}
          AND current_slots>0
        RETURNING current_slots
      `;
      if(!spent.length) throw new Error(`No level ${slotLevel} spell slot available`);
    }

    await sql`
      UPDATE character_resources
      SET current_value=current_value+${gain},updated_at=NOW()
      WHERE id=${points.id} AND character_id=${characterId}
    `;
    return;
  }

  throw new Error("Unknown Font of Magic action");
}

function isPactBladeEligibleItem(item){
  if(!isWeaponCard(item)) return false;
  const d=item?.data||{};
  const category=String(d.weaponCategory||d.category||"").toLowerCase();
  if(category.includes("ranged")) return false;
  return true;
}

async function setPactWeapon(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  if(c.class_name!=="Warlock" || !hasInvocation(c,"Pact of the Blade")) throw new Error("Pact of the Blade is not selected");

  const action=String(form.action||"set");
  if(action==="clear"){
    await patchCharacterFeatureChoices(characterId,{},["pact_weapon"]);
    return;
  }

  const instanceId=String(form.instance_id||"");
  const item=data.inventory.find(x=>String(x.instance_id)===instanceId);
  if(!item || !isPactBladeEligibleItem(item)) throw new Error("Choose an eligible melee weapon from this character's inventory");

  await patchCharacterFeatureChoices(characterId,{
    pact_weapon:{instance_id:String(item.instance_id),name:String(item.name_en||"Pact Weapon")}
  });
}

async function toggleInnateSorcery(characterId,action){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  if(c.class_name!=="Sorcerer") throw new Error("Innate Sorcery is not available");

  if(action==="end"){
    await patchCharacterFeatureChoices(characterId,{},["innate_sorcery_active"]);
    return;
  }

  if(innateSorceryActive(c)) return;
  await spendManagedResourceByKey(characterId,"class:sorcerer:innate-sorcery",1);
  await patchCharacterFeatureChoices(characterId,{innate_sorcery_active:true});
}

async function useSecondWind(characterId){
  const rows=await sql`
    SELECT id::text,name,class_name,level,hp_current,hp_max
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  if(c.class_name!=="Fighter") throw new Error("Second Wind is not available");
  const resource=await spendManagedResourceByKey(characterId,"class:fighter:second-wind",1);
  const roll=rollDiceFormula(`1d10+${Number(c.level)}`);
  const heal=roll.total;
  const updated=await sql`
    UPDATE characters SET hp_current=LEAST(hp_max,hp_current+${heal}),updated_at=NOW()
    WHERE id=${characterId}
    RETURNING hp_current,hp_max
  `;
  await sql`
    INSERT INTO roll_log(label,formula,total,detail)
    VALUES(${`${c.name} — Second Wind`},${roll.formula},${heal},${sql.json([...roll.parts,`healing ${heal}`])})
  `;
  return {...roll,label:`${c.name} — Second Wind`,outcome:`Regained ${Number(updated[0].hp_current)-Number(c.hp_current)} HP`,effects:{hp:{current:Number(updated[0].hp_current),max:Number(updated[0].hp_max)},resource:{key:"class:fighter:second-wind",current:Number(resource.current_value),max:Number(resource.max_value)}}};
}

async function useLayOnHands(characterId,form){
  const amount=Math.max(1,Math.min(999,Number(form.amount)||1));
  const rows=await sql`
    SELECT id::text,class_name,hp_current,hp_max
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length || rows[0].class_name!=="Paladin") throw new Error("Lay on Hands is not available");
  const resource=await sql`
    SELECT id::text,current_value FROM character_resources
    WHERE character_id=${characterId} AND source_key='class:paladin:lay-on-hands'
    LIMIT 1
  `;
  if(!resource.length || Number(resource[0].current_value)<amount) throw new Error("Not enough Lay on Hands points");
  await sql`UPDATE character_resources SET current_value=current_value-${amount},updated_at=NOW() WHERE id=${resource[0].id}`;
  await sql`UPDATE characters SET hp_current=LEAST(hp_max,hp_current+${amount}),updated_at=NOW() WHERE id=${characterId}`;
}

function fixedDiceResult(count,sides,bonus=0){
  const dice=Array.from({length:Math.max(0,Number(count)||0)},()=>({sides:Number(sides),value:Number(sides),kept:true}));
  const total=dice.reduce((sum,die)=>sum+die.value,0)+(Number(bonus)||0);
  const formula=signedFormula(`${Math.max(0,Number(count)||0)}d${Number(sides)||0}`,bonus);
  const parts=dice.map((die,index)=>`d${die.sides} #${index+1}: ${die.value}`);
  if(Number(bonus)) parts.push(`modifier ${Number(bonus)>=0?"+":""}${Number(bonus)}`);
  return {formula,total,dice,parts};
}

function emptyActionResult(label,total,formula,parts=[]){
  return {label,total:Number(total)||0,formula:String(formula||""),dice:[],parts};
}

async function useChannelDivinity(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  const profile=channelDivinityProfile(c);
  if(!profile.available) throw new Error("Channel Divinity is not available");
  const effect=String(form.effect||"");
  const state=channelDivinityState(c);

  if(effect==="divine_sense_end"){
    const next={...state,divine_sense:null};
    await patchCharacterFeatureChoices(characterId,{channel_divinity_state:next});
    return null;
  }
  if(effect==="sacred_weapon_end"){
    const next={...state,sacred_weapon:null};
    await patchCharacterFeatureChoices(characterId,{channel_divinity_state:next});
    return null;
  }

  let sacredItem=null;
  if(profile.className==="Cleric"){
    if(!["divine_spark","turn_undead","preserve_life"].includes(effect)) throw new Error("Unknown Channel Divinity effect");
    if(effect==="preserve_life" && (c.subclass_name!=="Life Domain" || profile.level<3)) throw new Error("Preserve Life is not available");
    if(effect==="divine_spark" && String(form.mode||"heal")==="damage" && !["Radiant","Necrotic"].includes(String(form.damage_type||"Radiant"))) throw new Error("Choose Radiant or Necrotic damage");
  }else if(profile.className==="Paladin"){
    if(!["divine_sense","abjure_foes","sacred_weapon"].includes(effect)) throw new Error("Unknown Channel Divinity effect");
    if(effect==="abjure_foes" && profile.level<9) throw new Error("Abjure Foes is not available");
    if(effect==="sacred_weapon"){
      if(c.subclass_name!=="Oath of Devotion" || profile.level<3) throw new Error("Sacred Weapon is not available");
      const instanceId=String(form.instance_id||"");
      sacredItem=data.inventory.find(x=>String(x.instance_id)===instanceId)||null;
      if(!sacredItem || !isPactBladeEligibleItem(sacredItem) || !stateBool(sacredItem.state,"equipped")) throw new Error("Choose an equipped melee weapon");
    }
  }

  const resource=await spendManagedResourceByKey(characterId,profile.sourceKey,1);
  const resourceEffect={key:profile.sourceKey,current:Number(resource.current_value),max:Number(resource.max_value)};

  if(profile.className==="Cleric" && effect==="divine_spark"){
    const mode=String(form.mode||"heal")==="damage"?"damage":"heal";
    const damageType=String(form.damage_type||"Radiant");
    const formula=signedFormula(`${profile.sparkDice}d8`,profile.mod);
    const supreme=mode==="heal" && c.subclass_name==="Life Domain" && profile.level>=17;
    const roll=supreme?fixedDiceResult(profile.sparkDice,8,profile.mod):rollDiceFormula(formula);
    const amount=Math.max(0,Number(roll.total)||0);
    const label=`${c.name} — Divine Spark`;
    const outcome=mode==="heal"
      ? `Restore ${amount} HP to another creature within 30 feet${supreme?" · Supreme Healing": ""}.`
      : `${damageType} damage ${amount} · Constitution save DC ${profile.saveDc}; success takes half (round down).`;
    await sql`INSERT INTO roll_log(label,formula,total,detail) VALUES(${label},${roll.formula},${amount},${sql.json([...roll.parts,outcome])})`;
    return {...roll,total:amount,label,outcome,effects:{resource:resourceEffect}};
  }

  if(profile.className==="Cleric" && effect==="turn_undead"){
    const label=`${c.name} — Turn Undead`;
    if(profile.searDice>0){
      const roll=rollDiceFormula(`${profile.searDice}d8`);
      const outcome=`Wisdom save DC ${profile.saveDc}. Failed saves are Frightened and Incapacitated for 1 minute; Sear Undead deals ${roll.total} Radiant damage and this damage does not end the turn effect.`;
      await sql`INSERT INTO roll_log(label,formula,total,detail) VALUES(${label},${roll.formula},${roll.total},${sql.json([...roll.parts,outcome])})`;
      return {...roll,label,outcome,effects:{resource:resourceEffect}};
    }
    return {...emptyActionResult(label,0,"Turn Undead",[`Wisdom save DC ${profile.saveDc}`]),outcome:`Wisdom save DC ${profile.saveDc}. Failed saves are Frightened and Incapacitated for 1 minute and try to move as far away as possible.`,effects:{resource:resourceEffect}};
  }

  if(profile.className==="Cleric" && effect==="preserve_life"){
    const pool=profile.level*5;
    return {...emptyActionResult(`${c.name} — Preserve Life`,pool,`5 × Cleric level`,[`Healing pool ${pool} HP`,`Only Bloodied creatures within 30 feet; no creature can be healed above half its HP maximum.`]),outcome:`Distribute ${pool} HP among Bloodied creatures within 30 feet, up to half each creature's HP maximum.`,effects:{resource:resourceEffect}};
  }

  if(profile.className==="Paladin" && effect==="divine_sense"){
    await patchCharacterFeatureChoices(characterId,{channel_divinity_state:{...state,divine_sense:{started_at:new Date().toISOString()}}});
    return null;
  }

  if(profile.className==="Paladin" && effect==="abjure_foes"){
    const targets=profile.abjureTargets;
    return {...emptyActionResult(`${c.name} — Abjure Foes`,targets,"Charisma modifier targets",[`Targets: ${targets}`,`Wisdom save DC ${profile.saveDc}`]),outcome:`Target up to ${targets} creature${targets===1?"":"s"} within 60 feet. Wisdom save DC ${profile.saveDc}; failed saves are Frightened for 1 minute or until damaged.`,effects:{resource:resourceEffect}};
  }

  if(profile.className==="Paladin" && effect==="sacred_weapon"){
    const instanceId=String(sacredItem.instance_id);
    const bonus=Math.max(1,profile.mod);
    await patchCharacterFeatureChoices(characterId,{channel_divinity_state:{...state,sacred_weapon:{instance_id:instanceId,name:String(sacredItem.name_en||"Sacred Weapon"),attack_bonus:bonus,started_at:new Date().toISOString()}}});
    return null;
  }

  throw new Error("Unknown Channel Divinity effect");
}

async function useMagicalCunning(characterId){
  const rows=await sql`
    SELECT id::text,name,class_name,level
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  if(c.class_name!=="Warlock" || Number(c.level)<2) throw new Error("Magical Cunning is not available");

  const slotRows=await sql`
    SELECT slot_level,max_slots,current_slots
    FROM character_spell_slots
    WHERE character_id=${characterId}
    ORDER BY slot_level DESC
    LIMIT 1
  `;
  if(!slotRows.length) throw new Error("No Pact Magic slots are available");
  const s=slotRows[0];
  const missing=Math.max(0,Number(s.max_slots)-Number(s.current_slots));
  if(!missing) throw new Error("No expended Pact Magic slots to recover");
  const recover=Number(c.level)>=20 ? missing : Math.min(missing,Math.ceil(Number(s.max_slots)/2));

  await spendManagedResourceByKey(characterId,"class:warlock:magical-cunning",1);
  await sql`
    UPDATE character_spell_slots
    SET current_slots=LEAST(max_slots,current_slots+${recover})
    WHERE character_id=${characterId} AND slot_level=${s.slot_level}
  `;
}

async function useClassAction(characterId,form){
  const action=String(form.action||"");
  if(action==="second_wind") return useSecondWind(characterId);
  if(action==="lay_on_hands") return useLayOnHands(characterId,form);
  if(action==="magical_cunning") return useMagicalCunning(characterId);
  if(action==="channel_divinity") return useChannelDivinity(characterId,form);
  if(action==="subclass_action") return useSubclassAction(sql,characterId,form);
  if(action==="subclass_control") return useSubclassControl(sql,characterId,form);
  throw new Error("Unknown class action");
}

function metamagicLimit(character){
  if(String(character?.class_name||"")!=="Sorcerer") return 0;
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  if(level<2) return 0;
  if(level>=17) return 6;
  if(level>=10) return 4;
  return 2;
}

const METAMAGIC_OPTIONS=[
  {name:"Careful Spell",cost:1,summary:"Protect chosen creatures from the full effect of a saving-throw spell."},
  {name:"Distant Spell",cost:1,summary:"Double a spell's range, or turn Touch range into 30 feet."},
  {name:"Empowered Spell",cost:1,summary:"Reroll a limited number of a spell's damage dice."},
  {name:"Extended Spell",cost:1,summary:"Double a qualifying spell's duration; helps with Concentration saves."},
  {name:"Heightened Spell",cost:2,summary:"Give one target Disadvantage on saving throws against the spell."},
  {name:"Quickened Spell",cost:2,summary:"Change a qualifying Action spell to a Bonus Action for that casting."},
  {name:"Seeking Spell",cost:1,summary:"Reroll a missed spell attack roll."},
  {name:"Subtle Spell",cost:1,summary:"Cast without most Verbal, Somatic, or Material components."},
  {name:"Transmuted Spell",cost:1,summary:"Change one qualifying elemental damage type into another."},
  {name:"Twinned Spell",cost:1,summary:"Increase a qualifying spell's effective slot level by 1 for extra targeting."}
];

function metamagicSelections(character){
  return featureChoiceArray(character,"metamagic")
    .map(x=>String(x||"").trim()).filter(Boolean);
}

function warlockInvocationLimit(character){
  if(String(character?.class_name||"")!=="Warlock") return 0;
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  const table=[0,1,3,3,3,5,5,6,6,7,7,7,8,8,8,9,9,9,10,10,10];
  return table[level]||0;
}

const WARLOCK_INVOCATIONS=[
  {name:"Agonizing Blast",level:2,target:"damage_cantrip",repeatable:true,summary:"Choose a damaging Warlock cantrip; add Charisma modifier to its damage rolls."},
  {name:"Armor of Shadows",level:1,summary:"Cast Mage Armor on yourself without spending a spell slot."},
  {name:"Ascendant Step",level:5,summary:"Cast Levitate on yourself without spending a spell slot."},
  {name:"Devil's Sight",level:2,summary:"See normally in magical and nonmagical Darkness within 120 feet."},
  {name:"Devouring Blade",level:12,requires:["Thirsting Blade"],summary:"Your Thirsting Blade Extra Attack grants two extra attacks instead of one."},
  {name:"Eldritch Mind",level:1,summary:"Gain Advantage on Constitution saves to maintain Concentration."},
  {name:"Eldritch Smite",level:5,requires:["Pact of the Blade"],summary:"Spend a Pact slot after a pact-weapon hit for extra Force damage and possible Prone."},
  {name:"Eldritch Spear",level:2,target:"ranged_damage_cantrip",repeatable:true,summary:"Choose a ranged damaging Warlock cantrip and greatly extend its range."},
  {name:"Fiendish Vigor",level:2,summary:"Cast False Life on yourself at will and use the maximum die result."},
  {name:"Gaze of Two Minds",level:5,summary:"Perceive through a willing creature and cast from either space while connected."},
  {name:"Gift of the Depths",level:5,summary:"Breathe underwater, gain a Swim Speed, and cast Water Breathing without a slot once per Long Rest."},
  {name:"Gift of the Protectors",level:9,requires:["Pact of the Tome"],summary:"Your Book of Shadows can prevent a named creature from dropping to 0 HP once per Long Rest."},
  {name:"Investment of the Chain Master",level:5,requires:["Pact of the Chain"],summary:"Empower your Pact familiar with movement, attacks, damage options, and defensive benefits."},
  {name:"Lessons of the First Ones",level:2,target:"origin_feat",repeatable:true,summary:"Gain an Origin feat you don't already have."},
  {name:"Lifedrinker",level:9,requires:["Pact of the Blade"],summary:"Once per turn, add extra damage with your pact weapon and optionally spend a Hit Die to heal."},
  {name:"Mask of Many Faces",level:2,summary:"Cast Disguise Self without spending a spell slot."},
  {name:"Master of Myriad Forms",level:5,summary:"Cast Alter Self on yourself without spending a spell slot."},
  {name:"Misty Visions",level:2,summary:"Cast Silent Image without spending a spell slot."},
  {name:"One with Shadows",level:5,summary:"Cast Invisibility on yourself at will while in Dim Light or Darkness."},
  {name:"Otherworldly Leap",level:2,summary:"Cast Jump on yourself without spending a spell slot."},
  {name:"Pact of the Blade",level:1,summary:"Bond with a melee weapon; it becomes a Warlock focus and can use Charisma for attacks."},
  {name:"Pact of the Chain",level:1,summary:"Learn Find Familiar and gain special familiar options."},
  {name:"Pact of the Tome",level:1,summary:"Conjure a Book of Shadows that grants additional cantrips and ritual spells."},
  {name:"Repelling Blast",level:2,target:"attack_cantrip",repeatable:true,summary:"Choose an attacking Warlock cantrip; hits can push a Large-or-smaller target away."},
  {name:"Thirsting Blade",level:5,requires:["Pact of the Blade"],summary:"Gain Extra Attack with your pact weapon."},
  {name:"Visions of Distant Realms",level:9,summary:"Cast Arcane Eye without spending a spell slot."},
  {name:"Whispers of the Grave",level:7,summary:"Cast Speak with Dead without spending a spell slot."},
  {name:"Witch Sight",level:15,summary:"Gain Truesight out to 30 feet."}
];

const PACT_FAMILIAR_FORMS=[
  {name:"Bat",kind:"normal"},
  {name:"Cat",kind:"normal"},
  {name:"Frog",kind:"normal"},
  {name:"Hawk",kind:"normal"},
  {name:"Lizard",kind:"normal"},
  {name:"Octopus",kind:"normal"},
  {name:"Owl",kind:"normal"},
  {name:"Rat",kind:"normal"},
  {name:"Raven",kind:"normal"},
  {name:"Spider",kind:"normal"},
  {name:"Weasel",kind:"normal"},
  {name:"Imp",kind:"special"},
  {name:"Pseudodragon",kind:"special"},
  {name:"Quasit",kind:"special"},
  {name:"Skeleton",kind:"special"},
  {name:"Slaad Tadpole",kind:"special"},
  {name:"Sphinx of Wonder",kind:"special"},
  {name:"Sprite",kind:"special"},
  {name:"Venomous Snake",kind:"special"}
];

function invocationSelections(character){
  return featureChoiceArray(character,"eldritch_invocations").map(x=>{
    if(typeof x==="string") return {name:x,target:""};
    if(x&&typeof x==="object") return {name:String(x.name||""),target:String(x.target||"")};
    return {name:"",target:""};
  }).filter(x=>x.name);
}

function invocationDefinition(name){
  return WARLOCK_INVOCATIONS.find(x=>x.name===name)||null;
}

function pactTomeSelections(character){
  const raw=character?.feature_choices?.pact_tome;
  return (Array.isArray(raw)?raw:[]).map(x=>{
    if(!x||typeof x!=="object") return null;
    return {
      id:String(x.id||""),name:String(x.name||""),level:Number(x.level)||0,ritual:Boolean(x.ritual),
      ruleset:String(x.ruleset||""),source_key:String(x.source_key||"")
    };
  }).filter(x=>x?.id && (x.level===0 || (x.level===1 && x.ritual)));
}

function giftProtectorState(character){
  const raw=character?.feature_choices?.gift_protectors;
  const names=Array.isArray(raw?.names)?raw.names.map(x=>String(x||"").trim()).filter(Boolean):[];
  return {names,used:Boolean(raw?.used)};
}

function giftProtectorLimit(character){
  return Math.max(1,abilityModifier(character?.charisma)||0);
}

function pactFamiliarState(character){
  const raw=character?.feature_choices?.pact_familiar;
  if(!raw||typeof raw!=="object"||!String(raw.form||"").trim()) return null;
  const maxHp=Math.max(1,Number(raw.hp_max)||1);
  const currentHp=Number.isFinite(Number(raw.hp_current))?Number(raw.hp_current):maxHp;
  return {
    form:String(raw.form),entity_id:String(raw.entity_id||""),
    hp_current:Math.max(0,Math.min(maxHp,currentHp)),hp_max:maxHp,
    movement:["Fly","Swim"].includes(raw.movement)?raw.movement:"Fly",
    damage_type:["Normal","Necrotic","Radiant"].includes(raw.damage_type)?raw.damage_type:"Normal"
  };
}

function challengeRatingValue(value){
  if(value===null||value===undefined||value==="") return null;
  const direct=Number(value);
  if(Number.isFinite(direct)) return direct;
  const fraction=String(value).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if(!fraction||Number(fraction[2])===0) return null;
  return Number(fraction[1])/Number(fraction[2]);
}

function challengeRatingText(value){
  const n=challengeRatingValue(value);
  if(n===null) return "—";
  const fractions=new Map([[0.125,"1/8"],[0.25,"1/4"],[0.5,"1/2"]]);
  return fractions.get(n)||numberText(n);
}

function creatureHasFlySpeed(speed){
  if(speed===null||speed===undefined) return false;
  if(typeof speed==="string") return /\bfly(?:ing)?\b/i.test(speed) && !/\bfly(?:ing)?\s*(?:0|—|-)/i.test(speed);
  if(Array.isArray(speed)) return speed.some(creatureHasFlySpeed);
  if(typeof speed!=="object") return false;
  const raw=speed.fly ?? speed.flying ?? speed.fly_speed;
  if(raw!==null&&raw!==undefined&&raw!==""){
    const n=Number(typeof raw==="object"?(raw.value??raw.speed??raw.amount):raw);
    if(Number.isFinite(n)) return n>0;
    if(!/^(?:0|none|—|-)$/i.test(String(raw).trim())) return true;
  }
  return speed.as_string ? creatureHasFlySpeed(speed.as_string) : false;
}

function wildShapeRules(character){
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  const available=String(character?.class_name||"")==="Druid" && level>=2;
  return {
    available,
    knownLimit:available?(level>=8?8:level>=4?6:4):0,
    maxCr:available?(level>=8?1:level>=4?0.5:0.25):0,
    allowFly:available&&level>=8,
    durationHours:available?Math.max(1,Math.floor(level/2)):0,
    temporaryHitPoints:available?level:0
  };
}

function wildShapeState(character){
  const raw=character?.feature_choices?.wild_shape;
  const source=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const knownRaw=Array.isArray(source.known_forms)?source.known_forms:Array.isArray(source.known)?source.known:[];
  const seen=new Set();
  const known=knownRaw.map(x=>{
    if(!x||typeof x!=="object") return null;
    const id=String(x.id||x.entity_id||"").trim();
    const name=String(x.name||x.name_en||"").trim();
    if(!id||!name||seen.has(id)) return null;
    seen.add(id);
    return {id,name,ruleset:String(x.ruleset||""),source_key:String(x.source_key||"")};
  }).filter(Boolean);
  const activeRaw=source.active_form&&typeof source.active_form==="object"
    ? source.active_form
    : source.active&&typeof source.active==="object"?source.active:null;
  const active=activeRaw&&String(activeRaw.id||activeRaw.entity_id||"").trim()?{
    id:String(activeRaw.id||activeRaw.entity_id),
    name:String(activeRaw.name||activeRaw.name_en||"Beast"),
    activated_at:String(activeRaw.activated_at||""),
    duration_hours:Math.max(1,Number(activeRaw.duration_hours)||wildShapeRules(character).durationHours),
    armor_class:Number.isFinite(Number(activeRaw.armor_class))?Number(activeRaw.armor_class):null,
    dexterity:Number.isFinite(Number(activeRaw.dexterity))?Number(activeRaw.dexterity):null
  }:null;
  return {known,active};
}

function familiarAttackProfile(action){
  if(!action) return {name:"Attack",attack:null,damage:null,saveDc:null};
  const text=`${typeof action.raw_data==="string"?action.raw_data:JSON.stringify(action.raw_data??"")} ${action.description_en||""}`;
  const attack=text.match(/(?:Attack Roll:|to hit[:,]?)\s*([+-]\s*\d+)/i);
  const save=text.match(/(?:DC|Difficulty Class)\s*(\d{1,2})/i);
  return {
    name:String(action.name_en||"Attack"),
    attack:attack?`1d20${attack[1].replace(/\s+/g,"")}`:null,
    damage:firstDiceFormula(action.raw_data)||firstDiceFormula(action.description_en),
    saveDc:save?Number(save[1]):null
  };
}

function wildShapeActionProfile(action){
  const attack=familiarAttackProfile(action);
  return {
    ...attack,
    action_type:String(action?.action_type||"Action"),
    description:String(action?.description_en||"")
  };
}

async function pactTomeOptions(character){
  if(String(character?.class_name)!=="Warlock" || !hasInvocation(character,"Pact of the Tome")) return {cantrips:[],rituals:[]};
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,ce.description_en,ce.ruleset,
           cs.document_key AS source_key,s.level AS spell_level,s.school,s.classes,s.ritual,s.concentration
    FROM content_entities ce
    JOIN spells s ON s.entity_id=ce.id
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    WHERE ce.entity_type='spell'
      AND (s.level=0 OR (s.level=1 AND s.ritual=TRUE))
      AND NOT EXISTS(
        SELECT 1
        FROM character_spells assigned
        JOIN content_entities assigned_entity ON assigned_entity.id=assigned.spell_entity_id
        WHERE assigned.character_id=${character.id}
          AND regexp_replace(lower(assigned_entity.name_en),'[^a-z0-9]+','','g')=
              regexp_replace(lower(ce.name_en),'[^a-z0-9]+','','g')
      )
    ORDER BY CASE ce.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,ce.name_en
  `;
  const srdOnly=character?.builder_meta?.content_scope==="srd2024";
  const selectedIds=new Set(pactTomeSelections(character).map(x=>x.id));
  const seen=new Set();
  const filtered=rows.filter(row=>{
    if(selectedIds.has(String(row.id))) return false;
    if(srdOnly && row.source_key && row.source_key!=="srd-2024") return false;
    const key=normalizedSpellName(row.name_en);
    if(!key||seen.has(key)) return false;
    seen.add(key);return true;
  });
  return {
    cantrips:filtered.filter(x=>Number(x.spell_level)===0),
    rituals:filtered.filter(x=>Number(x.spell_level)===1&&Boolean(x.ritual))
  };
}

async function pactFamiliarOptions(character){
  if(String(character?.class_name)!=="Warlock" || !hasInvocation(character,"Pact of the Chain")) return [];
  const names=PACT_FAMILIAR_FORMS.map(x=>x.name);
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,ce.ruleset,cs.document_key AS source_key,
           c.hit_points,c.armor_class,c.speed,c.creature_type,c.challenge_rating
    FROM content_entities ce
    JOIN creatures c ON c.entity_id=ce.id
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    WHERE ce.entity_type='creature'
      AND (
        ce.name_en IN ${sql(names)}
        OR (LOWER(COALESCE(c.creature_type,''))='beast' AND c.challenge_rating=0)
      )
    ORDER BY CASE ce.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,ce.name_en
  `;
  const srdOnly=character?.builder_meta?.content_scope==="srd2024";
  const chosen=new Map();
  for(const row of rows){
    if(srdOnly && row.source_key && row.source_key!=="srd-2024") continue;
    const key=String(row.name_en||"").toLowerCase();
    if(!chosen.has(key)) chosen.set(key,row);
  }
  const entityIds=[...chosen.values()].map(x=>x.id);
  const actions=entityIds.length?await sql`
    SELECT entity_id::text,action_type,name_en,description_en,raw_data,sort_order
    FROM entity_actions
    WHERE entity_id IN ${sql(entityIds)}
    ORDER BY entity_id,sort_order,name_en
  `:[];
  const actionByEntity=new Map();
  for(const action of actions){
    const current=actionByEntity.get(String(action.entity_id));
    const candidate=familiarAttackProfile(action);
    const score=(candidate.attack?2:0)+(candidate.damage?1:0)+(candidate.saveDc?1:0);
    if(!current || score>current.score){
      actionByEntity.set(String(action.entity_id),{row:action,profile:candidate,score});
    }
  }
  const baseNames=new Set(PACT_FAMILIAR_FORMS.map(x=>x.name.toLowerCase()));
  const extraBeasts=[...chosen.values()]
    .filter(row=>!baseNames.has(String(row.name_en||"").toLowerCase()))
    .sort((a,b)=>String(a.name_en).localeCompare(String(b.name_en)))
    .map(row=>({name:row.name_en,kind:"normal"}));
  return [...PACT_FAMILIAR_FORMS,...extraBeasts].map(base=>{
    const row=chosen.get(base.name.toLowerCase())||{};
    const action=actionByEntity.get(String(row.id||""));
    return {...base,...row,attack:action?.profile||null,catalogued:Boolean(row.id)};
  });
}

async function wildShapeOptions(character){
  const rules=wildShapeRules(character);
  if(!rules.available) return [];
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,ce.description_en,ce.ruleset,cs.document_key AS source_key,
           c.size,c.creature_type,c.challenge_rating,c.armor_class,c.hit_points,c.hit_dice,c.speed,
           c.strength,c.dexterity,c.constitution,c.skills,c.saving_throws,c.senses
    FROM content_entities ce
    JOIN creatures c ON c.entity_id=ce.id
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    WHERE ce.entity_type='creature'
      AND LOWER(COALESCE(c.creature_type,''))='beast'
      AND c.challenge_rating<=1
    ORDER BY CASE ce.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,
             c.challenge_rating,ce.name_en
  `;
  const srdOnly=character?.builder_meta?.content_scope==="srd2024";
  const chosen=new Map();
  for(const row of rows){
    if(srdOnly && row.source_key && row.source_key!=="srd-2024") continue;
    const key=String(row.name_en||"").trim().toLowerCase();
    if(!key||chosen.has(key)) continue;
    const cr=challengeRatingValue(row.challenge_rating);
    if(cr===null||cr>1) continue;
    chosen.set(key,{...row,cr,has_fly:creatureHasFlySpeed(row.speed)});
  }
  const entityIds=[...chosen.values()].map(x=>x.id);
  const actionRows=entityIds.length?await sql`
    SELECT entity_id::text,action_type,name_en,description_en,raw_data,sort_order
    FROM entity_actions
    WHERE entity_id IN ${sql(entityIds)}
    ORDER BY entity_id,sort_order,name_en
  `:[];
  const actionsByEntity=new Map();
  for(const row of actionRows){
    const id=String(row.entity_id);
    if(!actionsByEntity.has(id)) actionsByEntity.set(id,[]);
    actionsByEntity.get(id).push(wildShapeActionProfile(row));
  }
  return [...chosen.values()].map(row=>({
    ...row,
    eligible:row.cr<=rules.maxCr && (rules.allowFly||!row.has_fly),
    actions:actionsByEntity.get(String(row.id))||[]
  })).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.cr-b.cr||String(a.name_en).localeCompare(String(b.name_en)));
}

async function invocationTargetContext(character){
  if(String(character?.class_name||"")!=="Warlock") return {cantrips:[],originFeats:[]};
  const [cantrips,originFeats]=await Promise.all([
    sql`
      SELECT ce.id::text,ce.name_en,ce.description_en,
             s.damage,s.attack_type,s.range_text,s.classes
      FROM character_spells cs
      JOIN content_entities ce ON ce.id=cs.spell_entity_id
      JOIN spells s ON s.entity_id=ce.id
      WHERE cs.character_id=${character.id}
        AND s.level=0
      ORDER BY ce.name_en
    `,
    sql`
      SELECT ce.id::text,ce.name_en,
             cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
      FROM character_content cc
      JOIN content_entities ce ON ce.id=cc.entity_id
      JOIN content_sources cs ON cs.id=ce.source_id
      WHERE cc.content_kind='feat'
        AND cs.enabled=true
        AND LOWER(COALESCE(cc.category,'')) LIKE '%origin%'
      ORDER BY CASE cs.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,ce.name_en
    `
  ]);
  const srdOnly=character?.builder_meta?.content_scope==="srd2024";
  const seenFeats=new Set();
  const compatibleFeats=originFeats.filter(row=>{
    if(row.ruleset&&!['dnd5e-2024','dnd5e-2014'].includes(row.ruleset))return false;
    if(srdOnly&&row.source_key&&row.source_key!=="srd-2024")return false;
    const key=String(row.name_en||"").toLowerCase();
    if(!key||seenFeats.has(key))return false;
    seenFeats.add(key);return true;
  });
  return {
    cantrips:cantrips.filter(spell=>spellHasClass(spell.classes,"Warlock")),
    originFeats:compatibleFeats
  };
}

function invocationTargetCandidates(def,character,ctx){
  if(!def?.target) return [{value:"",label:""}];
  const selected=invocationSelections(character);
  const alreadyTargets=new Set(
    selected.filter(x=>x.name===def.name).map(x=>String(x.target||"").toLowerCase())
  );

  if(def.target==="origin_feat"){
    const currentOrigin=String(character.origin_feat||"").replace(/\s*\([^)]*\)\s*$/,"").trim().toLowerCase();
    return (ctx.originFeats||[])
      .filter(x=>String(x.name_en).toLowerCase()!==currentOrigin)
      .filter(x=>!alreadyTargets.has(String(x.name_en).toLowerCase()))
      .map(x=>({value:x.name_en,label:x.name_en}));
  }

  return (ctx.cantrips||[]).filter(spell=>{
    const hasDamage=spell.damage!=null || /\b\d+d\d+\b/i.test(String(spell.description_en||""));
    const hasAttack=String(spell.attack_type||"").trim()!=="";
    const range=String(spell.range_text||"").toLowerCase();
    if(def.target==="damage_cantrip") return hasDamage;
    if(def.target==="attack_cantrip") return hasAttack;
    if(def.target==="ranged_damage_cantrip") return hasDamage && !range.includes("touch") && !range.includes("self");
    return false;
  }).filter(x=>!alreadyTargets.has(String(x.name_en).toLowerCase()))
    .map(x=>({value:x.name_en,label:x.name_en}));
}

function eligibleInvocationChoices(character,ctx){
  const level=Math.max(1,Number(character.level)||1);
  const selected=invocationSelections(character);
  const names=new Set(selected.map(x=>x.name));
  const rows=[];

  for(const def of WARLOCK_INVOCATIONS){
    if(level<def.level) continue;
    if((def.requires||[]).some(req=>!names.has(req))) continue;
    if(!def.repeatable && names.has(def.name)) continue;

    const targets=invocationTargetCandidates(def,character,ctx);
    if(def.target){
      for(const target of targets){
        rows.push({
          value:`${def.name}|||${target.value}`,
          label:`${def.name} — ${target.label}`,
          summary:def.summary
        });
      }
    }else{
      rows.push({value:`${def.name}|||`,label:def.name,summary:def.summary});
    }
  }
  return rows;
}

function circleLandSpells(character){
  const land=String(featureChoiceValue(character,"circle_land")||"");
  const level=Math.max(1,Number(character.level)||1);
  const tables={
    Arid:[
      [3,["Blur","Burning Hands","Fire Bolt"]],
      [5,["Fireball"]],
      [7,["Blight"]],
      [9,["Wall of Stone"]]
    ],
    Polar:[
      [3,["Fog Cloud","Hold Person","Ray of Frost"]],
      [5,["Sleet Storm"]],
      [7,["Ice Storm"]],
      [9,["Cone of Cold"]]
    ],
    Temperate:[
      [3,["Misty Step","Shocking Grasp","Sleep"]],
      [5,["Lightning Bolt"]],
      [7,["Freedom of Movement"]],
      [9,["Tree Stride"]]
    ],
    Tropical:[
      [3,["Acid Splash","Ray of Sickness","Web"]],
      [5,["Stinking Cloud"]],
      [7,["Polymorph"]],
      [9,["Insect Plague"]]
    ]
  };
  if(!tables[land]) return [];
  return tables[land].flatMap(([min,names])=>level>=min?names:[]);
}

function fixedSubclassPreparedSpells(character){
  const level=Math.max(1,Number(character.level)||1);
  const subclass=String(character.subclass_name||"");
  const rows=[];

  const add=(min,names,key)=>{
    if(level>=min) for(const name of names) rows.push({name,sourceKey:`subclass:${key}:${min}:${normalizedSpellName(name)}`});
  };

  if(subclass==="Life Domain"){
    add(3,["Aid","Bless","Cure Wounds","Lesser Restoration"],"life");
    add(5,["Mass Healing Word","Revivify"],"life");
    add(7,["Aura of Life","Death Ward"],"life");
    add(9,["Greater Restoration","Mass Cure Wounds"],"life");
  }
  if(subclass==="Oath of Devotion"){
    add(3,["Protection from Evil and Good","Shield of Faith"],"devotion");
    add(5,["Aid","Zone of Truth"],"devotion");
    add(9,["Beacon of Hope","Dispel Magic"],"devotion");
    add(13,["Freedom of Movement","Guardian of Faith"],"devotion");
    add(17,["Commune","Flame Strike"],"devotion");
  }
  if(subclass==="Fiend Patron"){
    add(3,["Burning Hands","Command","Scorching Ray","Suggestion"],"fiend");
    add(5,["Fireball","Stinking Cloud"],"fiend");
    add(7,["Fire Shield","Wall of Fire"],"fiend");
    add(9,["Geas","Insect Plague"],"fiend");
  }
  if(subclass==="Draconic Sorcery"){
    add(3,["Alter Self","Chromatic Orb","Command","Dragon's Breath"],"draconic");
    add(5,["Fear","Fly"],"draconic");
    add(7,["Arcane Eye","Charm Monster"],"draconic");
    add(9,["Legend Lore","Summon Dragon"],"draconic");
  }
  if(subclass==="Circle of the Land"){
    const land=String(featureChoiceValue(character,"circle_land")||"").toLowerCase()||"unset";
    for(const name of circleLandSpells(character)){
      rows.push({name,sourceKey:`subclass:land:${land}:${normalizedSpellName(name)}`});
    }
  }
  return rows;
}

function loreDiscoverySelections(character){
  return featureChoiceArray(character,"lore_discoveries").map(x=>{
    if(x&&typeof x==="object") return {id:String(x.id||""),name:String(x.name||""),level:Number(x.level)||0};
    return null;
  }).filter(Boolean);
}

async function loreDiscoveryOptions(character){
  if(String(character?.class_name)!=="Bard" || String(character?.subclass_name)!=="College of Lore" || Number(character?.level)<6) return [];
  const profile=characterSpellProfile(character);
  const selectedIds=new Set(loreDiscoverySelections(character).map(x=>x.id));
  return sql`
    SELECT ce.id::text,ce.name_en,ce.description_en,
           ce.ruleset,cs.document_key AS source_key,
           s.level AS spell_level,s.school,s.classes,s.ritual,s.concentration
    FROM content_entities ce
    JOIN spells s ON s.entity_id=ce.id
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    WHERE ce.entity_type='spell'
      AND s.level<=${profile.maxSpellLevel}
    ORDER BY s.level,ce.name_en
  `.then(rows=>rows.filter(x=>
    !selectedIds.has(String(x.id)) &&
    ["Cleric","Druid","Wizard"].some(className=>spellHasClass(x.classes,className))
  ));
}

async function spendManagedResourceByKey(characterId,sourceKey,cost){
  const n=Math.max(1,Math.min(99,Number(cost)||1));
  const rows=await sql`
    UPDATE character_resources
    SET current_value=current_value-${n},updated_at=NOW()
    WHERE character_id=${characterId}
      AND source_key=${sourceKey}
      AND current_value>=${n}
    RETURNING id,current_value,max_value
  `;
  if(!rows.length) throw new Error("Not enough resource uses remaining");
  return rows[0];
}

async function setCoreClassChoice(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,subclass_name,level,skill_proficiencies,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  const key=String(form.key||"");
  const value=String(form.value||"");
  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};

  if(key==="divine_order"){
    if(c.class_name!=="Cleric" || Number(c.level)<1) throw new Error("Divine Order is not available");
    if(!["Protector","Thaumaturge"].includes(value)) throw new Error("Invalid Divine Order");
  } else if(key==="primal_order"){
    if(c.class_name!=="Druid" || Number(c.level)<1) throw new Error("Primal Order is not available");
    if(!["Magician","Warden"].includes(value)) throw new Error("Invalid Primal Order");
  } else if(key==="wizard_scholar"){
    if(c.class_name!=="Wizard" || Number(c.level)<2) throw new Error("Scholar is not available");
    const allowed=["Arcana","History","Investigation","Medicine","Nature","Religion"];
    if(!allowed.includes(value) || !(c.skill_proficiencies||[]).includes(value)) {
      throw new Error("Scholar must select one of the listed skills in which the Wizard is proficient");
    }
  } else if(key==="circle_land"){
    if(c.class_name!=="Druid" || c.subclass_name!=="Circle of the Land" || Number(c.level)<3) throw new Error("Circle land choice is not available");
    if(!["Arid","Polar","Temperate","Tropical"].includes(value)) throw new Error("Invalid land type");
  } else if(key==="draconic_affinity"){
    if(c.class_name!=="Sorcerer" || c.subclass_name!=="Draconic Sorcery" || Number(c.level)<6) throw new Error("Elemental Affinity is not available");
    if(!["Acid","Cold","Fire","Lightning","Poison"].includes(value)) throw new Error("Invalid affinity");
  } else {
    throw new Error("Unknown class choice");
  }

  choices[key]=value;
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;

  const refreshed=await getCharacter(characterId);
  if(refreshed) await ensureAlwaysPreparedSpells(refreshed.character);
}

async function setMetamagicChoice(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,level,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  const limit=metamagicLimit(c);
  if(!limit) throw new Error("Metamagic is not available");

  const name=String(form.name||"");
  if(!METAMAGIC_OPTIONS.some(x=>x.name===name)) throw new Error("Invalid Metamagic option");
  const action=String(form.action||"add");
  let selected=metamagicSelections(c);

  if(action==="remove"){
    selected=selected.filter(x=>x!==name);
  }else if(!selected.includes(name)){
    if(selected.length>=limit) throw new Error(`Metamagic limit reached (${limit})`);
    selected.push(name);
  }

  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  choices.metamagic=selected;
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
}

async function useMetamagic(characterId,form){
  const name=String(form.name||"");
  const def=METAMAGIC_OPTIONS.find(x=>x.name===name);
  if(!def) throw new Error("Unknown Metamagic option");

  const rows=await sql`
    SELECT feature_choices FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const selected=Array.isArray(rows[0].feature_choices?.metamagic)?rows[0].feature_choices.metamagic:[];
  if(!selected.includes(name)) throw new Error("This Metamagic option is not selected");
  await spendManagedResourceByKey(characterId,"class:sorcerer:sorcery-points",def.cost);
}

async function setWarlockInvocation(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,level,origin_feat,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  const limit=warlockInvocationLimit(c);
  if(!limit) throw new Error("Eldritch Invocations are not available");

  let selected=invocationSelections(c);
  const action=String(form.action||"add");
  const packed=String(form.selection||"");
  const [name,target=""]=packed.split("|||");
  const def=invocationDefinition(name);
  if(!def) throw new Error("Unknown invocation");

  if(action==="remove"){
    const dependent=selected.find(x=>{
      if(x.name===name && x.target===target) return false;
      const d=invocationDefinition(x.name);
      return (d?.requires||[]).includes(name);
    });
    if(dependent) throw new Error(`${name} is required by ${dependent.name}`);

    let removed=false;
    selected=selected.filter(x=>{
      if(!removed && x.name===name && String(x.target||"")===target){removed=true;return false;}
      return true;
    });
  }else{
    if(Number(c.level)<def.level) throw new Error(`Requires Warlock level ${def.level}`);
    const names=new Set(selected.map(x=>x.name));
    if((def.requires||[]).some(req=>!names.has(req))) throw new Error(`Missing prerequisite: ${(def.requires||[]).join(", ")}`);
    if(selected.length>=limit) throw new Error(`Invocation limit reached (${limit})`);
    if(!def.repeatable && selected.some(x=>x.name===name)) throw new Error("This invocation is already selected");

    const ctx=await invocationTargetContext(c);
    if(def.target){
      const allowed=invocationTargetCandidates(def,c,ctx).map(x=>x.value);
      if(!allowed.includes(target)) throw new Error("Invalid or already-used invocation target");
    }
    if(selected.some(x=>x.name===name && String(x.target||"")===target)) throw new Error("This invocation selection already exists");
    selected.push({name,target});
  }

  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  choices.eldritch_invocations=selected;
  if(!selected.some(x=>x.name==="Pact of the Blade")) delete choices.pact_weapon;
  if(!selected.some(x=>x.name==="Pact of the Tome")){
    delete choices.pact_tome;
    delete choices.gift_protectors;
  }
  if(!selected.some(x=>x.name==="Pact of the Chain")) delete choices.pact_familiar;
  if(!selected.some(x=>x.name==="Investment of the Chain Master") && choices.pact_familiar){
    choices.pact_familiar={...choices.pact_familiar,movement:"Fly",damage_type:"Normal"};
  }
  if(!selected.some(x=>x.name==="Gift of the Protectors")) delete choices.gift_protectors;
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
  const refreshed=await getCharacter(characterId);
  if(refreshed) await ensureAlwaysPreparedSpells(refreshed.character);
}

async function setPactTomeSpell(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  if(c.class_name!=="Warlock" || !hasInvocation(c,"Pact of the Tome")) throw new Error("Pact of the Tome is not selected");

  const action=String(form.action||"add");
  const id=String(form.spell_entity_id||"");
  let selected=pactTomeSelections(c);
  if(action==="remove"){
    selected=selected.filter(x=>x.id!==id);
  }else{
    if(selected.some(x=>x.id===id)) throw new Error("This Book of Shadows spell is already selected");
    const options=await pactTomeOptions(c);
    const spell=[...options.cantrips,...options.rituals].find(x=>String(x.id)===id);
    if(!spell) throw new Error("Choose an eligible cantrip or level 1 ritual that is not already prepared");
    const level=Number(spell.spell_level)||0;
    const cantripCount=selected.filter(x=>x.level===0).length;
    const ritualCount=selected.filter(x=>x.level===1&&x.ritual).length;
    if(level===0&&cantripCount>=3) throw new Error("Book of Shadows cantrip limit reached (3)");
    if(level===1&&ritualCount>=2) throw new Error("Book of Shadows ritual limit reached (2)");
    selected.push({
      id:String(spell.id),name:String(spell.name_en),level,ritual:Boolean(spell.ritual),
      ruleset:String(spell.ruleset||""),source_key:String(spell.source_key||"")
    });
  }

  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  choices.pact_tome=selected;
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
  const refreshed=await getCharacter(characterId);
  if(refreshed) await ensureAlwaysPreparedSpells(refreshed.character);
}

async function setPactFamiliar(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  if(c.class_name!=="Warlock" || !hasInvocation(c,"Pact of the Chain")) throw new Error("Pact of the Chain is not selected");
  const action=String(form.action||"summon");
  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  let familiar=pactFamiliarState(c);

  if(action==="clear"){
    delete choices.pact_familiar;
  }else if(action==="summon"){
    const formName=String(form.form_name||"");
    const options=await pactFamiliarOptions(c);
    const picked=options.find(x=>x.name===formName);
    if(!picked) throw new Error("Invalid Pact familiar form");
    const hp=Number.isFinite(Number(picked.hit_points))&&Number(picked.hit_points)>0?Math.round(Number(picked.hit_points)):1;
    familiar={
      form:picked.name,entity_id:String(picked.id||""),hp_current:hp,hp_max:hp,
      movement:familiar?.movement||"Fly",damage_type:familiar?.damage_type||"Normal"
    };
    choices.pact_familiar=familiar;
  }else if(action==="hp"){
    if(!familiar) throw new Error("Summon a Pact familiar first");
    const delta=Math.max(-999,Math.min(999,Number(form.delta)||0));
    familiar.hp_current=Math.max(0,Math.min(familiar.hp_max,familiar.hp_current+delta));
    choices.pact_familiar=familiar;
  }else if(action==="configure"){
    if(!familiar) throw new Error("Summon a Pact familiar first");
    if(!hasInvocation(c,"Investment of the Chain Master")) throw new Error("Investment of the Chain Master is not selected");
    const movement=String(form.movement||"");
    const damageType=String(form.damage_type||"");
    if(!["Fly","Swim"].includes(movement)) throw new Error("Choose Fly or Swim speed");
    if(!["Normal","Necrotic","Radiant"].includes(damageType)) throw new Error("Invalid familiar damage type");
    choices.pact_familiar={...familiar,movement,damage_type:damageType};
  }else{
    throw new Error("Unknown Pact familiar action");
  }
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
}

async function setWildShape(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  const rules=wildShapeRules(c);
  if(!rules.available) throw new Error("Wild Shape is not available");

  const action=String(form.action||"add");
  const state=wildShapeState(c);
  const options=await wildShapeOptions(c);
  const eligible=options.filter(x=>x.eligible);
  const id=String(form.entity_id||"");

  if(action==="add"){
    if(state.known.some(x=>x.id===id)) throw new Error("This Wild Shape form is already known");
    if(state.known.length>=rules.knownLimit) throw new Error(`Wild Shape known-form limit reached (${rules.knownLimit})`);
    const picked=eligible.find(x=>String(x.id)===id);
    if(!picked) throw new Error("Choose an eligible Beast form for this Druid level");
    state.known.push({id:String(picked.id),name:String(picked.name_en),ruleset:String(picked.ruleset||""),source_key:String(picked.source_key||"")});
  }else if(action==="remove"){
    if(state.active?.id===id) throw new Error("Leave the active Wild Shape form before replacing it");
    state.known=state.known.filter(x=>x.id!==id);
  }else if(action==="recommend"){
    const pickedIds=new Set(state.known.map(x=>x.id));
    const recommended=["Rat","Riding Horse","Spider","Wolf"];
    const ordered=[
      ...recommended.map(name=>eligible.find(x=>String(x.name_en).toLowerCase()===name.toLowerCase())).filter(Boolean),
      ...eligible
    ];
    for(const picked of ordered){
      if(state.known.length>=rules.knownLimit) break;
      if(pickedIds.has(String(picked.id))) continue;
      pickedIds.add(String(picked.id));
      state.known.push({id:String(picked.id),name:String(picked.name_en),ruleset:String(picked.ruleset||""),source_key:String(picked.source_key||"")});
    }
    if(!state.known.length) throw new Error("No eligible Beast forms are available in the local catalogue");
  }else if(action==="transform"){
    const known=state.known.find(x=>x.id===id);
    const picked=eligible.find(x=>String(x.id)===id);
    if(!known||!picked) throw new Error("Wild Shape can use only a currently eligible known form");
    await spendManagedResourceByKey(characterId,"class:druid:wild-shape",1);
    state.active={
      id:String(picked.id),name:String(picked.name_en),activated_at:new Date().toISOString(),
      duration_hours:rules.durationHours,armor_class:numericArmorClass(picked.armor_class),
      dexterity:Number.isFinite(Number(picked.dexterity))?Number(picked.dexterity):null
    };
    await sql`
      UPDATE characters
      SET temp_hp=GREATEST(COALESCE(temp_hp,0),${rules.temporaryHitPoints}),updated_at=NOW()
      WHERE id=${characterId}
    `;
  }else if(action==="exit"){
    state.active=null;
  }else{
    throw new Error("Unknown Wild Shape action");
  }

  const stored={known_forms:state.known};
  if(state.active) stored.active_form=state.active;
  await patchCharacterFeatureChoices(characterId,{wild_shape:stored});
}

async function setGiftProtector(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,level,charisma,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  if(c.class_name!=="Warlock" || !hasInvocation(c,"Gift of the Protectors")) throw new Error("Gift of the Protectors is not selected");
  const action=String(form.action||"add");
  const state=giftProtectorState(c);
  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};

  if(action==="add"){
    const name=String(form.name||"").trim().slice(0,80);
    if(!name) throw new Error("Enter a creature name");
    if(state.names.some(x=>x.toLowerCase()===name.toLowerCase())) throw new Error("That name is already on the page");
    if(state.names.length>=giftProtectorLimit(c)) throw new Error(`Gift of the Protectors name limit reached (${giftProtectorLimit(c)})`);
    state.names.push(name);
  }else if(action==="remove"){
    const name=String(form.name||"");
    state.names=state.names.filter(x=>x!==name);
  }else if(action==="trigger"){
    const name=String(form.name||"");
    if(!state.names.includes(name)) throw new Error("That creature is not named on the page");
    if(state.used) throw new Error("Gift of the Protectors has already triggered since the last Long Rest");
    state.used=true;
  }else{
    throw new Error("Unknown Gift of the Protectors action");
  }
  choices.gift_protectors=state;
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
}

async function setLoreDiscovery(characterId,form){
  const data=await getCharacter(characterId);
  if(!data) throw new Error("Character not found");
  const c=data.character;
  if(c.class_name!=="Bard" || c.subclass_name!=="College of Lore" || Number(c.level)<6) throw new Error("Magical Discoveries are not available");

  let selected=loreDiscoverySelections(c);
  const action=String(form.action||"add");

  if(action==="remove"){
    const id=String(form.spell_entity_id||"");
    selected=selected.filter(x=>x.id!==id);
  }else{
    if(selected.length>=2) throw new Error("Magical Discoveries limit reached (2)");
    const id=String(form.spell_entity_id||"");
    const options=await loreDiscoveryOptions(c);
    const spell=options.find(x=>String(x.id)===id);
    if(!spell) throw new Error("Invalid Magical Discovery spell");
    selected.push({id:String(spell.id),name:spell.name_en,level:Number(spell.spell_level)||0});
  }

  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  choices.lore_discoveries=selected;
  await sql`UPDATE characters SET feature_choices=${sql.json(choices)},updated_at=NOW() WHERE id=${characterId}`;
  const refreshed=await getCharacter(characterId);
  if(refreshed) await ensureAlwaysPreparedSpells(refreshed.character);
}

function pendingClassChoices(character){
  const out=[];
  const level=Number(character.level)||1;
  if(character.class_name==="Cleric" && !featureChoiceValue(character,"divine_order")) out.push("Divine Order");
  if(character.class_name==="Druid" && !featureChoiceValue(character,"primal_order")) out.push("Primal Order");
  if(character.class_name==="Druid" && level>=2 && wildShapeState(character).known.length<wildShapeRules(character).knownLimit) out.push("Wild Shape Forms");
  if(character.class_name==="Wizard" && level>=2 && !featureChoiceValue(character,"wizard_scholar")) out.push("Scholar");
  if(character.class_name==="Sorcerer" && metamagicSelections(character).length<metamagicLimit(character)) out.push("Metamagic");
  if(character.class_name==="Warlock" && invocationSelections(character).length<warlockInvocationLimit(character)) out.push("Eldritch Invocations");
  if(character.class_name==="Warlock" && hasInvocation(character,"Pact of the Tome")){
    const tome=pactTomeSelections(character);
    if(tome.filter(x=>x.level===0).length<3 || tome.filter(x=>x.level===1&&x.ritual).length<2) out.push("Book of Shadows");
  }
  if(character.class_name==="Warlock" && hasInvocation(character,"Pact of the Chain") && !pactFamiliarState(character)) out.push("Pact Familiar");
  if(character.subclass_name==="Circle of the Land" && level>=3 && !featureChoiceValue(character,"circle_land")) out.push("Circle Land");
  if(character.subclass_name==="Draconic Sorcery" && level>=6 && !featureChoiceValue(character,"draconic_affinity")) out.push("Elemental Affinity");
  if(character.subclass_name==="College of Lore" && level>=6 && loreDiscoverySelections(character).length<2) out.push("Magical Discoveries");
  return out;
}


function spellPickerPayload(options){
  return (options||[]).map(sp=>({
    id:String(sp.id||""),
    name:entityDisplayName(sp,displayContext.getStore()?.language||"ru","spell"),
    name_original:String(sp.name_en||""),
    level:Number(sp.spell_level)||0,
    school:translateText(String(sp.school||"Spell"),displayContext.getStore()?.language||"ru"),
    classes:spellClassNames(sp.classes).map(x=>translateText(x,displayContext.getStore()?.language||"ru")).join(", "),
    description:plainRulesText(displayText(sp.description_en,{ruleset:sp.ruleset,kind:"spell",source:sp.source_key})),
    ritual:Boolean(sp.ritual),
    concentration:Boolean(sp.concentration)
  }));
}

function renderSpellSearchPicker({action,inputName,options,placeholder="Search spells…",buttonText="Add spell",help="",pickerClass=""}){
  const payload=esc(JSON.stringify(spellPickerPayload(options)));
  return `<form method="post" action="${esc(action)}" class="spell-search-form ${esc(pickerClass)}" data-spell-picker data-spell-options="${payload}">
    <input type="hidden" name="${esc(inputName)}" data-spell-picker-value required>
    <div class="spell-search-shell">
      <div class="spell-search-field">
        <span class="spell-search-icon">⌕</span>
        <input class="spell-search-input" type="text" autocomplete="off" placeholder="${esc(placeholder)}" data-spell-picker-input>
        <button type="button" class="spell-search-clear" data-spell-picker-clear aria-label="Clear">×</button>
      </div>
      <div class="spell-search-popover" data-spell-picker-popover hidden>
        <div class="spell-search-tabs" data-spell-picker-tabs></div>
        <div class="spell-search-results" data-spell-picker-results></div>
        <div class="spell-search-empty" data-spell-picker-empty hidden>No matching spell.</div>
      </div>
    </div>
    <button class="spell-picker-submit" type="submit" data-spell-picker-submit disabled>${esc(buttonText)}</button>
    ${help?`<div class="spell-search-help">${esc(help)}</div>`:""}
  </form>`;
}

function spellGrantLabel(spell){
  const key=String(spell?.source_key||"");
  if(key.startsWith("invocation:pact-tome:")) return "Book of Shadows";
  if(key==="invocation:pact-chain:find-familiar") return "Pact of the Chain";
  if(key.startsWith("subclass:lore:discovery:")) return "Magical Discovery";
  if(key.startsWith("subclass:land:")) return "Circle Spell";
  if(key.startsWith("subclass:life:")) return "Life Domain";
  if(key.startsWith("subclass:devotion:")) return "Oath Spell";
  if(key.startsWith("subclass:fiend:")) return "Fiend Patron";
  if(key.startsWith("subclass:draconic:")) return "Draconic Spell";
  if(key.startsWith("class:druid:")) return "Druidic";
  if(key.startsWith("class:ranger:")) return "Favored Enemy";
  if(key.startsWith("class:paladin:")) return "Paladin Feature";
  if(key.startsWith("class:warlock:")) return "Warlock Feature";
  if(key.startsWith("class:bard:")) return "Bard Feature";
  return spell?.always_prepared ? "Class Feature" : "";
}

function renderPactTomePanel(c,tomeOptions){
  if(!hasInvocation(c,"Pact of the Tome")) return "";
  const selected=pactTomeSelections(c);
  const cantrips=selected.filter(x=>x.level===0);
  const rituals=selected.filter(x=>x.level===1&&x.ritual);
  const lang=displayContext.getStore()?.language||"ru";
  const spellCard=(sp,type)=>`<article class="pact-spell-card"><div><span>${esc(type)}</span><b>${esc(entityDisplayName({name_en:sp.name,ruleset:sp.ruleset,source_key:sp.source_key},lang,"spell"))}</b></div><div class="pact-inline-actions"><a class="button secondary" href="/entity/${encodeURIComponent(sp.id)}">Open</a><form method="post" action="/character/${encodeURIComponent(c.id)}/pact-tome"><input type="hidden" name="spell_entity_id" value="${esc(sp.id)}"><input type="hidden" name="action" value="remove"><button class="danger-button" title="Remove from the Book of Shadows">×</button></form></div></article>`;
  const gift=hasInvocation(c,"Gift of the Protectors")?renderGiftProtectorsPanel(c):"";
  return `<section class="pact-runtime-box pact-tome-box ${cantrips.length<3||rituals.length<2?"choice-pending":""}">
    <div class="pact-runtime-head"><div><span class="compact-kicker">Pact of the Tome</span><h5>Book of Shadows</h5></div><span class="choice-status">${cantrips.length}/3 · ${rituals.length}/2</span></div>
    <p>After a Short or Long Rest, choose three cantrips and two level 1 Ritual spells from any class. They are always prepared and use your Warlock spellcasting.</p>
    <div class="pact-spell-groups"><div><b>Cantrips · ${cantrips.length}/3</b>${cantrips.length?`<div class="pact-spell-list">${cantrips.map(sp=>spellCard(sp,"Cantrip")).join("")}</div>`:`<div class="small-note">No Book of Shadows cantrips selected.</div>`}</div><div><b>Level 1 rituals · ${rituals.length}/2</b>${rituals.length?`<div class="pact-spell-list">${rituals.map(sp=>spellCard(sp,"Ritual")).join("")}</div>`:`<div class="small-note">No Book of Shadows rituals selected.</div>`}</div></div>
    ${cantrips.length<3?renderSpellSearchPicker({
      action:`/character/${encodeURIComponent(c.id)}/pact-tome`,inputName:"spell_entity_id",options:tomeOptions?.cantrips||[],
      placeholder:"Search a cantrip from any class…",buttonText:"Add cantrip",help:"Russian and English spell names are both searchable.",pickerClass:"pact-tome-picker"
    }).replace("</form>",`<input type="hidden" name="action" value="add"></form>`):""}
    ${rituals.length<2?renderSpellSearchPicker({
      action:`/character/${encodeURIComponent(c.id)}/pact-tome`,inputName:"spell_entity_id",options:tomeOptions?.rituals||[],
      placeholder:"Search a level 1 ritual…",buttonText:"Add ritual",help:"Only eligible level 1 Ritual spells that are not already prepared are shown.",pickerClass:"pact-tome-picker"
    }).replace("</form>",`<input type="hidden" name="action" value="add"></form>`):""}
    ${gift}
  </section>`;
}

function renderGiftProtectorsPanel(c){
  const state=giftProtectorState(c);
  const limit=giftProtectorLimit(c);
  return `<div class="gift-protectors-box"><div class="pact-runtime-head"><div><span class="compact-kicker">Gift of the Protectors</span><h5>Protectors' Page</h5></div><span class="choice-status ${state.used?"spent":""}">${state.used?"Used":"Ready"}</span></div><p>Record up to ${esc(limit)} names. Once per Long Rest, one named creature that would drop to 0 HP drops to 1 HP instead.</p>${state.names.length?`<div class="protector-name-list">${state.names.map(name=>`<form method="post" action="/character/${encodeURIComponent(c.id)}/gift-protector"><input type="hidden" name="name" value="${esc(name)}"><input type="hidden" name="action" value="remove"><button class="choice-chip" title="Erase name">${esc(name)} <i>×</i></button></form>`).join("")}</div>`:`<div class="small-note">The page has no names yet.</div>`}${state.names.length<limit?`<form method="post" action="/character/${encodeURIComponent(c.id)}/gift-protector" class="choice-engine-form"><input name="name" maxlength="80" placeholder="Creature name" required><input type="hidden" name="action" value="add"><button>Add name</button></form>`:""}${state.names.length?`<form method="post" action="/character/${encodeURIComponent(c.id)}/gift-protector" class="choice-engine-form"><select name="name">${state.names.map(name=>`<option>${esc(name)}</option>`).join("")}</select><input type="hidden" name="action" value="trigger"><button ${state.used?"disabled":""}>Trigger · target stays at 1 HP</button></form>`:""}<div class="small-note">The trigger is tracked here; apply 1 HP to the named creature on its own sheet or encounter card. A Long Rest makes the page ready again.</div></div>`;
}

function renderPactFamiliarPanel(c,familiarOptions){
  if(!hasInvocation(c,"Pact of the Chain")) return "";
  const state=pactFamiliarState(c);
  const current=state?(familiarOptions||[]).find(x=>x.name===state.form):null;
  const lang=displayContext.getStore()?.language||"ru";
  const invested=hasInvocation(c,"Investment of the Chain Master");
  const profile=characterSpellProfile(c);
  const back=`/character/${encodeURIComponent(c.id)}`;
  const normal=(familiarOptions||[]).filter(x=>x.kind==="normal");
  const special=(familiarOptions||[]).filter(x=>x.kind==="special");
  const familiarName=x=>translateText(String(x?.name_en||x?.name||""),lang);
  const noLocalStats=translateText("· no local stat block",lang);
  const option=(x)=>`<option value="${esc(x.name)}" ${state?.form===x.name?"selected":""}>${esc(familiarName(x))}${x.catalogued?"":` ${esc(noLocalStats)}`}</option>`;
  const attack=current?.attack;
  const attackTiming=translateText(invested?"Reaction or Bonus Action":"Reaction after you forgo an attack",lang);
  const attackDc=attack?.saveDc?translateText(invested?`Save DC ${profile.saveDc}`:`DC ${attack.saveDc}`,lang):"";
  return `<section class="pact-runtime-box pact-familiar-box ${state?"":"choice-pending"}">
    <div class="pact-runtime-head"><div><span class="compact-kicker">Pact of the Chain</span><h5>${state?esc(familiarName(current||{name_en:state.form})):"Pact Familiar"}</h5></div><span class="choice-status">${state?`${esc(state.hp_current)} / ${esc(state.hp_max)} HP`:"Choose form"}</span></div>
    <p>Cast Find Familiar as a Magic action without a spell slot. When you take the Attack action, you can forgo one attack so the familiar attacks with its Reaction.</p>
    <form method="post" action="/character/${encodeURIComponent(c.id)}/pact-familiar" class="choice-engine-form"><select name="form_name" required><optgroup label="${esc(translateText("Normal familiar forms",lang))}">${normal.map(option).join("")}</optgroup><optgroup label="${esc(translateText("Special Pact forms",lang))}">${special.map(option).join("")}</optgroup></select><input type="hidden" name="action" value="summon"><button>${state?"Resummon / change":"Summon"}</button></form>
    ${state?`<div class="familiar-runtime-card"><div class="familiar-stats"><span><b>AC</b>${esc(current?.catalogued?acText(current.armor_class):"—")}</span><span><b>HP</b>${esc(state.hp_current)} / ${esc(state.hp_max)}</span><span><b>Speed</b>${esc(current?.catalogued?speedText(current.speed):"—")}</span><span><b>Form</b>${current?.kind==="special"?"Special form":"Normal form"}</span></div><form method="post" action="/character/${encodeURIComponent(c.id)}/pact-familiar" class="familiar-hp-form"><input name="delta" type="number" value="-1" step="1"><input type="hidden" name="action" value="hp"><button>Apply HP</button></form>${attack?`<div class="familiar-attack"><div><b>${esc(entityDisplayName({name_en:attack.name,ruleset:current?.ruleset,source_key:current?.source_key},lang,"action"))}</b><span>${esc(attackTiming)}${attackDc?` · ${esc(attackDc)}`:""}</span></div><div class="pact-inline-actions">${attack.attack?characterRollForm({formula:attack.attack,label:`${state.form} — ${attack.name} attack`,back,text:`Attack ${attack.attack}`}):""}${attack.damage?characterRollForm({formula:attack.damage,label:`${state.form} — ${attack.name} damage${state.damage_type!=="Normal"?` (${state.damage_type})`:""}`,back,text:`Damage ${attack.damage}`}):""}</div></div>`:`<div class="small-note">No attack action was found in the local creature stat block.</div>`}${invested?`<div class="investment-box"><div><span class="compact-kicker">Investment of the Chain Master</span><b>Empowered Familiar</b></div><form method="post" action="/character/${encodeURIComponent(c.id)}/pact-familiar" class="choice-engine-form"><label>40 ft. speed<select name="movement"><option value="Fly" ${state.movement==="Fly"?"selected":""}>Fly</option><option value="Swim" ${state.movement==="Swim"?"selected":""}>Swim</option></select></label><label>Physical damage becomes<select name="damage_type"><option value="Normal" ${state.damage_type==="Normal"?"selected":""}>Normal damage</option><option value="Necrotic" ${state.damage_type==="Necrotic"?"selected":""}>Necrotic damage</option><option value="Radiant" ${state.damage_type==="Radiant"?"selected":""}>Radiant damage</option></select></label><input type="hidden" name="action" value="configure"><button>Save</button></form><div class="choice-preview"><span>Bonus Action attack</span><span>Save DC ${esc(profile.saveDc)}</span><span>Reaction: Resistance</span><span>${esc(state.movement)} 40 ft.</span></div></div>`:""}<form method="post" action="/character/${encodeURIComponent(c.id)}/pact-familiar"><input type="hidden" name="action" value="clear"><button class="button secondary">Release familiar form</button></form></div>`:""}
  </section>`;
}

function renderWildShapeActionList(c,form,back){
  const lang=displayContext.getStore()?.language||"ru";
  const actions=Array.isArray(form?.actions)?form.actions:[];
  if(!actions.length) return `<div class="wild-shape-empty">No actions were found in this Beast's local stat block.</div>`;
  return `<div class="wild-shape-action-list">${actions.map(action=>{
    const actionName=entityDisplayName({name_en:action.name,ruleset:form.ruleset,source_key:form.source_key},lang,"action");
    const description=displayText(action.description,{ruleset:form.ruleset,kind:"action",source:form.source_key});
    const rolls=[
      action.attack?characterRollForm({formula:action.attack,label:`${c.name} as ${form.name_en} — ${action.name} attack`,back,text:`Attack ${action.attack}`}):"",
      action.damage?characterRollForm({formula:action.damage,label:`${c.name} as ${form.name_en} — ${action.name} damage`,back,text:`Damage ${action.damage}`}):""
    ].filter(Boolean).join("");
    return `<div class="wild-shape-action"><div class="wild-shape-action-head"><div><b>${esc(actionName)}</b><span class="chip">${esc(action.action_type||"Action")}</span></div>${rolls?`<div class="pact-inline-actions">${rolls}</div>`:""}</div>${description?`<p>${esc(truncate(description,280))}</p>`:""}${action.saveDc?`<div class="small-note">Save DC ${esc(action.saveDc)}</div>`:""}</div>`;
  }).join("")}</div>`;
}

function renderWildShapeActiveCard(c,form,pool,back){
  const state=wildShapeState(c);
  if(!state.active) return "";
  const lang=displayContext.getStore()?.language||"ru";
  const name=entityDisplayName({name_en:form?.name_en||state.active.name,ruleset:form?.ruleset,source_key:form?.source_key},lang,"creature");
  const ac=form?acText(form.armor_class):(state.active.armor_class??"—");
  const speed=form?speedText(form.speed):"—";
  const cr=form?challengeRatingText(form.cr):"—";
  return `<div class="wild-shape-active">
    <div class="wild-shape-active-head"><div><span class="compact-kicker">Active Wild Shape · Bonus Action</span><h4>${esc(name)}</h4></div><span class="choice-status">${esc(pool?.current_value??0)} / ${esc(pool?.max_value??0)} uses</span></div>
    <div class="wild-shape-stats"><span><b>AC</b>${esc(ac)}</span><span><b>Speed</b>${esc(speed)}</span><span><b>CR</b>${esc(cr)}</span><span><b>Temporary HP</b>${esc(c.temp_hp||0)}</span></div>
    ${form?`<div class="wild-shape-physical"><span>STR ${esc(abilityText(form.strength))}</span><span>DEX ${esc(abilityText(form.dexterity))}</span><span>CON ${esc(abilityText(form.constitution))}</span><span>${esc(form.size||"Beast")}</span></div>`:""}
    <div class="small-note">Use your own Hit Points, Hit Dice, INT, WIS, CHA, class features, languages and feats. This form can last up to ${esc(state.active.duration_hours)} hours.</div>
    ${renderWildShapeActionList(c,form,back)}
    <div class="wild-shape-form-actions"><a class="button secondary" href="/entity/${encodeURIComponent(state.active.id)}">Open stat block</a><form method="post" action="/character/${encodeURIComponent(c.id)}/wild-shape"><input type="hidden" name="action" value="exit"><button class="button secondary">Leave form · Bonus Action</button></form></div>
  </div>`;
}

function renderWildShapePanel(c,options,resources){
  const rules=wildShapeRules(c);
  if(!rules.available) return "";
  const state=wildShapeState(c);
  const pool=(resources||[]).find(x=>x.source_key==="class:druid:wild-shape");
  const byId=new Map((options||[]).map(x=>[String(x.id),x]));
  const selectedIds=new Set(state.known.map(x=>x.id));
  const available=(options||[]).filter(x=>x.eligible&&!selectedIds.has(String(x.id)));
  const activeForm=state.active?byId.get(state.active.id)||null:null;
  const lang=displayContext.getStore()?.language||"ru";
  const formName=form=>entityDisplayName({name_en:form?.name_en||form?.name,ruleset:form?.ruleset,source_key:form?.source_key},lang,"creature");
  const knownCards=state.known.map(saved=>{
    const form=byId.get(saved.id)||{...saved,name_en:saved.name,eligible:false,cr:null};
    const active=state.active?.id===saved.id;
    return `<article class="wild-shape-form ${active?"active":""} ${form.eligible===false?"ineligible":""}"><div class="wild-shape-form-head"><div><span>${active?"Active form":form.eligible===false?"Not eligible at this level":"Known form"}</span><h5>${esc(formName(form))}</h5></div><span>CR ${esc(challengeRatingText(form.cr??form.challenge_rating))}</span></div><div class="wild-shape-stats"><span><b>AC</b>${esc(form.armor_class!==undefined?acText(form.armor_class):"—")}</span><span><b>Speed</b>${esc(form.speed!==undefined?speedText(form.speed):"—")}</span><span><b>STR</b>${esc(form.strength!==undefined?abilityText(form.strength):"—")}</span><span><b>DEX</b>${esc(form.dexterity!==undefined?abilityText(form.dexterity):"—")}</span></div><div class="wild-shape-form-actions"><a class="button secondary" href="/entity/${encodeURIComponent(saved.id)}">Open</a>${form.eligible!==false?`<form method="post" action="/character/${encodeURIComponent(c.id)}/wild-shape"><input type="hidden" name="entity_id" value="${esc(saved.id)}"><input type="hidden" name="action" value="transform"><button ${Number(pool?.current_value||0)<1?"disabled":""}>${active?"Transform again":"Transform"}</button></form>`:""}<form method="post" action="/character/${encodeURIComponent(c.id)}/wild-shape"><input type="hidden" name="entity_id" value="${esc(saved.id)}"><input type="hidden" name="action" value="remove"><button class="danger-button" ${active?"disabled title=\"Leave the active form first\"":""}>×</button></form></div></article>`;
  }).join("");
  const optionHtml=available.map(form=>`<option value="${esc(form.id)}">${esc(formName(form))} · CR ${esc(challengeRatingText(form.cr))}${form.has_fly?" · Fly":""}</option>`).join("");
  return `<div class="choice-engine-card wide wild-shape-box ${state.known.length<rules.knownLimit?"choice-pending":""}">
    <div class="choice-engine-head"><div><span class="compact-kicker">Druid · Level ${esc(c.level)}</span><h4>Wild Shape Forms</h4></div><span class="choice-status">${state.known.length}/${rules.knownLimit} · CR ${esc(challengeRatingText(rules.maxCr))}${rules.allowFly?" · Fly allowed":" · No Fly"}</span></div>
    <p>Learn eligible Beast forms, then expend one Wild Shape use to transform as a Bonus Action. Replace one known form after a Long Rest.</p>
    ${knownCards?`<div class="wild-shape-known">${knownCards}</div>`:`<div class="wild-shape-empty">No Wild Shape forms learned yet.</div>`}
    ${state.known.length<rules.knownLimit&&available.length?`<form method="post" action="/character/${encodeURIComponent(c.id)}/wild-shape" class="choice-engine-form"><select name="entity_id" required><option value="">Choose eligible Beast…</option>${optionHtml}</select><input type="hidden" name="action" value="add"><button>Learn form</button></form>`:""}
    ${state.known.length<rules.knownLimit?`<form method="post" action="/character/${encodeURIComponent(c.id)}/wild-shape" class="wild-shape-form-actions"><input type="hidden" name="action" value="recommend"><button class="button secondary">Fill recommended forms</button></form>`:""}
    <div class="small-note">Maximum duration: ${esc(rules.durationHours)} hours. Transforming grants ${esc(rules.temporaryHitPoints)} Temporary HP; Temporary HP do not stack. Russian and English creature names remain available in the catalogue.</div>
    ${renderWildShapeActiveCard(c,activeForm,pool,`/character/${encodeURIComponent(c.id)}`)}
  </div>`;
}

function renderWildShapeCombatPanel(c,options,resources,back){
  const rules=wildShapeRules(c);
  if(!rules.available) return "";
  const state=wildShapeState(c);
  const pool=(resources||[]).find(x=>x.source_key==="class:druid:wild-shape");
  const byId=new Map((options||[]).map(x=>[String(x.id),x]));
  const activeForm=state.active?byId.get(state.active.id)||null:null;
  if(state.active) return `<div class="sheet-panel wild-shape-combat">${renderWildShapeActiveCard(c,activeForm,pool,back)}</div>`;
  const lang=displayContext.getStore()?.language||"ru";
  const known=state.known.map(saved=>byId.get(saved.id)).filter(x=>x?.eligible);
  const optionsHtml=known.map(form=>`<option value="${esc(form.id)}">${esc(entityDisplayName(form,lang,"creature"))} · CR ${esc(challengeRatingText(form.cr))}</option>`).join("");
  return `<div class="sheet-panel wild-shape-combat"><div class="spellbook-head"><div><h3>Wild Shape</h3><p class="small-note">${esc(pool?.current_value??0)} / ${esc(pool?.max_value??0)} uses · Bonus Action · ${esc(rules.temporaryHitPoints)} Temporary HP</p></div>${known.length?`<form method="post" action="/character/${encodeURIComponent(c.id)}/wild-shape" class="choice-engine-form"><select name="entity_id">${optionsHtml}</select><input type="hidden" name="action" value="transform"><button ${Number(pool?.current_value||0)<1?"disabled":""}>Transform</button></form>`:""}</div>${known.length?`<div class="small-note">Choose and manage all known forms on the Features tab.</div>`:`<div class="wild-shape-empty">Learn Wild Shape forms on the Features tab first.</div>`}</div>`;
}

function renderClassChoicePanel(c,resources,invocationCtx,loreOptions,inventory,tomeOptions,familiarOptions,wildOptions){
  const panels=[];

  if(c.class_name==="Cleric"){
    const current=String(featureChoiceValue(c,"divine_order")||"");
    panels.push(`<div class="choice-engine-card ${current?"":"choice-pending"}"><div class="choice-engine-head"><div><span class="compact-kicker">Level 1 · Cleric</span><h4>Divine Order</h4></div><span class="choice-status">${current?esc(current):"Choose"}</span></div><p>Protector favors martial training. Thaumaturge expands cantrips and scholarly divine checks.</p><form method="post" action="/character/${encodeURIComponent(c.id)}/class-choice" class="choice-engine-form"><input type="hidden" name="key" value="divine_order"><select name="value"><option value="Protector" ${current==="Protector"?"selected":""}>Protector · Martial weapons + Heavy armor</option><option value="Thaumaturge" ${current==="Thaumaturge"?"selected":""}>Thaumaturge · +1 cantrip + Arcana/Religion bonus</option></select><button>Save</button></form></div>`);
  }

  if(c.class_name==="Druid"){
    const current=String(featureChoiceValue(c,"primal_order")||"");
    panels.push(`<div class="choice-engine-card ${current?"":"choice-pending"}"><div class="choice-engine-head"><div><span class="compact-kicker">Level 1 · Druid</span><h4>Primal Order</h4></div><span class="choice-status">${current?esc(current):"Choose"}</span></div><p>Magician deepens primal spellcraft. Warden adds martial weapons and Medium armor training.</p><form method="post" action="/character/${encodeURIComponent(c.id)}/class-choice" class="choice-engine-form"><input type="hidden" name="key" value="primal_order"><select name="value"><option value="Magician" ${current==="Magician"?"selected":""}>Magician · +1 cantrip + Arcana/Nature bonus</option><option value="Warden" ${current==="Warden"?"selected":""}>Warden · Martial weapons + Medium armor</option></select><button>Save</button></form></div>`);

    if(Number(c.level)>=2) panels.push(renderWildShapePanel(c,wildOptions,resources));

    if(c.subclass_name==="Circle of the Land" && Number(c.level)>=3){
      const land=String(featureChoiceValue(c,"circle_land")||"");
      panels.push(`<div class="choice-engine-card ${land?"":"choice-pending"}"><div class="choice-engine-head"><div><span class="compact-kicker">Circle of the Land</span><h4>Land Type</h4></div><span class="choice-status">${land?esc(land):"Choose"}</span></div><p>Your current land determines the Circle spells that are always prepared. It can normally be changed after a Long Rest.</p><form method="post" action="/character/${encodeURIComponent(c.id)}/class-choice" class="choice-engine-form"><input type="hidden" name="key" value="circle_land"><select name="value">${["Arid","Polar","Temperate","Tropical"].map(x=>`<option ${land===x?"selected":""}>${x}</option>`).join("")}</select><button>Set land</button></form>${land?`<div class="choice-preview">${circleLandSpells(c).map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}</div>`);
    }
  }

  if(c.class_name==="Wizard" && Number(c.level)>=2){
    const current=String(featureChoiceValue(c,"wizard_scholar")||"");
    const eligible=["Arcana","History","Investigation","Medicine","Nature","Religion"].filter(x=>(c.skill_proficiencies||[]).includes(x));
    panels.push(`<div class="choice-engine-card ${current?"":"choice-pending"}"><div class="choice-engine-head"><div><span class="compact-kicker">Level 2 · Wizard</span><h4>Scholar</h4></div><span class="choice-status">${current?esc(current):"Choose"}</span></div><p>Choose one eligible skill you already know. Scholar grants Expertise in that skill.</p>${eligible.length?`<form method="post" action="/character/${encodeURIComponent(c.id)}/class-choice" class="choice-engine-form"><input type="hidden" name="key" value="wizard_scholar"><select name="value">${eligible.map(x=>`<option ${current===x?"selected":""}>${esc(x)}</option>`).join("")}</select><button>Save</button></form>`:`<div class="feature-warning">No eligible proficient Scholar skill is currently recorded on this character.</div>`}</div>`);
  }

  if(c.class_name==="Sorcerer" && metamagicLimit(c)){
    const limit=metamagicLimit(c);
    const selected=metamagicSelections(c);
    const pool=resources.find(x=>x.source_key==="class:sorcerer:sorcery-points");
    panels.push(`<div class="choice-engine-card wide ${selected.length<limit?"choice-pending":""}"><div class="choice-engine-head"><div><span class="compact-kicker">Sorcerer · Level ${esc(c.level)}</span><h4>Metamagic</h4></div><span class="choice-status">${selected.length}/${limit}${pool?` · ${esc(pool.current_value)} SP`:""}</span></div><div class="choice-token-list">${selected.map(name=>{const def=METAMAGIC_OPTIONS.find(x=>x.name===name);return `<div class="choice-token"><div><b>${esc(name)}</b><span>${esc(def?.summary||"")}</span></div><div class="choice-token-actions">${def&&pool?`<form method="post" action="/character/${encodeURIComponent(c.id)}/metamagic/use"><input type="hidden" name="name" value="${esc(name)}"><button ${Number(pool.current_value)<def.cost?"disabled":""}>Use · ${def.cost} SP</button></form>`:""}<form method="post" action="/character/${encodeURIComponent(c.id)}/metamagic"><input type="hidden" name="name" value="${esc(name)}"><input type="hidden" name="action" value="remove"><button class="danger-button">×</button></form></div></div>`}).join("")}</div>${selected.length<limit?`<form method="post" action="/character/${encodeURIComponent(c.id)}/metamagic" class="choice-engine-form"><select name="name"><option value="">Choose Metamagic…</option>${METAMAGIC_OPTIONS.filter(x=>!selected.includes(x.name)).map(x=>`<option value="${esc(x.name)}">${esc(translateText(x.name,displayContext.getStore()?.language||"ru"))} · ${x.cost} SP</option>`).join("")}</select><input type="hidden" name="action" value="add"><button>Add</button></form>`:""}</div>`);
  }

  if(c.class_name==="Warlock"){
    const limit=warlockInvocationLimit(c);
    const selected=invocationSelections(c);
    const available=eligibleInvocationChoices(c,invocationCtx);
    const pactSelected=hasInvocation(c,"Pact of the Blade");
    const pactChoice=pactWeaponChoice(c);
    const pactItems=(inventory||[]).filter(isPactBladeEligibleItem);
    const bladePanel=pactSelected?`<section class="pact-runtime-box pact-weapon-box"><div><span class="compact-kicker">Pact of the Blade</span><h5>${pactChoice?`Bound · ${esc(pactChoice.name)}`:"Bind a Pact Weapon"}</h5><p>Your bound inventory weapon uses Charisma for its attack and damage rolls on this sheet.</p></div>${pactItems.length?`<form method="post" action="/character/${encodeURIComponent(c.id)}/pact-weapon" class="choice-engine-form"><select name="instance_id">${pactItems.map(item=>`<option value="${esc(item.instance_id)}" ${pactChoice&&String(pactChoice.instance_id)===String(item.instance_id)?"selected":""}>${esc(item.name_en)}</option>`).join("")}</select><input type="hidden" name="action" value="set"><button>Bind</button></form>`:`<div class="feature-warning">Add a melee weapon to this character's inventory to bind it.</div>`}${pactChoice?`<form method="post" action="/character/${encodeURIComponent(c.id)}/pact-weapon"><input type="hidden" name="action" value="clear"><button class="button secondary">Clear bond</button></form>`:""}</section>`:"";
    const pactRuntime=[bladePanel,renderPactTomePanel(c,tomeOptions),renderPactFamiliarPanel(c,familiarOptions)].filter(Boolean).join("");
    panels.push(`<div class="choice-engine-card wide ${selected.length<limit?"choice-pending":""}">
      <div class="choice-engine-head"><div><span class="compact-kicker">Warlock · Level ${esc(c.level)}</span><h4>Eldritch Invocations</h4></div><span class="choice-status">${selected.length}/${limit}</span></div>
      <div class="choice-token-list">${selected.map(sel=>{const def=invocationDefinition(sel.name);return `<div class="choice-token"><div><b>${esc(sel.name)}${sel.target?` · ${esc(sel.target)}`:""}</b><span>${esc(def?.summary||"")}</span></div><form method="post" action="/character/${encodeURIComponent(c.id)}/invocation"><input type="hidden" name="selection" value="${esc(`${sel.name}|||${sel.target||""}`)}"><input type="hidden" name="action" value="remove"><button class="danger-button">×</button></form></div>`}).join("")}</div>
      ${selected.length<limit?`<form method="post" action="/character/${encodeURIComponent(c.id)}/invocation" class="choice-engine-form"><select name="selection" required><option value="">Choose eligible invocation…</option>${available.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("")}</select><input type="hidden" name="action" value="add"><button>Add</button></form>`:""}
      <div class="small-note">Level and invocation-dependency prerequisites are enforced. Targeted invocations only offer currently eligible cantrips or Origin feats.</div>
      ${pactRuntime?`<div class="pact-runtime-grid">${pactRuntime}</div>`:""}
    </div>`);
  }

  if(c.subclass_name==="Draconic Sorcery" && Number(c.level)>=6){
    const current=String(featureChoiceValue(c,"draconic_affinity")||"");
    panels.push(`<div class="choice-engine-card ${current?"":"choice-pending"}"><div class="choice-engine-head"><div><span class="compact-kicker">Draconic Sorcery · Level 6</span><h4>Elemental Affinity</h4></div><span class="choice-status">${current?esc(current):"Choose"}</span></div><p>Select the damage type tied to your draconic magic.</p><form method="post" action="/character/${encodeURIComponent(c.id)}/class-choice" class="choice-engine-form"><input type="hidden" name="key" value="draconic_affinity"><select name="value">${["Acid","Cold","Fire","Lightning","Poison"].map(x=>`<option ${current===x?"selected":""}>${x}</option>`).join("")}</select><button>Save</button></form></div>`);
  }

  if(c.subclass_name==="College of Lore" && Number(c.level)>=6){
    const selected=loreDiscoverySelections(c);
    panels.push(`<div class="choice-engine-card wide lore-discoveries-card ${selected.length<2?"choice-pending":""}">
      <div class="choice-engine-head"><div><span class="compact-kicker">College of Lore · Level 6</span><h4>Magical Discoveries</h4></div><span class="choice-status">${selected.length}/2</span></div>
      <p>Choose two eligible spells from the Cleric, Druid, or Wizard lists. Search checks spell names first and falls back to descriptions only when no name matches. Your discoveries are always prepared.</p>
      ${selected.length?`<div class="discovery-card-grid">${selected.map(sp=>`<article class="discovery-card">
        <div class="discovery-card-head"><div><span>${sp.level===0?"Cantrip":`Level ${esc(sp.level)}`}</span><b>${esc(sp.name)}</b></div><span class="discovery-seal">Lore</span></div>
        <div class="discovery-card-meta">Magical Discovery · Always Prepared</div>
        <div class="discovery-card-actions"><a class="button secondary" href="/entity/${encodeURIComponent(sp.id)}">Open spell</a><form method="post" action="/character/${encodeURIComponent(c.id)}/lore-discovery"><input type="hidden" name="spell_entity_id" value="${esc(sp.id)}"><input type="hidden" name="action" value="remove"><button class="danger-button" title="Remove discovery">×</button></form></div>
      </article>`).join("")}</div>`:`<div class="discovery-empty">Two empty discovery slots remain.</div>`}
      ${selected.length<2?renderSpellSearchPicker({
        action:`/character/${encodeURIComponent(c.id)}/lore-discovery`,
        inputName:"spell_entity_id",
        options:loreOptions||[],
        placeholder:"Search Cleric, Druid or Wizard spell…",
        buttonText:"Add discovery",
        help:"Suggestions are grouped by spell level. Start typing to filter by name; if no name matches, the picker searches descriptions.",
        pickerClass:"lore-spell-picker"
      }).replace("</form>",`<input type="hidden" name="action" value="add"></form>`):""}
    </div>`);
  }

  return panels.length?`<section class="section class-choice-section"><div class="unlocked-feature-head"><div><h3>Class Choices</h3><p>Persistent choices that change the character sheet, spell limits, skills, resources, or subclass spell packages.</p></div><span>${esc(pendingClassChoices(c).length)} pending</span></div><div class="choice-engine-grid">${panels.join("")}</div></section>`:"";
}

function fightingStyleName(character){
  return String(featureChoiceValue(character,"fighting_style") || "").trim();
}

function weaponMasteryLimit(character){
  const cls=String(character?.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  if(cls==="Barbarian") return level>=10?4:level>=4?3:2;
  if(cls==="Fighter") return level>=16?6:level>=10?5:level>=4?4:3;
  if(["Paladin","Ranger","Rogue"].includes(cls)) return 2;
  return 0;
}

function expertiseLimit(character){
  const cls=String(character?.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  if(cls==="Rogue") return level>=6?4:2;
  if(cls==="Bard") return level>=9?4:level>=2?2:0;
  if(cls==="Ranger") return level>=9?3:level>=2?1:0;
  return 0;
}

function fightingStyleGranted(character){
  const cls=String(character?.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  return cls==="Fighter" ? level>=1 : ["Paladin","Ranger"].includes(cls) ? level>=2 : false;
}

function weaponMasteryNames(character){
  return Array.isArray(character?.weapon_masteries)
    ? character.weapon_masteries.map(x=>String(x||"").trim()).filter(Boolean)
    : [];
}

function expertiseNames(character){
  return Array.isArray(character?.expertise_skills)
    ? character.expertise_skills.map(x=>String(x||"").trim()).filter(Boolean)
    : [];
}

function weaponMasteryIdentity(item){
  const d=item?.data||{};
  const base=String(d.baseItem||"").trim();
  if(base) return base;
  return String(item?.name_en||"")
    .replace(/\s*\(\s*\+[123]\s*\)\s*$/,"")
    .replace(/\s+\+[123]\s*$/,"")
    .trim();
}

function weaponMasteryForItem(character,item){
  if(!isWeaponCard(item)) return null;
  const identity=weaponMasteryIdentity(item).toLowerCase();
  const known=weaponMasteryNames(character).some(x=>x.toLowerCase()===identity);
  if(!known) return null;
  const mastery=String(item?.data?.mastery||"").trim();
  return mastery || "Mastered";
}

const MASTERY_HELP={
  Cleave:"After a qualifying melee hit, make one extra attack against a second nearby target once per turn.",
  Graze:"On a miss, deal damage equal to the attack ability modifier.",
  Nick:"The Light-property extra attack can be folded into the Attack action instead of using a Bonus Action.",
  Push:"On a hit, push a Large-or-smaller target up to 10 feet straight away.",
  Sap:"On a hit, the target has Disadvantage on its next attack roll before your next turn.",
  Slow:"On a damaging hit, reduce the target's Speed by 10 feet until your next turn.",
  Topple:"On a hit, the target makes a Constitution save or falls Prone.",
  Vex:"On a damaging hit, gain Advantage on your next attack against that target before the end of your next turn."
};

function masteryHelp(name){
  return MASTERY_HELP[String(name||"")] || "Use this weapon's mastery property when its trigger applies.";
}

function itemEligibleForMastery(character,item){
  const cls=String(character?.class_name||"");
  if(!weaponMasteryLimit(character)) return false;
  const category=String(item?.weapon_category||item?.data?.weaponCategory||"").toLowerCase();
  const props=normalizedPropertyText(item?.properties ?? item?.data?.properties);
  const simple=category.includes("simple");
  const martial=category.includes("martial");
  const melee=category.includes("melee");
  if(cls==="Barbarian") return (simple||martial) && melee;
  if(["Fighter","Paladin","Ranger"].includes(cls)) return simple||martial;
  if(cls==="Rogue") return simple || (martial && (props.includes("finesse")||props.includes("light")));
  return false;
}

async function weaponMasteryOptions(character){
  if(!weaponMasteryLimit(character)) return [];
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,
           i.weapon_category,i.mastery,i.damage_dice,i.damage_type,i.properties
    FROM items i
    JOIN content_entities ce ON ce.id=i.entity_id
    WHERE i.item_kind='equipment'
      AND i.item_type='weapon'
      AND i.mastery IS NOT NULL
      AND BTRIM(i.mastery)<>''
    ORDER BY ce.name_en
  `;
  return rows.filter(row=>itemEligibleForMastery(character,row));
}

async function fightingStyleOptions(){
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,ce.description_en,cc.category,cc.traits,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cc.content_kind='feat'
      AND cs.enabled=true
      AND (
        LOWER(COALESCE(cc.category,'')) LIKE '%fighting%'
        OR ce.name_en IN ('Archery','Defense','Great Weapon Fighting','Two-Weapon Fighting')
      )
    ORDER BY ce.name_en
  `;
  return dedupeGuidedRows(rows,"feat");
}

async function subclassOptionsForCharacter(character){
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,cc.summary,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cc.content_kind='subclass'
      AND cs.enabled=true
    ORDER BY ce.name_en
  `;
  const scope=guidedContentScope(character?.builder_meta?.content_scope);
  return dedupeGuidedRows(rows,"subclass").filter(row=>scopeAllows(row,scope)).filter(row=>{
    const parent=builderName(row.summary?.parent_class);
    return !parent || parent===character.class_name;
  }).map(row=>({...row,option_label:guidedOptionLabel(row)}));
}

async function setWeaponMastery(characterId,form){
  const chars=await sql`
    SELECT id::text,class_name,level,weapon_masteries
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!chars.length) throw new Error("Character not found");
  const character=chars[0];
  const limit=weaponMasteryLimit(character);
  if(!limit) throw new Error("This class does not currently have Weapon Mastery");

  const weaponId=String(form.weapon_entity_id||"");
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,i.weapon_category,i.mastery,i.properties
    FROM items i JOIN content_entities ce ON ce.id=i.entity_id
    WHERE ce.id=${weaponId}
      AND i.item_kind='equipment'
      AND i.item_type='weapon'
    LIMIT 1
  `;
  if(!rows.length) throw new Error("Weapon not found");
  const weapon=rows[0];
  if(!itemEligibleForMastery(character,weapon)) throw new Error("This weapon is not eligible for this class's Weapon Mastery");

  const action=String(form.action||"add");
  let selected=weaponMasteryNames(character);
  const key=String(weapon.name_en).toLowerCase();
  if(action==="remove"){
    selected=selected.filter(x=>x.toLowerCase()!==key);
  }else{
    if(!selected.some(x=>x.toLowerCase()===key)){
      if(selected.length>=limit) throw new Error(`Weapon Mastery limit reached (${limit})`);
      selected.push(weapon.name_en);
    }
  }
  await sql`
    UPDATE characters
    SET weapon_masteries=${sql.json(selected)},updated_at=NOW()
    WHERE id=${characterId}
  `;
}

async function setExpertiseSkill(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,level,skill_proficiencies,expertise_skills
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  const limit=expertiseLimit(c);
  if(!limit) throw new Error("This class does not currently grant Expertise");

  const skill=String(form.skill||"").trim();
  if(!SKILL_ABILITY[skill]) throw new Error("Unknown skill");
  const proficient=Array.isArray(c.skill_proficiencies)&&c.skill_proficiencies.includes(skill);
  if(!proficient) throw new Error("Expertise can only be assigned to a skill proficiency");

  const action=String(form.action||"add");
  let selected=expertiseNames(c);
  if(action==="remove") selected=selected.filter(x=>x!==skill);
  else if(!selected.includes(skill)){
    if(selected.length>=limit) throw new Error(`Expertise limit reached (${limit})`);
    selected.push(skill);
  }
  await sql`
    UPDATE characters
    SET expertise_skills=${sql.json(selected)},updated_at=NOW()
    WHERE id=${characterId}
  `;
}

async function setFightingStyle(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,level,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];
  if(!fightingStyleGranted(c)) throw new Error("This character does not currently have the Fighting Style feature");

  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  const featId=String(form.feat_id||"");
  if(!featId){
    delete choices.fighting_style;
  }else{
    const opts=await fightingStyleOptions();
    const feat=opts.find(x=>String(x.id)===featId);
    if(!feat) throw new Error("Fighting Style feat not found");
    choices.fighting_style=feat.name_en;
  }
  await sql`
    UPDATE characters
    SET feature_choices=${sql.json(choices)},updated_at=NOW()
    WHERE id=${characterId}
  `;
}

async function updateCharacterProgression(characterId,form){
  const rows=await sql`
    SELECT id::text,class_name,subclass_name,level,hp_max,
           skill_proficiencies,weapon_masteries,expertise_skills,feature_choices,builder_meta
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!rows.length) throw new Error("Character not found");
  const c=rows[0];

  const level=Math.max(1,Math.min(20,Number(form.level)||Number(c.level)||1));
  const hpMax=Math.max(1,Math.min(9999,Number(form.hp_max)||Number(c.hp_max)||1));

  let subclassName=null;
  let subclassChoice=null;
  if(level>=3){
    const opts=await subclassOptionsForCharacter({...c,level});
    const requested=String(form.subclass_id||"");
    const chosen=opts.find(x=>String(x.id)===requested);
    if(chosen){subclassName=chosen.name_en;subclassChoice=chosen;}
    else if(c.builder_meta?.subclass_entity_id){
      subclassChoice=opts.find(x=>String(x.id)===String(c.builder_meta.subclass_entity_id))||null;
      subclassName=subclassChoice?.name_en||null;
    }else if(c.subclass_name){
      subclassChoice=opts.find(x=>x.name_en===c.subclass_name)||null;
      subclassName=subclassChoice?.name_en||null;
    }
  }

  const next={...c,level};
  const masteryLimit=weaponMasteryLimit(next);
  const expertiseMax=expertiseLimit(next);
  const masteries=weaponMasteryNames(c).slice(0,masteryLimit);
  const expertise=expertiseNames(c)
    .filter(skill=>Array.isArray(c.skill_proficiencies)&&c.skill_proficiencies.includes(skill))
    .slice(0,expertiseMax);

  const choices=c.feature_choices&&typeof c.feature_choices==="object"?{...c.feature_choices}:{};
  if(!fightingStyleGranted(next)) delete choices.fighting_style;
  const builderMeta=c.builder_meta&&typeof c.builder_meta==="object"?{...c.builder_meta}:{};
  builderMeta.subclass_entity_id=subclassChoice?.id??null;
  if(subclassChoice){
    builderMeta.content_sources={...(builderMeta.content_sources||{}),subclass:{key:subclassChoice.source_key,ruleset:subclassChoice.ruleset}};
  }else if(builderMeta.content_sources){
    builderMeta.content_sources={...builderMeta.content_sources,subclass:null};
  }

  await sql`
    UPDATE characters
    SET level=${level},
        hp_max=${hpMax},
        hp_current=LEAST(hp_current,${hpMax}),
        subclass_name=${subclassName},
        proficiency_bonus=${proficiencyBonusForLevel(level)},
        weapon_masteries=${sql.json(masteries)},
        expertise_skills=${sql.json(expertise)},
        feature_choices=${sql.json(choices)},
        builder_meta=${sql.json(builderMeta)},
        updated_at=NOW()
    WHERE id=${characterId}
  `;
}

function weaponAbility(character, card) {
  const d = card.data || {};
  const pact=pactWeaponChoice(character);
  if(
    character.class_name==="Warlock" &&
    hasInvocation(character,"Pact of the Blade") &&
    pact &&
    String(pact.instance_id)===String(card.instance_id)
  ){
    return {key:"CHA",mod:abilityModifier(character.charisma)??0,pactBlade:true};
  }

  const props = normalizedPropertyText(d.properties);
  const category = `${d.weaponCategory || ""} ${d.category || ""}`.toLowerCase();
  const str = abilityModifier(character.strength) ?? 0;
  const dex = abilityModifier(character.dexterity) ?? 0;
  if (props.includes("finesse")) return dex > str ? { key:"DEX", mod:dex } : { key:"STR", mod:str };
  if (category.includes("ranged") || props.includes("ranged")) return { key:"DEX", mod:dex };
  return { key:"STR", mod:str };
}

function signedFormula(base, value) {
  const n = Number(value) || 0;
  if (!n) return String(base);
  return `${base}${n >= 0 ? "+" : ""}${n}`;
}

function characterWeaponRolls(character, card) {
  const type = inventoryType(card);
  const d = card.data || {};
  if (!type.includes("weapon") || type.includes("ammunition") || !d.damageDice) return null;
  const ability = weaponAbility(character, card);
  const magic = Number(d.magicBonus) || 0;
  const archery=fightingStyleName(character).toLowerCase()==="archery"
    && String(d.weaponCategory||"").toLowerCase().includes("ranged") ? 2 : 0;
  const sacred=channelDivinityState(character).sacred_weapon;
  const sacredWeapon=character.class_name==="Paladin" && character.subclass_name==="Oath of Devotion"
    && sacred && String(sacred.instance_id)===String(card.instance_id);
  const sacredBonus=sacredWeapon?Math.max(1,abilityModifier(character.charisma)??0):0;
  const attackBonus = ability.mod + Number(character.proficiency_bonus || 0) + magic + archery + sacredBonus;
  const damageBonus = ability.mod + magic;
  return {
    ability: ability.key,
    attack: signedFormula("1d20", attackBonus),
    damage: signedFormula(d.damageDice, damageBonus),
    versatile: d.versatileDamageDice ? signedFormula(d.versatileDamageDice, damageBonus) : null,
    mastery: weaponMasteryForItem(character,card),
    fightingStyle: archery ? "Archery" : null,
    pactBlade:Boolean(ability.pactBlade),
    sacredWeapon:Boolean(sacredWeapon),
    sacredBonus
  };
}

function characterRollForm({ formula, label, back, text, mode="" }) {
  return `<form method="post" action="/roll"><input type="hidden" name="formula" value="${esc(formula)}"><input type="hidden" name="label" value="${esc(label)}"><input type="hidden" name="back" value="${esc(back)}">${mode?`<input type="hidden" name="mode" value="${esc(mode)}">`:""}<button type="submit">${esc(text || `Roll ${formula}`)}</button></form>`;
}

function renderArmorClassControl(c) {
  const auto=c.ac_mode==="auto";
  return `<div class="core-stat armor-stat"><b>Armor Class</b><strong>${esc(c.armor_class)}</strong><span class="ac-mode-label">${auto?"From equipment":"Manual value"}</span>
    <details class="ac-settings"><summary>Adjust</summary>
      <form class="ac-settings-form" method="post" action="/character/${encodeURIComponent(c.id)}/ac">
        <label>Calculation<select name="ac_mode"><option value="auto" ${auto?"selected":""}>Auto from equipment</option><option value="manual" ${!auto?"selected":""}>Manual</option></select></label>
        <label>Manual Armor Class<input name="armor_class" type="number" min="1" max="40" step="1" value="${esc(c.armor_class)}" ${auto?"disabled":""} required></label>
        <p data-ac-auto-help ${auto?"":"hidden"}>Uses your equipped armor, shield, and applicable abilities.</p>
        <button type="submit">Save AC</button>
      </form>
    </details>
  </div>`;
}


const ALL_SKILLS = [
  "Acrobatics","Animal Handling","Arcana","Athletics","Deception","History",
  "Insight","Intimidation","Investigation","Medicine","Nature","Perception",
  "Performance","Persuasion","Religion","Sleight of Hand","Stealth","Survival"
];

const CLASS_BUILDER_RULES = {
  Barbarian:{hitDie:12,saves:["Strength","Constitution"],skillCount:2,skills:["Animal Handling","Athletics","Intimidation","Nature","Perception","Survival"],gpA:15,gpB:75,items:[["Greataxe",1],["Handaxe",4],["Explorer's Pack",1]],ac:"barbarian"},
  Bard:{hitDie:8,saves:["Dexterity","Charisma"],skillCount:3,skills:ALL_SKILLS,gpA:19,gpB:90,items:[["Leather Armor",1],["Dagger",2],["Entertainer's Pack",1]],ac:"leather"},
  Cleric:{hitDie:8,saves:["Wisdom","Charisma"],skillCount:2,skills:["History","Insight","Medicine","Persuasion","Religion"],gpA:7,gpB:110,items:[["Chain Shirt",1],["Shield",1],["Mace",1],["Holy Symbol",1],["Priest's Pack",1]],ac:"chainshirtshield"},
  Druid:{hitDie:8,saves:["Intelligence","Wisdom"],skillCount:2,skills:["Animal Handling","Arcana","Insight","Medicine","Nature","Perception","Religion","Survival"],gpA:9,gpB:50,items:[["Leather Armor",1],["Shield",1],["Sickle",1],["Quarterstaff",1],["Explorer's Pack",1],["Herbalism Kit",1]],ac:"leathershield"},
  Fighter:{hitDie:10,saves:["Strength","Constitution"],skillCount:2,skills:["Acrobatics","Animal Handling","Athletics","History","Insight","Intimidation","Persuasion","Perception","Survival"],gpA:4,gpB:155,items:[["Chain Mail",1],["Greatsword",1],["Flail",1],["Javelin",8],["Dungeoneer's Pack",1]],ac:"chainmail"},
  Monk:{hitDie:8,saves:["Strength","Dexterity"],skillCount:2,skills:["Acrobatics","Athletics","History","Insight","Religion","Stealth"],gpA:11,gpB:50,items:[["Spear",1],["Dagger",5],["Explorer's Pack",1]],ac:"monk"},
  Paladin:{hitDie:10,saves:["Wisdom","Charisma"],skillCount:2,skills:["Athletics","Insight","Intimidation","Medicine","Persuasion","Religion"],gpA:9,gpB:150,items:[["Chain Mail",1],["Shield",1],["Longsword",1],["Javelin",6],["Holy Symbol",1],["Priest's Pack",1]],ac:"chainmailshield"},
  Ranger:{hitDie:10,saves:["Strength","Dexterity"],skillCount:3,skills:["Animal Handling","Athletics","Insight","Investigation","Nature","Perception","Stealth","Survival"],gpA:7,gpB:150,items:[["Studded Leather Armor",1],["Scimitar",1],["Shortsword",1],["Longbow",1],["Arrow",20],["Quiver",1],["Explorer's Pack",1]],ac:"studded"},
  Rogue:{hitDie:8,saves:["Dexterity","Intelligence"],skillCount:4,skills:["Acrobatics","Athletics","Deception","Insight","Intimidation","Investigation","Perception","Persuasion","Sleight of Hand","Stealth"],gpA:8,gpB:100,items:[["Leather Armor",1],["Dagger",2],["Shortsword",1],["Shortbow",1],["Arrow",20],["Quiver",1],["Thieves' Tools",1],["Burglar's Pack",1]],ac:"leather"},
  Sorcerer:{hitDie:6,saves:["Constitution","Charisma"],skillCount:2,skills:["Arcana","Deception","Insight","Intimidation","Persuasion","Religion"],gpA:28,gpB:50,items:[["Spear",1],["Dagger",2],["Dungeoneer's Pack",1]],ac:"unarmored"},
  Warlock:{hitDie:8,saves:["Wisdom","Charisma"],skillCount:2,skills:["Arcana","Deception","History","Intimidation","Investigation","Nature","Religion"],gpA:15,gpB:100,items:[["Leather Armor",1],["Sickle",1],["Dagger",2],["Arcane Focus",1],["Book",1],["Scholar's Pack",1]],ac:"leather"},
  Wizard:{hitDie:6,saves:["Intelligence","Wisdom"],skillCount:2,skills:["Arcana","History","Insight","Investigation","Medicine","Nature","Religion"],gpA:5,gpB:55,items:[["Dagger",2],["Quarterstaff",1],["Robe",1],["Spellbook",1],["Scholar's Pack",1]],ac:"unarmored"}
};

const BACKGROUND_STARTER_ITEMS = {
  Acolyte:{gpA:8,gpB:50,items:[["Calligrapher's Supplies",1],["Book",1],["Holy Symbol",1],["Parchment",10],["Robe",1]]},
  Criminal:{gpA:16,gpB:50,items:[["Dagger",2],["Thieves' Tools",1],["Crowbar",1],["Pouch",2],["Clothes, Traveler's",1]]},
  Sage:{gpA:8,gpB:50,items:[["Quarterstaff",1],["Calligrapher's Supplies",1],["Book",1],["Parchment",8],["Robe",1]]},
  Soldier:{gpA:14,gpB:50,items:[["Spear",1],["Shortbow",1],["Arrow",20],["Healer's Kit",1],["Quiver",1],["Clothes, Traveler's",1]]}
};

const ITEM_ALIASES = {
  "Studded Leather Armor":["Studded Leather Armor","Studded Leather"],
  "Leather Armor":["Leather Armor","Leather"],
  "Chain Mail":["Chain Mail"],
  "Chain Shirt":["Chain Shirt"],
  "Clothes, Traveler's":["Clothes, Traveler's","Traveler's Clothes"],
  "Calligrapher's Supplies":["Calligrapher's Supplies"],
  "Thieves' Tools":["Thieves' Tools"],
  "Holy Symbol":["Holy Symbol"],
  "Arcane Focus":["Arcane Focus"],
  "Arrow":["Arrows","Ammunition"],
  "Parchment":["Parchment"],
  "Pouch":["Pouch"]
};

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function builderName(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.name || value.label || value.title || null;
  return String(value);
}

function builderNames(value) {
  return jsonArray(value).map(builderName).filter(Boolean);
}

function abilitySlug(name) {
  const n=String(name||"").toLowerCase();
  if(n.startsWith("str")) return "strength";
  if(n.startsWith("dex")) return "dexterity";
  if(n.startsWith("con")) return "constitution";
  if(n.startsWith("int")) return "intelligence";
  if(n.startsWith("wis")) return "wisdom";
  if(n.startsWith("cha")) return "charisma";
  return null;
}

function pointBuyCost(score) {
  return ({8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9})[score] ?? null;
}

function calculateStarterAc(className, scores, equipmentMode) {
  const dex=abilityModifier(scores.dexterity) ?? 0;
  const con=abilityModifier(scores.constitution) ?? 0;
  const wis=abilityModifier(scores.wisdom) ?? 0;

  if(equipmentMode!=="recommended") {
    if(className==="Barbarian") return 10+dex+con;
    if(className==="Monk") return 10+dex+wis;
    return 10+dex;
  }

  const mode=CLASS_BUILDER_RULES[className]?.ac || "unarmored";
  if(mode==="barbarian") return 10+dex+con;
  if(mode==="monk") return 10+dex+wis;
  if(mode==="leather") return 11+dex;
  if(mode==="leathershield") return 13+dex;
  if(mode==="studded") return 12+dex;
  if(mode==="chainshirtshield") return 15+Math.min(2,dex);
  if(mode==="chainmail") return 16;
  if(mode==="chainmailshield") return 18;
  return 10+dex;
}

function calculateBuilderHp(className, level, constitution) {
  const hitDie=CLASS_BUILDER_RULES[className]?.hitDie || 8;
  const conMod=abilityModifier(constitution) ?? 0;
  let hp=Math.max(1,hitDie+conMod);
  const average=Math.floor(hitDie/2)+1;
  for(let i=2;i<=level;i++) hp+=Math.max(1,average+conMod);
  return hp;
}

function mergeSpeciesRows(parent,child){
  if(!parent)return child;
  const parentScores=parent.summary?.ability_scores&&typeof parent.summary.ability_scores==="object"?parent.summary.ability_scores:{};
  const childScores=child.summary?.ability_scores&&typeof child.summary.ability_scores==="object"?child.summary.ability_scores:{};
  const abilityScores={...parentScores};
  for(const [key,value] of Object.entries(childScores))abilityScores[key]=(Number(abilityScores[key])||0)+(Number(value)||0);
  const mergeList=(a,b)=>{
    const seen=new Set(),out=[];
    for(const value of [...jsonArray(a),...jsonArray(b)]){
      const key=typeof value==="string"?`s:${value}`:`j:${JSON.stringify(value)}`;
      if(seen.has(key))continue;
      seen.add(key);out.push(value);
    }
    return out;
  };
  return {
    ...child,
    summary:{
      ...parent.summary,
      ...child.summary,
      source_key:child.source_key,
      source_name:child.source_name,
      ruleset:child.ruleset,
      parent_species:parent.name_en,
      parent_entity_id:parent.id,
      inherited_entity_ids:[...jsonArray(parent.summary?.inherited_entity_ids),parent.id],
      ability_scores:abilityScores,
      ability_score_choices:[...jsonArray(parent.summary?.ability_score_choices),...jsonArray(child.summary?.ability_score_choices)]
    },
    proficiencies:{
      ...(parent.proficiencies||{}),
      ...(child.proficiencies||{}),
      languages:mergeList(parent.proficiencies?.languages,child.proficiencies?.languages),
      skills:mergeList(parent.proficiencies?.skills,child.proficiencies?.skills)
    },
    traits:[...jsonArray(parent.traits),...jsonArray(child.traits)]
  };
}

function enrichSpeciesRows(rows){
  const byKey=new Map(rows.map(row=>[String(row.external_key||""),row]));
  const visit=(row,seen=new Set())=>{
    const key=String(row.external_key||row.id);
    if(seen.has(key))return row;
    const parentKey=String(row.summary?.parent_species_key||"");
    const parent=byKey.get(parentKey);
    if(!parent)return row;
    const nextSeen=new Set(seen);nextSeen.add(key);
    return mergeSpeciesRows(visit(parent,nextSeen),row);
  };
  return rows.map(row=>visit(row));
}

async function getBuilderCatalog(lang="ru") {
  const rows=await sql`
    SELECT ce.id::text,ce.external_key,ce.name_en,cc.content_kind,cc.summary,cc.proficiencies,
           cc.starting_equipment,cc.category,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cc.content_kind IN ('class','subclass','species','background','feat')
      AND cs.enabled=true
    ORDER BY cc.content_kind,ce.name_en
  `;

  const raw={classes:[],subclasses:[],species:[],backgrounds:[],feats:[]};
  for(const row of rows) {
    row.option_label=guidedOptionLabel(row,lang);
    if(row.content_kind==="class") raw.classes.push(row);
    else if(row.content_kind==="subclass") raw.subclasses.push(row);
    else if(row.content_kind==="species") raw.species.push(row);
    else if(row.content_kind==="background") raw.backgrounds.push(row);
    else if(row.content_kind==="feat") raw.feats.push(row);
  }
  return {
    classes:raw.classes.filter(row=>row.source_key==="srd-2024"&&CLASS_BUILDER_RULES[row.name_en]),
    subclasses:dedupeGuidedRows(raw.subclasses,"subclass"),
    species:dedupeGuidedRows(enrichSpeciesRows(raw.species),"species"),
    backgrounds:dedupeGuidedRows(raw.backgrounds,"background"),
    feats:dedupeGuidedRows(raw.feats,"feat")
  };
}

async function builderContentById(id, kind) {
  const rows=await sql`
    SELECT ce.id::text,ce.external_key,ce.name_en,cc.content_kind,cc.summary,cc.proficiencies,
           cc.starting_equipment,cc.traits,cc.category,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE ce.id=${id} AND cc.content_kind=${kind}
      AND cs.enabled=true
    LIMIT 1
  `;
  const row=rows[0]||null;
  if(!row||kind!=="species"||!row.summary?.parent_species_key)return row;
  const parents=await sql`
    SELECT ce.id::text,ce.external_key,ce.name_en,cc.content_kind,cc.summary,cc.proficiencies,
           cc.starting_equipment,cc.traits,cc.category,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cc.content_kind='species' AND cs.enabled=true
  `;
  const enriched=enrichSpeciesRows([...parents,row]);
  return enriched.find(candidate=>String(candidate.id)===String(row.id))||row;
}

function guidedContentScope(value){
  return value==="srd2024"?"srd2024":"expanded";
}

const GUIDED_ABILITY_NAMES=["Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"];

function guidedSourceName(record){
  const raw=String(record?.source_name||record?.source_key||"Unknown source");
  return raw
    .replace(/^System Reference Document 5\.2$/i,"SRD 5.2")
    .replace(/^System Reference Document 5\.1$/i,"SRD 5.1")
    .replace(/^Tal['’]dorei Campaign Setting$/i,"Tal'Dorei Campaign Setting");
}

function guidedOptionLabel(record,lang="ru"){
  if(!record)return "";
  const display=entityDisplayName(record,lang,record.content_kind);
  if(record.source_key==="srd-2024")return display;
  return `${display} · ${guidedSourceName(record)}`;
}

function speciesHasLegacyAbilityData(summary){
  const fixed=summary?.ability_scores;
  if(fixed&&typeof fixed==="object"&&!Array.isArray(fixed)&&Object.values(fixed).some(value=>Number(value)))return true;
  return jsonArray(summary?.ability_score_choices).some(group=>Math.max(0,Number(group?.count)||0)>0&&Math.max(0,Number(group?.amount)||0)>0);
}

function legacySpeciesSelections(form,speciesSummary){
  const selections=[];
  let fieldIndex=0;
  for(const group of jsonArray(speciesSummary?.ability_score_choices)){
    const count=Math.max(0,Number(group?.count)||0);
    const options=builderNames(group?.options).map(value=>String(value).toLowerCase());
    const chosen=[];
    for(let index=0;index<count;index++){
      const value=String(form[`legacy_species_bonus_${fieldIndex}`]||"").toLowerCase();
      fieldIndex++;
      if(!options.includes(value))throw new Error("Choose every legacy species ability increase");
      if(chosen.includes(value))throw new Error("Legacy species ability choices in the same group must be different");
      chosen.push(value);selections.push(value);
    }
  }
  return selections;
}

function backgroundEquipmentGold(backgroundData){
  const text=jsonArray(backgroundData?.starting_equipment).map(builderSimpleText).join(" ");
  const matches=[...text.matchAll(/\b(\d+)\s*gp\b/gi)].map(match=>Number(match[1])||0);
  return matches.length?Math.max(...matches):0;
}

async function grantNamedItem(characterId, requestedName, quantity=1) {
  const candidates=ITEM_ALIASES[requestedName] || [requestedName];
  let entity=null;

  for(const candidate of candidates) {
    const rows=await sql`
      SELECT ce.id::text,ce.name_en
      FROM content_entities ce
      WHERE ce.entity_type='item'
        AND LOWER(ce.name_en)=LOWER(${candidate})
      ORDER BY ce.name_en
      LIMIT 1
    `;
    if(rows.length){entity=rows[0];break;}
  }

  if(!entity) {
    for(const candidate of candidates) {
      const rows=await sql`
        SELECT ce.id::text,ce.name_en
        FROM content_entities ce
        WHERE ce.entity_type='item'
          AND ce.name_en ILIKE ${`%${candidate}%`}
        ORDER BY LENGTH(ce.name_en),ce.name_en
        LIMIT 1
      `;
      if(rows.length){entity=rows[0];break;}
    }
  }

  if(!entity) return {ok:false,name:requestedName,quantity};

  const templateId=await upsertCardFromEntity(entity.id);
  if(!templateId) return {ok:false,name:requestedName,quantity};

  const qty=Math.max(1,Number(quantity)||1);
  const existing=await sql`
    SELECT id::text
    FROM card_instances
    WHERE template_id=${templateId}
      AND owner_type='character'
      AND owner_ref=${characterId}
      AND COALESCE(state,'{}'::jsonb)='{}'::jsonb
    ORDER BY created_at
    LIMIT 1
  `;
  if(existing.length){
    await sql`
      UPDATE card_instances
      SET quantity=quantity+${qty},updated_at=NOW()
      WHERE id=${existing[0].id}
    `;
  }else{
    await sql`
      INSERT INTO card_instances(template_id,owner_type,owner_ref,quantity,state)
      VALUES(${templateId},'character',${characterId},${qty},'{}'::jsonb)
    `;
  }
  return {ok:true,name:entity.name_en,quantity:qty};
}

async function createGuidedCharacter(form) {
  const name=String(form.name||"").trim().slice(0,100);
  if(!name) throw new Error("Character name is required");

  const level=Math.max(1,Math.min(3,Number(form.level)||1));
  const contentScope=guidedContentScope(String(form.content_scope||"expanded"));
  const [classData,speciesData,backgroundData]=await Promise.all([
    builderContentById(String(form.class_id||""),"class"),
    builderContentById(String(form.species_id||""),"species"),
    builderContentById(String(form.background_id||""),"background")
  ]);

  if(!classData || !speciesData || !backgroundData) throw new Error("Class, species and background are required");
  if(classData.source_key!=="srd-2024") throw new Error("Guided Builder classes must use the SRD 5.2 rules engine");
  if(!scopeAllows(speciesData,contentScope) || !scopeAllows(backgroundData,contentScope)) {
    throw new Error("Species or background is outside the selected content scope");
  }

  const className=classData.name_en;
  const rules=CLASS_BUILDER_RULES[className];
  if(!rules) throw new Error(`Builder rules missing for ${className}`);

  let subclassData=null;
  if(level>=3) {
    subclassData=await builderContentById(String(form.subclass_id||""),"subclass");
    if(!subclassData) throw new Error("Level 3 character requires a subclass");
    if(!scopeAllows(subclassData,contentScope)) throw new Error("Subclass is outside the selected content scope");
    const parent=builderName(subclassData.summary?.parent_class);
    if(parent && parent!==className) throw new Error("Subclass does not belong to selected class");
  }

  const abilityKeys=["strength","dexterity","constitution","intelligence","wisdom","charisma"];
  const base={};
  for(const key of abilityKeys) base[key]=Number(form[`base_${key}`]);

  const method=String(form.ability_method||"standard");
  if(method==="pointbuy") {
    let spent=0;
    for(const key of abilityKeys) {
      const cost=pointBuyCost(base[key]);
      if(cost==null) throw new Error("Point Buy scores must be between 8 and 15");
      spent+=cost;
    }
    if(spent>27) throw new Error("Point Buy exceeds 27 points");
  } else if(method==="standard") {
    const expected=[8,10,12,13,14,15].join(",");
    const actual=Object.values(base).map(Number).sort((a,b)=>a-b).join(",");
    if(actual!==expected) throw new Error("Standard Array must use 15,14,13,12,10,8 exactly once");
  } else {
    for(const key of abilityKeys) {
      if(!Number.isFinite(base[key]) || base[key]<3 || base[key]>18) throw new Error("Rolled scores must be between 3 and 18");
    }
  }

  const allowedBackgroundAbilities=builderNames(backgroundData.summary?.ability_scores);
  const legacySpeciesAbilityData=speciesHasLegacyAbilityData(speciesData.summary);
  const compatibilityOriginBoost=allowedBackgroundAbilities.length!==3 && !legacySpeciesAbilityData;
  let finalScores={...base};
  let legacyAbilityChoices=[];
  let boostMode=String(form.boost_mode||"2_1");
  if(allowedBackgroundAbilities.length===3 || compatibilityOriginBoost){
    const allowedAbilities=compatibilityOriginBoost?GUIDED_ABILITY_NAMES:allowedBackgroundAbilities;
    if(boostMode==="1_1_1") {
      if(compatibilityOriginBoost){
        const picks=[String(form.boost_a||""),String(form.boost_b||""),String(form.boost_c||"")];
        if(new Set(picks).size!==3 || picks.some(value=>!allowedAbilities.includes(value))) {
          throw new Error("Choose three different abilities for the compatibility +1/+1/+1 increase");
        }
        for(const ability of picks) finalScores[abilitySlug(ability)]+=1;
      }else{
        for(const ability of allowedBackgroundAbilities) {
          const key=abilitySlug(ability);
          if(key) finalScores[key]+=1;
        }
      }
    } else {
      const a=String(form.boost_a||"");
      const b=String(form.boost_b||"");
      if(a===b || !allowedAbilities.includes(a) || !allowedAbilities.includes(b)) {
        throw new Error(compatibilityOriginBoost?"Choose two different abilities for the compatibility +2/+1 increase":"Choose two different background abilities for +2/+1");
      }
      finalScores[abilitySlug(a)]+=2;
      finalScores[abilitySlug(b)]+=1;
    }
    if(compatibilityOriginBoost)boostMode=`compat_${boostMode}`;
  }else{
    boostMode="legacy_species";
    legacyAbilityChoices=legacySpeciesSelections(form,speciesData.summary);
    finalScores=applyLegacySpeciesBonuses(finalScores,speciesData.summary,legacyAbilityChoices);
  }

  for(const key of abilityKeys) finalScores[key]=Math.min(20,finalScores[key]);

  const fixedBackgroundSkills=builderNames(backgroundData.proficiencies?.skills);
  const backgroundChoice=backgroundData.summary?.skill_choice&&typeof backgroundData.summary.skill_choice==="object"
    ? backgroundData.summary.skill_choice:{count:0,options:[]};
  const backgroundChoiceCount=Math.max(0,Number(backgroundChoice.count)||0);
  const backgroundChoiceOptions=builderNames(backgroundChoice.options);
  const selectedBackgroundSkills=[...new Set(String(form.background_skills_csv||"").split("|").map(x=>x.trim()).filter(Boolean))];
  if(selectedBackgroundSkills.length!==backgroundChoiceCount) throw new Error(`Choose exactly ${backgroundChoiceCount} background skill option${backgroundChoiceCount===1?"":"s"}`);
  if(selectedBackgroundSkills.some(skill=>!backgroundChoiceOptions.includes(skill))) throw new Error("Invalid background skill choice");
  const backgroundSkills=[...new Set([...fixedBackgroundSkills,...selectedBackgroundSkills])];
  const selectedClassSkills=String(form.skills_csv||"").split("|").map(x=>x.trim()).filter(Boolean);
  const availableClassSkills=rules.skills.filter(x=>!backgroundSkills.includes(x));
  const uniqueSelected=[...new Set(selectedClassSkills)];

  if(uniqueSelected.length!==rules.skillCount) throw new Error(`Choose exactly ${rules.skillCount} class skills`);
  if(uniqueSelected.some(x=>!availableClassSkills.includes(x))) throw new Error("Invalid class skill choice");

  const skillProficiencies=[...new Set([...backgroundSkills,...uniqueSelected])];
  const tools=builderNames(backgroundData.proficiencies?.tools);
  const originFeat=builderName(backgroundData.summary?.feat);

  const classEquipmentMode=String(form.class_equipment_mode||"recommended");
  const backgroundEquipmentMode=String(form.background_equipment_mode||"recommended");

  const hp=calculateBuilderHp(className,level,finalScores.constitution);
  const ac=calculateStarterAc(className,finalScores,classEquipmentMode);
  const classGp=classEquipmentMode==="recommended"?rules.gpA:rules.gpB;
  const bgRules=BACKGROUND_STARTER_ITEMS[backgroundData.name_en] || {gpA:backgroundEquipmentGold(backgroundData),gpB:50,items:[]};
  const bgGp=backgroundEquipmentMode==="recommended"?bgRules.gpA:bgRules.gpB;
  const currencyGp=classGp+bgGp;

  const rows=await sql`
    INSERT INTO characters(
      name,class_name,subclass_name,species,background_name,origin_feat,level,
      hp_current,hp_max,armor_class,
      strength,dexterity,constitution,intelligence,wisdom,charisma,
      proficiency_bonus,skill_proficiencies,tool_proficiencies,
      saving_throw_proficiencies,currency_gp,xp,builder_meta,notes
    ) VALUES (
      ${name},${className},${subclassData?.name_en ?? null},${speciesData.name_en},
      ${backgroundData.name_en},${originFeat},${level},
      ${hp},${hp},${ac},
      ${finalScores.strength},${finalScores.dexterity},${finalScores.constitution},
      ${finalScores.intelligence},${finalScores.wisdom},${finalScores.charisma},
      ${proficiencyBonusForLevel(level)},${sql.json(skillProficiencies)},${sql.json(tools)},
      ${sql.json(rules.saves)},${currencyGp},${xpForLevel(level)},
      ${sql.json({
        guided_builder:true,
        content_scope:contentScope,
        ability_method:method,
        base_scores:base,
        background_ability_options:allowedBackgroundAbilities,
        compatibility_origin_boost:compatibilityOriginBoost,
        background_skill_choices:selectedBackgroundSkills,
        legacy_species_ability_choices:legacyAbilityChoices,
        boost_mode:boostMode,
        class_equipment_mode:classEquipmentMode,
        background_equipment_mode:backgroundEquipmentMode,
        background_starting_equipment:backgroundData.starting_equipment,
        class_entity_id:classData.id,
        subclass_entity_id:subclassData?.id ?? null,
        species_entity_id:speciesData.id,
        background_entity_id:backgroundData.id,
        content_sources:{
          class:{key:classData.source_key,ruleset:classData.ruleset},
          subclass:subclassData?{key:subclassData.source_key,ruleset:subclassData.ruleset}:null,
          species:{key:speciesData.source_key,ruleset:speciesData.ruleset},
          background:{key:backgroundData.source_key,ruleset:backgroundData.ruleset}
        }
      })},
      ${"Created with Guided Character Builder v0.32.2. Content source IDs and rulesets are preserved in builder metadata."}
    )
    RETURNING id::text
  `;

  const characterId=rows[0].id;
  const granted=[];
  const unresolved=[];

  if(classEquipmentMode==="recommended") {
    for(const [item,qty] of rules.items) {
      const result=await grantNamedItem(characterId,item,qty);
      (result.ok?granted:unresolved).push(result);
    }
  }
  if(backgroundEquipmentMode==="recommended") {
    for(const [item,qty] of bgRules.items) {
      const result=await grantNamedItem(characterId,item,qty);
      (result.ok?granted:unresolved).push(result);
    }
    if(!bgRules.items.length){
      for(const item of jsonArray(backgroundData.starting_equipment)){
        unresolved.push({ok:false,name:builderSimpleText(item),quantity:1,source:"background narrative"});
      }
    }
  }

  await sql`
    UPDATE characters
    SET builder_meta=builder_meta || ${sql.json({granted_starting_items:granted,unresolved_starting_items:unresolved})}
    WHERE id=${characterId}
  `;

  return characterId;
}

async function guidedCharacterBuilderPage(lang="ru") {
  const catalog=await getBuilderCatalog(lang);
  const safeCatalog=JSON.stringify(catalog).replace(/</g,"\\u003c");
  const safeRules=JSON.stringify(CLASS_BUILDER_RULES).replace(/</g,"\\u003c");

  const classOptions=catalog.classes.map(x=>`<option value="${esc(x.id)}">${esc(x.option_label||x.name_en)}</option>`).join("");

  const abilityInputs=["strength","dexterity","constitution","intelligence","wisdom","charisma"].map(key=>`
    <div class="builder-ability"><b>${key.slice(0,3).toUpperCase()}</b><input id="ab_${key}" name="base_${key}" type="number" min="3" max="18" value="10" required><span id="mod_${key}">+0</span></div>
  `).join("");

  const content=`<a class="back" href="/characters">← Characters</a>
  <section class="hero tavern-scroll"><div><h2>Guided Character Builder</h2><p>Build a level 1–3 character with the SRD 5.2 class engine and either the core SRD catalog or compatible Open5e options. Expanded choices show their source; rules years stay in metadata instead of cluttering the lists.</p></div><div><span class="count">5</span><span class="count-label">steps</span></div></section>

  <form id="guided-builder-form" method="post" action="/character-builder/create" class="builder-shell">
    <div class="builder-stepper">
      ${["Identity","Abilities","Background","Skills","Equipment"].map((x,i)=>`<div class="builder-step-pill ${i===0?"active":""}" data-step-pill="${i}">${i+1}. ${x}</div>`).join("")}
    </div>

    <input type="hidden" name="skills_csv" id="skills_csv">
    <input type="hidden" name="background_skills_csv" id="background_skills_csv">
    <input type="hidden" name="ability_method" id="ability_method" value="standard">
    <input type="hidden" name="boost_mode" id="boost_mode" value="2_1">

    <section class="builder-panel active" data-step="0">
      <div class="builder-panel-card"><h3>Identity & Origin</h3>
      <div class="builder-form-grid">
        <label class="wide">Character Name<input name="name" required maxlength="100" placeholder="Aldric"></label>
        <label class="wide">Content Scope<select name="content_scope" id="content_scope"><option value="expanded" selected>Expanded compatible catalog</option><option value="srd2024">SRD 5.2 only</option></select><span class="builder-field-note">Expanded mode includes licensed legacy/third-party 5e options. Same-name options prefer the modern SRD record; compatibility adjustments are applied where the rules differ.</span></label>
        <label>Level<select name="level" id="level_select"><option value="1">Level 1</option><option value="2">Level 2</option><option value="3" selected>Level 3</option></select></label>
        <label>Class<select name="class_id" id="class_select" required><option value="">Choose class…</option>${classOptions}</select></label>
        <label id="subclass_wrap">Subclass<select name="subclass_id" id="subclass_select"><option value="">Choose subclass…</option></select></label>
        <label>Species<select name="species_id" id="species_select" required><option value="">Choose species…</option></select></label>
        <label>Background<select name="background_id" id="background_select" required><option value="">Choose background…</option></select></label>
      </div>
      <div id="builder_catalog_count" class="builder-note builder-catalog-count" style="margin-top:14px"></div>
      </div>
    </section>

    <section class="builder-panel" data-step="1">
      <div class="builder-panel-card"><h3>Ability Scores</h3>
      <div class="builder-toolbar">
        <button type="button" data-method="standard">Standard Array</button>
        <button type="button" data-method="pointbuy">Point Buy</button>
        <button type="button" data-method="roll">Roll 4d6 Drop Lowest</button>
        <button type="button" data-method="random">Random Array</button>
        <div id="score_status" class="builder-score-status">Standard Array</div>
      </div>
      <div class="builder-ability-grid">${abilityInputs}</div>
      <p class="small-note">Point Buy uses 27 points and scores 8–15 before background bonuses.</p>
      </div>
    </section>

    <section class="builder-panel" data-step="2">
      <div class="builder-panel-card"><h3>Background Benefits</h3>
        <div id="background_summary" class="builder-summary-grid"></div>
        <div id="background_boost_controls" style="margin-top:16px"><h4>Ability Score Increase</h4>
          <label class="builder-choice"><input type="radio" name="boost_mode_ui" value="2_1" checked> +2 to one listed ability and +1 to another</label>
          <label class="builder-choice"><input type="radio" name="boost_mode_ui" value="1_1_1"> +1 to all three listed abilities</label>
          <div id="boost_selectors" class="builder-form-grid" style="margin-top:12px">
            <label id="boost_a_wrap"><span id="boost_a_label">+2 Ability</span><select name="boost_a" id="boost_a"></select></label>
            <label id="boost_b_wrap"><span id="boost_b_label">+1 Ability</span><select name="boost_b" id="boost_b"></select></label>
            <label id="boost_c_wrap" class="builder-hidden"><span id="boost_c_label">+1 Ability</span><select name="boost_c" id="boost_c"></select></label>
          </div>
        </div>
        <div id="legacy_ability_note" class="builder-note builder-hidden" style="margin-top:16px"></div>
      </div>
    </section>

    <section class="builder-panel" data-step="3">
      <div class="builder-panel-card"><h3>Skill Proficiencies</h3>
        <div id="background_skills" class="builder-note"></div>
        <p id="class_skill_instruction" class="summary" style="margin-top:15px"></p>
        <div id="class_skill_grid" class="builder-skill-grid"></div>
        <div id="skill_status" class="builder-score-status" style="margin-top:12px"></div>
      </div>
    </section>

    <section class="builder-panel" data-step="4">
      <div class="builder-panel-card"><h3>Starting Equipment & Review</h3>
        <div class="builder-choice-grid">
          <div class="builder-choice"><b>Class Equipment</b><p id="class_equipment_text" class="small-note"></p>
            <label><input type="radio" name="class_equipment_mode" value="recommended" checked> Recommended equipment</label><br>
            <label><input type="radio" name="class_equipment_mode" value="gold"> Starting gold</label>
          </div>
          <div class="builder-choice"><b>Background Equipment</b><p id="background_equipment_text" class="small-note"></p>
            <label><input type="radio" name="background_equipment_mode" value="recommended" checked> Recommended equipment</label><br>
            <label><input type="radio" name="background_equipment_mode" value="gold"> 50 GP instead</label>
          </div>
        </div>
        <h3 style="margin-top:18px">Review</h3>
        <div id="builder_review" class="builder-review"></div>
        <div class="builder-note" style="margin-top:14px">Recognized starting items are automatically converted into Card Instances and placed in the character inventory. Unmatched generic choices remain recorded in builder metadata.</div>
      </div>
    </section>

    <div class="builder-nav">
      <button type="button" id="builder_prev" class="button secondary" disabled>Previous</button>
      <button type="button" id="builder_next" class="primary-action">Next</button>
      <button type="submit" id="builder_submit" class="primary-action builder-hidden">Create Character</button>
    </div>
  </form>

  <script>
  (() => {
    const catalog=${safeCatalog};
    const rules=${safeRules};
    const form=document.getElementById('guided-builder-form');
    const panels=[...document.querySelectorAll('[data-step]')];
    const pills=[...document.querySelectorAll('[data-step-pill]')];
    const prev=document.getElementById('builder_prev');
    const next=document.getElementById('builder_next');
    const submit=document.getElementById('builder_submit');
    let step=0;
    let method='standard';

    const abilityKeys=['strength','dexterity','constitution','intelligence','wisdom','charisma'];
    const standard=[15,14,13,12,10,8];
    const pointCosts={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};

    const selected = id => document.getElementById(id);
    const byId = (arr,id) => arr.find(x=>x.id===id);
    const arrNames = value => (Array.isArray(value)?value:[]).map(v=>typeof v==='string'?v:(v?.name||v?.label||v?.title)).filter(Boolean);
    const html = value => String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    const scope = () => selected('content_scope').value;
    const allowedByScope = row => scope()==='expanded' || row.source_key==='srd-2024';
    const optionLabel = row => row.option_label||row.name_en;
    const mod = score => Math.floor((Number(score)-10)/2);
    const signed = n => n>=0?'+'+n:String(n);

    function showStep(n){
      step=Math.max(0,Math.min(4,n));
      panels.forEach((p,i)=>p.classList.toggle('active',i===step));
      pills.forEach((p,i)=>p.classList.toggle('active',i===step));
      prev.disabled=step===0;
      next.classList.toggle('builder-hidden',step===4);
      submit.classList.toggle('builder-hidden',step!==4);
      if(step===2) refreshBackground();
      if(step===3) refreshSkills();
      if(step===4) refreshReview();
      window.scrollTo({top:0,behavior:'smooth'});
    }

    function values(){
      return Object.fromEntries(abilityKeys.map(k=>[k,Number(selected('ab_'+k).value)||0]));
    }

    function setScores(scores){
      abilityKeys.forEach((k,i)=>selected('ab_'+k).value=scores[i]);
      refreshScores();
    }

    function refreshScores(){
      abilityKeys.forEach(k=>selected('mod_'+k).textContent=signed(mod(selected('ab_'+k).value)));
      const v=values();
      const status=selected('score_status');
      status.classList.remove('bad','good');

      if(method==='pointbuy'){
        const costs=abilityKeys.map(k=>pointCosts[v[k]]);
        if(costs.some(x=>x===undefined)){
          status.textContent='Point Buy: scores must be 8–15';
          status.classList.add('bad');
        }else{
          const spent=costs.reduce((a,b)=>a+b,0);
          status.textContent='Point Buy: '+spent+' / 27 points';
          status.classList.add(spent<=27?'good':'bad');
        }
      }else if(method==='standard'){
        const actual=Object.values(v).slice().sort((a,b)=>a-b).join(',');
        status.textContent=actual==='8,10,12,13,14,15'?'Standard Array valid':'Use each Standard Array value once';
        status.classList.add(actual==='8,10,12,13,14,15'?'good':'bad');
      }else{
        status.textContent=method==='roll'?'Rolled 4d6 drop lowest':'Randomized Standard Array';
        status.classList.add('good');
      }
    }

    let abilityRolls=[];
    function roll4d6(){
      const rolls=Array.from({length:4},()=>1+Math.floor(Math.random()*6));
      const dropped=rolls.indexOf(Math.min(...rolls));
      const total=rolls.reduce((sum,value,index)=>sum+(index===dropped?0:value),0);
      abilityRolls.push({rolls,dropped,total});
      return total;
    }

    document.querySelectorAll('[data-method]').forEach(btn=>btn.addEventListener('click',()=>{
      method=btn.dataset.method;
      selected('ability_method').value=method;
      if(method==='standard') setScores(standard);
      if(method==='pointbuy') setScores([15,14,13,12,10,8]);
      if(method==='roll') {
        abilityRolls=[];
        setScores(abilityKeys.map(()=>roll4d6()));
        window.DndDice?.show({formula:'6 × 4d6 · drop lowest',total:abilityRolls.reduce((sum,r)=>sum+r.total,0),parts:abilityRolls.map((r,i)=>abilityKeys[i].toUpperCase()+': ['+r.rolls.join(', ')+'] → '+r.total),dice:abilityRolls.flatMap(r=>r.rolls.map((value,i)=>({sides:6,value,kept:i!==r.dropped})))},'Ability scores');
      }
      if(method==='random') setScores([...standard].sort(()=>Math.random()-.5));
      refreshScores();
    }));

    abilityKeys.forEach(k=>selected('ab_'+k).addEventListener('input',refreshScores));

    function fillCatalogSelect(id,rows,placeholder){
      const select=selected(id);
      const previous=select.value;
      const options=rows.filter(allowedByScope);
      select.innerHTML='<option value="">'+placeholder+'</option>'+options.map(row=>'<option value="'+html(row.id)+'">'+html(optionLabel(row))+'</option>').join('');
      if(options.some(row=>row.id===previous))select.value=previous;
      return options.length;
    }

    function refreshCatalogOptions(){
      const speciesCount=fillCatalogSelect('species_select',catalog.species,'Choose species…');
      const backgroundCount=fillCatalogSelect('background_select',catalog.backgrounds,'Choose background…');
      const subclassCount=catalog.subclasses.filter(allowedByScope).length;
      selected('builder_catalog_count').textContent=scope()==='srd2024'
        ? 'Core catalog: '+catalog.classes.length+' classes · '+subclassCount+' subclasses · '+speciesCount+' species · '+backgroundCount+' backgrounds.'
        : 'Expanded catalog: '+catalog.classes.length+' classes · '+subclassCount+' subclasses · '+speciesCount+' species · '+backgroundCount+' backgrounds. Same-name options prefer the modern SRD record; source labels stay visible without repeating rules years.';
      refreshSubclasses();
      refreshBackground();
      refreshSkills();
      refreshEquipmentText();
    }

    function refreshSubclasses(){
      const cls=byId(catalog.classes,selected('class_select').value);
      const level=Number(selected('level_select').value);
      const select=selected('subclass_select');
      const wrap=selected('subclass_wrap');
      const className=cls?.name_en||'';
      const options=catalog.subclasses.filter(s=>allowedByScope(s)&&(()=>{
        const parent=s.summary?.parent_class;
        const name=typeof parent==='string'?parent:(parent?.name||parent?.label||'');
        return name===className;
      })());
      const previous=select.value;
      select.innerHTML='<option value="">Choose subclass…</option>'+options.map(s=>'<option value="'+html(s.id)+'">'+html(optionLabel(s))+'</option>').join('');
      if(options.some(row=>row.id===previous))select.value=previous;
      wrap.classList.toggle('builder-hidden',level<3);
      select.required=level>=3;
    }

    selected('class_select').addEventListener('change',()=>{refreshSubclasses();refreshSkills();});
    selected('level_select').addEventListener('change',refreshSubclasses);
    selected('content_scope').addEventListener('change',refreshCatalogOptions);

    function refreshBackground(){
      const bg=byId(catalog.backgrounds,selected('background_select').value);
      const species=byId(catalog.species,selected('species_select').value);
      const target=selected('background_summary');
      const controls=selected('background_boost_controls');
      const legacyNote=selected('legacy_ability_note');
      const allAbilities=['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
      const fixedSpeciesBonuses=species?.summary?.ability_scores;
      const speciesGroups=Array.isArray(species?.summary?.ability_score_choices)?species.summary.ability_score_choices:[];
      const speciesHasLegacyBoost=Boolean(
        fixedSpeciesBonuses&&typeof fixedSpeciesBonuses==='object'&&!Array.isArray(fixedSpeciesBonuses)&&Object.values(fixedSpeciesBonuses).some(value=>Number(value))
      ) || speciesGroups.some(group=>Math.max(0,Number(group?.count)||0)>0&&Math.max(0,Number(group?.amount)||0)>0);

      function setBoostOptions(names){
        const options=names.map(x=>'<option value="'+html(x)+'">'+html(x)+'</option>').join('');
        selected('boost_a').innerHTML=options;
        selected('boost_b').innerHTML=options;
        selected('boost_c').innerHTML=options;
        if(names.length>1)selected('boost_b').selectedIndex=1;
        if(names.length>2)selected('boost_c').selectedIndex=2;
      }

      function syncBoostUi(modeType){
        const boostMode=document.querySelector('input[name="boost_mode_ui"]:checked')?.value||'2_1';
        selected('boost_mode').value=boostMode;
        const generic=modeType==='compat';
        const triple=boostMode==='1_1_1';
        selected('boost_selectors').classList.toggle('builder-hidden',!generic&&triple);
        selected('boost_c_wrap').classList.toggle('builder-hidden',!generic||!triple);
        selected('boost_a_label').textContent=generic&&triple?'+1 Ability 1':'+2 Ability';
        selected('boost_b_label').textContent=generic&&triple?'+1 Ability 2':'+1 Ability';
        selected('boost_c_label').textContent='+1 Ability 3';
      }

      if(!bg){
        target.innerHTML='<div class="builder-note">Choose a background in Step 1.</div>';
        controls.classList.remove('builder-hidden');
        controls.dataset.boostMode='modern';
        legacyNote.classList.add('builder-hidden');
        setBoostOptions(allAbilities);
        syncBoostUi('modern');
        return;
      }
      const abilities=arrNames(bg.summary?.ability_scores);
      const skills=arrNames(bg.proficiencies?.skills);
      const skillChoiceCount=Math.max(0,Number(bg.summary?.skill_choice?.count)||0);
      const skillChoiceOptions=arrNames(bg.summary?.skill_choice?.options);
      const tools=arrNames(bg.proficiencies?.tools);
      const feat=typeof bg.summary?.feat==='string'?bg.summary.feat:(bg.summary?.feat?.name||'—');
      const modernBackground=abilities.length===3;
      const compatibilityBoost=!modernBackground&&!speciesHasLegacyBoost;
      const sourceText=bg.source_name||bg.source_key||'Unknown source';

      target.innerHTML=
        '<div class="builder-summary-box"><h4>Ability Options</h4><div class="chips">'+(
          modernBackground?abilities.map(x=>'<span class="chip">'+html(x)+'</span>').join(''):
          compatibilityBoost?'<span class="small-note">Choose freely using the compatibility origin increase</span>':
          '<span class="small-note">Uses legacy species bonuses</span>'
        )+'</div></div>'+ 
        '<div class="builder-summary-box"><h4>Origin Feat</h4><div>'+html(feat)+'</div></div>'+ 
        '<div class="builder-summary-box"><h4>Skills</h4><div class="chips">'+(skills.map(x=>'<span class="chip">'+html(x)+'</span>').join('')||'—')+'</div>'+(skillChoiceCount?'<div class="small-note">Choose '+skillChoiceCount+': '+html(skillChoiceOptions.join(', '))+'</div>':'')+'</div>'+ 
        '<div class="builder-summary-box"><h4>Tool</h4><div class="chips">'+(tools.map(x=>'<span class="chip">'+html(x)+'</span>').join('')||'—')+'</div></div>'+ 
        '<div class="builder-summary-box"><h4>Source</h4><div>'+html(sourceText)+'</div>'+(bg.ruleset==='dnd5e-2014'?'<div class="small-note">Legacy 5e source</div>':'')+'</div>';

      if(modernBackground){
        setBoostOptions(abilities);
        controls.classList.remove('builder-hidden');
        controls.dataset.boostMode='modern';
        legacyNote.classList.add('builder-hidden');
        legacyNote.innerHTML='';
        syncBoostUi('modern');
      }else if(compatibilityBoost){
        setBoostOptions(allAbilities);
        controls.classList.remove('builder-hidden');
        controls.dataset.boostMode='compat';
        legacyNote.classList.remove('builder-hidden');
        legacyNote.innerHTML='<b>Compatibility rule</b><p>This older background has no ability increase and the selected species does not supply a legacy increase. Choose +2/+1 or three +1 increases here so the character is not left without an origin ability increase.</p>';
        syncBoostUi('compat');
      }else{
        controls.classList.add('builder-hidden');
        controls.dataset.boostMode='legacy';
        selected('boost_mode').value='legacy_species';
        legacyNote.classList.remove('builder-hidden');
        const bonuses=species?.summary?.ability_scores;
        const parts=bonuses&&typeof bonuses==='object'&&!Array.isArray(bonuses)
          ? Object.entries(bonuses).filter(([,value])=>Number(value)).map(([key,value])=>key.slice(0,3).toUpperCase()+' +'+value)
          : [];
        let fieldIndex=0;
        const choiceFields=speciesGroups.flatMap(group=>{
          const count=Math.max(0,Number(group?.count)||0);
          const amount=Math.max(0,Number(group?.amount)||0);
          const options=arrNames(group?.options);
          return Array.from({length:count},(_,index)=>{
            const name='legacy_species_bonus_'+fieldIndex++;
            return '<label>+'+amount+' ability '+(count>1?(index+1):'')+'<select name="'+name+'" data-legacy-species-choice required><option value="">Choose ability…</option>'+options.map(option=>'<option value="'+html(option.toLowerCase())+'">'+html(option)+'</option>').join('')+'</select></label>';
          });
        }).join('');
        const fixedText=parts.length?'Fixed species increases: '+parts.join(', ')+'.':'This species has no fixed ability increase.';
        legacyNote.innerHTML='<b>Legacy ability rules</b><p>'+html(fixedText)+' This legacy background does not add ability scores; the selected legacy species provides them.</p>'+
          (choiceFields?'<div class="builder-form-grid legacy-ability-grid">'+choiceFields+'</div>':'');
      }
      refreshEquipmentText();
    }

    selected('background_select').addEventListener('change',()=>{refreshBackground();refreshSkills();});
    selected('species_select').addEventListener('change',refreshBackground);

    document.querySelectorAll('input[name="boost_mode_ui"]').forEach(r=>r.addEventListener('change',()=>{
      const modeType=selected('background_boost_controls').dataset.boostMode||'modern';
      selected('boost_mode').value=r.value;
      const generic=modeType==='compat';
      const triple=r.value==='1_1_1';
      selected('boost_selectors').classList.toggle('builder-hidden',!generic&&triple);
      selected('boost_c_wrap').classList.toggle('builder-hidden',!generic||!triple);
      selected('boost_a_label').textContent=generic&&triple?'+1 Ability 1':'+2 Ability';
      selected('boost_b_label').textContent=generic&&triple?'+1 Ability 2':'+1 Ability';
    }));

    function refreshSkills(){
      const previousBackground=[...document.querySelectorAll('[data-background-skill]:checked')].map(x=>x.value);
      const previousClass=[...document.querySelectorAll('[data-class-skill]:checked')].map(x=>x.value);
      const cls=byId(catalog.classes,selected('class_select').value);
      const bg=byId(catalog.backgrounds,selected('background_select').value);
      const classRules=rules[cls?.name_en];
      const fixedSkills=arrNames(bg?.proficiencies?.skills);
      const choiceCount=Math.max(0,Number(bg?.summary?.skill_choice?.count)||0);
      const choiceOptions=arrNames(bg?.summary?.skill_choice?.options);
      const keptBackground=previousBackground.filter(skill=>choiceOptions.includes(skill)).slice(0,choiceCount);
      selected('background_skills').innerHTML=bg
        ? '<b>Background skills:</b> '+html(fixedSkills.join(', ')||'None fixed.')+
          (choiceCount?'<div class="builder-skill-grid background-skill-grid">'+choiceOptions.map(skill=>
            '<label class="builder-skill"><input type="'+(choiceCount===1?'radio':'checkbox')+'" name="background_skill_choice" data-background-skill value="'+html(skill)+'" '+(keptBackground.includes(skill)?'checked':'')+'> '+html(skill)+'</label>'
          ).join('')+'</div><span class="small-note">Choose '+choiceCount+' additional background skill'+(choiceCount===1?'':'s')+'.</span>':'')
        : '<b>Background skills:</b> Choose a background first.';
      document.querySelectorAll('[data-background-skill]').forEach(x=>x.addEventListener('change',refreshSkills));
      const chosenBackground=[...document.querySelectorAll('[data-background-skill]:checked')].map(x=>x.value);
      selected('background_skills_csv').value=chosenBackground.join('|');
      const bgSkills=[...new Set([...fixedSkills,...chosenBackground])];

      if(!classRules){
        selected('class_skill_grid').innerHTML='';
        selected('class_skill_instruction').textContent='Choose a class first.';
        refreshSkillStatus();
        return;
      }

      const options=classRules.skills.filter(x=>!bgSkills.includes(x));
      selected('class_skill_instruction').textContent='Choose '+classRules.skillCount+' class skills. Background duplicates are automatically excluded.';
      selected('class_skill_grid').innerHTML=options.map(skill=>
        '<label class="builder-skill"><input type="checkbox" data-class-skill value="'+html(skill)+'" '+(previousClass.includes(skill)?'checked':'')+'> '+html(skill)+'</label>'
      ).join('');
      document.querySelectorAll('[data-class-skill]').forEach(x=>x.addEventListener('change',refreshSkillStatus));
      refreshSkillStatus();
    }

    function refreshSkillStatus(){
      const cls=byId(catalog.classes,selected('class_select').value);
      const bg=byId(catalog.backgrounds,selected('background_select').value);
      const classRules=rules[cls?.name_en];
      const checked=[...document.querySelectorAll('[data-class-skill]:checked')].map(x=>x.value);
      const backgroundChecked=[...document.querySelectorAll('[data-background-skill]:checked')].map(x=>x.value);
      const backgroundNeed=Math.max(0,Number(bg?.summary?.skill_choice?.count)||0);
      selected('skills_csv').value=checked.join('|');
      selected('background_skills_csv').value=backgroundChecked.join('|');
      const status=selected('skill_status');
      const need=classRules?.skillCount||0;
      status.textContent=(backgroundNeed?'Background '+backgroundChecked.length+' / '+backgroundNeed+' · ':'')+'Class '+checked.length+' / '+need;
      const valid=checked.length===need&&backgroundChecked.length===backgroundNeed;
      status.classList.toggle('good',valid);
      status.classList.toggle('bad',!valid);
    }

    function refreshEquipmentText(){
      const cls=byId(catalog.classes,selected('class_select').value);
      const bg=byId(catalog.backgrounds,selected('background_select').value);
      const r=rules[cls?.name_en];
      selected('class_equipment_text').textContent=r
        ? r.items.map(([n,q])=>(q>1?q+'× ':'')+n).join(', ')+' + '+r.gpA+' GP; or '+r.gpB+' GP'
        : 'Choose a class first.';
      selected('background_equipment_text').textContent=bg
        ? ((bg.starting_equipment||[]).map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')||'Recommended background equipment or 50 GP.')
        : 'Choose a background first.';
    }

    selected('class_select').addEventListener('change',refreshEquipmentText);

    function finalAbilityPreview(){
      const base=values();
      const bg=byId(catalog.backgrounds,selected('background_select').value);
      const species=byId(catalog.species,selected('species_select').value);
      const abilities=arrNames(bg?.summary?.ability_scores);
      const result={...base};
      const boost=selected('boost_mode').value;
      const keyOf=name=>({Strength:'strength',Dexterity:'dexterity',Constitution:'constitution',Intelligence:'intelligence',Wisdom:'wisdom',Charisma:'charisma'})[name];
      if(boost==='legacy_species'){
        const bonuses=species?.summary?.ability_scores;
        if(bonuses&&typeof bonuses==='object'&&!Array.isArray(bonuses)){
          Object.entries(bonuses).forEach(([key,value])=>{if(key in result)result[key]+=Math.max(0,Math.min(3,Number(value)||0));});
        }
        let choiceIndex=0;
        for(const group of (species?.summary?.ability_score_choices||[])){
          const count=Math.max(0,Number(group?.count)||0);
          const amount=Math.max(0,Math.min(3,Number(group?.amount)||0));
          for(let index=0;index<count;index++){
            const key=form.elements['legacy_species_bonus_'+choiceIndex]?.value;
            choiceIndex++;
            if(key&&key in result)result[key]+=amount;
          }
        }
      }else if(boost==='1_1_1') abilities.forEach(a=>{const k=keyOf(a);if(k)result[k]+=1;});
      else{
        const a=keyOf(selected('boost_a').value),b=keyOf(selected('boost_b').value);
        if(a)result[a]+=2;if(b)result[b]+=1;
      }
      return result;
    }

    function refreshReview(){
      refreshSkillStatus(); refreshEquipmentText();
      const cls=byId(catalog.classes,selected('class_select').value);
      const species=byId(catalog.species,selected('species_select').value);
      const bg=byId(catalog.backgrounds,selected('background_select').value);
      const sub=byId(catalog.subclasses,selected('subclass_select').value);
      const scores=finalAbilityPreview();
      const skills=[...document.querySelectorAll('[data-class-skill]:checked')].map(x=>x.value);
      const bgSkills=arrNames(bg?.proficiencies?.skills);
      const chosenBgSkills=[...document.querySelectorAll('[data-background-skill]:checked')].map(x=>x.value);
      const feat=typeof bg?.summary?.feat==='string'?bg.summary.feat:(bg?.summary?.feat?.name||'—');
      const namedSource=row=>row?(row.source_name||row.source_key||'Unknown source'):'—';

      const rows=[
        ['Name',form.elements.name.value||'—'],
        ['Level',selected('level_select').value],
        ['Class',cls?.name_en||'—'],
        ['Subclass',Number(selected('level_select').value)>=3?(sub?(sub.name_en+' · '+namedSource(sub)):'—'):'Not required'],
        ['Species',species?(species.name_en+' · '+namedSource(species)):'—'],
        ['Background',bg?(bg.name_en+' · '+namedSource(bg)):'—'],
        ['Origin Feat',feat],
        ['Abilities',Object.entries(scores).map(([k,v])=>k.slice(0,3).toUpperCase()+' '+v).join(' · ')],
        ['Skills',[...bgSkills,...chosenBgSkills,...skills].join(', ')||'—'],
        ['Class Equipment',form.querySelector('input[name="class_equipment_mode"]:checked')?.value||'recommended'],
        ['Background Equipment',form.querySelector('input[name="background_equipment_mode"]:checked')?.value||'recommended']
      ];
      selected('builder_review').innerHTML=rows.map(([k,v])=>'<div class="builder-review-row"><span>'+html(k)+'</span><b>'+html(v)+'</b></div>').join('');
    }

    function validateStep(){
      if(step===0){
        if(!form.elements.name.value.trim()||!selected('class_select').value||!selected('species_select').value||!selected('background_select').value) return false;
        if(Number(selected('level_select').value)>=3&&!selected('subclass_select').value) return false;
      }
      if(step===1){
        const v=values();
        if(method==='pointbuy'){
          const costs=abilityKeys.map(k=>pointCosts[v[k]]);
          if(costs.some(x=>x===undefined)||costs.reduce((a,b)=>a+b,0)>27) return false;
        }
        if(method==='standard'&&Object.values(v).slice().sort((a,b)=>a-b).join(',')!=='8,10,12,13,14,15') return false;
      }
      if(step===2&&selected('boost_mode').value==='2_1'&&selected('boost_a').value===selected('boost_b').value) return false;
      if(step===2&&selected('boost_mode').value==='legacy_species'){
        const choices=[...document.querySelectorAll('[data-legacy-species-choice]')];
        if(choices.some(select=>!select.value))return false;
        let offset=0;
        const species=byId(catalog.species,selected('species_select').value);
        for(const group of (species?.summary?.ability_score_choices||[])){
          const count=Math.max(0,Number(group?.count)||0);
          const values=choices.slice(offset,offset+count).map(select=>select.value);
          if(new Set(values).size!==values.length)return false;
          offset+=count;
        }
      }
      if(step===3){
        const cls=byId(catalog.classes,selected('class_select').value);
        const bg=byId(catalog.backgrounds,selected('background_select').value);
        const need=rules[cls?.name_en]?.skillCount||0;
        if(document.querySelectorAll('[data-class-skill]:checked').length!==need) return false;
        const backgroundNeed=Math.max(0,Number(bg?.summary?.skill_choice?.count)||0);
        if(document.querySelectorAll('[data-background-skill]:checked').length!==backgroundNeed) return false;
      }
      return true;
    }

    next.addEventListener('click',()=>{
      if(!validateStep()){alert('Complete the required choices on this step first.');return;}
      showStep(step+1);
    });
    prev.addEventListener('click',()=>showStep(step-1));
    form.addEventListener('submit',e=>{
      refreshSkillStatus();
      if(!validateStep()){e.preventDefault();alert('Please review the current step.');}
    });

    setScores(standard);
    refreshCatalogOptions();
    showStep(0);
  })();
  </script>`;

  return layout({title:"Guided Character Builder",content});
}



const SPELLCASTING_ABILITY = {
  Bard:"charisma",
  Cleric:"wisdom",
  Druid:"wisdom",
  Paladin:"charisma",
  Ranger:"wisdom",
  Sorcerer:"charisma",
  Warlock:"charisma",
  Wizard:"intelligence"
};

const FULL_CASTER_SLOTS = [
  null,
  {1:2},
  {1:3},
  {1:4,2:2},
  {1:4,2:3},
  {1:4,2:3,3:2},
  {1:4,2:3,3:3},
  {1:4,2:3,3:3,4:1},
  {1:4,2:3,3:3,4:2},
  {1:4,2:3,3:3,4:3,5:1},
  {1:4,2:3,3:3,4:3,5:2},
  {1:4,2:3,3:3,4:3,5:2,6:1},
  {1:4,2:3,3:3,4:3,5:2,6:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1,8:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1,8:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1,8:1,9:1},
  {1:4,2:3,3:3,4:3,5:3,6:1,7:1,8:1,9:1},
  {1:4,2:3,3:3,4:3,5:3,6:2,7:1,8:1,9:1},
  {1:4,2:3,3:3,4:3,5:3,6:2,7:2,8:1,9:1}
];

const HALF_CASTER_SLOTS = [
  null,
  {1:2},
  {1:2},
  {1:3},
  {1:3},
  {1:4,2:2},
  {1:4,2:2},
  {1:4,2:3},
  {1:4,2:3},
  {1:4,2:3,3:2},
  {1:4,2:3,3:2},
  {1:4,2:3,3:3},
  {1:4,2:3,3:3},
  {1:4,2:3,3:3,4:1},
  {1:4,2:3,3:3,4:1},
  {1:4,2:3,3:3,4:2},
  {1:4,2:3,3:3,4:2},
  {1:4,2:3,3:3,4:3,5:1},
  {1:4,2:3,3:3,4:3,5:1},
  {1:4,2:3,3:3,4:3,5:2},
  {1:4,2:3,3:3,4:3,5:2}
];

const WARLOCK_PACT = [
  null,
  {slots:{1:1},slotLevel:1},
  {slots:{1:2},slotLevel:1},
  {slots:{2:2},slotLevel:2},
  {slots:{2:2},slotLevel:2},
  {slots:{3:2},slotLevel:3},
  {slots:{3:2},slotLevel:3},
  {slots:{4:2},slotLevel:4},
  {slots:{4:2},slotLevel:4},
  {slots:{5:2},slotLevel:5},
  {slots:{5:2},slotLevel:5},
  {slots:{5:3},slotLevel:5},
  {slots:{5:3},slotLevel:5},
  {slots:{5:3},slotLevel:5},
  {slots:{5:3},slotLevel:5},
  {slots:{5:3},slotLevel:5},
  {slots:{5:3},slotLevel:5},
  {slots:{5:4},slotLevel:5},
  {slots:{5:4},slotLevel:5},
  {slots:{5:4},slotLevel:5},
  {slots:{5:4},slotLevel:5}
];

const SPELL_LIMITS = {
  Bard:{
    cantrips:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
    prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
  },
  Cleric:{
    cantrips:[0,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
    prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
  },
  Druid:{
    cantrips:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
    prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
  },
  Paladin:{
    cantrips:Array(21).fill(0),
    prepared:[0,2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]
  },
  Ranger:{
    cantrips:Array(21).fill(0),
    prepared:[0,2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]
  },
  Sorcerer:{
    cantrips:[0,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
    prepared:[0,2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
  },
  Warlock:{
    cantrips:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
    prepared:[0,2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]
  },
  Wizard:{
    cantrips:[0,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
    prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25]
  }
};

function spellcastingLimits(character){
  const className=String(character?.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character?.level)||1));
  const table=SPELL_LIMITS[className];
  let cantrips=table?.cantrips?.[level] ?? 0;
  const prepared=table?.prepared?.[level] ?? 0;

  if(className==="Cleric" && featureChoiceValue(character,"divine_order")==="Thaumaturge") cantrips+=1;
  if(className==="Druid" && featureChoiceValue(character,"primal_order")==="Magician") cantrips+=1;

  return {cantrips,prepared};
}

function characterSpellProfile(character) {
  const className=String(character.class_name||"");
  const level=Math.max(1,Math.min(20,Number(character.level)||1));
  const abilityKey=SPELLCASTING_ABILITY[className] || null;

  let slots={};
  let recharge="long";
  let pact=false;

  if(["Bard","Cleric","Druid","Sorcerer","Wizard"].includes(className)) {
    slots={...(FULL_CASTER_SLOTS[level]||{})};
  } else if(["Paladin","Ranger"].includes(className)) {
    slots={...(HALF_CASTER_SLOTS[level]||{})};
  } else if(className==="Warlock") {
    recharge="short";
    pact=true;
    slots={...(WARLOCK_PACT[level]?.slots||{})};
  }

  const maxSpellLevel=Math.max(0,...Object.keys(slots).map(Number));
  const mod=abilityKey ? (abilityModifier(character[abilityKey]) ?? 0) : null;
  const innateActive=className==="Sorcerer" && innateSorceryActive(character);
  const attack=mod==null ? null : mod+Number(character.proficiency_bonus||0);
  const saveDc=mod==null ? null : 8+Number(character.proficiency_bonus||0)+mod+(innateActive?1:0);
  const limits=spellcastingLimits(character);

  return {
    className,level,abilityKey,slots,recharge,pact,maxSpellLevel,mod,attack,saveDc,
    innateSorceryActive:innateActive,
    cantripLimit:limits.cantrips,preparedLimit:limits.prepared
  };
}

function normalizedSpellName(value){
  return String(value??"").toLowerCase().replace(/[\u2018\u2019'`´]/g,"").replace(/[^a-z0-9]+/g,"");
}

const CORE_ALWAYS_PREPARED = [
  {className:"Druid",level:1,name:"Speak with Animals",sourceKey:"class:druid:druidic"},
  {className:"Ranger",level:1,name:"Hunter's Mark",sourceKey:"class:ranger:favored-enemy"},
  {className:"Paladin",level:2,name:"Divine Smite",sourceKey:"class:paladin:smite"},
  {className:"Paladin",level:5,name:"Find Steed",sourceKey:"class:paladin:faithful-steed"},
  {className:"Warlock",level:9,name:"Contact Other Plane",sourceKey:"class:warlock:contact-patron"},
  {className:"Bard",level:20,name:"Power Word Heal",sourceKey:"class:bard:words-of-creation:heal"},
  {className:"Bard",level:20,name:"Power Word Kill",sourceKey:"class:bard:words-of-creation:kill"}
];

async function findSpellEntityByLooseName(name,ruleset=null){
  const normalized=normalizedSpellName(name);
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,s.level AS spell_level
    FROM content_entities ce
    JOIN spells s ON s.entity_id=ce.id
    WHERE ce.entity_type='spell'
      AND regexp_replace(lower(ce.name_en),'[^a-z0-9]+','','g')=${normalized}
    ORDER BY CASE
      WHEN ${String(ruleset||"")}<>'' AND ce.ruleset=${String(ruleset||"")} THEN 0
      WHEN ce.ruleset='dnd5e-2024' THEN 1
      WHEN ce.ruleset='dnd5e-2014' THEN 2
      ELSE 3
    END
    LIMIT 1
  `;
  return rows[0]||null;
}

async function ensureAlwaysPreparedSpells(character){
  const desired=CORE_ALWAYS_PREPARED.filter(x=>
    x.className===String(character.class_name||"") &&
    Number(character.level)>=x.level
  ).map(x=>({name:x.name,sourceKey:x.sourceKey}));

  desired.push(...fixedSubclassPreparedSpells(character));

  if(String(character.class_name)==="Warlock" && hasInvocation(character,"Pact of the Chain")){
    desired.push({name:"Find Familiar",sourceKey:"invocation:pact-chain:find-familiar",ruleset:"dnd5e-2024"});
  }

  const desiredKeys=desired.map(x=>x.sourceKey);

  for(const rule of desired){
    const spell=await findSpellEntityByLooseName(rule.name,rule.ruleset);
    if(!spell) continue;
    await sql`
      INSERT INTO character_spells(
        character_id,spell_entity_id,prepared,always_prepared,source_key
      )
      VALUES(
        ${character.id},${spell.id},TRUE,TRUE,${rule.sourceKey}
      )
      ON CONFLICT(character_id,spell_entity_id)
      DO UPDATE SET
        prepared=TRUE,
        always_prepared=TRUE,
        source_key=EXCLUDED.source_key
    `;
  }

  if(String(character.class_name)==="Bard" && String(character.subclass_name)==="College of Lore" && Number(character.level)>=6){
    for(const picked of loreDiscoverySelections(character)){
      if(!picked.id) continue;
      const exists=await sql`
        SELECT ce.id::text,ce.name_en
        FROM content_entities ce
        JOIN spells s ON s.entity_id=ce.id
        WHERE ce.id=${picked.id} AND ce.entity_type='spell'
        LIMIT 1
      `;
      if(!exists.length) continue;
      const key=`subclass:lore:discovery:${picked.id}`;
      desiredKeys.push(key);
      await sql`
        INSERT INTO character_spells(
          character_id,spell_entity_id,prepared,always_prepared,source_key
        )
        VALUES(${character.id},${picked.id},TRUE,TRUE,${key})
        ON CONFLICT(character_id,spell_entity_id)
        DO UPDATE SET prepared=TRUE,always_prepared=TRUE,source_key=EXCLUDED.source_key
      `;
    }
  }

  if(String(character.class_name)==="Warlock" && hasInvocation(character,"Pact of the Tome")){
    for(const picked of pactTomeSelections(character)){
      if(!picked.id) continue;
      const exists=await sql`
        SELECT ce.id::text
        FROM content_entities ce
        JOIN spells s ON s.entity_id=ce.id
        WHERE ce.id=${picked.id}
          AND ce.entity_type='spell'
          AND (s.level=0 OR (s.level=1 AND s.ritual=TRUE))
        LIMIT 1
      `;
      if(!exists.length) continue;
      const key=`invocation:pact-tome:${picked.id}`;
      desiredKeys.push(key);
      await sql`
        INSERT INTO character_spells(
          character_id,spell_entity_id,prepared,always_prepared,source_key
        )
        VALUES(${character.id},${picked.id},TRUE,TRUE,${key})
        ON CONFLICT(character_id,spell_entity_id)
        DO UPDATE SET prepared=TRUE,always_prepared=TRUE,source_key=EXCLUDED.source_key
      `;
    }
  }

  if(desiredKeys.length){
    await sql`
      DELETE FROM character_spells
      WHERE character_id=${character.id}
        AND always_prepared=TRUE
        AND source_key IS NOT NULL
        AND source_key NOT IN ${sql(desiredKeys)}
    `;
  }else{
    await sql`
      DELETE FROM character_spells
      WHERE character_id=${character.id}
        AND always_prepared=TRUE
        AND source_key IS NOT NULL
    `;
  }
}
function spellUsageCounts(spells){
  const list=Array.isArray(spells)?spells:[];
  return {
    cantrips:list.filter(x=>Number(x.spell_level)===0 && !x.always_prepared).length,
    prepared:list.filter(x=>Number(x.spell_level)>0 && x.prepared && !x.always_prepared).length,
    always:list.filter(x=>x.always_prepared).length,
    spellbook:list.filter(x=>Number(x.spell_level)>0 && !x.always_prepared).length
  };
}

async function ensureCharacterSpellSlots(character) {
  const profile=characterSpellProfile(character);
  const desired=profile.slots;

  for(const [levelText,maxValue] of Object.entries(desired)) {
    const slotLevel=Number(levelText);
    await sql`
      INSERT INTO character_spell_slots(character_id,slot_level,max_slots,current_slots,recharge)
      VALUES(${character.id},${slotLevel},${maxValue},${maxValue},${profile.recharge})
      ON CONFLICT(character_id,slot_level)
      DO UPDATE SET
        max_slots=EXCLUDED.max_slots,
        current_slots=LEAST(character_spell_slots.current_slots,EXCLUDED.max_slots),
        recharge=EXCLUDED.recharge
    `;
  }

  if(Object.keys(desired).length) {
    await sql`
      DELETE FROM character_spell_slots
      WHERE character_id=${character.id}
        AND slot_level NOT IN ${sql(Object.keys(desired).map(Number))}
    `;
  } else {
    await sql`DELETE FROM character_spell_slots WHERE character_id=${character.id}`;
  }
}

async function getCharacterRuntime(character) {
  await ensureCharacterSpellSlots(character);
  await ensureAlwaysPreparedSpells(character);

  const [spells,slots,conditions,resources]=await Promise.all([
    sql`
      SELECT cs.id::text AS character_spell_id,cs.prepared,cs.always_prepared,cs.source_key,cs.notes,
             ce.id::text AS entity_id,ce.name_en,ce.description_en,
             s.level AS spell_level,s.school,s.casting_time,s.range_text,s.duration,
             s.ritual,s.concentration,s.attack_type,s.saving_throw_ability,
             s.damage,s.higher_levels_en,s.classes,s.components,s.material
      FROM character_spells cs
      JOIN content_entities ce ON ce.id=cs.spell_entity_id
      JOIN spells s ON s.entity_id=ce.id
      WHERE cs.character_id=${character.id}
      ORDER BY s.level,ce.name_en
    `,
    sql`
      SELECT slot_level,max_slots,current_slots,recharge
      FROM character_spell_slots
      WHERE character_id=${character.id}
      ORDER BY slot_level
    `,
    sql`
      SELECT cc.id::text,ce.id::text AS entity_id,ce.name_en,ce.description_en
      FROM character_conditions cc
      JOIN content_entities ce ON ce.id=cc.condition_entity_id
      WHERE cc.character_id=${character.id}
      ORDER BY ce.name_en
    `,
    sql`
      SELECT id::text,name,current_value,max_value,recharge,notes,
             source_key,auto_managed,short_rest_gain
      FROM character_resources
      WHERE character_id=${character.id}
      ORDER BY created_at,name
    `
  ]);

  const bonusSlots=fontBonusSlots(character);
  const present=new Set();
  for(const s of slots){
    const level=Number(s.slot_level)||0;
    present.add(level);
    s.bonus_slots=bonusSlots[level]||0;
  }
  for(const [levelText,count] of Object.entries(bonusSlots)){
    const level=Number(levelText)||0;
    if(level>0 && count>0 && !present.has(level)){
      slots.push({slot_level:level,max_slots:0,current_slots:0,recharge:"long",bonus_slots:count,virtual_bonus:true});
    }
  }
  slots.sort((a,b)=>Number(a.slot_level)-Number(b.slot_level));

  return {spells,slots,conditions,resources};
}

async function characterSpellOptions(character) {
  const profile=characterSpellProfile(character);
  if(!profile.abilityKey) return [];

  const levelLimit=Math.max(0,profile.maxSpellLevel);

  const rows=await sql`
    SELECT ce.id::text,ce.name_en,ce.description_en,ce.ruleset,cs.document_key AS source_key,
           s.level AS spell_level,s.school,s.classes,
           s.ritual,s.concentration
    FROM content_entities ce
    JOIN spells s ON s.entity_id=ce.id
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    WHERE ce.entity_type='spell'
      AND s.level <= ${levelLimit}
      AND NOT EXISTS(
        SELECT 1 FROM character_spells cs
        WHERE cs.character_id=${character.id} AND cs.spell_entity_id=ce.id
      )
    ORDER BY s.level,ce.name_en
  `;
  return rows.filter(spell=>spellHasClass(spell.classes,profile.className));
}

async function conditionOptions(characterId) {
  return sql`
    SELECT ce.id::text,ce.name_en
    FROM content_entities ce
    WHERE ce.entity_type='condition'
      AND NOT EXISTS(
        SELECT 1 FROM character_conditions cc
        WHERE cc.character_id=${characterId}
          AND cc.condition_entity_id=ce.id
      )
    ORDER BY ce.name_en
  `;
}

async function addCharacterSpell(characterId,spellEntityId) {
  const chars=await sql`
    SELECT id::text,class_name,level,intelligence,wisdom,charisma,proficiency_bonus,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!chars.length) throw new Error("Character not found");
  const character=chars[0];
  const profile=characterSpellProfile(character);
  if(!profile.abilityKey) throw new Error("This class does not have the current spellcasting runtime");

  const valid=await sql`
    SELECT ce.id::text,ce.name_en,s.level AS spell_level,s.classes
    FROM content_entities ce
    JOIN spells s ON s.entity_id=ce.id
    WHERE ce.id=${spellEntityId} AND ce.entity_type='spell'
    LIMIT 1
  `;
  if(!valid.length) throw new Error("Spell not found");
  const spell=valid[0];
  const level=Number(spell.spell_level)||0;
  if(level>profile.maxSpellLevel) throw new Error(`This character cannot access level ${level} spells yet`);
  if(!spellHasClass(spell.classes,profile.className)) {
    throw new Error(`This spell is not on the ${profile.className} spell list`);
  }

  const current=await sql`
    SELECT cs.prepared,cs.always_prepared,s.level AS spell_level
    FROM character_spells cs
    JOIN spells s ON s.entity_id=cs.spell_entity_id
    WHERE cs.character_id=${characterId}
  `;
  const counts=spellUsageCounts(current);

  if(level===0){
    if(counts.cantrips>=profile.cantripLimit) throw new Error(`Cantrip limit reached (${profile.cantripLimit})`);
    await sql`
      INSERT INTO character_spells(character_id,spell_entity_id,prepared,always_prepared)
      VALUES(${characterId},${spellEntityId},TRUE,FALSE)
      ON CONFLICT(character_id,spell_entity_id) DO NOTHING
    `;
    return;
  }

  if(profile.className==="Wizard"){
    const prepared=counts.prepared<profile.preparedLimit;
    await sql`
      INSERT INTO character_spells(character_id,spell_entity_id,prepared,always_prepared)
      VALUES(${characterId},${spellEntityId},${prepared},FALSE)
      ON CONFLICT(character_id,spell_entity_id) DO NOTHING
    `;
    return;
  }

  const assignedNormal=current.filter(x=>Number(x.spell_level)>0 && !x.always_prepared).length;
  if(assignedNormal>=profile.preparedLimit) throw new Error(`Prepared spell limit reached (${profile.preparedLimit})`);
  await sql`
    INSERT INTO character_spells(character_id,spell_entity_id,prepared,always_prepared)
    VALUES(${characterId},${spellEntityId},TRUE,FALSE)
    ON CONFLICT(character_id,spell_entity_id) DO NOTHING
  `;
}

async function removeCharacterSpell(characterId,characterSpellId) {
  const rows=await sql`
    SELECT always_prepared
    FROM character_spells
    WHERE id=${characterSpellId} AND character_id=${characterId}
    LIMIT 1
  `;
  if(!rows.length) return;
  if(rows[0].always_prepared) throw new Error("Always-prepared class spells cannot be removed");
  await sql`
    DELETE FROM character_spells
    WHERE id=${characterSpellId} AND character_id=${characterId}
  `;
}

async function togglePreparedSpell(characterId,characterSpellId) {
  const chars=await sql`
    SELECT id::text,class_name,level,intelligence,wisdom,charisma,proficiency_bonus
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!chars.length) throw new Error("Character not found");
  const character=chars[0];
  if(character.class_name!=="Wizard") throw new Error("For this class, assigned level 1+ spells are the prepared list. Replace them by removing and adding spells.");

  const target=await sql`
    SELECT cs.id::text,cs.prepared,cs.always_prepared,s.level AS spell_level
    FROM character_spells cs
    JOIN spells s ON s.entity_id=cs.spell_entity_id
    WHERE cs.id=${characterSpellId} AND cs.character_id=${characterId}
    LIMIT 1
  `;
  if(!target.length) throw new Error("Spell not found");
  if(target[0].always_prepared) throw new Error("Always-prepared spells cannot be unprepared");
  if(Number(target[0].spell_level)===0) throw new Error("Cantrips are always prepared");

  if(!target[0].prepared){
    const profile=characterSpellProfile(character);
    const rows=await sql`
      SELECT cs.prepared,cs.always_prepared,s.level AS spell_level
      FROM character_spells cs
      JOIN spells s ON s.entity_id=cs.spell_entity_id
      WHERE cs.character_id=${characterId}
    `;
    const counts=spellUsageCounts(rows);
    if(counts.prepared>=profile.preparedLimit) throw new Error(`Prepared spell limit reached (${profile.preparedLimit})`);
  }

  await sql`
    UPDATE character_spells
    SET prepared=NOT prepared
    WHERE id=${characterSpellId} AND character_id=${characterId}
  `;
}

async function spendSpellSlot(characterId,characterSpellId,requestedSlotLevel) {
  const characterRows=await sql`
    SELECT id::text,name,class_name,level,strength,dexterity,constitution,intelligence,wisdom,charisma,
           proficiency_bonus,saving_throw_proficiencies,feature_choices
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if(!characterRows.length) throw new Error("Character not found");
  const character=characterRows[0];

  const spellRows=await sql`
    SELECT cs.prepared,cs.always_prepared,cs.source_key,
           ce.id::text AS entity_id,ce.name_en,
           s.level AS spell_level,s.ritual,s.concentration
    FROM character_spells cs
    JOIN spells s ON s.entity_id=cs.spell_entity_id
    JOIN content_entities ce ON ce.id=cs.spell_entity_id
    WHERE cs.id=${characterSpellId} AND cs.character_id=${characterId}
    LIMIT 1
  `;
  if(!spellRows.length) throw new Error("Spell not found");
  const spell=spellRows[0];
  const level=Number(spell.spell_level)||0;
  if(!spell.prepared && !spell.always_prepared) throw new Error("This spell is not prepared");

  if(spell.source_key==="invocation:pact-chain:find-familiar"){
    await sql`
      UPDATE characters
      SET feature_choices=jsonb_set(
            COALESCE(feature_choices,'{}'::jsonb),
            '{pact_familiar,hp_current}',
            COALESCE(feature_choices#>'{pact_familiar,hp_max}','1'::jsonb),
            FALSE
          ),
          updated_at=NOW()
      WHERE id=${characterId}
        AND COALESCE(feature_choices,'{}'::jsonb) ? 'pact_familiar'
    `;
    return;
  }

  if(level===0){
    if(spell.concentration) await startConcentration(characterId,spell);
    return;
  }

  await ensureCharacterSpellSlots(character);
  const profile=characterSpellProfile(character);

  let slotLevel=Number(requestedSlotLevel)||level;

  if(profile.className==="Warlock") {
    const rows=await sql`
      SELECT slot_level FROM character_spell_slots
      WHERE character_id=${characterId}
        AND current_slots>0
        AND slot_level>=${level}
      ORDER BY slot_level
      LIMIT 1
    `;
    if(!rows.length) throw new Error("No Pact Magic slot available");
    slotLevel=rows[0].slot_level;
  }

  if(slotLevel<level) throw new Error("Selected slot is too low for this spell");

  const bonus=fontBonusSlots(character);
  if((bonus[slotLevel]||0)>0){
    bonus[slotLevel]-=1;
    if(bonus[slotLevel]<=0) delete bonus[slotLevel];
    await patchCharacterFeatureChoices(characterId,{font_bonus_slots:bonus});
  }else{
    const spent=await sql`
      UPDATE character_spell_slots
      SET current_slots=current_slots-1
      WHERE character_id=${characterId}
        AND slot_level=${slotLevel}
        AND current_slots>0
      RETURNING current_slots
    `;
    if(!spent.length) throw new Error(`No level ${slotLevel} spell slot available`);
  }

  if(spell.concentration) await startConcentration(characterId,spell);
}
async function adjustSpellSlot(characterId,slotLevel,delta) {
  const d=Math.max(-20,Math.min(20,Number(delta)||0));
  await sql`
    UPDATE character_spell_slots
    SET current_slots=GREATEST(0,LEAST(max_slots,current_slots+${d}))
    WHERE character_id=${characterId} AND slot_level=${Number(slotLevel)||0}
  `;
}

async function addCharacterCondition(characterId,conditionEntityId) {
  const valid=await sql`
    SELECT id FROM content_entities
    WHERE id=${conditionEntityId} AND entity_type='condition'
    LIMIT 1
  `;
  if(!valid.length) throw new Error("Condition not found");
  await sql`
    INSERT INTO character_conditions(character_id,condition_entity_id)
    VALUES(${characterId},${conditionEntityId})
    ON CONFLICT(character_id,condition_entity_id) DO NOTHING
  `;
}

async function removeCharacterCondition(characterId,conditionRowId) {
  await sql`
    DELETE FROM character_conditions
    WHERE id=${conditionRowId} AND character_id=${characterId}
  `;
}

async function createCharacterResource(characterId,form) {
  const name=String(form.name||"").trim().slice(0,80);
  const maxValue=Math.max(1,Math.min(999,Number(form.max_value)||1));
  const recharge=["short","long","none"].includes(String(form.recharge)) ? String(form.recharge) : "long";
  if(!name) throw new Error("Resource name is required");
  await sql`
    INSERT INTO character_resources(character_id,name,current_value,max_value,recharge)
    VALUES(${characterId},${name},${maxValue},${maxValue},${recharge})
  `;
}

async function adjustCharacterResource(characterId,resourceId,delta) {
  const d=Math.max(-999,Math.min(999,Number(delta)||0));
  await sql`
    UPDATE character_resources
    SET current_value=GREATEST(0,LEAST(max_value,current_value+${d})),updated_at=NOW()
    WHERE id=${resourceId} AND character_id=${characterId}
  `;
}

async function deleteCharacterResource(characterId,resourceId) {
  await sql`
    DELETE FROM character_resources
    WHERE id=${resourceId} AND character_id=${characterId}
  `;
}

async function restCharacter(characterId,restType) {
  const type=restType==="short" ? "short" : "long";

  if(type==="long") {
    await sql`
      UPDATE characters
      SET hp_current=hp_max,temp_hp=0,updated_at=NOW()
      WHERE id=${characterId}
    `;
    await sql`
      UPDATE character_spell_slots
      SET current_slots=max_slots
      WHERE character_id=${characterId}
    `;
    await sql`
      UPDATE character_resources
      SET current_value=max_value,updated_at=NOW()
      WHERE character_id=${characterId}
        AND recharge IN ('short','long')
    `;
    await sql`
      UPDATE characters
      SET feature_choices=COALESCE(feature_choices,'{}'::jsonb)
        - 'font_bonus_slots'
        - 'concentration'
        - 'innate_sorcery_active'
        - 'channel_divinity_state' - 'dragon_wings',
          updated_at=NOW()
      WHERE id=${characterId}
    `;
    await sql`
      UPDATE characters
      SET feature_choices=jsonb_set(
            COALESCE(feature_choices,'{}'::jsonb),
            '{gift_protectors}',
            COALESCE(feature_choices->'gift_protectors','{}'::jsonb) || '{"used":false}'::jsonb,
            TRUE
          ),
          updated_at=NOW()
      WHERE id=${characterId}
        AND COALESCE(feature_choices,'{}'::jsonb) ? 'gift_protectors'
    `;
  } else {
    await sql`
      UPDATE character_spell_slots
      SET current_slots=max_slots
      WHERE character_id=${characterId}
        AND recharge='short'
    `;
    await sql`
      UPDATE character_resources
      SET current_value=max_value,updated_at=NOW()
      WHERE character_id=${characterId}
        AND recharge='short'
    `;
    await sql`
      UPDATE character_resources
      SET current_value=LEAST(max_value,current_value+short_rest_gain),updated_at=NOW()
      WHERE character_id=${characterId}
        AND short_rest_gain>0
    `;
    await sql`
      UPDATE characters
      SET feature_choices=COALESCE(feature_choices,'{}'::jsonb)-'innate_sorcery_active'-'channel_divinity_state'-'dragon_wings',
          updated_at=NOW()
      WHERE id=${characterId}
    `;
  }
}

function spellDamageFormula(spell) {
  return firstDiceFormula(spell.damage) || firstDiceFormula(spell.description_en);
}

function spellCastButtonText(spell,level) {
  if(spell?.source_key==="invocation:pact-chain:find-familiar") return "Cast without spell slot";
  if(spell?.concentration)return "Cast & start Concentration";
  return Number(level)===0?"Cast cantrip":"Cast";
}

function renderSpellRuntimeCard(character,spell,slots,profile,back) {
  const level=Number(spell.spell_level)||0;
  const damage=spellDamageFormula(spell);
  const isAttack=String(spell.attack_type||"").trim()!=="";
  const availableSlots=slots.filter(s=>Number(s.slot_level)>=level && (Number(s.current_slots)||0)+(Number(s.bonus_slots)||0)>0);
  const prepared=Boolean(spell.prepared||spell.always_prepared||level===0);
  const slotFree=spell.source_key==="invocation:pact-chain:find-familiar";
  const canCast=prepared && (level===0 || slotFree || availableSlots.length>0);
  const wizardBook=profile.className==="Wizard" && level>0 && !spell.always_prepared;

  const castPath=`/character/${encodeURIComponent(character.id)}/spell/${encodeURIComponent(spell.character_spell_id)}/cast`;
  const firstSlot=Number(availableSlots[0]?.slot_level)||profile.maxSpellLevel||level;
  const cost=slotFree?"Magic Action · no spell slot":level===0?"No spell slot":(!prepared&&wizardBook&&spell.ritual)?"Ritual · no spell slot":`1 ${profile.pact?"Pact Magic":"spell"} slot · level ${availableSlots.length?firstSlot:(profile.pact?firstSlot:level)}`;
  const castingTime=slotFree?"Magic Action":String(spell.casting_time||"").replace(/[-_]/g," ").trim();
  const timeLabel=/^(action|bonus action|reaction)$/i.test(castingTime)?`1 ${castingTime}`:castingTime;
  const components=pretty(spell.components).replace(/\bverbal\b/gi,"V").replace(/\bsomatic\b/gi,"S").replace(/\bmaterial\b/gi,"M");
  const materials=spell.material?pretty(spell.material):"";
  const castButtonText=spellCastButtonText(spell,level);
  let castControl="";
  if(level===0 || slotFree) {
    castControl=`<form class="spell-cast-form" method="post" action="${castPath}"><button type="submit">${castButtonText}</button></form>`;
  } else if(canCast) {
    castControl=`<form class="spell-cast-form" method="post" action="${castPath}">
      ${profile.className==="Warlock"
        ? `<input type="hidden" name="slot_level" value="${esc(availableSlots[0]?.slot_level||level)}">`
        : `<select name="slot_level" aria-label="Spell slot to spend">${availableSlots.map(s=>`<option value="${esc(s.slot_level)}">Level ${esc(s.slot_level)} · ${esc((Number(s.current_slots)||0)+(Number(s.bonus_slots)||0))} available${Number(s.bonus_slots)||0?` (${esc(s.bonus_slots)} created)`:""}</option>`).join("")}</select>`}
      <button type="submit">${castButtonText}</button>
    </form>`;
  } else if(!prepared && wizardBook && spell.ritual) {
    castControl=`<span class="spell-stat ritual-ready">Ritual from spellbook</span>`;
  } else if(!prepared) {
    castControl=`<span class="spell-stat runtime-danger">Not prepared</span>`;
  } else {
    castControl=`<span class="spell-stat runtime-danger">No slot available</span>`;
  }

  const grantLabel=spellGrantLabel(spell);
  const status=spell.always_prepared
    ? `<div class="spell-status-stack">${grantLabel?`<span class="spell-source-badge ${grantLabel==="Magical Discovery"?"discovery":""}">${esc(grantLabel)}</span>`:""}<span class="spell-stat always-prepared">Always Prepared</span></div>`
    : level===0
      ? `<span class="spell-stat prepared-on">Known Cantrip</span>`
      : wizardBook
        ? `<span class="spell-stat ${spell.prepared?"prepared-on":""}">${spell.prepared?"Prepared":"In Spellbook"}</span>`
        : `<span class="spell-stat prepared-on">Prepared</span>`;

  return `<div class="runtime-card spell-runtime-card ${spell.always_prepared?"spell-always":""} ${grantLabel==="Magical Discovery"?"spell-discovery":""}">
    <div class="spellbook-head"><div><div class="eyebrow"><span>${level===0?"Cantrip":`Level ${level}`}</span><span>${esc(spell.school||"Spell")}</span></div><h4>${esc(spell.name_en)}</h4></div>${status}</div>
    <div class="spell-meta">
      ${timeLabel?`<span class="spell-stat">Cast: ${esc(timeLabel)}</span>`:""}
      ${spell.range_text?`<span class="spell-stat">Range: ${esc(spell.range_text)}${/^\d+$/.test(String(spell.range_text))?" ft.":""}</span>`:""}
      ${components!=="—"?`<span class="spell-stat">${esc(components)}</span>`:""}
      ${spell.concentration?`<span class="spell-stat">Concentration</span>`:""}
      ${spell.ritual?`<span class="spell-stat">Ritual</span>`:""}
    </div>
    <div class="spell-description">
      <p class="spell-description-preview">${esc(truncate(plainRulesText(displayText(spell.description_en)),180))}</p>
      <details class="spell-description-toggle"><summary>Full description</summary><div class="rules-text">${renderRulesText(spell.description_en||"No description supplied.")}${spell.higher_levels_en?`<h4>At Higher Levels</h4>${renderRulesText(spell.higher_levels_en)}`:""}</div></details>
      ${materials?`<div class="spell-component-note rules-text"><b>Materials:</b> ${rulesInline(materials)}</div>`:""}
    </div>
    <div class="spell-cast-row"><div class="spell-cast-cost"><small>Casting cost</small><strong data-slot-cost>${esc(cost)}</strong></div>
      ${castControl}
    </div>
    <div class="spell-actions">
      ${isAttack&&profile.attack!=null&&prepared?characterRollForm({formula:signedFormula("1d20",profile.attack),label:`${character.name} — ${spell.name_en} spell attack`,back,text:`Spell attack ${signedFormula("1d20",profile.attack)}${profile.innateSorceryActive?" · Advantage":""}`,mode:profile.innateSorceryActive?"advantage":""}):""}
      ${damage&&prepared?characterRollForm({formula:damage,label:`${character.name} — ${spell.name_en} damage`,back,text:`Damage ${damage}`}):""}
      ${wizardBook?`<form method="post" action="/character/${encodeURIComponent(character.id)}/spell/${encodeURIComponent(spell.character_spell_id)}/prepared"><button type="submit">${spell.prepared?"Unprepare":"Prepare"}</button></form>`:""}
      <a class="button secondary" href="/entity/${encodeURIComponent(spell.entity_id)}">Open spell</a>
      ${spell.always_prepared?"":`<form method="post" action="/character/${encodeURIComponent(character.id)}/spell/${encodeURIComponent(spell.character_spell_id)}/remove" onsubmit="return confirm('Remove this spell from the character?')"><button class="danger-button" type="submit">Remove</button></form>`}
    </div>
  </div>`;
}
async function charactersPage() {
  const chars = await listCharacters();
  const defaults = ["strength","dexterity","constitution","intelligence","wisdom","charisma"];
  const content = `<section class="hero tavern-scroll"><div><h2>Characters</h2><p>Create manually or use the SRD-guided Character Builder, then assign cards and use them in encounters.</p><div style="margin-top:12px"><a class="primary-action" href="/character-builder">Open Guided Builder</a></div></div><div><span class="count">${chars.length}</span><span class="count-label">characters</span></div></section>
  <div class="character-layout"><section>${chars.length ? `<div class="character-grid">${chars.map(c=>`<a class="character-tile" href="/character/${encodeURIComponent(c.id)}"><div class="eyebrow"><span>${esc(c.class_name || "Adventurer")}</span><span>LV ${esc(c.level)}</span></div><h3 data-i18n-skip>${esc(c.name)}</h3><div class="chips"><span class="chip">HP ${esc(c.hp_current)}/${esc(c.hp_max)}</span><span class="chip">AC ${esc(c.armor_class)}</span><span class="chip gold">PB +${esc(c.proficiency_bonus)}</span></div></a>`).join("")}</div>` : `<div class="empty">No characters yet.</div>`}</section>
  <aside class="card-panel"><h3>Quick Manual Character</h3><form class="character-form" method="post" action="/characters/create">
    <label class="wide">Name<input name="name" required maxlength="100" placeholder="Rustem"></label>
    <label>Class<input name="class_name" placeholder="Paladin"></label><label>Species<input name="species" placeholder="Human"></label>
    <label>Level<input name="level" type="number" min="1" max="20" value="1"></label><label>Armor Class<input name="armor_class" type="number" min="1" max="40" value="10"></label>
    <label>HP Current<input name="hp_current" type="number" min="0" value="10"></label><label>HP Max<input name="hp_max" type="number" min="1" value="10"></label>
    ${defaults.map(k=>`<label>${k.slice(0,3).toUpperCase()}<input name="${k}" type="number" min="1" max="30" value="10"></label>`).join("")}
    <label class="wide">Notes<textarea name="notes"></textarea></label>
    <button class="primary-action wide" type="submit">Create character</button>
  </form></aside></div>`;
  return layout({ title:"Characters", content });
}



function renderEquipmentControls(c,item,back,attunedCount){
  const labels=itemStateLabel(item);
  const controls=[];

  if(isEquippableCard(item)){
    controls.push(`<form method="post" action="/character/${encodeURIComponent(c.id)}/inventory/${encodeURIComponent(item.instance_id)}/equip"><button class="${stateBool(item.state,"equipped")?"equipment-on":""}" type="submit">${stateBool(item.state,"equipped")?"Unequip":"Equip"}</button></form>`);
  }

  if(requiresAttunement(item)){
    const attuned=stateBool(item.state,"attuned");
    controls.push(`<form method="post" action="/character/${encodeURIComponent(c.id)}/inventory/${encodeURIComponent(item.instance_id)}/attune"><button class="${attuned?"equipment-attuned":""}" type="submit" ${!attuned&&attunedCount>=3?"disabled":""}>${attuned?"Unattune":"Attune"}</button></form>`);
  }

  const badges=labels.map(x=>`<span class="equipment-state ${x==="Attuned"?"attuned":""}">${esc(x)}</span>`).join("");
  return `<div class="equipment-controls">${badges}${controls.join("")}</div>`;
}

const SKILL_ABILITY={
  "Acrobatics":"dexterity","Animal Handling":"wisdom","Arcana":"intelligence","Athletics":"strength",
  "Deception":"charisma","History":"intelligence","Insight":"wisdom","Intimidation":"charisma",
  "Investigation":"intelligence","Medicine":"wisdom","Nature":"intelligence","Perception":"wisdom",
  "Performance":"charisma","Persuasion":"charisma","Religion":"intelligence","Sleight of Hand":"dexterity",
  "Stealth":"dexterity","Survival":"wisdom"
};
async function characterPresentationData(c){
  const originBase=String(c.origin_feat||"").replace(/\s*\([^)]*\)\s*$/,"").trim();
  const meta=c.builder_meta&&typeof c.builder_meta==="object"?c.builder_meta:{};
  const classId=String(meta.class_entity_id||"");
  const subclassId=String(meta.subclass_entity_id||"");
  const speciesId=String(meta.species_entity_id||"");
  const backgroundId=String(meta.background_entity_id||"");
  const loaded=await sql`
    SELECT ce.id::text,ce.external_key,ce.name_en,cc.content_kind,cc.summary,cc.traits,cc.progression,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true AND (
          (cc.content_kind='class' AND ((${classId}<>'' AND ce.id::text=${classId}) OR (${classId}='' AND ce.name_en=${c.class_name})))
       OR (cc.content_kind='subclass' AND ((${subclassId}<>'' AND ce.id::text=${subclassId}) OR (${subclassId}='' AND ce.name_en=${c.subclass_name||""})))
       OR (cc.content_kind='species' AND ((${speciesId}<>'' AND ce.id::text=${speciesId}) OR (${speciesId}='' AND ce.name_en=${c.species||""})))
       OR (cc.content_kind='background' AND ((${backgroundId}<>'' AND ce.id::text=${backgroundId}) OR (${backgroundId}='' AND ce.name_en=${c.background_name||""})))
       OR (cc.content_kind='feat' AND LOWER(ce.name_en)=LOWER(${originBase}))
    )
  `;
  const resolved=[];
  for(const kind of ["class","subclass","species","background"]){
    const candidates=loaded.filter(row=>row.content_kind===kind);
    if(!candidates.length)continue;
    const selected=dedupeGuidedRows(candidates,kind)[0]||candidates[0];
    if(selected)resolved.push(selected);
  }
  resolved.push(...loaded.filter(row=>row.content_kind==="feat"));
  let expanded=resolved;
  const selectedSpecies=resolved.find(row=>row.content_kind==="species");
  if(selectedSpecies?.summary?.parent_species_key){
    const speciesRows=await sql`
      SELECT ce.id::text,ce.external_key,ce.name_en,cc.content_kind,cc.summary,cc.traits,cc.progression,
             cs.document_key AS source_key,cs.name AS source_name,cs.ruleset
      FROM character_content cc
      JOIN content_entities ce ON ce.id=cc.entity_id
      JOIN content_sources cs ON cs.id=ce.source_id
      WHERE cc.content_kind='species' AND cs.enabled=true
    `;
    const byKey=new Map(speciesRows.map(row=>[String(row.external_key||""),row]));
    const ancestors=[];
    let parentKey=String(selectedSpecies.summary.parent_species_key||"");
    const seen=new Set();
    while(parentKey&&!seen.has(parentKey)){
      seen.add(parentKey);
      const parent=byKey.get(parentKey);
      if(!parent)break;
      ancestors.unshift(parent);
      parentKey=String(parent.summary?.parent_species_key||"");
    }
    expanded=[...resolved.filter(row=>row.content_kind!=="species"),...ancestors,selectedSpecies];
  }
  const nonFeats=expanded.filter(row=>row.content_kind!=="feat");
  const feat=dedupeGuidedRows(expanded.filter(row=>row.content_kind==="feat"),"feat")[0];
  const rows=feat?[...nonFeats,feat]:nonFeats;

  let speed="30 ft.";
  const features=[];
  const currentLevel=Math.max(1,Number(c.level)||1);

  const numericLevels=value=>{
    const out=[];
    const visit=v=>{
      if(v===null||v===undefined) return;
      if(typeof v==="number" && Number.isFinite(v)){ out.push(v); return; }
      if(typeof v==="string"){
        const direct=Number(v);
        if(Number.isFinite(direct)){ out.push(direct); return; }
        const m=v.match(/\blevel\s*(\d{1,2})\b/i);
        if(m) out.push(Number(m[1]));
        return;
      }
      if(Array.isArray(v)){ for(const x of v) visit(x); return; }
      if(typeof v==="object"){
        for(const key of ["level","class_level","character_level"]) {
          if(Number.isFinite(Number(v[key]))) out.push(Number(v[key]));
        }
      }
    };
    visit(value);
    return out.filter(x=>x>=1&&x<=20);
  };

  const featureLevel=v=>{
    if(!v || typeof v!=="object") return null;
    const vals=[
      ...numericLevels(v.level),
      ...numericLevels(v.class_level),
      ...numericLevels(v.character_level),
      ...numericLevels(v.gained_at),      // Open5e v2 canonical field
      ...numericLevels(v.granted_at),     // legacy compatibility
      ...numericLevels(v.gains_at),
      ...numericLevels(v.levels)
    ];
    if(vals.length) return Math.min(...vals);

    // Fallback for source records whose level is stated only in prose,
    // e.g. Dragonborn Draconic Flight.
    const prose=String(v.desc||v.description||v.detail||"");
    let m=prose.match(/\bwhen you reach (?:character |[A-Za-z]+ )?level\s*(\d{1,2})\b/i);
    if(!m) m=prose.match(/\bstarting at (?:character |[A-Za-z]+ )?level\s*(\d{1,2})\b/i);
    if(!m) m=prose.match(/\bat (?:character |[A-Za-z]+ )?level\s*(\d{1,2})\b/i);
    return m ? Number(m[1]) : null;
  };

  const isPresentationOnly=(row,tr)=>{
    if(!tr || typeof tr!=="object") return false;
    const name=String(tr.name||tr.title||tr.key||"").trim();
    const desc=String(tr.desc||tr.description||tr.detail||"").trim();
    const type=String(tr.feature_type||tr.type||"").toLowerCase();

    if(/\bcolumn\b|\btable[_ -]?data\b/.test(type)) return true;
    if(/^\[?\s*column data\s*\]?$/i.test(desc)) return true;

    // These are character-sheet data, not unlockable abilities.
    if(row.content_kind==="class" && /^proficiency bonus$/i.test(name)) return true;
    if(row.content_kind==="class" && /^core .+ traits$/i.test(name)) return true;
    if(row.content_kind==="species" && /^(size|speed|creature type)$/i.test(name)) return true;
    return false;
  };

  for(const row of rows){
    if(row.content_kind==="species" && row.summary?.speed) speed=builderSimpleText(row.summary.speed);

    for(const tr of Array.isArray(row.traits)?row.traits:[]){
      if(!tr) continue;
      if(isPresentationOnly(row,tr)) continue;

      const lvl=featureLevel(tr);
      if(lvl!=null && lvl>currentLevel) continue;

      const name=typeof tr==="string" ? tr : (tr.name||tr.title||tr.key||"Feature");
      const description=typeof tr==="string" ? "" : (tr.desc||tr.description||tr.detail||"");

      features.push({
        source:row.name_en,
        kind:row.content_kind,
        entityId:row.id,
        name,
        description,
        level:lvl
      });
    }
  }

  const seen=new Set();
  const kindOrder={species:0,background:1,feat:2,class:3,subclass:4};
  const filtered=features.filter(f=>{
    const k=`${f.source}|${f.name}`;
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a,b)=>{
    const ka=kindOrder[a.kind]??9, kb=kindOrder[b.kind]??9;
    if(ka!==kb) return ka-kb;
    const la=a.level??0, lb=b.level??0;
    if(la!==lb) return la-lb;
    return String(a.name).localeCompare(String(b.name));
  });

  return {speed,features:filtered.slice(0,80)};
}

function richInline(text){ return rulesInline(text); }

function featureRichText(value){ return renderRulesText(value); }

async function characterLevelUpPage(id){
  const result=await getCharacter(id);
  if(!result) return {status:404,body:layout({title:"Character not found",content:`<div class="empty">Character not found.</div>`})};
  const c=result.character;
  const xp=xpProgressState(c);
  if(!xp.canLevel){
    return {status:400,body:layout({title:"Level Up",content:`<a class="back" href="/character/${encodeURIComponent(c.id)}">← ${esc(c.name)}</a><div class="empty">This character needs ${esc(xp.remaining)} more XP before the next level.</div>`})};
  }

  const nextLevel=xp.level+1;
  const [currentPresentation,nextPresentation,subclasses]=await Promise.all([
    characterPresentationData(c),
    characterPresentationData({...c,level:nextLevel}),
    subclassOptionsForCharacter({...c,level:nextLevel})
  ]);
  const oldKeys=new Set(currentPresentation.features.map(f=>`${f.kind}|${f.source}|${f.name}`));
  const newFeatures=nextPresentation.features.filter(f=>!oldKeys.has(`${f.kind}|${f.source}|${f.name}`));
  const die=classHitDie(c);
  const con=abilityModifier(c.constitution)??0;
  const fixed=fixedHpGain(c);
  const nextPb=proficiencyBonusForLevel(nextLevel);
  const masteryDelta=Math.max(0,weaponMasteryLimit({...c,level:nextLevel})-weaponMasteryLimit(c));
  const expertiseDelta=Math.max(0,expertiseLimit({...c,level:nextLevel})-expertiseLimit(c));
  const styleUnlock=!fightingStyleGranted(c)&&fightingStyleGranted({...c,level:nextLevel});
  const needSubclass=nextLevel>=3 && !c.subclass_name && subclasses.length>0;

  const featureRows=newFeatures.length?newFeatures.map(f=>`<details class="feature-disclosure levelup-feature"><summary><div class="feature-summary-main"><span class="feature-arrow">›</span><div><div class="feature-source">${esc(f.kind)} · ${esc(f.source)}</div><b>${esc(f.name)}</b></div></div><span class="feature-level-badge">Lv ${esc(nextLevel)}</span></summary><div class="feature-expanded">${f.description?featureRichText(f.description):`<p>No additional description supplied.</p>`}</div></details>`).join(""):`<div class="builder-note">No additional normalized feature rows were found for this level.</div>`;

  const currentInvocationLimit=warlockInvocationLimit(c),nextInvocationLimit=warlockInvocationLimit({...c,level:nextLevel});
  const currentMetaLimit=metamagicLimit(c),nextMetaLimit=metamagicLimit({...c,level:nextLevel});
  const choices=[
    needSubclass?"Subclass choice":null,
    masteryDelta?`+${masteryDelta} Weapon Mastery selection${masteryDelta>1?"s":""}`:null,
    expertiseDelta?`+${expertiseDelta} Expertise selection${expertiseDelta>1?"s":""}`:null,
    styleUnlock?"Fighting Style becomes available":null,
    nextMetaLimit>currentMetaLimit?`+${nextMetaLimit-currentMetaLimit} Metamagic option${nextMetaLimit-currentMetaLimit>1?"s":""}`:null,
    nextInvocationLimit>currentInvocationLimit?`+${nextInvocationLimit-currentInvocationLimit} Eldritch Invocation${nextInvocationLimit-currentInvocationLimit>1?"s":""}`:null,
    c.class_name==="Wizard"&&nextLevel===2?"Scholar expertise choice":null,
    c.subclass_name==="Circle of the Land"&&nextLevel===3?"Choose a Circle land type":null,
    c.subclass_name==="Draconic Sorcery"&&nextLevel===6?"Choose Elemental Affinity":null,
    c.subclass_name==="College of Lore"&&nextLevel===6?"Choose 2 Magical Discoveries":null
  ].filter(Boolean);

  const content=`<a class="back" href="/character/${encodeURIComponent(c.id)}">← ${esc(c.name)}</a>
  <section class="hero tavern-scroll"><div><h2>Level Up · ${esc(c.name)}</h2><p>Guided progression from level ${esc(c.level)} to level ${esc(nextLevel)}. Review new features, increase Hit Points and confirm class choices.</p></div><div><span class="count">${esc(nextLevel)}</span><span class="count-label">new level</span></div></section>

  <form id="level-up-form" method="post" action="/character/${encodeURIComponent(c.id)}/level-up/confirm" class="builder-shell">
    <div class="builder-stepper levelup-stepper">
      ${["Review","Hit Points","Choices","Confirm"].map((x,i)=>`<div class="builder-step-pill ${i===0?"active":""}" data-levelup-pill="${i}">${i+1}. ${x}</div>`).join("")}
    </div>

    <section class="builder-panel active" data-levelup-step="0">
      <div class="builder-panel-card">
        <h3>Level ${esc(c.level)} → ${esc(nextLevel)}</h3>
        <div class="levelup-summary-grid">
          <div class="levelup-stat"><span>Experience</span><b>${esc(xp.xp.toLocaleString("en-US"))} XP</b><small>Requirement: ${esc(xp.next.toLocaleString("en-US"))}</small></div>
          <div class="levelup-stat"><span>Proficiency Bonus</span><b>${esc(signedBonus(c.proficiency_bonus))} → ${esc(signedBonus(nextPb))}</b><small>${nextPb!==Number(c.proficiency_bonus)?"Bonus increases this level":"No change this level"}</small></div>
          <div class="levelup-stat"><span>Class</span><b>${esc(c.class_name)}</b><small>${c.subclass_name?esc(c.subclass_name):"No subclass selected yet"}</small></div>
        </div>
        <h3 style="margin-top:18px">Newly Unlocked Features</h3>
        <div class="feature-accordion">${featureRows}</div>
      </div>
    </section>

    <section class="builder-panel" data-levelup-step="1">
      <div class="builder-panel-card">
        <h3>Hit Point Increase</h3>
        <p class="summary">Your ${esc(c.class_name)} Hit Die is d${esc(die)}. Constitution modifier: ${esc(signedBonus(con))}.</p>
        <div class="levelup-hp-choice">
          <button type="button" class="builder-choice levelup-hp-method active" data-hp-mode="fixed"><b>Fixed Value</b><span>d${esc(die)} average + CON</span><strong>+${esc(fixed)} HP</strong></button>
          <button type="button" class="builder-choice levelup-hp-method" data-hp-mode="roll"><b>Roll Hit Die</b><span>Roll 1d${esc(die)} + CON</span><strong id="rolled_hp_preview">Roll when ready</strong></button>
          <button type="button" class="builder-choice levelup-hp-method" data-hp-mode="custom"><b>Custom</b><span>For house rules or manual rolls</span><strong>Enter value</strong></button>
        </div>
        <div class="builder-form-grid" style="margin-top:16px">
          <label>HP Gain<input id="levelup_hp_gain" name="hp_gain" type="number" min="1" max="100" value="${esc(fixed)}" required></label>
          <label>Current Maximum<input value="${esc(c.hp_max)}" disabled></label>
          <label>New Maximum<input id="levelup_hp_total" value="${esc(Number(c.hp_max)+fixed)}" disabled></label>
        </div>
        <div class="builder-note" style="margin-top:14px">The same increase is added to current HP so gaining a level doesn't make the character proportionally more injured. It never exceeds the new maximum.</div>
      </div>
    </section>

    <section class="builder-panel" data-levelup-step="2">
      <div class="builder-panel-card">
        <h3>Choices Unlocked at Level ${esc(nextLevel)}</h3>
        ${choices.length?`<div class="levelup-choice-list">${choices.map(x=>`<div class="builder-note">${esc(x)}</div>`).join("")}</div>`:`<div class="builder-note">This level does not add a new modeled class choice.</div>`}
        ${needSubclass?`<div style="margin-top:18px"><label>Subclass<select name="subclass_id" required><option value="">Choose subclass…</option>${subclasses.map(x=>`<option value="${esc(x.id)}">${esc(x.option_label||x.name_en)}</option>`).join("")}</select></label></div>`:`${c.subclass_name?`<input type="hidden" name="subclass_id" value="">`:""}`}
        <div class="builder-note" style="margin-top:16px">Weapon Mastery, Expertise and Fighting Style choices remain editable in the Features tab after the level is applied. The level-up flow unlocks their new limits; it does not silently choose them for you.</div>
      </div>
    </section>

    <section class="builder-panel" data-levelup-step="3">
      <div class="builder-panel-card">
        <h3>Confirm Level Up</h3>
        <div class="builder-review">
          <div><span>Character</span><b data-i18n-skip>${esc(c.name)}</b></div>
          <div><span>Level</span><b>${esc(c.level)} → ${esc(nextLevel)}</b></div>
          <div><span>HP Maximum</span><b id="levelup_review_hp">${esc(c.hp_max)} → ${esc(Number(c.hp_max)+fixed)}</b></div>
          <div><span>Proficiency Bonus</span><b>${esc(signedBonus(nextPb))}</b></div>
          <div><span>XP</span><b>${esc(xp.xp.toLocaleString("en-US"))}</b></div>
        </div>
        <div class="builder-note" style="margin-top:14px">A reversible snapshot of the current progression state is saved before applying the level. The small Undo Level button on the character sheet can restore it.</div>
      </div>
    </section>

    <div class="builder-nav">
      <button type="button" id="levelup_prev" class="button secondary" disabled>Previous</button>
      <button type="button" id="levelup_next" class="primary-action">Next</button>
      <button type="submit" id="levelup_submit" class="primary-action builder-hidden">Confirm Level ${esc(nextLevel)}</button>
    </div>
  </form>

  <script>
  (()=> {
    const panels=[...document.querySelectorAll('[data-levelup-step]')];
    const pills=[...document.querySelectorAll('[data-levelup-pill]')];
    const prev=document.getElementById('levelup_prev');
    const next=document.getElementById('levelup_next');
    const submit=document.getElementById('levelup_submit');
    const hp=document.getElementById('levelup_hp_gain');
    const total=document.getElementById('levelup_hp_total');
    const review=document.getElementById('levelup_review_hp');
    const methods=[...document.querySelectorAll('[data-hp-mode]')];
    const fixed=${JSON.stringify(fixed)};
    const die=${JSON.stringify(die)};
    const con=${JSON.stringify(con)};
    const currentMax=${JSON.stringify(Number(c.hp_max))};
    let step=0;

    function show(n){
      step=Math.max(0,Math.min(3,n));
      panels.forEach((p,i)=>p.classList.toggle('active',i===step));
      pills.forEach((p,i)=>p.classList.toggle('active',i===step));
      prev.disabled=step===0;
      next.classList.toggle('builder-hidden',step===3);
      submit.classList.toggle('builder-hidden',step!==3);
      window.scrollTo({top:0,behavior:'smooth'});
    }
    function syncHp(){
      const gain=Math.max(1,Number(hp.value)||1);
      total.value=currentMax+gain;
      review.textContent=currentMax+' → '+(currentMax+gain);
    }
    methods.forEach(btn=>btn.addEventListener('click',()=>{
      methods.forEach(x=>x.classList.toggle('active',x===btn));
      const mode=btn.dataset.hpMode;
      if(mode==='fixed') hp.value=fixed;
      if(mode==='roll'){
        const arr=new Uint32Array(1); crypto.getRandomValues(arr);
        const roll=(arr[0]%die)+1;
        const gain=Math.max(1,roll+con);
        hp.value=gain;
        document.getElementById('rolled_hp_preview').textContent='Rolled '+roll+(con>=0?' + ':' - ')+Math.abs(con)+' = +'+gain+' HP';
      }
      if(mode==='custom') { hp.focus(); hp.select(); }
      syncHp();
    }));
    hp.addEventListener('input',syncHp);
    prev.addEventListener('click',()=>show(step-1));
    next.addEventListener('click',()=>show(step+1));
    syncHp(); show(0);
  })();
  </script>`;

  return {status:200,body:layout({title:`Level Up · ${c.name}`,content})};
}

function signedBonus(n){return Number(n)>=0?`+${Number(n)}`:String(Number(n));}
function skillBonus(c,skill){
  const key=SKILL_ABILITY[skill]; const mod=abilityModifier(c[key])??0;
  const proficient=(c.skill_proficiencies||[]).includes(skill);
  const scholar=String(featureChoiceValue(c,"wizard_scholar")||"")===skill;
  const expert=expertiseNames(c).includes(skill)||scholar;
  const multiplier=proficient?(expert?2:1):0;
  let bonus=mod+Number(c.proficiency_bonus||0)*multiplier;

  const order=String(featureChoiceValue(c,"divine_order")||"");
  if(c.class_name==="Cleric" && order==="Thaumaturge" && ["Arcana","Religion"].includes(skill)){
    bonus+=Math.max(1,abilityModifier(c.wisdom)??0);
  }

  const primal=String(featureChoiceValue(c,"primal_order")||"");
  if(c.class_name==="Druid" && primal==="Magician" && ["Arcana","Nature"].includes(skill)){
    bonus+=Math.max(1,abilityModifier(c.wisdom)??0);
  }
  return bonus;
}
function saveBonus(c,key,label){
  const mod=abilityModifier(c[key])??0;
  return mod+((c.saving_throw_proficiencies||[]).includes(label)?Number(c.proficiency_bonus||0):0);
}

function renderManagedResourceActions(c,r,slots,back){
  const key=String(r.source_key||"");
  if(key==="subclass:fiend:dark-luck" || key==="subclass:open-hand:wholeness" || key==="subclass:draconic:dragon-wings" || key==="subclass:berserker:intimidating-presence"){
    return `<span class="resource-active">Use a Subclass Action card.</span>`;
  }

  if(key==="class:fighter:second-wind"){
    return `<form data-live-roll data-roll-formula="1d10+${esc(c.level)}" data-roll-label="Second Wind" method="post" action="/character/${encodeURIComponent(c.id)}/class-action"><input type="hidden" name="action" value="second_wind"><button type="submit" ${Number(r.current_value)<=0?"disabled":""}>Second Wind</button></form>`;
  }

  if(key==="class:paladin:lay-on-hands"){
    return `<form class="resource-spend-form" method="post" action="/character/${encodeURIComponent(c.id)}/class-action"><input type="hidden" name="action" value="lay_on_hands"><input name="amount" type="number" min="1" max="${esc(r.current_value)}" value="5"><button type="submit" ${Number(r.current_value)<=0?"disabled":""}>Heal</button></form>`;
  }

  if(key==="class:sorcerer:innate-sorcery"){
    return innateSorceryActive(c)
      ? `<form method="post" action="/character/${encodeURIComponent(c.id)}/innate-sorcery"><input type="hidden" name="action" value="end"><button type="submit" class="equipment-on">End</button></form><span class="resource-active">Active · DC +1 · spell attacks Advantage</span>`
      : `<form method="post" action="/character/${encodeURIComponent(c.id)}/innate-sorcery"><input type="hidden" name="action" value="activate"><button type="submit" ${Number(r.current_value)<=0?"disabled":""}>Activate</button></form>`;
  }

  if(key==="class:warlock:magical-cunning"){
    return `<form method="post" action="/character/${encodeURIComponent(c.id)}/class-action"><input type="hidden" name="action" value="magical_cunning"><button type="submit" ${Number(r.current_value)<=0?"disabled":""}>Recover Pact Slots</button></form>`;
  }

  if(key==="class:cleric:channel-divinity" || key==="class:paladin:channel-divinity"){
    return `<span class="resource-active">Use a Channel Divinity action card.</span>`;
  }

  return `<form method="post" action="/character/${encodeURIComponent(c.id)}/resource/${encodeURIComponent(r.id)}/adjust"><input type="hidden" name="delta" value="-1"><button type="submit">Use</button></form><form method="post" action="/character/${encodeURIComponent(c.id)}/resource/${encodeURIComponent(r.id)}/adjust"><input type="hidden" name="delta" value="1"><button type="submit">+</button></form>`;
}

function renderChannelDivinityPanel(c,resources,inventory,back,compact=false){
  const profile=channelDivinityProfile(c);
  if(!profile.available) return "";
  const resource=(resources||[]).find(x=>String(x.source_key)===profile.sourceKey);
  if(!resource) return "";
  const empty=Number(resource.current_value)<=0;
  const disabled=empty?"disabled":"";
  const state=channelDivinityState(c);
  const cards=[];
  const action=`/character/${encodeURIComponent(c.id)}/class-action`;
  const spendAttr=`data-resource-consumer="${esc(profile.sourceKey)}"`;

  if(profile.className==="Cleric"){
    const sparkFormula=signedFormula(`${profile.sparkDice}d8`,profile.mod);
    const supreme=c.subclass_name==="Life Domain" && profile.level>=17;
    cards.push(`<article class="choice-engine-card channel-card"><div class="choice-engine-head"><div><span class="compact-kicker">Magic Action · 30 ft.</span><h4>Divine Spark</h4></div><span class="choice-status">${esc(sparkFormula)}</span></div><p>Restore HP to another creature, or force a Constitution save for Radiant or Necrotic damage. Successful saves take half damage.</p>${supreme?`<div class="small-note">Supreme Healing maximizes the healing dice.</div>`:""}<div class="channel-action-row" ${spendAttr}><form data-live-roll data-roll-formula="${esc(sparkFormula)}" data-roll-label="Divine Spark · healing" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="divine_spark"><input type="hidden" name="mode" value="heal"><button data-spend-resource type="submit" ${disabled}>Roll healing</button></form><form data-live-roll data-roll-formula="${esc(sparkFormula)}" data-roll-label="Divine Spark · Radiant" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="divine_spark"><input type="hidden" name="mode" value="damage"><input type="hidden" name="damage_type" value="Radiant"><button data-spend-resource type="submit" ${disabled}>Radiant damage</button></form><form data-live-roll data-roll-formula="${esc(sparkFormula)}" data-roll-label="Divine Spark · Necrotic" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="divine_spark"><input type="hidden" name="mode" value="damage"><input type="hidden" name="damage_type" value="Necrotic"><button data-spend-resource type="submit" ${disabled}>Necrotic damage</button></form></div></article>`);

    const sear=profile.searDice>0?`${profile.searDice}d8 Radiant on each failed save`:"No Sear Undead damage before level 5";
    cards.push(`<article class="choice-engine-card channel-card"><div class="choice-engine-head"><div><span class="compact-kicker">Magic Action · 30 ft.</span><h4>Turn Undead</h4></div><span class="choice-status">DC ${esc(profile.saveDc)}</span></div><p>Chosen Undead make a Wisdom save. On a failure they are Frightened and Incapacitated for 1 minute and try to move away; damage normally ends the effect.</p><div class="small-note">${esc(sear)}${profile.searDice>0?" · Sear Undead damage does not end the turn effect.":""}</div><div ${spendAttr}><form data-live-roll data-roll-formula="${profile.searDice>0?esc(`${profile.searDice}d8`):"0"}" data-roll-label="Turn Undead" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="turn_undead"><button data-spend-resource type="submit" ${disabled}>Use Turn Undead</button></form></div></article>`);

    if(c.subclass_name==="Life Domain" && profile.level>=3){
      const pool=profile.level*5;
      cards.push(`<article class="choice-engine-card channel-card"><div class="choice-engine-head"><div><span class="compact-kicker">Life Domain · Magic Action</span><h4>Preserve Life</h4></div><span class="choice-status">${esc(pool)} HP pool</span></div><p>Distribute this healing among Bloodied creatures within 30 feet. A creature cannot be healed above half its HP maximum.</p><div ${spendAttr}><form data-live-roll data-roll-formula="0" data-roll-label="Preserve Life" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="preserve_life"><button data-spend-resource type="submit" ${disabled}>Use Preserve Life</button></form></div></article>`);
    }
  }

  if(profile.className==="Paladin"){
    cards.push(`<article class="choice-engine-card channel-card"><div class="choice-engine-head"><div><span class="compact-kicker">Bonus Action · 60 ft.</span><h4>Divine Sense</h4></div><span class="choice-status">${state.divine_sense?"Active":"10 minutes"}</span></div><p>Detect the location and creature type of Celestials, Fiends, and Undead, plus consecrated or desecrated places and objects within 60 feet.</p>${state.divine_sense?`<form method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="divine_sense_end"><button class="button secondary">End Divine Sense</button></form>`:`<div ${spendAttr}><form method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="divine_sense"><button data-spend-resource ${disabled}>Activate Divine Sense</button></form></div>`}</article>`);

    if(c.subclass_name==="Oath of Devotion" && profile.level>=3){
      const eligible=(inventory||[]).filter(item=>stateBool(item.state,"equipped")&&isPactBladeEligibleItem(item));
      cards.push(`<article class="choice-engine-card channel-card"><div class="choice-engine-head"><div><span class="compact-kicker">Oath of Devotion · Attack action</span><h4>Sacred Weapon</h4></div><span class="choice-status">${state.sacred_weapon?`Active · +${esc(state.sacred_weapon.attack_bonus||Math.max(1,profile.mod))}`:`+${esc(Math.max(1,profile.mod))} attack`}</span></div><p>For 10 minutes, add your Charisma modifier (minimum +1) to attack rolls with the chosen equipped melee weapon. Its hits can deal normal or Radiant damage.</p>${state.sacred_weapon?`<div class="small-note">Active weapon: ${esc(state.sacred_weapon.name||"Sacred Weapon")}</div><form method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="sacred_weapon_end"><button class="button secondary">End Sacred Weapon</button></form>`:eligible.length?`<div ${spendAttr}><form class="choice-engine-form" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="sacred_weapon"><select name="instance_id">${eligible.map(item=>`<option value="${esc(item.instance_id)}">${esc(item.name_en)}</option>`).join("")}</select><button data-spend-resource ${disabled}>Imbue weapon</button></form></div>`:`<div class="feature-warning">Equip a melee weapon to use Sacred Weapon.</div>`}</article>`);
    }

    if(profile.level>=9){
      cards.push(`<article class="choice-engine-card channel-card"><div class="choice-engine-head"><div><span class="compact-kicker">Magic Action · 60 ft.</span><h4>Abjure Foes</h4></div><span class="choice-status">${esc(profile.abjureTargets)} target${profile.abjureTargets===1?"":"s"} · DC ${esc(profile.saveDc)}</span></div><p>Targets make a Wisdom save. A failed target is Frightened for 1 minute or until it takes damage, and can only move, take an action, or take a Bonus Action on its turns.</p><div ${spendAttr}><form data-live-roll data-roll-formula="0" data-roll-label="Abjure Foes" method="post" action="${action}"><input type="hidden" name="action" value="channel_divinity"><input type="hidden" name="effect" value="abjure_foes"><button data-spend-resource type="submit" ${disabled}>Use Abjure Foes</button></form></div></article>`);
    }
  }

  const title=compact?"Channel Divinity":"Channel Divinity Actions";
  return `<section class="section channel-divinity-panel ${compact?"compact":""}"><div class="unlocked-feature-head"><div><span class="compact-kicker">${esc(profile.className)} · Level ${esc(profile.level)}</span><h3>${title}</h3><p>Spend the shared class resource through one of the available effects below.</p></div><span class="choice-status" data-resource-key="${esc(profile.sourceKey)}">${esc(resource.current_value)} / ${esc(resource.max_value)}</span></div><div class="choice-engine-grid">${cards.join("")}</div></section>`;
}

function renderChannelDivinityCombatPanel(c,resources,inventory,back){
  return renderChannelDivinityPanel(c,resources,inventory,back,true);
}

function renderFontOfMagicPanel(c,resources,slots){
  if(c.class_name!=="Sorcerer" || Number(c.level)<2) return "";
  const points=resources.find(x=>x.source_key==="class:sorcerer:sorcery-points");
  if(!points) return "";

  const spendable=slots.filter(s=>((Number(s.current_slots)||0)+(Number(s.bonus_slots)||0))>0 && Number(s.slot_level)>=1 && Number(s.slot_level)<=5);
  const creatable=Object.entries(FONT_SLOT_COST)
    .map(([level,cost])=>({level:Number(level),cost}))
    .filter(x=>x.cost<=Number(points.max_value));

  return `<section class="font-magic-panel">
    <div class="font-magic-head"><div><span class="compact-kicker">Sorcerer · Font of Magic</span><h4>Flexible Casting</h4></div><span class="font-points">${esc(points.current_value)} / ${esc(points.max_value)} SP</span></div>
    <div class="font-magic-grid">
      <form method="post" action="/character/${encodeURIComponent(c.id)}/font-of-magic">
        <label>Convert a spell slot into Sorcery Points<select name="slot_level" ${spendable.length?"":"disabled"}>${spendable.map(s=>`<option value="${esc(s.slot_level)}">Level ${esc(s.slot_level)} · gain ${esc(s.slot_level)} SP · ${esc((Number(s.current_slots)||0)+(Number(s.bonus_slots)||0))} available</option>`).join("")}</select></label>
        <input type="hidden" name="action" value="slot_to_points">
        <button ${spendable.length?"":"disabled"}>Convert slot</button>
      </form>
      <form method="post" action="/character/${encodeURIComponent(c.id)}/font-of-magic">
        <label>Create a temporary spell slot<select name="slot_level">${creatable.map(x=>`<option value="${esc(x.level)}">Level ${esc(x.level)} · ${esc(x.cost)} SP</option>`).join("")}</select></label>
        <input type="hidden" name="action" value="points_to_slot">
        <button ${Number(points.current_value)>=2?"":"disabled"}>Create slot</button>
      </form>
    </div>
    <p>Created slots are shown separately and disappear on a Long Rest. Casting spends created slots before normal slots of the same level.</p>
  </section>`;
}

function renderConcentrationPanel(c,back){
  const state=concentrationState(c);
  if(!state) return "";
  const checks=pendingConcentrationChecks(state);
  const pending=checks[0]?.dc||0;
  const eldritch=hasInvocation(c,"Eldritch Mind");
  return `<div class="sheet-panel concentration-panel"><div class="concentration-head"><div><span class="compact-kicker">Concentration</span><h3>${esc(state.name)}</h3></div><span class="concentration-orb">C</span></div>${pending?`<div class="concentration-alert"><b>Damage taken · save DC ${esc(pending)}</b><span>Constitution save${eldritch?" with Advantage from Eldritch Mind":""}</span><span><b>Pending saves</b>: ${esc(checks.length)}</span><form data-live-roll data-roll-formula="1d20" data-roll-mode="${eldritch?"advantage":""}" data-roll-label="Concentration save" method="post" action="/character/${encodeURIComponent(c.id)}/concentration/check"><input type="hidden" name="check_id" value="${esc(checks[0].id)}"><input type="hidden" name="back" value="${esc(back||"")}"><button>Roll Concentration Save</button></form></div>`:`<div class="small-note">Concentration is active. Casting another Concentration spell replaces it automatically.</div>`}<form method="post" action="/character/${encodeURIComponent(c.id)}/concentration/end" style="margin-top:9px"><input type="hidden" name="back" value="${esc(back||"")}"><button class="button secondary">End Concentration</button></form></div>`;
}

function renderTemporaryHpControl(c,back){
  return `<details class="temporary-hp-control"><summary><span>Temporary HP</span>: <b data-temp-hp-value>${esc(c.temp_hp||0)}</b></summary><form class="form-row" method="post" action="/character/${encodeURIComponent(c.id)}/temp-hp"><label>Temporary HP<input data-temp-hp-input name="amount" type="number" min="0" max="9999" step="1" value="${esc(c.temp_hp||0)}" required></label><input type="hidden" name="back" value="${esc(back||"")}"><button>Set</button></form><p class="small-note">Replaces the current value. Temporary HP do not stack.</p></details>`;
}

function combatReturnPath(value,characterId){
  const back=String(value||"");
  return /^\/encounter\/[a-zA-Z0-9-]+$/.test(back)?back:`/character/${encodeURIComponent(characterId)}`;
}

async function characterPage(id,workspacePanel=null) {
  const result=await getCharacter(id);
  if(!result)return{status:404,body:layout({title:"Character not found",content:`<a class="back" href="/characters">← Characters</a><div class="empty">Character not found.</div>`})};
  const {character:c,inventory,spells,slots,conditions,resources}=result;
  const [spellOptions,conditionChoices,presentation,masteryOptions,fightingStyles,subclassOptions,lastLevelHistory,invocationCtx,loreOptions,tomeOptions,familiarOptions,wildOptions]=await Promise.all([
    characterSpellOptions(c),conditionOptions(c.id),characterPresentationData(c),
    weaponMasteryOptions(c),fightingStyleOptions(),subclassOptionsForCharacter(c),lastLevelUpHistory(c.id),
    invocationTargetContext(c),loreDiscoveryOptions(c),pactTomeOptions(c),pactFamiliarOptions(c),wildShapeOptions(c)
  ]);
  const profile=characterSpellProfile(c), back=`/character/${encodeURIComponent(c.id)}`;
  const attunedCount=inventory.filter(i=>stateBool(i.state,"attuned")).length;
  const dexMod=abilityModifier(c.dexterity)??0,wisMod=abilityModifier(c.wisdom)??0;
  const passive=10+wisMod+((c.skill_proficiencies||[]).includes("Perception")?Number(c.proficiency_bonus||0):0);
  const abilities=[["STR","strength","Strength"],["DEX","dexterity","Dexterity"],["CON","constitution","Constitution"],["INT","intelligence","Intelligence"],["WIS","wisdom","Wisdom"],["CHA","charisma","Charisma"]];
  const hpPct=Math.max(0,Math.min(100,c.hp_max?Number(c.hp_current)/Number(c.hp_max)*100:0));
  const portrait=c.has_portrait?`<img src="/media/character/${encodeURIComponent(c.id)}?v=${encodeURIComponent(c.updated_at||"")}" alt="${esc(c.name)}">`:`<div class="media-fallback">${esc(String(c.name||"?").slice(0,2).toUpperCase())}</div>`;
  const view=c.sheet_layout||"standard";
  const xpState=xpProgressState(c);

  const inventoryHtml=inventory.length?`<div class="inventory-grid">${inventory.map(item=>{const rolls=characterWeaponRolls(c,item);const mastery=weaponMasteryForItem(c,item);return `<div class="inventory-item ${stateBool(item.state,"equipped")?"inventory-equipped":""}"><div class="eyebrow"><span>${esc(itemTypeLabel(inventoryType(item)))}</span><span>x${esc(item.quantity)}</span></div><h4>${esc(item.name_en)}</h4><div class="meta">${esc(item.subtitle_en||"")}</div>${mastery?`<div class="mastery-badge"><b>${esc(mastery)}</b><span>${esc(masteryHelp(mastery))}</span></div>`:""}${rolls?.pactBlade?`<div class="pact-weapon-badge">Pact Weapon · CHA</div>`:""}${renderEquipmentControls(c,item,back,attunedCount)}${rolls?`<div class="inventory-actions">${characterRollForm({formula:rolls.attack,label:`${c.name} — ${item.name_en} attack`,back,text:`Attack ${rolls.attack}`})}${characterRollForm({formula:rolls.damage,label:`${c.name} — ${item.name_en} damage`,back,text:`Damage ${rolls.damage}`})}</div>`:""}<div class="inventory-actions"><a class="button secondary" href="/card/${encodeURIComponent(item.template_id)}">Open card</a><form method="post" action="/instance/${encodeURIComponent(item.instance_id)}/unassign"><input type="hidden" name="back" value="${esc(back)}"><button class="button secondary">Return to world</button></form></div></div>`}).join("")}</div>`:`<div class="empty">No inventory cards yet.</div>`;

  const equippedItems=inventory.filter(i=>stateBool(i.state,"equipped"));
  const combatInventoryHtml=equippedItems.length?`<div class="inventory-grid">${equippedItems.map(item=>{const rolls=characterWeaponRolls(c,item);const mastery=weaponMasteryForItem(c,item);return `<div class="inventory-item inventory-equipped"><div class="eyebrow"><span>Equipped</span><span>x${esc(item.quantity)}</span></div><h4>${esc(item.name_en)}</h4>${mastery?`<div class="mastery-badge compact"><b>Mastery · ${esc(mastery)}</b><span>${esc(masteryHelp(mastery))}</span></div>`:""}${rolls?.pactBlade?`<div class="pact-weapon-badge">Pact Weapon · CHA</div>`:""}${rolls?.sacredWeapon?`<div class="pact-weapon-badge">Sacred Weapon · +${esc(rolls.sacredBonus)} attack · Radiant option</div>`:""}${rolls?`<div class="inventory-actions">${characterRollForm({formula:rolls.attack,label:`${c.name} — ${item.name_en} attack`,back,text:`Attack ${rolls.attack}`})}${characterRollForm({formula:rolls.damage,label:`${c.name} — ${item.name_en} damage`,back,text:`Damage ${rolls.damage}`})}${rolls.versatile?characterRollForm({formula:rolls.versatile,label:`${c.name} — ${item.name_en} versatile damage`,back,text:`Versatile ${rolls.versatile}`}):""}</div>`:`<div class="small-note">${isArmorCard(item)||isShieldCard(item)?"Contributes to Auto AC.":"Equipped item."}</div>`}</div>`}).join("")}</div>`:`<div class="empty">No equipped combat cards. Equip weapons, armor or a shield from Inventory.</div>`;

  const skillRows=Object.keys(SKILL_ABILITY).map(skill=>{const scholar=String(featureChoiceValue(c,"wizard_scholar")||"")===skill;const expert=expertiseNames(c).includes(skill)||scholar;return `<div class="skill-row ${(c.skill_proficiencies||[]).includes(skill)?"prof":""} ${expert?"expert":""}"><span>${esc(skill)}${expert?` <em>${scholar?"Scholar":"Expertise"}</em>`:""}</span><b>${esc(signedBonus(skillBonus(c,skill)))}</b></div>`}).join("");
  const saveRows=abilities.map(([abbr,key,label])=>`<div class="skill-row ${(c.saving_throw_proficiencies||[]).includes(label)?"prof":""}"><span>${esc(label)}</span><b>${esc(signedBonus(saveBonus(c,key,label)))}</b></div>`).join("");
  const abilityGrid=`<div class="ability-sheet-grid">${abilities.map(([abbr,key,label])=>{const m=abilityModifier(c[key])??0;return `<div class="ability-sheet"><b>${abbr}</b><strong>${esc(c[key])}</strong><span>${esc(signedBonus(m))}</span>${characterRollForm({formula:signedFormula("1d20",m),label:`${c.name} — ${label} check`,back,text:"Roll"})}</div>`}).join("")}</div>`;

  const conditionsBlock=`<div class="sheet-panel"><div class="spellbook-head"><h3>Conditions</h3><form class="spellbook-add" method="post" action="/character/${encodeURIComponent(c.id)}/condition/add"><select name="condition_entity_id"><option value="">Add condition…</option>${conditionChoices.map(x=>`<option value="${esc(x.id)}">${esc(x.name_en)}</option>`).join("")}</select><button>Apply</button></form></div><div class="condition-list">${conditions.length?conditions.map(x=>`<span class="condition-pill"><a href="/entity/${encodeURIComponent(x.entity_id)}">${esc(x.name_en)}</a><form method="post" action="/character/${encodeURIComponent(c.id)}/condition/${encodeURIComponent(x.id)}/remove"><button>×</button></form></span>`).join(""):`<span class="small-note">No active conditions.</span>`}</div></div>`;

  const resourcesBlock=`<div class="sheet-panel" data-workspace-character-resources><div class="spellbook-head"><div><h3>Resources</h3><p class="small-note">Class resources are synchronized automatically. Supported class actions resolve their common bookkeeping here.</p></div><form class="spellbook-add" method="post" action="/character/${encodeURIComponent(c.id)}/resource/add"><input name="name" placeholder="Custom resource"><input name="max_value" type="number" min="1" value="1"><select name="recharge"><option value="short">Short Rest</option><option value="long" selected>Long Rest</option><option value="none">Manual</option></select><button>Add</button></form></div>${resources.length?resources.map(r=>`<div class="resource-row"><div><div class="resource-title"><b>${esc(r.name)}</b>${r.auto_managed?`<span class="auto-resource">Class</span>`:""}</div>${r.notes?`<div class="small-note">${esc(r.notes)}</div>`:`<div class="small-note">${esc(r.recharge)}</div>`}</div><div class="resource-actions"><span class="resource-value" data-resource-key="${esc(r.source_key||r.id)}">${esc(r.current_value)} / ${esc(r.max_value)}</span>${renderManagedResourceActions(c,r,slots,back)}${r.auto_managed?"":`<form method="post" action="/character/${encodeURIComponent(c.id)}/resource/${encodeURIComponent(r.id)}/delete" onsubmit="return confirm('Delete resource?')"><button class="danger-button" type="submit">×</button></form>`}</div></div>`).join(""):`<div class="small-note">This class has no automated limited-use resource at the current level.</div>`}</div>`;

  const slotsHtml=slots.length?slots.map(s=>{const normal=Number(s.current_slots)||0,bonus=Number(s.bonus_slots)||0,max=Number(s.max_slots)||0;return `<div class="spell-slot ${bonus?"spell-slot-bonus":""}"><b>${profile.pact?"Pact Slot":`Level ${esc(s.slot_level)} Slot`}</b><strong>${max?`${esc(normal)} / ${esc(max)}`:"Created"}${bonus?` <em>+${esc(bonus)}</em>`:""}</strong><div class="slot-pips">${Array.from({length:max},(_,i)=>`<span class="slot-pip ${i<normal?"full":""}"></span>`).join("")}${Array.from({length:bonus},()=>`<span class="slot-pip bonus"></span>`).join("")}</div>${profile.pact?`<span class="slot-note">Level ${esc(s.slot_level)} · Short Rest</span>`:bonus?`<span class="slot-note">${esc(bonus)} temporary slot${bonus===1?"":"s"} · Long Rest clears</span>`:""}</div>`}).join(""):`<div class="small-note">No spell slots.</div>`;

  const spellCounts=spellUsageCounts(spells);
  const cantripText=profile.cantripLimit>0?`${spellCounts.cantrips}/${profile.cantripLimit}`:"—";
  const preparedText=`${spellCounts.prepared}/${profile.preparedLimit}`;
  const spellbookText=profile.className==="Wizard"?`<span class="spell-ledger-stat"><b>${esc(spellCounts.spellbook)}</b><small>Spellbook</small></span>`:"";
  const addHelp=profile.className==="Wizard"
    ? "Cantrips are limited by level. Level 1+ spells are added to your spellbook; prepare up to the class limit."
    : "Cantrips and prepared level 1+ spells are limited by the class table. Always-prepared class spells do not count against the limit.";
  const fontMagicHtml=renderFontOfMagicPanel(c,resources,slots);
  const activeConcentration=concentrationState(c);

  const spellsHtml=profile.abilityKey?`<div class="sheet-panel spellcasting-panel">
    <div class="spellcasting-hero">
      <div><span class="compact-kicker">${esc(profile.className)} Spellcasting</span><h3>Spellbook & Magic</h3><div class="chips"><span class="chip">${esc(profile.abilityKey.toUpperCase())}</span><span class="chip gold">Attack +${esc(profile.attack)}</span><span class="chip gold">DC ${esc(profile.saveDc)}</span>${profile.innateSorceryActive?`<span class="chip active-magic-chip">Innate Sorcery</span>`:""}${activeConcentration?`<span class="chip concentration-chip">Concentrating · ${esc(activeConcentration.name)}</span>`:""}</div></div>
      <div class="spell-ledger">
        <span class="spell-ledger-stat"><b>${esc(cantripText)}</b><small>Cantrips</small></span>
        <span class="spell-ledger-stat"><b>${esc(preparedText)}</b><small>Prepared</small></span>
        ${spellbookText}
        ${spellCounts.always?`<span class="spell-ledger-stat always"><b>${esc(spellCounts.always)}</b><small>Always</small></span>`:""}
      </div>
    </div>
    <div class="spell-manager spell-manager-search">
      ${renderSpellSearchPicker({
        action:`/character/${encodeURIComponent(c.id)}/spell/add`,
        inputName:"spell_entity_id",
        options:spellOptions,
        placeholder:`Search ${profile.className==="Wizard"?"spellbook":"class"} spell…`,
        buttonText:"Add spell",
        help:addHelp,
        pickerClass:"class-spell-picker"
      })}
    </div>
    <div class="spell-slot-grid">${slotsHtml}</div>
    ${fontMagicHtml}
    <div class="runtime-grid spell-runtime-grid" style="margin-top:14px">${spells.length?spells.map(sp=>renderSpellRuntimeCard(c,sp,slots,profile,back)).join(""):`<div class="empty">No spells assigned yet.</div>`}</div>
  </div>`:`<div class="empty">This class does not use the current spellcasting runtime.</div>`;

  const masteryLimit=weaponMasteryLimit(c);
  const selectedMasteries=weaponMasteryNames(c);
  const selectedMasteryRows=selectedMasteries.map(name=>masteryOptions.find(x=>x.name_en===name)||{name_en:name,mastery:"—",id:null});
  const masteryAvailable=masteryOptions.filter(x=>!selectedMasteries.includes(x.name_en));
  const masteryPanel=masteryLimit?`<div class="feature-choice-panel"><div class="feature-choice-head"><div><h4>Weapon Mastery</h4><p>${selectedMasteries.length} / ${masteryLimit} weapon kinds selected. Reconfigure when your table permits a mastery change, normally around a Long Rest.</p></div><span class="choice-count">${selectedMasteries.length}/${masteryLimit}</span></div>${selectedMasteryRows.length?`<div class="mastery-selection">${selectedMasteryRows.map(w=>`<div class="mastery-choice"><div><b>${esc(w.name_en)}</b><span>${esc(w.mastery||"—")} · ${esc(masteryHelp(w.mastery))}</span></div>${w.id?`<form method="post" action="/character/${encodeURIComponent(c.id)}/mastery"><input type="hidden" name="weapon_entity_id" value="${esc(w.id)}"><input type="hidden" name="action" value="remove"><button class="danger-button" type="submit">Remove</button></form>`:""}</div>`).join("")}</div>`:""}${selectedMasteries.length<masteryLimit?`<form class="choice-add-form" method="post" action="/character/${encodeURIComponent(c.id)}/mastery"><select name="weapon_entity_id" required><option value="">Choose weapon…</option>${masteryAvailable.map(w=>`<option value="${esc(w.id)}">${esc(w.name_en)} · ${esc(w.mastery)}</option>`).join("")}</select><input type="hidden" name="action" value="add"><button type="submit">Master weapon</button></form>`:""}<div class="small-note">The app marks mastered weapons in Inventory, Combat and Encounter actions. Mastery effects are reminders; target movement, Advantage and saving throws are still resolved at the table.</div></div>`:"";

  const expertLimit=expertiseLimit(c);
  const selectedExpertise=expertiseNames(c);
  const eligibleExpertise=(c.skill_proficiencies||[]).filter(x=>!selectedExpertise.includes(x));
  const expertisePanel=expertLimit?`<div class="feature-choice-panel compact-choice-panel expertise-panel"><div class="compact-choice-head"><div><span class="compact-kicker">Skill Specialization</span><h4>Expertise</h4></div><span class="choice-count">${selectedExpertise.length}/${expertLimit}</span></div><div class="compact-choice-body">${selectedExpertise.length?`<div class="choice-chips expertise-chips">${selectedExpertise.map(skill=>`<form method="post" action="/character/${encodeURIComponent(c.id)}/expertise"><input type="hidden" name="skill" value="${esc(skill)}"><input type="hidden" name="action" value="remove"><button class="choice-chip expert" type="submit" title="Remove Expertise">${esc(skill)} <span>×2</span><i>×</i></button></form>`).join("")}</div>`:`<div class="small-note">No Expertise selected yet.</div>`}${selectedExpertise.length<expertLimit&&eligibleExpertise.length?`<details class="compact-editor"><summary>Edit</summary><form class="choice-add-form compact-add-form" method="post" action="/character/${encodeURIComponent(c.id)}/expertise"><select name="skill" required><option value="">Choose proficient skill…</option>${eligibleExpertise.map(skill=>`<option>${esc(skill)}</option>`).join("")}</select><input type="hidden" name="action" value="add"><button type="submit">Add</button></form></details>`:""}</div></div>`:"";

  const styleName=fightingStyleName(c);
  const styleEntity=fightingStyles.find(x=>x.name_en===styleName);
  const fightingStylePanel=fightingStyleGranted(c)?`<div class="feature-choice-panel"><div class="feature-choice-head"><div><h4>Fighting Style</h4><p>Choose a normalized Fighting Style feat. Defense and Archery already feed into Auto AC / attack calculations.</p></div>${styleName?`<span class="choice-count">${esc(styleName)}</span>`:""}</div><form class="choice-add-form" method="post" action="/character/${encodeURIComponent(c.id)}/fighting-style"><select name="feat_id"><option value="">No style selected</option>${fightingStyles.map(x=>`<option value="${esc(x.id)}" ${x.name_en===styleName?"selected":""}>${esc(x.name_en)}</option>`).join("")}</select><button type="submit">Save style</button>${styleEntity?`<a class="button secondary" href="/builder-data/entity/${encodeURIComponent(styleEntity.id)}">Open feat</a>`:""}</form></div>`:"";

  const currentSubclass=subclassOptions.find(x=>String(x.id)===String(c.builder_meta?.subclass_entity_id||""))
    ||subclassOptions.find(x=>x.name_en===c.subclass_name);
  const progressionPanel=`<div class="feature-choice-panel progression-panel progression-ledger">
    <div class="progression-ledger-main">
      <div class="level-medallion"><span>LEVEL</span><b>${esc(c.level)}</b><small>PB ${esc(signedBonus(c.proficiency_bonus))}</small></div>
      <div class="progression-track">
        <div class="progression-track-head">
          <div><span class="compact-kicker">${xpState.maxLevel?"Legendary Adventurer":`Road to Level ${esc(Number(c.level)+1)}`}</span><b>${esc(xpState.xp.toLocaleString("en-US"))} XP</b></div>
          <div class="progression-track-right">${xpState.maxLevel?`<strong>MAX</strong>`:`<strong>${Math.round(xpState.pct)}%</strong><span>${esc(xpState.remaining.toLocaleString("en-US"))} XP remaining</span>`}</div>
        </div>
        <div class="xp-bar xp-bar-ornate"><div class="xp-fill ${xpState.canLevel?"ready":""}" style="width:${xpState.pct}%"></div><span class="xp-gem" style="left:${Math.max(1,Math.min(99,xpState.pct))}%"></span></div>
        ${!xpState.maxLevel?`<div class="xp-thresholds"><span>${esc(xpState.current.toLocaleString("en-US"))}</span><span>${esc(xpState.next.toLocaleString("en-US"))} XP</span></div>`:""}
        <div class="xp-quick-row">
          <span class="xp-quick-label">Award XP</span>
          ${[100,500,1000].map(amount=>`<form method="post" action="/character/${encodeURIComponent(c.id)}/xp"><input type="hidden" name="xp" value="${amount}"><input type="hidden" name="mode" value="add"><button class="xp-quick-button" type="submit">+${amount}</button></form>`).join("")}
          <details class="xp-more">
            <summary>More ▾</summary>
            <div class="xp-more-popover">
              <form method="post" action="/character/${encodeURIComponent(c.id)}/xp"><label>Add custom XP<input type="number" name="xp" value="100" step="1"></label><input type="hidden" name="mode" value="add"><button type="submit">Add</button></form>
              <form method="post" action="/character/${encodeURIComponent(c.id)}/xp"><label>Set exact XP<input type="number" name="xp" value="${esc(c.xp)}" min="0" step="1"></label><input type="hidden" name="mode" value="set"><button class="button secondary" type="submit">Set</button></form>
              ${lastLevelHistory&&Number(lastLevelHistory.to_level)===Number(c.level)?`<form method="post" action="/character/${encodeURIComponent(c.id)}/level-rollback" onsubmit="return confirm('Undo the last level-up and restore its saved progression state? XP is kept.')"><button class="tiny-rollback" type="submit">↶ Undo last level</button></form>`:""}
            </div>
          </details>
        </div>
      </div>
      <div class="progression-action">
        ${xpState.canLevel?`<a class="level-up-seal level-up-ready" href="/character/${encodeURIComponent(c.id)}/level-up"><span>Ready</span><b>Level Up</b><small>to ${esc(Number(c.level)+1)}</small></a>`:`${xpState.maxLevel?`<div class="level-up-seal max"><span>Legend</span><b>Level 20</b><small>complete</small></div>`:`<button class="level-up-seal locked" type="button" disabled><span>Locked</span><b>Level Up</b><small>${esc(xpState.remaining.toLocaleString("en-US"))} XP</small></button>`}`}
      </div>
    </div>
    <div class="progression-ledger-foot">
      <span>${esc(c.class_name)}${c.subclass_name?` · ${esc(c.subclass_name)}`:""}</span>
      <span>Experience is never spent when leveling.</span>
    </div>
  </div>`;

  const featuresHtml=presentation.features.length?`<div class="feature-accordion">${presentation.features.map((f,index)=>`<details class="feature-disclosure"><summary><div class="feature-summary-main"><span class="feature-arrow">›</span><div><div class="feature-source">${esc(f.kind)} · ${f.entityId?`<a href="/builder-data/entity/${encodeURIComponent(f.entityId)}" onclick="event.stopPropagation()">${esc(f.source)}</a>`:esc(f.source)}</div><b>${esc(f.name)}</b></div></div>${f.level?`<span class="feature-level-badge">Lv ${esc(f.level)}</span>`:`<span class="feature-level-badge core">Core</span>`}</summary><div class="feature-expanded">${f.description?featureRichText(f.description):`<p class="small-note">No additional description was supplied by the source.</p>`}<div class="feature-expanded-footer">${f.entityId?`<a class="button secondary" href="/builder-data/entity/${encodeURIComponent(f.entityId)}">Open source entry</a>`:""}</div></div></details>`).join("")}</div>`:`<div class="empty">No level-appropriate features were normalized yet.</div>`;

  const classChoicePanel=renderClassChoicePanel(c,resources,invocationCtx,loreOptions,inventory,tomeOptions,familiarOptions,wildOptions);
  const channelDivinityPanel=renderChannelDivinityPanel(c,resources,inventory,back);
  const subclassPanel=renderSubclassActionPanel(c,resources,text=>translateText(text,displayContext.getStore()?.language||"ru"))
    +`<div class="subclass-controls" data-subclass-controls="${esc(c.id)}">${renderSubclassControls(c,resources,text=>translateText(text,displayContext.getStore()?.language||"ru"))}</div>`;
  const featureEngineHtml=`<div class="feature-engine-grid">${progressionPanel}${masteryPanel}${expertisePanel}${fightingStylePanel}</div>${classChoicePanel}${channelDivinityPanel}${subclassPanel}<section class="section"><div class="unlocked-feature-head"><div><h3>Unlocked Features</h3><p>Only features available at character level ${esc(c.level)} are shown. Click a name to expand its full description.</p></div><span>${esc(presentation.features.length)} unlocked</span></div>${featuresHtml}</section>`;

  const content=`<a class="back" href="/characters">← Characters</a>
  <div class="sheet-shell sheet-mode-${esc(view)}">
    <div class="sheet-header">
      <section class="sheet-panel sheet-identity"><div class="eyebrow"><span>${esc(c.class_name||"Adventurer")}${c.subclass_name?` · ${esc(c.subclass_name)}`:""}</span><span>Level ${esc(c.level)}</span></div><h2 data-i18n-skip>${esc(c.name)}</h2><div class="chips">${c.species?`<span class="chip">${esc(c.species)}</span>`:""}${c.background_name?`<span class="chip">${esc(c.background_name)}</span>`:""}${c.origin_feat?`<span class="chip gold">${esc(c.origin_feat)}</span>`:""}${pendingClassChoices(c).length?`<span class="chip choice-pending-chip">${esc(pendingClassChoices(c).length)} choice${pendingClassChoices(c).length===1?"":"s"} pending</span>`:""}</div><div class="xp-compact"><div class="xp-compact-label"><span>${esc(xpState.xp.toLocaleString("en-US"))} XP</span><span>${xpState.maxLevel?"MAX":`${esc(xpState.next.toLocaleString("en-US"))} for Lv ${esc(Number(c.level)+1)}`}</span></div><div class="xp-bar"><div class="xp-fill ${xpState.canLevel?"ready":""}" style="width:${xpState.pct}%"></div></div></div><div class="sheet-view-switch" style="margin-top:15px">${["standard","compact","illustrated"].map(v=>`<form method="post" action="/character/${encodeURIComponent(c.id)}/layout"><input type="hidden" name="layout" value="${v}"><button class="${view===v?"active":""}">${v[0].toUpperCase()+v.slice(1)}</button></form>`).join("")}</div></section>
      <section class="sheet-portrait-section"><div class="media-frame sheet-portrait">${portrait}</div><div class="media-tools"><label class="button secondary">Upload portrait<input type="file" accept="image/png,image/jpeg,image/webp" onchange="uploadDndImage('/api/character/${encodeURIComponent(c.id)}/image',this)"></label>${c.has_portrait?`<button class="button secondary" type="button" onclick="removeDndImage('/api/character/${encodeURIComponent(c.id)}/image')">Remove</button>`:""}</div></section>
      <section class="sheet-panel sheet-vitals"><div class="sheet-core">
        <div class="core-stat"><b>HP</b><strong data-hp-value>${esc(c.hp_current)} / ${esc(c.hp_max)}</strong><div class="hp-bar"><div class="hp-fill" data-hp-fill style="width:${hpPct}%"></div></div></div>
        ${renderArmorClassControl(c)}
        <div class="core-stat"><b>Initiative</b><strong>${esc(signedBonus(dexMod))}</strong></div>
        <div class="core-stat"><b>Speed</b><strong>${esc(presentation.speed)}</strong><small data-subclass-flight ${dragonWingsActive(c)?"":"hidden"}>Fly 60 ft. · Dragon Wings</small></div>
        <div class="core-stat"><b>PB</b><strong>+${esc(c.proficiency_bonus)}</strong></div>
        <div class="core-stat"><b>Passive Perception</b><strong>${esc(passive)}</strong></div>
      </div>${renderTemporaryHpControl(c,back)}<div class="runtime-toolbar" style="margin-top:12px"><form class="form-row" method="post" action="/character/${encodeURIComponent(c.id)}/hp"><input name="delta" type="number" value="-1"><button>HP Apply</button></form><form method="post" action="/character/${encodeURIComponent(c.id)}/rest"><input type="hidden" name="rest_type" value="short"><button class="button secondary">Short Rest</button></form><form method="post" action="/character/${encodeURIComponent(c.id)}/rest"><input type="hidden" name="rest_type" value="long"><button>Long Rest</button></form></div></section>
    </div>

    <nav class="sheet-tabs">${["overview","combat","spells","inventory","features","notes"].map((x,i)=>`<button type="button" class="sheet-tab ${i===0?"active":""}" data-sheet-tab="${x}">${x[0].toUpperCase()+x.slice(1)}</button>`).join("")}</nav>

    <section class="sheet-pane active" data-sheet-pane="overview">${abilityGrid}<div class="skill-columns" style="margin-top:14px"><div class="skill-list"><h3>Saving Throws</h3>${saveRows}</div><div class="skill-list"><h3>Skills</h3>${skillRows}</div></div></section>
    <section class="sheet-pane" data-sheet-pane="combat"><div class="runtime-grid">${renderWildShapeCombatPanel(c,wildOptions,resources,back)}${renderChannelDivinityCombatPanel(c,resources,inventory,back)}${subclassPanel}<div class="concentration-area" data-concentration-area data-concentration-character="${esc(c.id)}">${renderConcentrationPanel(c,back)}</div>${conditionsBlock}${resourcesBlock}</div><section class="section"><h3>Equipped Loadout</h3>${combatInventoryHtml}</section></section>
    <section class="sheet-pane" data-sheet-pane="spells">${spellsHtml}</section>
    <section class="sheet-pane" data-sheet-pane="inventory"><section class="section"><div class="spellbook-head"><h3>Inventory Cards</h3><div class="chips"><span class="chip">Attunement ${esc(attunedCount)} / 3</span><span class="chip">${esc(equippedItems.length)} equipped</span></div></div>${inventoryHtml}</section></section>
    <section class="sheet-pane" data-sheet-pane="features">${featureEngineHtml}</section>
    <section class="sheet-pane" data-sheet-pane="notes"><div class="sheet-panel"><h3>Notes</h3><div class="description" data-i18n-skip>${esc(c.notes||translateText("No notes yet.",displayContext.getStore()?.language||"ru"))}</div><div style="margin-top:18px"><form method="post" action="/character/${encodeURIComponent(c.id)}/delete" onsubmit="return confirm('Delete this character?')"><button class="danger-button">Delete character</button></form></div></div></section>
  </div>
  <script>
  (()=>{const key='sheet-tab:${esc(c.id)}',tabs=[...document.querySelectorAll('[data-sheet-tab]')],panes=[...document.querySelectorAll('[data-sheet-pane]')];function show(name){tabs.forEach(t=>t.classList.toggle('active',t.dataset.sheetTab===name));panes.forEach(p=>p.classList.toggle('active',p.dataset.sheetPane===name));localStorage.setItem(key,name)}tabs.forEach(t=>t.addEventListener('click',()=>show(t.dataset.sheetTab)));show(localStorage.getItem(key)||'overview')})();

  (()=> {
    const clean=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
    const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el};

    document.querySelectorAll('[data-spell-picker]').forEach(root=>{
      let options=[];
      try{options=JSON.parse(root.dataset.spellOptions||'[]')}catch(_){options=[]}
      const input=root.querySelector('[data-spell-picker-input]');
      const hidden=root.querySelector('[data-spell-picker-value]');
      const pop=root.querySelector('[data-spell-picker-popover]');
      const tabs=root.querySelector('[data-spell-picker-tabs]');
      const results=root.querySelector('[data-spell-picker-results]');
      const empty=root.querySelector('[data-spell-picker-empty]');
      const clear=root.querySelector('[data-spell-picker-clear]');
      const submit=root.querySelector('[data-spell-picker-submit]');
      let activeLevel='all';

      const levels=[...new Set(options.map(o=>Number(o.level)||0))].sort((a,b)=>a-b);
      const tabDefs=[['all','All'],...levels.map(l=>[String(l),l===0?'Cantrips':'Level '+l])];

      for(const [value,label] of tabDefs){
        const b=make('button','spell-search-tab'+(value==='all'?' active':''),label);
        b.type='button';b.dataset.level=value;
        b.addEventListener('click',()=>{activeLevel=value;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});
        tabs.appendChild(b);
      }

      function sourceText(o){
        return o.classes || 'Spell';
      }

      function filtered(){
        const q=clean(input.value);
        let pool=options.filter(o=>activeLevel==='all'||String(Number(o.level)||0)===activeLevel);
        if(!q) return {items:pool.slice(0,36),mode:'browse'};
        const byName=pool.filter(o=>clean(o.name+" "+(o.name_original||"")).includes(q));
        if(byName.length) return {items:byName.slice(0,48),mode:'name'};
        return {items:pool.filter(o=>clean(o.description).includes(q)).slice(0,48),mode:'description'};
      }

      function render(){
        results.replaceChildren();
        const {items,mode}=filtered();
        empty.hidden=items.length>0;
        if(!items.length) return;

        const grouped=new Map();
        for(const o of items){
          const lv=Number(o.level)||0;
          if(!grouped.has(lv))grouped.set(lv,[]);
          grouped.get(lv).push(o);
        }

        for(const [lv,list] of [...grouped.entries()].sort((a,b)=>a[0]-b[0])){
          const group=make('div','spell-search-group');
          const heading=make('div','spell-search-group-title',lv===0?'Cantrips':'Level '+lv);
          if(mode==='description') heading.appendChild(make('span','spell-search-fallback','Description matches'));
          group.appendChild(heading);

          for(const o of list){
            const row=make('button','spell-search-result');row.type='button';
            const top=make('div','spell-search-result-top');
            const title=make('b','',o.name);
            const meta=make('span','',o.school||'Spell');
            top.append(title,meta);
            const tags=make('div','spell-search-result-tags');
            tags.appendChild(make('span','',sourceText(o)));
            if(o.ritual)tags.appendChild(make('span','','Ritual'));
            if(o.concentration)tags.appendChild(make('span','','Concentration'));
            const desc=make('p','',String(o.description||'').replace(/\s+/g,' ').slice(0,170)+(String(o.description||'').length>170?'…':''));
            row.append(top,tags,desc);
            row.addEventListener('click',()=>{
              hidden.value=o.id;
              input.value=o.name;
              submit.disabled=false;
              root.classList.add('has-selection');
              pop.hidden=true;
            });
            group.appendChild(row);
          }
          results.appendChild(group);
        }
      }

      function open(){pop.hidden=false;render()}
      input.addEventListener('focus',open);
      input.addEventListener('click',open);
      input.addEventListener('input',()=>{hidden.value='';submit.disabled=true;root.classList.remove('has-selection');open()});
      clear.addEventListener('click',()=>{input.value='';hidden.value='';submit.disabled=true;root.classList.remove('has-selection');open();input.focus()});
      root.addEventListener('submit',e=>{if(!hidden.value){e.preventDefault();open();input.focus()}});
      document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))pop.hidden=true});
      render();
    });
  })();
  </script>`;
  const document=layout({title:c.name,content,userTitle:true});
  return {status:200,body:workspacePanel?projectCharacterPanel(document,workspacePanel,c.id):document};
}

function numericArmorClass(value) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "number") return Math.round(entry);
      if (entry && typeof entry === "object") {
        const candidate = entry.value ?? entry.ac ?? entry.armor_class;
        if (candidate !== undefined && Number.isFinite(Number(candidate))) return Math.round(Number(candidate));
      }
    }
  }
  if (value && typeof value === "object") {
    const candidate = value.value ?? value.ac ?? value.armor_class;
    if (candidate !== undefined && Number.isFinite(Number(candidate))) return Math.round(Number(candidate));
  }
  return 10;
}

async function listEncounters() {
  return sql`
    SELECT e.id::text, e.name, e.status, e.round_number, e.current_turn_index, e.created_at,
           COUNT(ec.id)::int AS combatant_count
    FROM encounters e
    LEFT JOIN encounter_combatants ec ON ec.encounter_id=e.id
    GROUP BY e.id
    ORDER BY e.updated_at DESC, e.created_at DESC
  `;
}

async function createEncounter(form) {
  const name = String(form.name || "").trim().slice(0,120);
  if (!name) throw new Error("Encounter name is required");
  const rows = await sql`
    INSERT INTO encounters(name, status, round_number, current_turn_index)
    VALUES (${name}, 'setup', 1, 0)
    RETURNING id::text
  `;
  return rows[0].id;
}

async function deleteEncounter(id) {
  await sql`DELETE FROM encounters WHERE id=${id}`;
}

async function encounterCreatureOptions() {
  return sql`
    SELECT ce.id::text, ce.name_en, c.challenge_rating, c.hit_points, c.dexterity, c.armor_class
    FROM content_entities ce
    JOIN creatures c ON c.entity_id=ce.id
    WHERE ce.entity_type='creature'
    ORDER BY ce.name_en
  `;
}

async function getEncounter(id) {
  const rows = await sql`
    SELECT id::text, name, status, round_number, current_turn_index, created_at, updated_at
    FROM encounters WHERE id=${id} LIMIT 1
  `;
  if (!rows.length) return null;
  const combatants = await sql`
    SELECT ec.id::text, ec.combatant_type, ec.character_id::text, ec.entity_id::text,
           ec.display_name, ec.initiative,
           COALESCE(ch.hp_current,ec.hp_current) AS hp_current,
           COALESCE(ch.hp_max,ec.hp_max) AS hp_max, ec.armor_class,
           ec.dexterity, ec.notes, ec.created_at,
           ch.class_name, ch.level, ch.temp_hp, ch.feature_choices
    FROM encounter_combatants ec
    LEFT JOIN characters ch ON ch.id=ec.character_id
    WHERE ec.encounter_id=${id}
    ORDER BY ec.initiative DESC NULLS LAST, ec.dexterity DESC, ec.created_at, ec.id
  `;
  return { encounter: rows[0], combatants };
}

async function addCharacterToEncounter(encounterId, characterId) {
  const chars = await sql`
    SELECT id, name, hp_current, hp_max, armor_class, dexterity
    FROM characters WHERE id=${characterId} LIMIT 1
  `;
  if (!chars.length) throw new Error("Character not found");
  const c = chars[0];
  const existing = await sql`
    SELECT id FROM encounter_combatants
    WHERE encounter_id=${encounterId} AND character_id=${characterId}
    LIMIT 1
  `;
  if (existing.length) return existing[0].id;
  const rows = await sql`
    INSERT INTO encounter_combatants(
      encounter_id, combatant_type, character_id, display_name,
      hp_current, hp_max, armor_class, dexterity
    ) VALUES (
      ${encounterId}, 'character', ${characterId}, ${c.name},
      ${c.hp_current}, ${c.hp_max}, ${c.armor_class}, ${c.dexterity}
    ) RETURNING id::text
  `;
  return rows[0].id;
}

async function addCreatureToEncounter(encounterId, entityId) {
  const rows = await sql`
    SELECT ce.id, ce.name_en, c.hit_points, c.dexterity, c.armor_class
    FROM content_entities ce
    JOIN creatures c ON c.entity_id=ce.id
    WHERE ce.id=${entityId} AND ce.entity_type='creature'
    LIMIT 1
  `;
  if (!rows.length) throw new Error("Creature not found");
  const c = rows[0];
  const counts = await sql`
    SELECT COUNT(*)::int AS count FROM encounter_combatants
    WHERE encounter_id=${encounterId} AND entity_id=${entityId}
  `;
  const number = Number(counts[0]?.count || 0) + 1;
  const display = `${c.name_en} #${number}`;
  const hp = Math.max(1, Number(c.hit_points) || 1);
  const ac = numericArmorClass(c.armor_class);
  const inserted = await sql`
    INSERT INTO encounter_combatants(
      encounter_id, combatant_type, entity_id, display_name,
      hp_current, hp_max, armor_class, dexterity
    ) VALUES (
      ${encounterId}, 'creature', ${entityId}, ${display},
      ${hp}, ${hp}, ${ac}, ${Number(c.dexterity) || 10}
    ) RETURNING id::text
  `;
  return inserted[0].id;
}

async function removeCombatant(encounterId, combatantId) {
  await sql`DELETE FROM encounter_combatants WHERE encounter_id=${encounterId} AND id=${combatantId}`;
  const counts = await sql`SELECT COUNT(*)::int AS count FROM encounter_combatants WHERE encounter_id=${encounterId}`;
  const count = Number(counts[0]?.count || 0);
  await sql`
    UPDATE encounters
    SET current_turn_index=CASE WHEN ${count}=0 THEN 0 ELSE LEAST(current_turn_index, ${count - 1}) END,
        updated_at=NOW()
    WHERE id=${encounterId}
  `;
}

async function adjustCombatantHp(encounterId, combatantId, delta) {
  return adjustEncounterHitPoints(sql,encounterId,combatantId,delta);
}

async function setCombatantInitiative(encounterId, combatantId, value) {
  const initiative = Math.max(-20, Math.min(99, Number(value) || 0));
  await sql`
    UPDATE encounter_combatants SET initiative=${initiative}, updated_at=NOW()
    WHERE encounter_id=${encounterId} AND id=${combatantId}
  `;
}

async function rollEncounterInitiative(encounterId) {
  const combatants = await sql`
    SELECT id::text, dexterity FROM encounter_combatants WHERE encounter_id=${encounterId}
  `;
  for (const c of combatants) {
    const mod = abilityModifier(c.dexterity) ?? 0;
    const roll = Math.floor(Math.random() * 20) + 1 + mod;
    await sql`UPDATE encounter_combatants SET initiative=${roll}, updated_at=NOW() WHERE id=${c.id}`;
  }
  await sql`
    UPDATE encounters SET status='active', round_number=1, current_turn_index=0, updated_at=NOW()
    WHERE id=${encounterId}
  `;
}

async function stepEncounterTurn(encounterId, direction) {
  const data = await getEncounter(encounterId);
  if (!data || !data.combatants.length) return;
  const count = data.combatants.length;
  let index = Math.max(0, Math.min(count - 1, Number(data.encounter.current_turn_index) || 0));
  let round = Math.max(1, Number(data.encounter.round_number) || 1);
  if (direction === 'previous') {
    index -= 1;
    if (index < 0) { index = count - 1; round = Math.max(1, round - 1); }
  } else {
    index += 1;
    if (index >= count) { index = 0; round += 1; }
  }
  await sql`
    UPDATE encounters SET current_turn_index=${index}, round_number=${round}, status='active', updated_at=NOW()
    WHERE id=${encounterId}
  `;
}

async function resetEncounter(encounterId) {
  await sql`UPDATE encounter_combatants SET initiative=NULL, updated_at=NOW() WHERE encounter_id=${encounterId}`;
  await sql`
    UPDATE encounters SET status='setup', round_number=1, current_turn_index=0, updated_at=NOW()
    WHERE id=${encounterId}
  `;
}

async function currentEncounterActions(combatant, back) {
  if (!combatant) return `<div class="small-note">No current combatant.</div>`;
  if (combatant.combatant_type === 'character' && combatant.character_id) {
    const data = await getCharacter(combatant.character_id);
    if (!data) return `<div class="small-note">Character no longer exists.</div>`;
    const c = data.character;
    const wild=wildShapeState(c);
    if(wild.active){
      const forms=await wildShapeOptions(c);
      const form=forms.find(x=>String(x.id)===wild.active.id)||null;
      const lang=displayContext.getStore()?.language||"ru";
      const name=entityDisplayName({name_en:form?.name_en||wild.active.name,ruleset:form?.ruleset,source_key:form?.source_key},lang,"creature");
      return `<div class="action-stack"><div class="enc-action"><b>Wild Shape · ${esc(name)}</b><p>AC ${esc(form?acText(form.armor_class):(wild.active.armor_class??"—"))} · ${esc(form?speedText(form.speed):"—")} · Temporary HP ${esc(c.temp_hp||0)}</p>${renderWildShapeActionList(c,form,back)}</div></div>`;
    }
    if (!data.inventory.length) return `<div class="small-note">${esc(c.name)} has no inventory cards.</div>`;
    const combatItems=data.inventory.filter(item=>stateBool(item.state,"equipped") && isWeaponCard(item));
    if(!combatItems.length) return `<div class="small-note">${esc(c.name)} has no equipped weapon. Equip one from the character inventory.</div>`;
    return `<div class="action-stack">${combatItems.map(item => {
      const rolls = characterWeaponRolls(c, item);
      const mastery=weaponMasteryForItem(c,item);
      if (rolls) return `<div class="enc-action"><b>${esc(item.name_en)}${mastery?` <span class="mastery-inline">${esc(mastery)}</span>`:""}</b>${mastery?`<p>${esc(masteryHelp(mastery))}</p>`:""}<div class="inventory-actions">${characterRollForm({formula:rolls.attack,label:`${c.name} — ${item.name_en} attack`,back,text:`Attack ${rolls.attack}`})}${characterRollForm({formula:rolls.damage,label:`${c.name} — ${item.name_en} damage`,back,text:`Damage ${rolls.damage}`})}${rolls.versatile?characterRollForm({formula:rolls.versatile,label:`${c.name} — ${item.name_en} versatile damage`,back,text:`Versatile ${rolls.versatile}`}):''}</div></div>`;
      return `<div class="enc-action"><b>${esc(item.name_en)}</b><p>${esc(truncate(item.description_en || 'No automated action yet.', 180))}</p></div>`;
    }).join('')}</div>`;
  }
  if (combatant.combatant_type === 'creature' && combatant.entity_id) {
    const actions = await sql`
      SELECT name_en, description_en, action_type
      FROM entity_actions WHERE entity_id=${combatant.entity_id}
      ORDER BY sort_order, name_en LIMIT 20
    `;
    if (!actions.length) return `<div class="small-note">No creature actions imported.</div>`;
    return `<div class="action-stack">${actions.map(a=>`<div class="enc-action"><b>${esc(a.name_en)} <span class="chip">${esc(a.action_type)}</span></b>${a.description_en?`<p>${esc(truncate(a.description_en,300))}</p>`:''}</div>`).join('')}</div>`;
  }
  return `<div class="small-note">No actions available.</div>`;
}

async function encountersPage() {
  const encounters = await listEncounters();
  const content = `<section class="hero tavern-scroll"><div><h2>Encounters</h2><p>Build combats from characters and creatures, roll initiative, track turns, rounds and hit points.</p></div><div><span class="count">${encounters.length}</span><span class="count-label">encounters</span></div></section>
  <div class="character-layout"><section>${encounters.length?`<div class="encounter-grid">${encounters.map(e=>`<a class="encounter-card" href="/encounter/${encodeURIComponent(e.id)}"><div class="eyebrow"><span class="status-chip ${e.status==='active'?'active':''}">${esc(e.status)}</span><span>${esc(e.combatant_count)} combatants</span></div><h3 data-i18n-skip>${esc(e.name)}</h3><div class="chips"><span class="chip gold">Round ${esc(e.round_number)}</span></div></a>`).join('')}</div>`:`<div class="empty">No encounters yet.</div>`}</section>
  <aside class="card-panel"><h3>Create Encounter</h3><form class="encounter-form" method="post" action="/encounters/create"><label>Name<input name="name" required maxlength="120" placeholder="Goblin Ambush"></label><button class="primary-action" type="submit">Create encounter</button></form></aside></div>`;
  return layout({title:'Encounters',content});
}

async function encounterPage(id) {
  const data = await getEncounter(id);
  if (!data) return {status:404,body:layout({title:'Encounter not found',content:`<a class="back" href="/encounters">← Encounters</a><div class="empty">Encounter not found.</div>`})};
  const { encounter:e, combatants } = data;
  const characters = await listCharacters();
  const creatures = await encounterCreatureOptions();
  const index = combatants.length ? Math.max(0, Math.min(combatants.length - 1, Number(e.current_turn_index)||0)) : 0;
  const current = combatants[index] || null;
  const back = `/encounter/${encodeURIComponent(e.id)}`;
  const currentActions = await currentEncounterActions(current, back);
  const rows = combatants.length ? `<div class="initiative-list">${combatants.map((c,i)=>{
    const hpClass = Number(c.hp_current) <= 0 ? 'hp-zero' : '';
    return `<div class="combatant-entry"><div class="combatant-row ${i===index&&e.status==='active'?'current':''}"><div class="initiative-badge">${c.initiative===null||c.initiative===undefined?'—':esc(c.initiative)}</div><div><div class="combatant-name">${i===index&&e.status==='active'?'→ ':''}${c.character_id?`<a href="/character/${encodeURIComponent(c.character_id)}" data-i18n-skip>${esc(c.display_name)}</a>`:esc(c.display_name)}</div><div class="combatant-meta">${esc(c.combatant_type)} · AC ${esc(c.armor_class)} · DEX ${esc(abilityText(c.dexterity))}${c.class_name?` · ${esc(c.class_name)} Lv ${esc(c.level)}`:''}</div><form class="tiny-form" method="post" action="/encounter/${encodeURIComponent(e.id)}/combatant/${encodeURIComponent(c.id)}/initiative" style="margin-top:6px"><input name="initiative" type="number" value="${c.initiative===null||c.initiative===undefined?'':esc(c.initiative)}" placeholder="Init"><button type="submit">Set</button></form></div><div class="combatant-hp">${c.character_id?renderTemporaryHpControl({...c,id:c.character_id},back):""}<strong class="${hpClass}">HP ${esc(c.hp_current)}/${esc(c.hp_max)}</strong><form class="tiny-form" method="post" action="/encounter/${encodeURIComponent(e.id)}/combatant/${encodeURIComponent(c.id)}/hp"><input name="delta" type="number" value="-1"><button type="submit">Apply</button></form><form method="post" action="/encounter/${encodeURIComponent(e.id)}/combatant/${encodeURIComponent(c.id)}/remove" onsubmit="return confirm('Remove this combatant from the encounter?')"><button class="danger-button" type="submit">×</button></form></div></div>${c.character_id?`<div data-concentration-area data-concentration-character="${esc(c.character_id)}">${renderConcentrationPanel({...c,id:c.character_id},back)}</div>`:""}</div>`;
  }).join('')}</div>` : `<div class="empty">Add characters or creatures to begin.</div>`;

  const content = `<a class="back" href="/encounters">← Encounters</a><section class="detail-head"><div><div class="eyebrow"><span>Encounter</span><span class="status-chip ${e.status==='active'?'active':''}">${esc(e.status)}</span></div><h2 data-i18n-skip>${esc(e.name)}</h2></div><div class="character-header-actions"><form method="post" action="/encounter/${encodeURIComponent(e.id)}/reset"><button class="button secondary" type="submit">Reset initiative</button></form><form method="post" action="/encounter/${encodeURIComponent(e.id)}/delete" onsubmit="return confirm('Delete this encounter?')"><button class="danger-button" type="submit">Delete encounter</button></form></div></section>
  <div class="encounter-layout"><main><div class="turn-controls"><span class="round-badge">Round ${esc(e.round_number)}</span><form method="post" action="/encounter/${encodeURIComponent(e.id)}/initiative"><button class="primary-action" type="submit">Roll all initiative</button></form><form method="post" action="/encounter/${encodeURIComponent(e.id)}/previous"><button type="submit">Previous</button></form><form method="post" action="/encounter/${encodeURIComponent(e.id)}/next"><button type="submit">Next turn</button></form></div>${rows}</main>
  <aside><div class="current-panel"><div class="eyebrow"><span>Current turn</span><span>${current?`Initiative ${esc(current.initiative ?? '—')}`:''}</span></div><h3>${current?esc(current.display_name):'No combatant'}</h3>${current?`<div class="chips"><span class="chip">HP ${esc(current.hp_current)}/${esc(current.hp_max)}</span><span class="chip">AC ${esc(current.armor_class)}</span></div>`:''}<div style="margin-top:14px">${currentActions}</div></div>
  <div class="card-panel encounter-setup"><h3>Add Combatants</h3>${characters.length?`<form class="encounter-form" method="post" action="/encounter/${encodeURIComponent(e.id)}/add-character"><label>Character<select name="character_id" required><option value="">Choose character…</option>${characters.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · Lv ${esc(c.level)} ${esc(c.class_name||'')}</option>`).join('')}</select></label><button type="submit">Add character</button></form>`:`<div class="small-note">No characters created yet.</div>`}
  <form class="encounter-form" method="post" action="/encounter/${encodeURIComponent(e.id)}/add-creature"><label>Creature<select name="entity_id" required><option value="">Choose creature…</option>${creatures.map(c=>`<option value="${esc(c.id)}">${esc(c.name_en)} · CR ${esc(numberText(c.challenge_rating))}</option>`).join('')}</select></label><button type="submit">Add creature</button></form></div></aside></div>`;
  return {status:200,body:layout({title:e.name,content,userTitle:true})};
}

async function parseForm(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("Request body too large");
  }
  const params = new URLSearchParams(raw);
  // Persist the response preference on the request so route handlers and the outer
  // error boundary can still return JSON even if a browser/proxy rewrites Accept.
  if(params.get("_response")==="json") req.__dndWantsJson=true;
  return Object.fromEntries(params.entries());
}

function wantsJson(req) {
  if(req?.__dndWantsJson===true) return true;
  if(String(req?.url||"").startsWith("/api/")) return true;
  if(String(req.headers?.accept || "").includes("application/json")) return true;
  // Backward-compatible fallback for older clients; current live rolls use POST body.
  try {
    return new URL(String(req.url||"/"),"http://localhost").searchParams.get("_response")==="json";
  } catch {
    return false;
  }
}

async function rollPage(req,res) {
  const form=await parseForm(req);
  const mode=String(form.mode||"");
  const result=rollWithMode(form.formula,mode);
  await sql`INSERT INTO roll_log(label, formula, total, detail) VALUES (${form.label || null}, ${result.formula}, ${result.total}, ${sql.json(result.parts)})`;
  if(wantsJson(req)) {
    json(res,200,{...result,label:String(form.label || "Dice roll")});
    return null;
  }
  const requested=String(form.back || "/cards");
  const back=requested.startsWith("/") && !requested.startsWith("//")?requested:"/cards";
  const content=`<a class="back" href="${esc(back)}">← Back</a><div class="roll-result"><div class="eyebrow"><span>${mode==="advantage"?"Advantage Roll":"Dice Roll"}</span><span>${esc(form.label || "Action")}</span></div><div class="roll-total">${esc(result.total)}</div><div><b>${esc(result.formula)}</b></div><div class="roll-parts">${result.parts.map(esc).join("<br>")}</div></div>`;
  return layout({title:"Dice Roll",content});
}


function builderRuleset(value){
  return ["all","dnd5e-2024","dnd5e-2014","a5e"].includes(value)?value:"all";
}
async function builderDataStats(scope="all") {
  const rows=await sql`
    SELECT COUNT(*) FILTER(WHERE content_kind='class')::int AS classes,
           COUNT(DISTINCT LOWER(ce.name_en)) FILTER(WHERE content_kind='class')::int AS classes_unique,
           COUNT(*) FILTER(WHERE content_kind='subclass')::int AS subclasses,
           COUNT(*) FILTER(WHERE content_kind='species')::int AS species,
           COUNT(*) FILTER(WHERE content_kind='background')::int AS backgrounds,
           COUNT(*) FILTER(WHERE content_kind='feat')::int AS feats,
           COUNT(*)::int AS total
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true
      AND (${scope}='all' OR cs.ruleset=${scope})
  `;
  return rows[0];
}
function builderKind(value) {
  return ["all","class","subclass","species","background","feat"].includes(value) ? value : "all";
}
async function listBuilderData(kind,q,scope="all") {
  const term=String(q||"").trim().replace(/\s+/g," ").slice(0,120);

  if(!term) {
    return sql`
      SELECT ce.id::text,ce.entity_type::text,ce.name_en,ce.description_en,
             cc.content_kind,cc.category,cc.summary,cc.prerequisites,
             cc.proficiencies,cc.starting_equipment,cc.traits,
             cs.document_key AS source_key,cs.name AS source_name,cs.ruleset,
             'all'::text AS match_source
      FROM character_content cc
      JOIN content_entities ce ON ce.id=cc.entity_id
      JOIN content_sources cs ON cs.id=ce.source_id
      WHERE (${kind}='all' OR cc.content_kind=${kind})
        AND cs.enabled=true
        AND (${scope}='all' OR cs.ruleset=${scope})
      ORDER BY cc.content_kind,ce.name_en
      LIMIT 500
    `;
  }

  const contains=`%${term}%`;
  const prefix=`${term}%`;
  const aliases=russianSearchAliases(term,{ruleset:scope==="all"?null:scope,kind:kind==="all"?null:kind});
  const aliasLower=aliases.length?aliases.map(value=>value.toLowerCase()):["__no_translation_alias__"];

  const titleRows=await sql`
    SELECT ce.id::text,ce.entity_type::text,ce.name_en,ce.description_en,
           cc.content_kind,cc.category,cc.summary,cc.prerequisites,
           cc.proficiencies,cc.starting_equipment,cc.traits,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset,
           'name'::text AS match_source
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE (${kind}='all' OR cc.content_kind=${kind})
      AND cs.enabled=true
      AND (${scope}='all' OR cs.ruleset=${scope})
      AND (ce.name_en ILIKE ${contains} OR LOWER(ce.name_en) IN ${sql(aliasLower)})
    ORDER BY
      CASE
        WHEN LOWER(ce.name_en)=LOWER(${term}) THEN 0
        WHEN ce.name_en ILIKE ${prefix} THEN 1
        ELSE 2
      END,
      POSITION(LOWER(${term}) IN LOWER(ce.name_en)),
      LENGTH(ce.name_en),
      ce.name_en
    LIMIT 500
  `;

  if(titleRows.length) return titleRows;

  return sql`
    SELECT ce.id::text,ce.entity_type::text,ce.name_en,ce.description_en,
           cc.content_kind,cc.category,cc.summary,cc.prerequisites,
           cc.proficiencies,cc.starting_equipment,cc.traits,
           cs.document_key AS source_key,cs.name AS source_name,cs.ruleset,
           'description'::text AS match_source
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE (${kind}='all' OR cc.content_kind=${kind})
      AND cs.enabled=true
      AND (${scope}='all' OR cs.ruleset=${scope})
      AND COALESCE(ce.description_en,'') ILIKE ${contains}
    ORDER BY
      POSITION(LOWER(${term}) IN LOWER(COALESCE(ce.description_en,''))),
      LENGTH(COALESCE(ce.description_en,'')),
      ce.name_en
    LIMIT 500
  `;
}
function builderRowsForDisplay(rows,kind,scope){
  const list=Array.isArray(rows)?rows:[];
  if(scope!=="all")return list;
  if(kind==="class")return groupClassVariants(list);
  if(kind!=="all")return list;
  const classes=groupClassVariants(list.filter(row=>row.content_kind==="class"));
  const other=list.filter(row=>row.content_kind!=="class");
  return [...classes,...other].sort((a,b)=>String(a.content_kind||"").localeCompare(String(b.content_kind||""))||String(a.name_en||"").localeCompare(String(b.name_en||"")));
}

function builderVariantBadges(row){
  const variants=Array.isArray(row?.variants)?row.variants:[];
  if(variants.length<2)return "";
  return `<div class="builder-variant-badges"><span class="chip builder-version-count">${variants.length} versions</span>${variants.map(v=>`<span class="chip builder-version-chip">${esc(compactRulesetLabel(v.ruleset))}</span>`).join("")}</div>`;
}

async function builderDataPage(url,lang="ru") {
  const kind=builderKind(url.searchParams.get("kind")||"all");
  const scope=builderRuleset(url.searchParams.get("scope")||"all");
  const q=(url.searchParams.get("q")||"").trim().slice(0,120);
  const [stats,rawRows]=await Promise.all([builderDataStats(scope),listBuilderData(kind,q,scope)]);
  const rows=builderRowsForDisplay(rawRows,kind,scope);
  const visibleClassCount=scope==="all"?Number(stats.classes_unique||stats.classes):Number(stats.classes);
  const visibleTotal=scope==="all"?Number(stats.total)-Number(stats.classes)+visibleClassCount:Number(stats.total);
  const defs=[
    ["all","All",visibleTotal],
    ["class","Classes",visibleClassCount],
    ["subclass","Subclasses",stats.subclasses],
    ["species","Species",stats.species],
    ["background","Backgrounds",stats.backgrounds],
    ["feat","Feats",stats.feats]
  ];

  const content=`<section class="hero tavern-scroll"><div><h2>Character Builder Data</h2><p>Normalized Open5e classes, subclasses, species, backgrounds and feats with source and ruleset labels. 2024/2014-compatible records feed the guided builder; A5E records remain searchable reference data.</p></div><div><span class="count">${esc(rows.length)}</span><span class="count-label">shown</span></div></section>
  <div class="builder-kinds" style="grid-template-columns:repeat(5,1fr)"><div class="builder-kind"><b>${esc(visibleClassCount)}</b><span>Classes${scope==="all"&&Number(stats.classes)!==visibleClassCount?` · ${esc(stats.classes)} records`:""}</span></div><div class="builder-kind"><b>${esc(stats.subclasses)}</b><span>Subclasses</span></div><div class="builder-kind"><b>${esc(stats.species)}</b><span>Species</span></div><div class="builder-kind"><b>${esc(stats.backgrounds)}</b><span>Backgrounds</span></div><div class="builder-kind"><b>${esc(stats.feats)}</b><span>Feats</span></div></div>
  <nav class="builder-tabs">${defs.map(([key,label,count])=>`<a class="${kind===key?"tab active":"tab"}" href="/builder-data?kind=${key}&scope=${encodeURIComponent(scope)}${q?`&q=${encodeURIComponent(q)}`:""}">${esc(label)} · ${esc(count)}</a>`).join("")}</nav>
  <form class="toolbar builder-data-toolbar" method="get" action="/builder-data" id="builder-search-form"><input type="hidden" name="kind" value="${esc(kind)}"><label class="builder-ruleset-filter">Ruleset<select name="scope" id="builder-ruleset-scope"><option value="all" ${scope==="all"?"selected":""}>All imported</option><option value="dnd5e-2024" ${scope==="dnd5e-2024"?"selected":""}>5e 2024</option><option value="dnd5e-2014" ${scope==="dnd5e-2014"?"selected":""}>5e 2014 compatible</option><option value="a5e" ${scope==="a5e"?"selected":""}>A5E reference only</option></select></label><div class="search builder-search-wrap"><input id="builder-search-input" type="search" name="q" value="${esc(q)}" placeholder="Search builder content…" autocomplete="off" aria-autocomplete="list" aria-controls="builder-search-suggestions"><div id="builder-search-suggestions" class="search-suggestions" role="listbox"></div><button type="submit">Search</button></div></form>
  ${rows.length?`<section class="builder-grid">${rows.map(r=>`<a class="builder-card ${Array.isArray(r.variants)&&r.variants.length>1?"builder-card-has-variants":""}" href="/builder-data/entity/${encodeURIComponent(r.id)}"><div class="eyebrow"><span>${esc(r.category||r.content_kind)}</span><span>${esc(r.ruleset==="a5e"?"reference only":r.ruleset)}</span></div><h3 data-i18n-skip>${esc(entityDisplayName(r,lang,r.content_kind))}</h3>${lang==="ru"&&entityDisplayName(r,lang,r.content_kind)!==r.name_en?`<div class="localized-original-name" data-i18n-skip>${esc(r.name_en)}</div>`:""}<p class="summary">${esc(truncate(displayText(r.description_en,{ruleset:r.ruleset,kind:r.content_kind,source:r.source_key})||"Open to inspect normalized builder data.",130))}</p><div class="chips"><span class="chip gold">${esc(r.content_kind)}</span>${r.category?`<span class="chip">${esc(r.category)}</span>`:""}<span class="chip builder-source-chip">${esc(r.source_name)}</span>${r.match_source==="description"?`<span class="chip">description match</span>`:""}</div>${builderVariantBadges(r)}</a>`).join("")}</section>`:`<div class="empty">No Character Builder data found.</div>`}

  <script>
  (() => {
    const input=document.getElementById('builder-search-input');
    const box=document.getElementById('builder-search-suggestions');
    if(!input||!box)return;
    const kind=${JSON.stringify(kind)};
    const scope=${JSON.stringify(scope)};
    let timer=null,items=[],selected=-1;
    let requestNumber=0;
    let activeController=null;

    function close(){box.classList.remove('open');box.innerHTML='';items=[];selected=-1;}
    function selectIndex(index){
      selected=index;
      items.forEach((el,i)=>el.classList.toggle('selected',i===selected));
      if(items[selected])items[selected].scrollIntoView({block:'nearest'});
    }
    async function update(){
      const q=input.value.trim().replace(/\s+/g,' ');
      if(!q){
        requestNumber++;
        activeController?.abort();
        activeController=null;
        close();
        return;
      }

      const myRequest=++requestNumber;
      activeController?.abort();
      const controller=new AbortController();
      activeController=controller;

      try{
        const res=await fetch(
          '/api/builder-search?q='+encodeURIComponent(q)+'&kind='+encodeURIComponent(kind)+'&scope='+encodeURIComponent(scope),
          {signal:controller.signal,cache:'no-store'}
        );
        if(!res.ok)return;

        const data=await res.json();

        // A slower response for an older input must never replace newer suggestions.
        if(myRequest!==requestNumber || input.value.trim().replace(/\s+/g,' ')!==q)return;

        box.innerHTML=data.map(x=>{
          const meta=escapeHtml(x.kind)+(x.category&&x.category!==x.kind?' · '+escapeHtml(x.category):'');
          const snippet=x.match_source==='description'&&x.snippet
            ? '<small>'+escapeHtml(x.snippet)+'</small>'
            : '';
          const source=x.match_source==='description'?'description':meta;
          return '<a class="search-suggestion" role="option" href="/builder-data/entity/'+encodeURIComponent(x.id)+'"><span class="search-suggestion-main"><b>'+escapeHtml(x.name)+'</b>'+snippet+'</span><span class="match-source">'+escapeHtml(source)+'</span></a>';
        }).join('');

        items=[...box.querySelectorAll('.search-suggestion')];
        selected=-1;
        box.classList.toggle('open',items.length>0);
      }catch(error){
        if(error?.name!=='AbortError' && myRequest===requestNumber)close();
      }
    }
    function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

    input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,120);});
    input.addEventListener('focus',()=>{if(input.value.trim())update();});
    input.addEventListener('keydown',e=>{
      if(!box.classList.contains('open'))return;
      if(e.key==='ArrowDown'){e.preventDefault();selectIndex(Math.min(items.length-1,selected+1));}
      else if(e.key==='ArrowUp'){e.preventDefault();selectIndex(Math.max(0,selected-1));}
      else if(e.key==='Escape'){close();}
      else if(e.key==='Enter'&&selected>=0&&items[selected]){e.preventDefault();location.href=items[selected].href;}
    });
    document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==input)close();});
    document.getElementById('builder-ruleset-scope')?.addEventListener('change',()=>document.getElementById('builder-search-form').submit());
  })();
  </script>`;

  return layout({title:"Builder Data",content});
}

function builderSimpleText(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(builderSimpleText).filter(v=>v!=="—").join(", ") || "—";
  if (typeof value === "object") return value.name || value.label || value.title || value.desc || value.description || JSON.stringify(value);
  return String(value);
}

function builderRefLookup(refs,name) {
  if(!name)return null;
  const exact=refs.get(String(name).toLowerCase());
  if(exact)return exact;
  const base=String(name).replace(/\s*\([^)]*\)\s*$/,"").trim().toLowerCase();
  return refs.get(base)||null;
}

function renderBuilderReference(value,refs) {
  const name=builderSimpleText(value);
  if(name==="—")return `<span class="muted">—</span>`;
  const ref=builderRefLookup(refs,name);
  return ref
    ? `<a class="entity-ref" href="/builder-data/entity/${encodeURIComponent(ref.id)}" title="${esc(ref.kind)}">${esc(name)}</a>`
    : `<span>${esc(name)}</span>`;
}

function renderBuilderList(value,refs=new Map()) {
  if (value == null) return `<span class="muted">—</span>`;
  const list=Array.isArray(value)?value:[value];
  if (!list.length) return `<span class="muted">—</span>`;
  return `<div class="chips">${list.map(v=>{
    const name=builderSimpleText(v);
    const ref=builderRefLookup(refs,name);
    return ref
      ? `<a class="entity-ref" href="/builder-data/entity/${encodeURIComponent(ref.id)}">${esc(name)}</a>`
      : `<span class="chip">${esc(name)}</span>`;
  }).join("")}</div>`;
}

function builderLooksLikeRulesText(value){
  const text=String(value??"");
  return text.includes("\n") || /(^|\n)\s*[-+*]\s+/.test(text) || /\*\*[^*]+\*\*/.test(text) || /\|[^\n]+\|/.test(text);
}

function renderBuilderRichValue(value,refs=new Map(),currentEntityId=null){
  if(value==null)return `<span class="muted">—</span>`;
  if(Array.isArray(value)){
    if(!value.length)return `<span class="muted">—</span>`;
    if(value.some(v=>typeof v==="string"&&builderLooksLikeRulesText(v)))return `<div class="builder-rules-text">${value.map(v=>renderBuilderLinkedRulesText(builderSimpleText(v),refs,currentEntityId)).join("")}</div>`;
    return renderBuilderList(value,refs);
  }
  if(typeof value==="string" && builderLooksLikeRulesText(value))return `<div class="builder-rules-text">${renderBuilderLinkedRulesText(value,refs,currentEntityId)}</div>`;
  return renderBuilderList(value,refs);
}

function renderBuilderSummary(e,refs) {
  const s=e.summary||{};

  if(e.content_kind==="background") return `<div class="stats">
    <div class="stat"><b>Ability Scores</b>${renderBuilderList(s.ability_scores,refs)}</div>
    <div class="stat"><b>Origin Feat</b>${renderBuilderReference(s.feat,refs)}</div>
    <div class="stat"><b>Skills</b>${renderBuilderList(s.skills,refs)}</div>
  </div>`;

  if(e.content_kind==="class") return `<div class="stats">
    <div class="stat"><b>Hit Die</b><span>${esc(builderSimpleText(s.hit_dices||s.hit_dice||"—"))}</span></div>
    <div class="stat"><b>Primary Ability</b>${renderBuilderList(s.primary_ability,refs)}</div>
    <div class="stat"><b>Saving Throws</b>${renderBuilderList(s.saving_throws,refs)}</div>
  </div>`;

  if(e.content_kind==="subclass") return `<div class="stats">
    <div class="stat"><b>Parent Class</b>${renderBuilderReference(s.parent_class,refs)}</div>
    <div class="stat"><b>Type</b><span>Subclass</span></div>
  </div>`;

  if(e.content_kind==="species") return `<div class="stats">
    <div class="stat"><b>Size</b>${renderBuilderList(s.size,refs)}</div>
    <div class="stat"><b>Speed</b>${renderBuilderList(s.speed,refs)}</div>
    <div class="stat"><b>Creature Type</b>${renderBuilderList(s.creature_type,refs)}</div>
  </div>`;

  if(e.content_kind==="feat") return `<div class="stats">
    <div class="stat"><b>Category</b><span>${esc(builderSimpleText(s.category||e.category||"—"))}</span></div>
    <div class="stat"><b>Repeatable</b><span>${s.repeatable===true?"Yes":s.repeatable===false?"No":"—"}</span></div>
    <div class="stat"><b>Level</b><span>${esc(builderSimpleText(s.level||"—"))}</span></div>
  </div>`;

  return `<div class="small-note">No normalized summary available.</div>`;
}

function builderFeatureLevels(v){
  if(!v || typeof v!=="object") return [];
  const numbers=[];
  const add=n=>{n=Number(n);if(Number.isFinite(n)&&n>=1&&n<=20)numbers.push(n);};
  const visit=value=>{
    if(value==null)return;
    if(typeof value==="number"){add(value);return;}
    if(typeof value==="string"){
      const text=value.trim();
      if(/^\d{1,2}$/.test(text)){add(text);return;}
      for(const m of text.matchAll(/\blevels?\s*(\d{1,2})\b/gi))add(m[1]);
      if(/levels?/i.test(text))for(const m of text.matchAll(/\b(\d{1,2})\b/g))add(m[1]);
      return;
    }
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(typeof value==="object") for(const key of ["level","class_level","character_level","levels","gained_at","granted_at","gains_at"]) if(value[key]!=null)visit(value[key]);
  };
  for(const key of ["level","class_level","character_level","gained_at","granted_at","gains_at","levels"])visit(v[key]);
  const prose=String(v.desc||v.description||v.detail||"");
  for(const pattern of [
    /\bwhen you reach (?:character |[A-Za-z]+ )?level\s*(\d{1,2})\b/gi,
    /\bstarting at (?:character |[A-Za-z]+ )?level\s*(\d{1,2})\b/gi,
    /\bat (?:character |[A-Za-z]+ )?level\s*(\d{1,2})\b/gi,
    /\bat (?:character |[A-Za-z]+ )?levels?\s*([\d, and]+)\b/gi
  ]){
    for(const m of prose.matchAll(pattern)){
      add(m[1]);
      if(m[1] && /[, ]/.test(m[1]))for(const n of String(m[1]).match(/\d{1,2}/g)||[])add(n);
    }
  }
  return [...new Set(numbers)].sort((a,b)=>a-b);
}

function builderFeatureLevel(v){return builderFeatureLevels(v)[0]??null;}

function builderPresentationOnlyTrait(v){
  if(!v || typeof v!=="object")return false;
  const name=String(v.name||v.title||v.key||"").trim();
  const desc=String(v.desc||v.description||v.detail||"").trim();
  const type=String(v.feature_type||v.type||"").toLowerCase();
  if(/\bcolumn\b|\btable[_ -]?data\b/.test(type))return true;
  if(/^\[?\s*column data\s*\]?$/i.test(desc))return true;
  if(/^proficiency bonus$/i.test(name))return true;
  if(/^core .+ traits$/i.test(name))return true;
  if(/^(cantrips known|spells known|prepared spells|spell slots)$/i.test(name) && /^\[?\s*column data\s*\]?$/i.test(desc))return true;
  return false;
}

function builderFeatureAnchor(name,index=0){
  const slug=String(name||"feature").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"feature";
  return `feature-${slug}-${index}`;
}

function builderClassFeatureRows(e){
  const list=Array.isArray(e.traits)?e.traits:[];
  const seen=new Set(),out=[];
  for(const [index,v] of list.entries()){
    if(!v || builderPresentationOnlyTrait(v))continue;
    const name=typeof v==="object"?(v.name||v.title||v.key||"Feature"):String(v);
    const desc=typeof v==="object"?(v.desc||v.description||v.detail||""):"";
    if(!name || /^\[?\s*column data\s*\]?$/i.test(String(desc).trim()))continue;
    const key=String(name).trim().toLowerCase(); if(seen.has(key))continue; seen.add(key);
    const levels=builderFeatureLevels(v);
    out.push({name:String(name),description:String(desc||""),level:levels[0]??null,levels,anchor:builderFeatureAnchor(name,index),raw:v});
  }
  return out.sort((a,b)=>(a.level??0)-(b.level??0)||a.name.localeCompare(b.name));
}

function renderBuilderTraits(value,refs,currentEntityId=null) {
  const list=(Array.isArray(value)?value:[]).filter(v=>!builderPresentationOnlyTrait(v));
  if(!list.length) return `<div class="small-note">No structured traits/features in this entry.</div>`;
  return list.slice(0,80).map(v=>{
    if(typeof v!=="object") return `<div class="block"><div class="block-title">${linkifyBuilderText(String(v),refs,currentEntityId)}</div></div>`;
    const title=v.name||v.title||v.key||"Feature";
    const desc=v.desc||v.description||v.detail||"";
    return `<div class="block"><div class="block-title">${linkifyBuilderText(title,refs,currentEntityId)}</div>${desc?`<div class="builder-linked-text builder-rules-text">${renderBuilderLinkedRulesText(desc,refs,currentEntityId)}</div>`:""}</div>`;
  }).join("");
}

function builderProgressionRows(value){
  if(!value)return [];
  let rows=[];
  if(Array.isArray(value)) rows=value;
  else if(typeof value==="object"){
    for(const key of ["levels","rows","progression","level_progression"]){if(Array.isArray(value[key])){rows=value[key];break;}}
    if(!rows.length){const numeric=Object.entries(value).filter(([key,val])=>/^\d{1,2}$/.test(key) && val && typeof val==="object");if(numeric.length)rows=numeric.map(([key,val])=>({level:Number(key),...val}));}
    if(!rows.length){const columns=Object.entries(value).filter(([,val])=>Array.isArray(val));const length=Math.max(0,...columns.map(([,val])=>val.length));if(length>1)rows=Array.from({length},(_,i)=>Object.fromEntries(columns.map(([key,val])=>[key,val[i]])));}
  }
  return rows.filter(row=>row!=null).map((row,index)=>typeof row==="object"&&!Array.isArray(row)?{...row,__level:Number(row.level??row.class_level??row.character_level??index+1)||index+1}:{__level:index+1,value:row}).filter(row=>row.__level>=1&&row.__level<=20).sort((a,b)=>a.__level-b.__level);
}

function builderProgressionFeatureNames(row){
  for(const key of ["features","feature","class_features","traits","abilities","class_feature"]){
    const value=row?.[key]; if(value==null)continue;
    const list=Array.isArray(value)?value:[value];
    return list.map(v=>builderSimpleText(v)).flatMap(v=>String(v).split(/\s*(?:,|;|\|)\s*/)).map(v=>v.trim()).filter(v=>v&&v!=="—"&&!/^\[?\s*column data\s*\]?$/i.test(v));
  }
  return [];
}

function builderCompactProgressionValue(value,depth=0){
  if(value==null || value==="")return "";
  if(typeof value==="string" || typeof value==="number" || typeof value==="boolean"){const text=String(value).trim();return /^\[?\s*column data\s*\]?$/i.test(text)?"":text;}
  if(Array.isArray(value))return value.map(v=>builderCompactProgressionValue(v,depth+1)).filter(Boolean).join(" / ");
  if(typeof value==="object" && depth<2)return Object.entries(value).map(([k,v])=>{const text=builderCompactProgressionValue(v,depth+1);return text?`${k.replaceAll("_"," ")}: ${text}`:"";}).filter(Boolean).join(" · ");
  return "";
}

function builderProgressionDetails(row,fallback={}){
  const ignored=new Set(["__level","level","class_level","character_level","features","feature","class_features","traits","abilities","class_feature","proficiency_bonus","prof_bonus","pb"]);
  const chunks=[];
  // Imported structured values win; curated fallback only fills missing columns.
  const merged={...(fallback||{}),...(row||{})};
  for(const [key,value] of Object.entries(merged)){
    if(ignored.has(key))continue;
    const text=builderCompactProgressionValue(value);if(!text)continue;
    chunks.push(`<span><b>${esc(key.replaceAll("_"," "))}</b> ${esc(text)}</span>`);
    if(chunks.length>=8)break;
  }
  return chunks.length?`<div class="class-progression-data">${chunks.join("")}</div>`:`<span class="muted">—</span>`;
}

function builderClassProficiencyBonus(level){return 2+Math.floor((Math.max(1,Number(level)||1)-1)/4);}

function builderClassProgressionTable(e,features,refs){
  const rawRows=builderProgressionRows(e.progression),byLevel=new Map(rawRows.map(row=>[Number(row.__level),row]));
  const featureByName=new Map(features.map(f=>[f.name.toLowerCase(),f]));
  const importedLevels=features.flatMap(f=>Array.isArray(f.levels)&&f.levels.length?f.levels:(f.level?[f.level]:[]));
  const hasCurated=Array.from({length:20},(_,i)=>i+1).some(level=>coreClassFeatures(e.name_en,e.ruleset,level).length||Object.keys(coreClassProgressionData(e.name_en,e.ruleset,level)).length);
  const populatedLevels=new Set([...byLevel.keys(),...importedLevels]);
  if(!populatedLevels.size&&!hasCurated)return `<div class="small-note">No structured progression table was supplied by this source.</div>`;
  const rows=[];
  for(let level=1;level<=20;level++){
    const row=byLevel.get(level)||{__level:level},names=[];
    const addName=name=>{name=String(name||"").trim();if(name&&!names.some(n=>n.toLowerCase()===name.toLowerCase()))names.push(name);};
    for(const name of builderProgressionFeatureNames(row))addName(name);
    for(const name of coreClassFeatures(e.name_en,e.ruleset,level))addName(name);
    for(const feature of features.filter(f=>(Array.isArray(f.levels)&&f.levels.includes(level))||(!f.levels?.length&&f.level===level)))addName(feature.name);
    const featureHtml=names.length?names.map(name=>{
      const exact=featureByName.get(name.toLowerCase());
      if(exact)return `<a href="#${esc(exact.anchor)}" class="progression-feature-link">${esc(name)}</a>`;
      const target=progressionAnchorTarget(name);
      if(target==="#class-subclasses")return `<a href="#class-subclasses" class="progression-feature-link">${esc(name)}</a>`;
      const aliased=featureByName.get(String(target).toLowerCase());
      if(aliased)return `<a href="#${esc(aliased.anchor)}" class="progression-feature-link">${esc(name)}</a>`;
      return `<span>${linkifyBuilderText(name,refs,e.id)}</span>`;
    }).join(`<span class="progression-sep">·</span>`):`<span class="muted">—</span>`;
    const fallback=coreClassProgressionData(e.name_en,e.ruleset,level);
    rows.push(`<tr><th scope="row">${level}</th><td>+${builderClassProficiencyBonus(level)}</td><td class="class-feature-cell">${featureHtml}</td><td>${builderProgressionDetails(row,fallback)}</td></tr>`);
  }
  return `<div class="class-progression-note">Imported progression is supplemented with core class milestones and table values when the source leaves a level blank.</div><div class="class-progression-wrap"><table class="class-progression-table"><thead><tr><th>Level</th><th>PB</th><th>Features</th><th>Class Data</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderClassFeatureSections(e,features,refs){
  if(!features.length)return `<div class="small-note">No structured class features were supplied by this source.</div>`;
  const groups=new Map();for(const feature of features){const key=feature.level||0;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(feature);}
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([level,list])=>`<section class="class-feature-level"><div class="class-feature-level-title">${level?`Level ${level}`:"Core Features"}</div><div class="class-feature-list">${list.map(feature=>`<details class="class-feature-disclosure" id="${esc(feature.anchor)}"><summary><span>${esc(feature.name)}</span><span class="feature-arrow">›</span></summary><div class="class-feature-copy builder-rules-text">${feature.description?renderBuilderLinkedRulesText(feature.description,refs,e.id):`<p class="small-note">No additional description was supplied by the source.</p>`}</div></details>`).join("")}</div></section>`).join("");
}

function renderClassOverview(e,refs){
  const s=e.summary||{};
  return `<div class="class-overview-grid"><div class="class-overview-stat"><b>Hit Die</b><span>${esc(builderSimpleText(s.hit_dices||s.hit_dice||"—"))}</span></div><div class="class-overview-stat"><b>Primary Ability</b>${renderBuilderList(s.primary_ability,refs)}</div><div class="class-overview-stat"><b>Saving Throws</b>${renderBuilderList(s.saving_throws,refs)}</div></div><div class="class-rules-grid"><section><h4>Proficiencies</h4>${renderBuilderObjectFields(e.proficiencies&&typeof e.proficiencies==="object"?e.proficiencies:{},refs,e.id)}</section><section><h4>Starting Equipment</h4>${renderBuilderRichValue(Array.isArray(e.starting_equipment)?e.starting_equipment:[],refs,e.id)}</section>${e.spellcasting&&typeof e.spellcasting==="object"&&Object.keys(e.spellcasting).length?`<section><h4>Spellcasting</h4>${renderBuilderObjectFields(e.spellcasting,refs,e.id)}</section>`:""}</div>`;
}
function renderBuilderObjectFields(value,refs,currentEntityId=null) {
  if(!value || typeof value!=="object" || Array.isArray(value) || !Object.keys(value).length) {
    return `<p class="small-note">None.</p>`;
  }
  return `<div class="builder-human-grid">${Object.entries(value).map(([key,val])=>`<div class="builder-human-box"><h4>${esc(key.replaceAll("_"," "))}</h4>${renderBuilderRichValue(val,refs,currentEntityId)}</div>`).join("")}</div>`;
}

function renderBuilderChoicesSection(e,refs) {
  const prereqs=Array.isArray(e.prerequisites)?e.prerequisites:[];
  const equipment=Array.isArray(e.starting_equipment)?e.starting_equipment:[];
  const spellcasting=e.spellcasting && typeof e.spellcasting==="object" ? e.spellcasting : {};
  const choices=e.choices && typeof e.choices==="object" ? e.choices : {};
  const prof=e.proficiencies && typeof e.proficiencies==="object" ? e.proficiencies : {};

  return `<div class="builder-human-grid">
    <div class="builder-human-box wide"><h4>Proficiencies</h4>${renderBuilderObjectFields(prof,refs,e.id)}</div>
    <div class="builder-human-box"><h4>Prerequisites</h4>${renderBuilderRichValue(prereqs,refs,e.id)}</div>
    <div class="builder-human-box"><h4>Starting Equipment</h4>${renderBuilderRichValue(equipment,refs,e.id)}</div>
    ${Object.keys(choices).length?`<div class="builder-human-box wide"><h4>Choices</h4>${renderBuilderObjectFields(choices,refs,e.id)}</div>`:""}
    ${Object.keys(spellcasting).length?`<div class="builder-human-box wide"><h4>Spellcasting</h4>${renderBuilderObjectFields(spellcasting,refs,e.id)}</div>`:""}
  </div>
  <details class="builder-dev-details"><summary>Developer data (normalized JSON)</summary><pre>${esc(JSON.stringify({proficiencies:prof,choices,prerequisites:prereqs,starting_equipment:equipment,spellcasting},null,2))}</pre></details>`;
}

async function builderReferenceIndex() {
  const rows=await sql`
    SELECT ce.id::text,ce.name_en,cc.content_kind,cc.category,cs.ruleset
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE cs.enabled=true
    ORDER BY CASE cs.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,
             LENGTH(ce.name_en) DESC,ce.name_en
  `;
  const map=new Map();
  for(const row of rows){
    const key=String(row.name_en).toLowerCase();
    if(map.has(key))continue;
    map.set(key,{
      id:row.id,name:row.name_en,kind:row.content_kind,category:row.category
    });
  }
  return map;
}

function builderDescriptionSnippet(description,term) {
  const text=String(displayText(description)||"").replace(/\s+/g," ").trim();
  if(!text)return "";
  const lower=text.toLowerCase();
  const needle=String(term||"").toLowerCase();
  const index=lower.indexOf(needle);
  if(index<0)return text.slice(0,120)+(text.length>120?"…":"");

  const start=Math.max(0,index-45);
  const end=Math.min(text.length,index+needle.length+70);
  return `${start>0?"…":""}${text.slice(start,end)}${end<text.length?"…":""}`;
}



async function cardSearchSuggestions(q,lang="ru") {
  const term=String(q||"").trim().replace(/\s+/g," ").slice(0,80);
  if(!term)return [];

  const contains=`%${term}%`;
  const prefix=`${term}%`;
  const aliases=lang==="ru"?russianSearchAliases(term):[];
  const aliasLower=aliases.length?aliases.map(value=>value.toLowerCase()):["__no_translation_alias__"];

  const titleRows=await sql`
    SELECT ct.id::text,ct.name_en,ct.card_type,ct.description_en,ct.data,
           ce_src.entity_type,ce_src.ruleset,cs_src.document_key AS source_key,
           'name'::text AS match_source
    FROM card_templates ct
    LEFT JOIN content_entities ce_src ON ce_src.id=ct.source_entity_id
    LEFT JOIN content_sources cs_src ON cs_src.id=ce_src.source_id
    WHERE ct.name_en ILIKE ${contains} OR LOWER(ct.name_en) IN ${sql(aliasLower)}
    ORDER BY
      CASE
        WHEN LOWER(ct.name_en)=LOWER(${term}) THEN 0
        WHEN LOWER(ct.name_en) IN ${sql(aliasLower)} THEN 1
        WHEN ct.name_en ILIKE ${prefix} THEN 2
        ELSE 3
      END,
      POSITION(LOWER(${term}) IN LOWER(ct.name_en)),
      LENGTH(ct.name_en),
      ct.name_en
    LIMIT 8
  `;

  if(titleRows.length)return titleRows.map(row=>({...row,name:cardDisplayName(row,lang)}));

  const descriptionRows=await sql`
    SELECT ct.id::text,ct.name_en,ct.card_type,ct.description_en,ct.data,
           ce_src.entity_type,ce_src.ruleset,cs_src.document_key AS source_key,
           'description'::text AS match_source
    FROM card_templates ct
    LEFT JOIN content_entities ce_src ON ce_src.id=ct.source_entity_id
    LEFT JOIN content_sources cs_src ON cs_src.id=ce_src.source_id
    WHERE COALESCE(ct.description_en,'') ILIKE ${contains}
    ORDER BY
      POSITION(LOWER(${term}) IN LOWER(COALESCE(ct.description_en,''))),
      LENGTH(COALESCE(ct.description_en,'')),
      ct.name_en
    LIMIT 8
  `;

  return descriptionRows.map(row=>({
    ...row,
    name:cardDisplayName(row,lang),
    snippet:builderDescriptionSnippet(row.description_en,term)
  }));
}

function contentSuggestionLabel(row) {
  if(row.entity_type==="creature") return row.creature_type || "Monster";
  if(row.entity_type==="spell") return "Spell";
  if(row.entity_type==="condition") return "Condition";
  if(row.entity_type==="item") return row.item_kind==="magic_item" ? (row.rarity || "Magic Item") : (row.category || "Equipment");
  return String(row.entity_type||"Content");
}

async function contentSearchSuggestions(q,tab,lang="ru") {
  const term=String(q||"").trim().replace(/\s+/g," ").slice(0,80);
  const safeTab=normalizeTab(tab||"all");
  if(!term)return [];

  const contains=`%${term}%`;
  const prefix=`${term}%`;
  const aliases=russianSearchAliases(term);
  const aliasLower=aliases.length?aliases.map(value=>value.toLowerCase()):["__no_translation_alias__"];

  const tabFilter=sql`
    (${safeTab}='all'
      OR (${safeTab}='creature' AND ce.entity_type='creature')
      OR (${safeTab}='spell' AND ce.entity_type='spell')
      OR (${safeTab}='condition' AND ce.entity_type='condition')
      OR (${safeTab}='equipment' AND ce.entity_type='item' AND i.item_kind='equipment')
      OR (${safeTab}='magic_item' AND ce.entity_type='item' AND i.item_kind='magic_item'))
  `;

  const titleRows=await sql`
    SELECT ce.id::text,ce.name_en AS name,ce.entity_type::text AS entity_type,ce.ruleset,
           cs.document_key AS source_key,
           ce.description_en,c.creature_type,i.item_kind,i.category,i.rarity,
           'name'::text AS match_source
    FROM content_entities ce
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    LEFT JOIN creatures c ON c.entity_id=ce.id
    LEFT JOIN items i ON i.entity_id=ce.id
    WHERE ${tabFilter}
      AND (ce.name_en ILIKE ${contains} OR LOWER(ce.name_en) IN ${sql(aliasLower)})
    ORDER BY
      CASE
        WHEN LOWER(ce.name_en)=LOWER(${term}) THEN 0
        WHEN ce.name_en ILIKE ${prefix} THEN 1
        ELSE 2
      END,
      POSITION(LOWER(${term}) IN LOWER(ce.name_en)),
      LENGTH(ce.name_en),
      ce.name_en
    LIMIT 8
  `;

  if(titleRows.length){
    return titleRows.map(row=>({...row,name:entityDisplayName(row,lang),label:contentSuggestionLabel(row)}));
  }

  const descriptionRows=await sql`
    SELECT ce.id::text,ce.name_en AS name,ce.entity_type::text AS entity_type,ce.ruleset,
           cs.document_key AS source_key,
           ce.description_en,c.creature_type,i.item_kind,i.category,i.rarity,
           'description'::text AS match_source
    FROM content_entities ce
    LEFT JOIN content_sources cs ON cs.id=ce.source_id
    LEFT JOIN creatures c ON c.entity_id=ce.id
    LEFT JOIN items i ON i.entity_id=ce.id
    WHERE ${tabFilter}
      AND COALESCE(ce.description_en,'') ILIKE ${contains}
    ORDER BY
      POSITION(LOWER(${term}) IN LOWER(COALESCE(ce.description_en,''))),
      LENGTH(COALESCE(ce.description_en,'')),
      ce.name_en
    LIMIT 8
  `;

  return descriptionRows.map(row=>({
    ...row,
    name:entityDisplayName(row,lang),
    label:contentSuggestionLabel(row),
    snippet:builderDescriptionSnippet(row.description_en,term)
  }));
}

function dedupeBuilderSuggestions(rows,scope){
  if(scope!=="all")return rows;
  const seenClasses=new Set(),out=[];
  for(const row of rows){
    if(row.kind==="class"){
      const key=String(row.name||"").toLowerCase();
      if(seenClasses.has(key))continue;
      seenClasses.add(key);
    }
    out.push(row);
    if(out.length>=8)break;
  }
  return out;
}

async function builderSearchSuggestions(q,kind,scope="all",lang="ru") {
  const term=String(q||"").trim().replace(/\s+/g," ").slice(0,80);
  const safeKind=builderKind(kind||"all");
  const safeScope=builderRuleset(scope||"all");
  if(!term)return [];

  const contains=`%${term}%`;
  const prefix=`${term}%`;
  const aliases=russianSearchAliases(term,{ruleset:safeScope==="all"?null:safeScope,kind:safeKind==="all"?null:safeKind});
  const aliasLower=aliases.length?aliases.map(value=>value.toLowerCase()):["__no_translation_alias__"];

  // First priority: names containing the exact typed substring,
  // case-insensitively and in the same character order.
  const titleRows=await sql`
    SELECT ce.id::text,ce.name_en AS name,cc.content_kind AS kind,cc.category,cs.ruleset,cs.document_key AS source_key,cs.name AS source_name,
           'name'::text AS match_source,NULL::text AS description
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE (${safeKind}='all' OR cc.content_kind=${safeKind})
      AND cs.enabled=true
      AND (${safeScope}='all' OR cs.ruleset=${safeScope})
      AND (ce.name_en ILIKE ${contains} OR LOWER(ce.name_en) IN ${sql(aliasLower)})
    ORDER BY
      CASE
        WHEN LOWER(ce.name_en)=LOWER(${term}) THEN 0
        WHEN ce.name_en ILIKE ${prefix} THEN 1
        ELSE 2
      END,
      CASE cs.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,
      POSITION(LOWER(${term}) IN LOWER(ce.name_en)),
      LENGTH(ce.name_en),
      ce.name_en
    LIMIT 24
  `;

  if(titleRows.length) return dedupeBuilderSuggestions(titleRows.map(row=>({...row,name:entityDisplayName(row,lang,row.kind)})),safeScope);

  // Only if there are no matching names do we search descriptions.
  const descriptionRows=await sql`
    SELECT ce.id::text,ce.name_en AS name,cc.content_kind AS kind,cc.category,cs.ruleset,cs.document_key AS source_key,cs.name AS source_name,
           'description'::text AS match_source,ce.description_en AS description
    FROM character_content cc
    JOIN content_entities ce ON ce.id=cc.entity_id
    JOIN content_sources cs ON cs.id=ce.source_id
    WHERE (${safeKind}='all' OR cc.content_kind=${safeKind})
      AND cs.enabled=true
      AND (${safeScope}='all' OR cs.ruleset=${safeScope})
      AND COALESCE(ce.description_en,'') ILIKE ${contains}
    ORDER BY
      POSITION(LOWER(${term}) IN LOWER(COALESCE(ce.description_en,''))),
      LENGTH(COALESCE(ce.description_en,'')),
      ce.name_en
    LIMIT 24
  `;

  return dedupeBuilderSuggestions(descriptionRows.map(row=>({
    ...row,
    name:entityDisplayName(row,lang,row.kind),
    snippet:builderDescriptionSnippet(row.description,term)
  })),safeScope);
}
async function builderClassEntityContent(e,refs,lang="ru"){
  const features=builderClassFeatureRows(e);
  const [subclasses,variants]=await Promise.all([
    sql`
      SELECT ce.id::text,ce.name_en,ce.description_en,cc.category,cs.ruleset,cs.name AS source_name,cs.document_key AS source_key
      FROM character_content cc JOIN content_entities ce ON ce.id=cc.entity_id JOIN content_sources cs ON cs.id=ce.source_id
      WHERE cc.content_kind='subclass' AND cs.enabled=true
        AND cs.ruleset=${e.ruleset}
        AND LOWER(COALESCE(cc.summary->>'parent_class',''))=LOWER(${e.name_en})
      ORDER BY ce.name_en,CASE WHEN cs.document_key LIKE 'srd-%' THEN 0 ELSE 1 END,cs.name
    `,
    sql`
      SELECT ce.id::text,ce.name_en,cs.ruleset,cs.name AS source_name,cs.document_key AS source_key
      FROM character_content cc JOIN content_entities ce ON ce.id=cc.entity_id JOIN content_sources cs ON cs.id=ce.source_id
      WHERE cc.content_kind='class' AND cs.enabled=true AND LOWER(ce.name_en)=LOWER(${e.name_en})
      ORDER BY CASE cs.ruleset WHEN 'dnd5e-2024' THEN 0 WHEN 'dnd5e-2014' THEN 1 ELSE 2 END,
               CASE WHEN cs.document_key LIKE 'srd-%' THEN 0 ELSE 1 END,cs.name
    `
  ]);
  const seenSubclasses=new Set();
  const visibleSubclasses=subclasses.filter(row=>{const key=String(row.name_en).toLowerCase();if(seenSubclasses.has(key))return false;seenSubclasses.add(key);return true;});
  const subclassHtml=visibleSubclasses.length?`<div class="class-subclass-grid">${visibleSubclasses.map(row=>`<a class="class-subclass-card" href="/builder-data/entity/${encodeURIComponent(row.id)}"><div><span class="compact-kicker">${esc(compactRulesetLabel(row.ruleset))}</span><h4 data-i18n-skip>${esc(entityDisplayName(row,lang,"subclass"))}</h4><p>${esc(truncate(displayText(row.description_en,{ruleset:row.ruleset,kind:"subclass",source:row.source_key})||"Open subclass entry.",155))}</p></div><span class="subclass-open">→</span></a>`).join("")}</div>`:`<div class="small-note">No linked subclasses were found for this ruleset.</div>`;
  const variantHtml=variants.length>1?`<div class="class-variant-switch"><span>Versions</span>${variants.map(v=>`<a class="${String(v.id)===String(e.id)?"active":""}" href="/builder-data/entity/${encodeURIComponent(v.id)}" title="${esc(v.source_name)}">${esc(compactRulesetLabel(v.ruleset))}</a>`).join("")}</div>`:"";
  const intro=e.description_en?`<section class="class-intro builder-linked-text builder-rules-text">${renderBuilderLinkedRulesText(e.description_en,refs,e.id)}</section>`:"";
  return `<div class="builder-class-page" data-ruleset="${esc(e.ruleset)}" data-content-kind="class"><a class="back builder-class-back" href="/builder-data?kind=class">← Builder Data</a><section class="builder-class-hero"><div><div class="eyebrow"><span>Class</span><span>${esc(e.ruleset==="a5e"?"A5E · reference only":e.ruleset)}</span></div><h2 data-i18n-skip>${esc(entityDisplayName(e,displayContext.getStore()?.language||"ru"))}</h2><div class="chips"><span class="chip gold">${esc(e.source_name||"")}</span>${e.category?`<span class="chip">${esc(e.category)}</span>`:""}</div>${variantHtml}</div><div class="class-source-mini">${kv([["Ruleset",e.ruleset],["Source",e.source_name],["License",e.license_code]])}</div></section><nav class="class-toc" aria-label="Class page sections"><a href="#class-overview">Overview</a><a href="#class-progression">Class Progression</a><a href="#class-features">Class Features</a><a href="#class-subclasses">Subclasses</a></nav>${intro}<section class="class-page-section" id="class-overview"><div class="class-section-head"><span>01</span><div><h3>Class Overview</h3><p>The essentials used during character creation and play.</p></div></div>${renderClassOverview(e,refs)}</section><section class="class-page-section" id="class-progression"><div class="class-section-head"><span>02</span><div><h3>Class Progression</h3><p>Level-by-level advancement. Feature names jump to their descriptions below when a matching rule is available.</p></div></div>${builderClassProgressionTable(e,features,refs)}</section><section class="class-page-section" id="class-features"><div class="class-section-head"><span>03</span><div><h3>Class Features</h3><p>Features are grouped by the level at which they become available. Open only the rule you need.</p></div></div>${renderClassFeatureSections(e,features,refs)}</section><section class="class-page-section" id="class-subclasses"><div class="class-section-head"><span>04</span><div><h3>Subclasses</h3><p>${esc(compactRulesetLabel(e.ruleset))} subclasses linked to ${esc(entityDisplayName(e,lang,"class"))}.</p></div></div>${subclassHtml}</section><details class="builder-source-drawer"><summary>Source & normalized data</summary><div class="builder-source-grid"><div>${renderBuilderChoicesSection(e,refs)}</div><div class="aside-card">${kv([["Kind",e.content_kind],["Category",e.category],["Ruleset",e.ruleset],["Source",e.source_name],["License",e.license_code]])}<details class="raw"><summary>Raw imported source</summary><pre>${esc(JSON.stringify(e.raw_source,null,2))}</pre></details></div></div></details></div>`;
}

async function builderDataEntityPage(id,lang="ru") {
  const [rows,refs]=await Promise.all([sql`
      SELECT ce.id::text,ce.name_en,ce.description_en,ce.entity_type::text,ce.raw_source,ce.ruleset,
             cs.name AS source_name,cs.document_key AS source_key,cs.license_code,cc.*
      FROM character_content cc JOIN content_entities ce ON ce.id=cc.entity_id LEFT JOIN content_sources cs ON cs.id=ce.source_id
      WHERE ce.id=${id} LIMIT 1`,builderReferenceIndex()]);
  if(!rows.length)return {status:404,body:layout({title:"Not found",content:`<a class="back" href="/builder-data">← Builder Data</a><div class="empty">Entry not found.</div>`})};
  const e=rows[0];
  Object.assign(displayContext.getStore()||{}, {ruleset:e.ruleset,kind:e.content_kind,source:e.source_key});
  if(e.content_kind==="class")return {status:200,body:layout({title:entityDisplayName(e,lang,"class"),content:await builderClassEntityContent(e,refs,lang)})};
  const content=`<a class="back" href="/builder-data">← Builder Data</a><section class="detail-head"><div><div class="eyebrow"><span>${esc(e.content_kind)}</span><span>${esc(e.ruleset==="a5e"?"A5E · reference only":e.ruleset)}</span></div><h2 data-i18n-skip>${esc(entityDisplayName(e,lang,e.content_kind))}</h2><div class="chips">${e.category?`<span class="chip gold">${esc(e.category)}</span>`:""}<span class="chip">${esc(e.source_name||"")}</span></div></div></section><div class="builder-detail-grid"><article>${e.description_en?`<section class="section"><h3>Description</h3><div class="description builder-linked-text builder-rules-text">${renderBuilderLinkedRulesText(e.description_en,refs,e.id)}</div></section>`:""}<section class="section"><h3>Normalized Summary</h3>${renderBuilderSummary(e,refs)}</section><section class="section"><h3>Traits / Features</h3>${renderBuilderTraits(e.traits,refs,e.id)}</section><section class="section"><h3>Choices & Proficiencies</h3>${renderBuilderChoicesSection(e,refs)}</section></article><aside><div class="aside-card">${kv([["Kind",e.content_kind],["Category",e.category],["Ruleset",e.ruleset],["Source",e.source_name],["License",e.license_code]])}<details class="raw"><summary>Raw imported source</summary><pre>${esc(JSON.stringify(e.raw_source,null,2))}</pre></details></div></aside></div>`;
  return {status:200,body:layout({title:entityDisplayName(e,lang,e.content_kind),content})};
}

const handleTabletop = createTabletopHandler({sql,layout,html,json,language:requestLanguage,characterPanel:characterPage});

const server = http.createServer((req, res) => displayContext.run({language:requestLanguage(req)}, async () => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
    if (serveThemeAsset(res, url.pathname)) return;
    if (await handleTabletop(req,res,url)) return;
    if(req.method==="GET" && url.pathname==="/localization"){
      html(res,200,layout({title:"Перевод контента",content:statusContent(await readCatalog(sql))}));return;
    }
    if(req.method==="GET" && url.pathname==="/api/localization/export"){
      const manifest=await readCatalog(sql);
      res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=dnd-translation-input.json","Cache-Control":"no-store"});
      res.end(JSON.stringify(manifest,null,2));return;
    }
    if(req.method==="GET" && url.pathname==="/api/localization/dictionary"){
      const groups=new Map();
      for(const e of packEntries()){
        if(!groups.has(e.text))groups.set(e.text,new Set());
        groups.get(e.text).add(e.translation);
      }
      json(res,200,{dictionary:Object.fromEntries([...groups].filter(([,v])=>v.size===1).map(([k,v])=>[k,[...v][0]]))});return;
    }
    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/library" }); res.end(); return;
    }
    if (url.pathname === "/health") {
      const rows = await sql`SELECT 1 AS ok`;
      json(res, 200, { ok: rows[0].ok === 1, database: "connected" }); return;
    }
    if (url.pathname === "/api/stats") {
      json(res, 200, await getStats()); return;
    }
    const mediaCharacterMatch=url.pathname.match(/^\/media\/character\/([^/]+)$/);
    if(mediaCharacterMatch && req.method==="GET"){const m=await mediaCharacter(decodeURIComponent(mediaCharacterMatch[1]));if(!m?.bytes){res.writeHead(404);res.end();return;}binary(res,200,m.mime,m.bytes);return;}
    const mediaEntityMatch=url.pathname.match(/^\/media\/entity\/([^/]+)$/);
    if(mediaEntityMatch && req.method==="GET"){const m=await mediaEntity(decodeURIComponent(mediaEntityMatch[1]));if(!m?.bytes){res.writeHead(404);res.end();return;}binary(res,200,m.mime,m.bytes);return;}
    const mediaCardMatch=url.pathname.match(/^\/media\/card\/([^/]+)$/);
    if(mediaCardMatch && req.method==="GET"){const m=await mediaCard(decodeURIComponent(mediaCardMatch[1]));if(!m?.bytes){res.writeHead(404);res.end();return;}binary(res,200,m.mime,m.bytes);return;}

    const apiCharacterImage=url.pathname.match(/^\/api\/character\/([^/]+)\/image$/);
    if(apiCharacterImage){
      const id=decodeURIComponent(apiCharacterImage[1]);
      if(req.method==="POST"){await saveCharacterImage(id,await parseJson(req));json(res,200,{ok:true});return;}
      if(req.method==="DELETE"){await sql`UPDATE characters SET portrait_bytes=NULL,portrait_mime=NULL,portrait_name=NULL,updated_at=NOW() WHERE id=${id}`;json(res,200,{ok:true});return;}
    }
    const apiEntityImage=url.pathname.match(/^\/api\/entity\/([^/]+)\/image$/);
    if(apiEntityImage){
      const id=decodeURIComponent(apiEntityImage[1]);
      if(req.method==="POST"){await saveEntityImage(id,await parseJson(req));json(res,200,{ok:true});return;}
      if(req.method==="DELETE"){await sql`UPDATE content_entities SET image_bytes=NULL,image_mime=NULL,image_name=NULL,updated_at=NOW() WHERE id=${id}`;json(res,200,{ok:true});return;}
    }
    const apiCardImage=url.pathname.match(/^\/api\/card\/([^/]+)\/image$/);
    if(apiCardImage){
      const id=decodeURIComponent(apiCardImage[1]);
      if(req.method==="POST"){await saveCardImage(id,await parseJson(req));json(res,200,{ok:true});return;}
      if(req.method==="DELETE"){await sql`UPDATE card_templates SET image_bytes=NULL,image_mime=NULL,image_name=NULL,updated_at=NOW() WHERE id=${id}`;json(res,200,{ok:true});return;}
    }
    if (url.pathname === "/api/content-search" && req.method === "GET") {
      const suggestions=await contentSearchSuggestions(url.searchParams.get("q")||"",url.searchParams.get("tab")||"all",requestLanguage(req));
      json(res,200,suggestions); return;
    }
    if (url.pathname === "/api/card-search" && req.method === "GET") {
      const suggestions=await cardSearchSuggestions(url.searchParams.get("q")||"",requestLanguage(req));
      json(res,200,suggestions); return;
    }
    if (url.pathname === "/api/entities") {
      const tab = normalizeTab(url.searchParams.get("tab") || "all");
      const q = (url.searchParams.get("q") || "").trim().slice(0,120);
      const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1",10) || 1);
      json(res, 200, await listEntities({ tab, q, page })); return;
    }
    if (url.pathname.startsWith("/api/entities/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/entities/".length));
      const data = await apiEntity(id);
      json(res, data ? 200 : 404, data ?? { error: "Not found" }); return;
    }
    if (url.pathname === "/api/builder-search" && req.method === "GET") {
      const suggestions=await builderSearchSuggestions(
        url.searchParams.get("q")||"",
        url.searchParams.get("kind")||"all",
        url.searchParams.get("scope")||"all",
        requestLanguage(req)
      );
      json(res,200,suggestions); return;
    }
    if (url.pathname === "/builder-data" && req.method === "GET") {
      html(res,200,await builderDataPage(url,requestLanguage(req))); return;
    }
    if (url.pathname.startsWith("/builder-data/entity/") && req.method === "GET") {
      const id=decodeURIComponent(url.pathname.slice("/builder-data/entity/".length));
      const result=await builderDataEntityPage(id,requestLanguage(req)); html(res,result.status,result.body); return;
    }
    if (url.pathname === "/cards" && req.method === "GET") {
      html(res, 200, await cardsPage(url,requestLanguage(req))); return;
    }
    if (url.pathname.startsWith("/cards/from-entity/") && req.method === "POST") {
      const entityId = decodeURIComponent(url.pathname.slice("/cards/from-entity/".length));
      const cardId = await upsertCardFromEntity(entityId);
      if (!cardId) { html(res,404,layout({title:"Not found",content:`<div class="empty">Source entity not found.</div>`})); return; }
      res.writeHead(303,{Location:`/card/${encodeURIComponent(cardId)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/card/") && url.pathname.endsWith("/instance") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/card/".length,-"/instance".length));
      await createInstance(id);
      res.writeHead(303,{Location:`/card/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/instance/") && url.pathname.endsWith("/delete") && req.method === "POST") {
      const instanceId = decodeURIComponent(url.pathname.slice("/instance/".length,-"/delete".length));
      const form = await parseForm(req);
      const templateId = await deleteInstance(instanceId);
      const requestedBack = String(form.back || "");
      const location = requestedBack.startsWith("/") ? requestedBack : (templateId?`/card/${encodeURIComponent(templateId)}`:"/cards");
      res.writeHead(303,{Location:location}); res.end(); return;
    }
    if (url.pathname.startsWith("/card/") && url.pathname.endsWith("/delete") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/card/".length,-"/delete".length));
      await deleteCardTemplate(id);
      res.writeHead(303,{Location:"/cards"}); res.end(); return;
    }
    if (url.pathname.startsWith("/card/") && url.pathname.endsWith("/instance-character") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/card/".length,-"/instance-character".length));
      const form = await parseForm(req);
      await createCharacterInstance(id, String(form.character_id || ""));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(String(form.character_id))}`}); res.end(); return;
    }
    if (url.pathname === "/character-builder" && req.method === "GET") {
      html(res,200,await guidedCharacterBuilderPage(requestLanguage(req))); return;
    }
    if (url.pathname === "/character-builder/create" && req.method === "POST") {
      const id=await createGuidedCharacter(await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname === "/characters" && req.method === "GET") {
      html(res,200,await charactersPage()); return;
    }
    if (url.pathname === "/characters/create" && req.method === "POST") {
      const id = await createCharacter(await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/xp") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/xp".length));
      await adjustCharacterXp(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/level-up/confirm") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/level-up/confirm".length));
      await completeCharacterLevelUp(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/level-rollback") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/level-rollback".length));
      await rollbackCharacterLevel(id);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/progression") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/progression".length));
      await updateCharacterProgression(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/font-of-magic") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/font-of-magic".length));
      await fontOfMagic(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/pact-weapon") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/pact-weapon".length));
      await setPactWeapon(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/pact-tome") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/pact-tome".length));
      await setPactTomeSpell(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/pact-familiar") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/pact-familiar".length));
      await setPactFamiliar(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/wild-shape") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/wild-shape".length));
      await setWildShape(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/gift-protector") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/gift-protector".length));
      await setGiftProtector(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/innate-sorcery") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/innate-sorcery".length));
      const form=await parseForm(req);
      await toggleInnateSorcery(id,String(form.action||"activate"));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    const apiClassActionMatch=url.pathname.match(/^\/api\/character\/([^/]+)\/class-action$/);
    if(apiClassActionMatch && req.method === "POST") {
      const id=decodeURIComponent(apiClassActionMatch[1]);
      const form=await parseForm(req);
      const result=await useClassAction(id,form);
      if(!result) throw new Error("This class action completed without live-roll data");
      json(res,200,result);return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/class-action") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/class-action".length));
      const form=await parseForm(req);
      const result=await useClassAction(id,form);
      if(wantsJson(req) && result){json(res,200,result);return;}
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/concentration/check") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/concentration/check".length));
      const form=await parseForm(req);
      const back=combatReturnPath(form.back,id);
      const result=await concentrationSavingThrow(id,form.check_id,back);
      if(wantsJson(req)){json(res,200,result);return;}
      res.writeHead(303,{Location:back});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/concentration/end") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/concentration/end".length));
      const form=await parseForm(req);
      await endConcentration(id);
      res.writeHead(303,{Location:combatReturnPath(form.back,id)});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/class-choice") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/class-choice".length));
      await setCoreClassChoice(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/metamagic/use") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/metamagic/use".length));
      await useMetamagic(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/metamagic") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/metamagic".length));
      await setMetamagicChoice(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/invocation") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/invocation".length));
      await setWarlockInvocation(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/lore-discovery") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/lore-discovery".length));
      await setLoreDiscovery(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/mastery") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/mastery".length));
      await setWeaponMastery(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/expertise") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/expertise".length));
      await setExpertiseSkill(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/fighting-style") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/fighting-style".length));
      await setFightingStyle(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/ac") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/ac".length));
      await setCharacterAc(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    const inventoryStateMatch=url.pathname.match(/^\/character\/([^/]+)\/inventory\/([^/]+)\/(equip|attune)$/);
    if(inventoryStateMatch && req.method==="POST"){
      const characterId=decodeURIComponent(inventoryStateMatch[1]);
      const instanceId=decodeURIComponent(inventoryStateMatch[2]);
      const action=inventoryStateMatch[3];
      if(action==="equip") await setInventoryEquipped(characterId,instanceId);
      if(action==="attune") await setInventoryAttuned(characterId,instanceId);
      const refreshed=await getCharacter(characterId);
      if(refreshed) await syncAutoArmorClass(refreshed.character,refreshed.inventory);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(characterId)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/layout") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/layout".length));
      const form=await parseForm(req); await setCharacterLayout(id,form.layout);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/rest") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/rest".length));
      const form=await parseForm(req);
      await restCharacter(id,String(form.rest_type||"long"));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/spell/add") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/spell/add".length));
      const form=await parseForm(req);
      await addCharacterSpell(id,String(form.spell_entity_id||""));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    const characterSpellMatch=url.pathname.match(/^\/character\/([^/]+)\/spell\/([^/]+)\/(cast|prepared|remove)$/);
    if(characterSpellMatch && req.method==="POST") {
      const characterId=decodeURIComponent(characterSpellMatch[1]);
      const characterSpellId=decodeURIComponent(characterSpellMatch[2]);
      const action=characterSpellMatch[3];
      if(action==="cast") {
        const form=await parseForm(req);
        await spendSpellSlot(characterId,characterSpellId,form.slot_level);
      }
      if(action==="prepared") await togglePreparedSpell(characterId,characterSpellId);
      if(action==="remove") await removeCharacterSpell(characterId,characterSpellId);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(characterId)}`}); res.end(); return;
    }
    const slotMatch=url.pathname.match(/^\/character\/([^/]+)\/slot\/(\d+)$/);
    if(slotMatch && req.method==="POST") {
      const characterId=decodeURIComponent(slotMatch[1]);
      const form=await parseForm(req);
      await adjustSpellSlot(characterId,Number(slotMatch[2]),form.delta);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(characterId)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/condition/add") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/condition/add".length));
      const form=await parseForm(req);
      await addCharacterCondition(id,String(form.condition_entity_id||""));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    const conditionMatch=url.pathname.match(/^\/character\/([^/]+)\/condition\/([^/]+)\/remove$/);
    if(conditionMatch && req.method==="POST") {
      const characterId=decodeURIComponent(conditionMatch[1]);
      const conditionId=decodeURIComponent(conditionMatch[2]);
      await removeCharacterCondition(characterId,conditionId);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(characterId)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/resource/add") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/resource/add".length));
      await createCharacterResource(id,await parseForm(req));
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    const resourceMatch=url.pathname.match(/^\/character\/([^/]+)\/resource\/([^/]+)\/(adjust|delete)$/);
    if(resourceMatch && req.method==="POST") {
      const characterId=decodeURIComponent(resourceMatch[1]);
      const resourceId=decodeURIComponent(resourceMatch[2]);
      const action=resourceMatch[3];
      if(action==="adjust") {
        const form=await parseForm(req);
        await adjustCharacterResource(characterId,resourceId,form.delta);
      } else {
        await deleteCharacterResource(characterId,resourceId);
      }
      res.writeHead(303,{Location:`/character/${encodeURIComponent(characterId)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/temp-hp") && req.method === "POST") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/temp-hp".length));
      const form=await parseForm(req);
      await setTemporaryHitPoints(sql,id,form.amount);
      res.writeHead(303,{Location:combatReturnPath(form.back,id)});res.end();return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/hp") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/character/".length,-"/hp".length));
      const form = await parseForm(req);
      await adjustCharacterHp(id, form.delta);
      res.writeHead(303,{Location:`/character/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/delete") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/character/".length,-"/delete".length));
      await deleteCharacter(id);
      res.writeHead(303,{Location:"/characters"}); res.end(); return;
    }
    if (url.pathname.startsWith("/character/") && url.pathname.endsWith("/level-up") && req.method === "GET") {
      const id=decodeURIComponent(url.pathname.slice("/character/".length,-"/level-up".length));
      const result=await characterLevelUpPage(id); html(res,result.status,result.body); return;
    }
    if (url.pathname.startsWith("/character/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/character/".length));
      const result = await characterPage(id); html(res,result.status,result.body); return;
    }
    if (url.pathname.startsWith("/instance/") && url.pathname.endsWith("/unassign") && req.method === "POST") {
      const instanceId = decodeURIComponent(url.pathname.slice("/instance/".length,-"/unassign".length));
      const form = await parseForm(req);
      await unassignInstance(instanceId);
      const back = String(form.back || "/cards");
      res.writeHead(303,{Location:back.startsWith("/")?back:"/cards"}); res.end(); return;
    }
    if (url.pathname === "/encounters" && req.method === "GET") {
      html(res,200,await encountersPage()); return;
    }
    if (url.pathname === "/encounters/create" && req.method === "POST") {
      const id = await createEncounter(await parseForm(req));
      res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/add-character") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/add-character".length));
      const form = await parseForm(req); await addCharacterToEncounter(id,String(form.character_id||""));
      res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/add-creature") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/add-creature".length));
      const form = await parseForm(req); await addCreatureToEncounter(id,String(form.entity_id||""));
      res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/initiative") && req.method === "POST" && !url.pathname.includes("/combatant/")) {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/initiative".length));
      await rollEncounterInitiative(id); res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/next") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/next".length));
      await stepEncounterTurn(id,'next'); res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/previous") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/previous".length));
      await stepEncounterTurn(id,'previous'); res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/reset") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/reset".length));
      await resetEncounter(id); res.writeHead(303,{Location:`/encounter/${encodeURIComponent(id)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && url.pathname.endsWith("/delete") && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length,-"/delete".length));
      await deleteEncounter(id); res.writeHead(303,{Location:"/encounters"}); res.end(); return;
    }
    const combatantMatch = url.pathname.match(/^\/encounter\/([^/]+)\/combatant\/([^/]+)\/(hp|initiative|remove)$/);
    if (combatantMatch && req.method === "POST") {
      const encounterId=decodeURIComponent(combatantMatch[1]), combatantId=decodeURIComponent(combatantMatch[2]), action=combatantMatch[3];
      if (action==='hp') { const form=await parseForm(req); await adjustCombatantHp(encounterId,combatantId,form.delta); }
      if (action==='initiative') { const form=await parseForm(req); await setCombatantInitiative(encounterId,combatantId,form.initiative); }
      if (action==='remove') await removeCombatant(encounterId,combatantId);
      res.writeHead(303,{Location:`/encounter/${encodeURIComponent(encounterId)}`}); res.end(); return;
    }
    if (url.pathname.startsWith("/encounter/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/encounter/".length));
      const result = await encounterPage(id); html(res,result.status,result.body); return;
    }
    if (url.pathname.startsWith("/card/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/card/".length));
      const result = await cardPage(id,requestLanguage(req)); html(res,result.status,result.body); return;
    }
    if (url.pathname === "/roll" && req.method === "POST") {
      const body=await rollPage(req,res); if(body!==null) html(res,200,body); return;
    }
    if (url.pathname === "/api/cards" && req.method === "GET") {
      const q=(url.searchParams.get("q")||"").trim().slice(0,120); json(res,200,await listCards(q)); return;
    }
    if (url.pathname.startsWith("/api/cards/") && req.method === "GET") {
      const id=decodeURIComponent(url.pathname.slice("/api/cards/".length)); const data=await getCardTemplate(id); json(res,data?200:404,data??{error:"Not found"}); return;
    }
    if (url.pathname === "/library") {
      html(res, 200, await libraryPage(url,requestLanguage(req))); return;
    }
    if (url.pathname.startsWith("/entity/")) {
      const id = decodeURIComponent(url.pathname.slice("/entity/".length));
      const result = await entityPage(id);
      html(res, result.status, result.body); return;
    }
    html(res, 404, layout({ title: "Not found", content: `<a class="back" href="/library">← Library</a><div class="empty">Page not found.</div>` }));
  } catch (error) {
    console.error(error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    const lang=requestLanguage(req);
    const databaseError=builderDatabaseError(error,lang);
    if(databaseError) {
      if(wantsJson(req))json(res,databaseError.status,{error:databaseError.message,code:databaseError.code});
      else html(res,databaseError.status,layout({title:databaseError.title,content:databaseError.content}));
      return;
    }
    const message=translateText(rawMessage,lang);
    if(wantsJson(req)){json(res,500,{error:message});return;}
    html(res, 500, layout({ title: lang==="ru"?"Ошибка сервера":"Server error", content: `<div class="empty"><b>${lang==="ru"?"Ошибка сервера":"Server error"}</b><br><br>${esc(message)}</div>` }));
  }
}));

const stopTranslationWorker=startTranslationWorker(sql);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`D&D Card Table Library running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

async function shutdown() {
  stopTranslationWorker();
  server.close(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
