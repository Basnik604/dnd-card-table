// v0.30.2-fixed is the authoritative art for every type it already supports.
// Extra race/role PNGs preserve tokens created by the other chat branch.
// Crops only affect rendering; all supplied image files retain their original bytes.
export const ICON_GROUPS = ["People and roles","Character classes","Races","Creatures","Map markers"];
export const TOKEN_ICONS = {
  "undead": {
    "label": "Undead",
    "group": "Creatures",
    "color": "#91d573",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      70,
      76,
      132,
      164
    ]
  },
  "beast": {
    "label": "Beast",
    "group": "Creatures",
    "color": "#d3a35a",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      289,
      76,
      160,
      164
    ]
  },
  "dragon": {
    "label": "Dragon",
    "group": "Creatures",
    "color": "#dd8971",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      502,
      51,
      214,
      189
    ]
  },
  "construct": {
    "label": "Construct",
    "group": "Creatures",
    "color": "#a6bdc9",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      760,
      70,
      169,
      170
    ]
  },
  "aberration": {
    "label": "Aberration",
    "group": "Creatures",
    "color": "#c294e6",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      988,
      72,
      197,
      168
    ]
  },
  "celestial": {
    "label": "Celestial",
    "group": "Creatures",
    "color": "#f3de8b",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      1217,
      79,
      193,
      157
    ]
  },
  "elemental": {
    "label": "Elemental",
    "group": "Creatures",
    "color": "#6fcde1",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      39,
      314,
      201,
      181
    ]
  },
  "fey": {
    "label": "Fey",
    "group": "Creatures",
    "color": "#b5d780",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      271,
      323,
      214,
      172
    ]
  },
  "fiend": {
    "label": "Fiend",
    "group": "Creatures",
    "color": "#e67474",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      520,
      314,
      198,
      181
    ]
  },
  "giant": {
    "label": "Giant",
    "group": "Creatures",
    "color": "#cead8a",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      750,
      315,
      197,
      180
    ]
  },
  "humanoid": {
    "label": "Humanoid",
    "group": "Creatures",
    "color": "#d4b690",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      987,
      316,
      209,
      179
    ]
  },
  "monstrosity": {
    "label": "Monstrosity",
    "group": "Creatures",
    "color": "#b894d5",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      1229,
      331,
      195,
      164
    ]
  },
  "ooze": {
    "label": "Ooze",
    "group": "Creatures",
    "color": "#9dbf54",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      37,
      607,
      200,
      151
    ]
  },
  "plant": {
    "label": "Plant",
    "group": "Creatures",
    "color": "#78bf87",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      277,
      569,
      193,
      189
    ]
  },
  "demon": {
    "label": "Demon",
    "group": "Creatures",
    "color": "#c86f85",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      518,
      561,
      195,
      197
    ]
  },
  "devil": {
    "label": "Devil",
    "group": "Creatures",
    "color": "#d59864",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      758,
      564,
      172,
      194
    ]
  },
  "spirit": {
    "label": "Spirit",
    "group": "Creatures",
    "color": "#b4dbea",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      996,
      574,
      177,
      184
    ]
  },
  "parasite": {
    "label": "Parasite",
    "group": "Creatures",
    "color": "#93b786",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      1243,
      576,
      176,
      182
    ]
  },
  "swarm": {
    "label": "Swarm",
    "group": "Creatures",
    "color": "#c9b585",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      47,
      852,
      180,
      154
    ]
  },
  "boss": {
    "label": "Boss",
    "group": "Creatures",
    "color": "#e3c278",
    "file": "token-icons-creatures-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      263,
      816,
      231,
      190
    ]
  },
  "character": {
    "label": "Character",
    "group": "People and roles",
    "color": "#80bce7",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      39,
      100,
      281,
      280
    ]
  },
  "npc": {
    "label": "NPC",
    "group": "People and roles",
    "color": "#d9c796",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      350,
      101,
      254,
      276
    ]
  },
  "merchant": {
    "label": "Merchant",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      657,
      104,
      247,
      280
    ]
  },
  "guard": {
    "label": "Guard",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      951,
      39,
      269,
      339
    ]
  },
  "blacksmith": {
    "label": "Blacksmith",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      42,
      421,
      271,
      263
    ]
  },
  "healer": {
    "label": "Healer",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      361,
      426,
      244,
      242
    ]
  },
  "scholar": {
    "label": "Scholar",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      627,
      422,
      294,
      240
    ]
  },
  "noble": {
    "label": "Noble",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      965,
      437,
      236,
      238
    ]
  },
  "quest_giver": {
    "label": "Quest giver",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      40,
      713,
      264,
      241
    ]
  },
  "companion": {
    "label": "Companion",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      347,
      695,
      262,
      275
    ]
  },
  "loot": {
    "label": "Treasure",
    "group": "Map markers",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      640,
      717,
      270,
      237
    ]
  },
  "trap": {
    "label": "Trap",
    "group": "Map markers",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      958,
      745,
      255,
      189
    ]
  },
  "door": {
    "label": "Door",
    "group": "Map markers",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      51,
      954,
      241,
      270
    ]
  },
  "stairs": {
    "label": "Stairs",
    "group": "Map markers",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      350,
      999,
      247,
      217
    ]
  },
  "portal": {
    "label": "Portal",
    "group": "Map markers",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      639,
      956,
      286,
      265
    ]
  },
  "marker": {
    "label": "Location marker",
    "group": "Map markers",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      969,
      953,
      263,
      272
    ]
  },
  "class_barbarian": {
    "label": "Barbarian",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      31,
      68,
      352,
      285
    ]
  },
  "class_fighter": {
    "label": "Fighter",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      434,
      35,
      234,
      325
    ]
  },
  "class_paladin": {
    "label": "Paladin",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      738,
      25,
      324,
      333
    ]
  },
  "class_ranger": {
    "label": "Ranger",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      1093,
      29,
      324,
      336
    ]
  },
  "class_rogue": {
    "label": "Rogue",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      29,
      379,
      343,
      321
    ]
  },
  "class_monk": {
    "label": "Monk",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      408,
      394,
      293,
      323
    ],
    "clip": "400,370 734,370 734,717 620,717 620,700 400,700"
  },
  "class_bard": {
    "label": "Bard",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      745,
      376,
      301,
      341
    ]
  },
  "class_druid": {
    "label": "Druid",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      1087,
      386,
      344,
      309
    ]
  },
  "class_cleric": {
    "label": "Cleric",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      39,
      700,
      323,
      355
    ]
  },
  "class_wizard": {
    "label": "Wizard",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      369,
      704,
      365,
      348
    ],
    "clip": "369,717 480,717 480,704 620,704 620,727 734,727 734,1052 369,1052"
  },
  "class_sorcerer": {
    "label": "Sorcerer",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      754,
      705,
      292,
      343
    ]
  },
  "class_warlock": {
    "label": "Warlock",
    "group": "Character classes",
    "color": "#c8d2dc",
    "file": "token-icons-classes-v1.png",
    "width": 1448,
    "height": 1086,
    "crop": [
      1100,
      723,
      312,
      324
    ]
  },
  "innkeeper": {
    "label": "Innkeeper",
    "group": "People and roles",
    "file": "token-icons/innkeeper.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      41,
      91,
      323,
      215
    ],
    "originalColor": true
  },
  "mage": {
    "label": "Mage",
    "group": "People and roles",
    "file": "token-icons/mage.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      16,
      84,
      340,
      222
    ],
    "originalColor": true
  },
  "bandit": {
    "label": "Bandit",
    "group": "People and roles",
    "file": "token-icons/bandit.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      15,
      86,
      336,
      221
    ],
    "originalColor": true
  },
  "human": {
    "label": "Human",
    "group": "Races",
    "file": "token-icons/human.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      30,
      74,
      307,
      249
    ],
    "originalColor": true
  },
  "elf": {
    "label": "Elf",
    "group": "Races",
    "file": "token-icons/elf.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      33,
      82,
      301,
      226
    ],
    "originalColor": true
  },
  "dwarf": {
    "label": "Dwarf",
    "group": "Races",
    "file": "token-icons/dwarf.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      16,
      81,
      344,
      227
    ],
    "originalColor": true
  },
  "orc": {
    "label": "Orc",
    "group": "Races",
    "file": "token-icons/orc.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      27,
      78,
      330,
      227
    ],
    "originalColor": true
  },
  "gnome": {
    "label": "Gnome",
    "group": "Races",
    "file": "token-icons/gnome.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      51,
      71,
      298,
      241
    ],
    "originalColor": true
  },
  "halfling": {
    "label": "Halfling",
    "group": "Races",
    "file": "token-icons/halfling.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      34,
      84,
      277,
      231
    ],
    "originalColor": true
  },
  "half_orc": {
    "label": "Half-Orc",
    "group": "Races",
    "file": "token-icons/half_orc.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      28,
      85,
      330,
      214
    ],
    "originalColor": true
  },
  "half_elf": {
    "label": "Half-Elf",
    "group": "Races",
    "file": "token-icons/half_elf.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      26,
      88,
      300,
      207
    ],
    "originalColor": true
  },
  "tiefling": {
    "label": "Tiefling",
    "group": "Races",
    "file": "token-icons/tiefling.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      29,
      89,
      299,
      217
    ],
    "originalColor": true
  },
  "dragonborn": {
    "label": "Dragonborn",
    "group": "Races",
    "file": "token-icons/dragonborn.png",
    "color": "#8ed8ff",
    "width": 384,
    "height": 384,
    "crop": [
      27,
      83,
      331,
      228
    ],
    "originalColor": true
  },
  "questgiver": {
    "label": "Quest giver",
    "group": "People and roles",
    "color": "#c8d2dc",
    "file": "token-icons-roles-v1.png",
    "width": 1254,
    "height": 1254,
    "crop": [
      40,
      713,
      264,
      241
    ],
    "aliasOf": "quest_giver"
  }
};

