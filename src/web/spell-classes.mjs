// Open5e imports preserve class references as JSON. Use the same names for
// picker labels and eligibility checks instead of coercing objects to strings.
const CLASS_NAMES = new Map([
  "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin",
  "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"
].map(name => [name.toLowerCase(), name]));

export function spellClassNames(value) {
  const names = new Map();

  function add(name) {
    const label = name.trim().replace(/\s+/g, " ");
    if (!label || label === "[object Object]") return;
    const key = label.toLowerCase();
    if (!names.has(key)) names.set(key, CLASS_NAMES.get(key) || label);
  }

  function visit(entry) {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (typeof entry === "string") {
      const text = entry.trim();
      if (!text) return;
      if (/^[\[{"]/.test(text)) {
        try { visit(JSON.parse(text)); } catch { /* Unknown serialized format. */ }
        return;
      }
      text.split(/[,;|]/).forEach(add);
      return;
    }
    if (!entry || typeof entry !== "object") return;

    // A reference's name is authoritative; source descriptions and document
    // metadata must never accidentally grant access to another class's spells.
    for (const key of ["name", "name_en", "label"]) {
      if (typeof entry[key] === "string" && entry[key].trim()) {
        visit(entry[key]);
        return;
      }
    }
    // Support compact Open5e references such as { key: "srd-2024_bard" }.
    for (const key of ["key", "slug"]) {
      if (typeof entry[key] !== "string") continue;
      const token = entry[key].trim().toLowerCase().split(/[_-]/).at(-1);
      if (CLASS_NAMES.has(token)) {
        add(CLASS_NAMES.get(token));
        return;
      }
    }
  }

  visit(value);
  return [...names.values()];
}

export function spellHasClass(classes, className) {
  const expected = String(className ?? "").trim().toLowerCase();
  return expected !== "" && spellClassNames(classes).some(name => name.toLowerCase() === expected);
}
