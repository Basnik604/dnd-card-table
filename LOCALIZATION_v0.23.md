# D&D Card Table v0.23 — Full Russian Localization Engine

## Goal

Russian mode should cover the entire application, not only navigation labels:

- all pages and tabs;
- Builder Data;
- classes, subclasses, species, backgrounds and feats;
- spells, creatures, conditions, equipment and magic items;
- descriptions, traits, actions, spell text and class feature prose;
- dynamically created UI, validation messages and search suggestions.

The canonical English database remains unchanged.

## Hybrid strategy

### 1. Curated D&D terminology

`src/web/assets/game-ru.mjs` and `src/web/assets/glossary-ru.mjs` contain preferred Russian D&D terminology.
Short names/terms use established Russian reference terminology where a matching concept is known.
This layer always wins over machine translation.

### 2. Local automatic translator

Unknown English text is translated locally with Transformers.js using:

`Xenova/opus-mt-en-ru`

The model is loaded only when required. On first use Transformers.js downloads the selected model and keeps it in the local cache directory:

`.localization/models`

Default inference dtype: `q8`.

Environment overrides:

- `I18N_MODEL` — another compatible EN→RU Transformers.js model;
- `I18N_DTYPE` — e.g. `q8`, `fp16`, `fp32`;
- `I18N_MODEL_CACHE` — model cache directory;
- `I18N_CACHE_FILE` — translation-memory JSON file;
- `I18N_OFFLINE=1` — forbid downloading a model and use only already cached model files.

### 3. Translation memory

Generated translations are stored in:

`.localization/ru-cache.json`

They are reused on subsequent starts and searches. Entity names keep ruleset/kind-aware cache keys; ordinary prose is reusable across pages.

### 4. D&D-aware protection

Before model inference the engine protects:

- dice formulas (`2d6+3`);
- AC / HP / DC / CR / PB notation;
- URLs;
- HTML/Markdown links;
- product/source titles;
- known D&D terms from the glossary.

Known English D&D terminology is restored using the preferred Russian equivalent after translation.

### 5. Runtime fallback

`src/web/assets/i18n.js` first checks the static translation dictionaries. If a visible English string still has no translation, the browser sends it in batches to:

`POST /api/i18n/translate`

The server translates it locally and caches the result. This means newly imported content is localizable without writing new manual dictionaries.

User-created names and notes are marked as hard-skip content and are not automatically translated.

## Full pretranslation

After `npm install`, run:

```powershell
npm.cmd run i18n:full
```

This scans the local database and pre-translates/caches all available content so pages do not have to wait for on-demand translation.

The first run can take time because the translation model is downloaded once and the existing database may contain thousands of strings.

## Future imports

`npm run import:all` and `npm run import:charactercontent` now run `i18n:sync` automatically after import.

If content is imported by another custom command, the runtime fallback still translates missing strings on first display. `npm run i18n:sync` can be run at any time to pre-warm the cache.

## Search

Static Russian aliases continue to work. Machine-translated entity names are also entered into the translation-memory reverse index, so Russian searches can resolve them back to their canonical English database names after translation/prewarming.

## Copyright/data policy

The engine does **not** copy long descriptions from third-party Russian reference sites. Such sites are used only as terminology/name references. Full prose is generated from the project's canonical English records and stored locally.