let sequence=0;
const prefix='token-art-'+Math.random().toString(36).slice(2);
export function tokenColor(type,color) {
  return typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)?color.toLowerCase():TOKEN_ICONS[Object.hasOwn(TOKEN_ICONS,type)?type:'npc'].color;
}
export function tokenIcon(type,color) {
  const key=Object.hasOwn(TOKEN_ICONS,type)?type:'npc',icon=TOKEN_ICONS[key],tint=tokenColor(key,color);
  const id=prefix+'-'+(++sequence),[x,y,w,h]=icon.crop;
  const channels=[1,3,5].map(offset=>parseInt(tint.slice(offset,offset+2),16)/255);
  const ramp=n=>[0,n*.24,n*.6,n,n+(1-n)*.55].map(v=>v.toFixed(4)).join(' ');
  const mask=icon.clip?`<polygon points="${icon.clip}"/>`:`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  // Keep the approved blue artwork unchanged at its default color. Custom
  // colors tint luminance (including filled shapes), retaining shading/alpha.
  const filter=icon.originalColor&&tint===icon.color?'':` filter="url(#${id}-tint)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="vtt-symbol" data-icon="${key}" data-icon-color="${tint}" viewBox="${x} ${y} ${w} ${h}" aria-hidden="true" focusable="false"><defs><clipPath id="${id}-clip">${mask}</clipPath><filter id="${id}-tint" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="${ramp(channels[0])}"/><feFuncG type="table" tableValues="${ramp(channels[1])}"/><feFuncB type="table" tableValues="${ramp(channels[2])}"/></feComponentTransfer></filter></defs><image href="/assets/${icon.file}?v=0.31.2" width="${icon.width}" height="${icon.height}" clip-path="url(#${id}-clip)"${filter}/></svg>`;
}
export function characterIcon(className) {
  const key='class_'+String(className||'').trim().toLowerCase();
  return Object.hasOwn(TOKEN_ICONS,key)?key:'character';
}
