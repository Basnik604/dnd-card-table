# Источники графики токенов v0.30.2

## Исходный набор

`src/web/assets/token-icons-creatures-v1.png` — предоставленное пользователем изображение `image(20260926-181136).png`, 1448 × 1086, 20 значков существ. PNG включён без изменения пикселей.

## Дополнительные наборы

Созданы встроенным инструментом ImageGen с исходным набором как визуальным референсом. Оба результата имеют прозрачный фон и включены без изменения пикселей:

- `src/web/assets/token-icons-roles-v1.png` — 1254 × 1254, 16 ролей и объектов, сетка 4 × 4.
- `src/web/assets/token-icons-classes-v1.png` — 1448 × 1086, 12 классов, сетка 4 × 3. В качестве второго референса использован уже созданный набор ролей.

Растровые файлы служат атласами. `tabletop-icon-art.mjs` хранит координаты и SVG-маски, отделяющие значки от подписей и соседних ячеек. SVG-фильтр переводит изображение в градации яркости и окрашивает их выбранным цветом, сохраняя прозрачность. Координаты и маски уточнены после просмотра браузерных снимков. Это обработка отображения в приложении; исходные PNG не перерисованы.

## Промпт: роли и объекты

```text
Use case: stylized-concept. Asset type: production RPG virtual tabletop UI icon atlas, complementary set to the reference. Image 1 is STYLE REFERENCE ONLY: match its crisp black/dark graphite bodies, polished steel silver-white beveled highlights, subtle cool rim lines, bold simple silhouettes and fantasy tavern heraldic appearance. Create ONE square transparent PNG sprite atlas, exactly 4 columns by 4 rows, exactly 16 icons, equal square cells, centers on a regular grid. Each icon fits within the central 76% of its cell with generous completely transparent margins. No text, no labels, no nameplates, no circular badge, no backgrounds, no decorative frames. Monochrome neutral grayscale metal only, black shadow to white highlights; no blue cast so the app can recolor it. Strong legibility at 64px. Row 1 left to right: 1 PLAYER HERO, adventurer hooded bust with one small diamond clasp; 2 CIVILIAN NPC, unarmored simple head and shoulders with a rounded cap; 3 MERCHANT, tied coin purse with three coins; 4 GUARD, broad shield with a spear behind it. Row 2: 5 BLACKSMITH, sturdy anvil with diagonal hammer; 6 HEALER, cupped hands holding a bright four-point restorative spark; 7 SCHOLAR, open tome with quill; 8 NOBLE, ornate signet ring. Row 3: 9 QUEST GIVER, rolled parchment scroll with wax seal; 10 COMPANION, friendly pointed-ear dog head profile; 11 LOOT, treasure chest slightly open with coins; 12 TRAP, unmistakable steel jaw trap. Row 4: 13 DOOR, arched wooden door slightly ajar; 14 STAIRS, three stone steps rising diagonally; 15 PORTAL, stone arch containing a spiral; 16 LOCATION MARKER, pennant on a pole planted in a small stone. Entire objects inside their own cell, no overlap between cells. Cohesive symbols with the same visual weight and beveled steel treatment as reference.
```

## Промпт: классы

```text
Use case: stylized-concept. Asset type: a single RPG virtual tabletop character-class icon sprite atlas. Both images are STYLE REFERENCES ONLY. Match their bold dark graphite silhouettes, polished beveled silver metal, white highlights, clean black shadowed cavities and subtle edges. This must be a cohesive companion set, not a redesign. Create exactly 12 isolated icons in an evenly spaced 4-column by 3-row grid on a completely transparent landscape PNG, approximately 4:3 aspect. No text, labels, nameplates, borders, circular discs or background of any kind. Use only neutral grayscale metal black to silver-white, no colored glows. Each icon entirely inside the central 74% of its equal-size cell with transparent margins; do not let different icons touch. Strong simple silhouettes readable at 64px. Row 1 left to right: BARBARIAN two crossed heavy battle axes; FIGHTER upright sword with a small shield; PALADIN upright warhammer with a radiant four-point star behind it; RANGER arrowhead and bow with a small leaf. Row 2: ROGUE two crossed curved daggers and a hood-shaped shadow; MONK closed fist with a loop of prayer beads; BARD elegant lyre with a single floating music note; DRUID antlers surrounding a broad oak leaf. Row 3: CLERIC sunburst medallion hanging from a short chain; WIZARD open spellbook with a slender wand and three tiny stars; SORCERER an outstretched hand cupping a contained flame; WARLOCK a sinister open eye inside a crescent with two small horn-like tips. Do not draw people, faces, words, extra icons or duplicate symbols. Keep all 12 distinct and give each the same visual weight.
```
