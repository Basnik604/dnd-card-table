
const CORE_CLASSES=new Set([
  "Barbarian","Bard","Cleric","Druid","Fighter","Monk",
  "Paladin","Ranger","Rogue","Sorcerer","Warlock","Wizard"
]);

const FEATURES_2024={
  Barbarian:{
    1:["Rage","Unarmored Defense","Weapon Mastery"],2:["Danger Sense","Reckless Attack"],
    3:["Barbarian Subclass","Primal Knowledge"],4:["Ability Score Improvement"],
    5:["Extra Attack","Fast Movement"],6:["Subclass feature"],7:["Feral Instinct","Instinctive Pounce"],
    8:["Ability Score Improvement"],9:["Brutal Strike"],10:["Subclass feature"],11:["Relentless Rage"],
    12:["Ability Score Improvement"],13:["Improved Brutal Strike"],14:["Subclass feature"],
    15:["Persistent Rage"],16:["Ability Score Improvement"],17:["Improved Brutal Strike"],
    18:["Indomitable Might"],19:["Epic Boon"],20:["Primal Champion"]
  },
  Bard:{
    1:["Bardic Inspiration","Spellcasting"],2:["Expertise","Jack of All Trades"],3:["Bard Subclass"],
    4:["Ability Score Improvement"],5:["Font of Inspiration"],6:["Subclass feature"],7:["Countercharm"],
    8:["Ability Score Improvement"],9:["Expertise"],10:["Magical Secrets"],12:["Ability Score Improvement"],
    14:["Subclass feature"],16:["Ability Score Improvement"],18:["Superior Inspiration"],19:["Epic Boon"],
    20:["Words of Creation"]
  },
  Cleric:{
    1:["Spellcasting","Divine Order"],2:["Channel Divinity"],3:["Cleric Subclass"],
    4:["Ability Score Improvement"],5:["Sear Undead"],6:["Subclass feature"],7:["Blessed Strikes"],
    8:["Ability Score Improvement"],10:["Divine Intervention"],12:["Ability Score Improvement"],
    14:["Improved Blessed Strikes"],16:["Ability Score Improvement"],17:["Subclass feature"],
    19:["Epic Boon"],20:["Greater Divine Intervention"]
  },
  Druid:{
    1:["Spellcasting","Druidic","Primal Order"],2:["Wild Shape","Wild Companion"],3:["Druid Subclass"],
    4:["Ability Score Improvement"],5:["Wild Resurgence"],6:["Subclass feature"],7:["Elemental Fury"],
    8:["Ability Score Improvement"],10:["Subclass feature"],12:["Ability Score Improvement"],
    14:["Subclass feature"],15:["Improved Elemental Fury"],16:["Ability Score Improvement"],
    18:["Beast Spells"],19:["Epic Boon"],20:["Archdruid"]
  },
  Fighter:{
    1:["Fighting Style","Second Wind","Weapon Mastery"],2:["Action Surge (one use)","Tactical Mind"],
    3:["Fighter Subclass"],4:["Ability Score Improvement"],5:["Extra Attack","Tactical Shift"],
    6:["Ability Score Improvement"],7:["Subclass feature"],8:["Ability Score Improvement"],
    9:["Indomitable (one use)","Tactical Master"],10:["Subclass feature"],11:["Two Extra Attacks"],
    12:["Ability Score Improvement"],13:["Indomitable (two uses)","Studied Attacks"],
    14:["Ability Score Improvement"],15:["Subclass feature"],16:["Ability Score Improvement"],
    17:["Action Surge (two uses)","Indomitable (three uses)"],18:["Subclass feature"],
    19:["Epic Boon"],20:["Three Extra Attacks"]
  },
  Monk:{
    1:["Martial Arts","Unarmored Defense"],2:["Monk's Focus","Unarmored Movement","Uncanny Metabolism"],
    3:["Deflect Attacks","Monk Subclass"],4:["Ability Score Improvement","Slow Fall"],
    5:["Extra Attack","Stunning Strike"],6:["Empowered Strikes","Subclass feature"],7:["Evasion"],
    8:["Ability Score Improvement"],9:["Acrobatic Movement"],10:["Heightened Focus","Self-Restoration"],
    11:["Subclass feature"],12:["Ability Score Improvement"],13:["Deflect Energy"],14:["Disciplined Survivor"],
    15:["Perfect Focus"],16:["Ability Score Improvement"],17:["Subclass feature"],18:["Superior Defense"],
    19:["Epic Boon"],20:["Body and Mind"]
  },
  Paladin:{
    1:["Lay On Hands","Spellcasting","Weapon Mastery"],2:["Fighting Style","Paladin's Smite"],
    3:["Channel Divinity","Paladin Subclass"],4:["Ability Score Improvement"],
    5:["Extra Attack","Faithful Steed"],6:["Aura of Protection"],7:["Subclass feature"],
    8:["Ability Score Improvement"],9:["Abjure Foes"],10:["Aura of Courage"],11:["Radiant Strikes"],
    12:["Ability Score Improvement"],14:["Restoring Touch"],15:["Subclass feature"],
    16:["Ability Score Improvement"],18:["Aura Expansion"],19:["Epic Boon"],20:["Subclass feature"]
  },
  Ranger:{
    1:["Spellcasting","Favored Enemy","Weapon Mastery"],2:["Deft Explorer","Fighting Style"],
    3:["Ranger Subclass"],4:["Ability Score Improvement"],5:["Extra Attack"],6:["Roving"],
    7:["Subclass feature"],8:["Ability Score Improvement"],9:["Expertise"],10:["Tireless"],
    11:["Subclass feature"],12:["Ability Score Improvement"],13:["Relentless Hunter"],14:["Nature's Veil"],
    15:["Subclass feature"],16:["Ability Score Improvement"],17:["Precise Hunter"],18:["Feral Senses"],
    19:["Epic Boon"],20:["Foe Slayer"]
  },
  Rogue:{
    1:["Expertise","Sneak Attack","Thieves' Cant","Weapon Mastery"],2:["Cunning Action"],
    3:["Rogue Subclass","Steady Aim"],4:["Ability Score Improvement"],5:["Cunning Strike","Uncanny Dodge"],
    6:["Expertise"],7:["Evasion","Reliable Talent"],8:["Ability Score Improvement"],9:["Subclass feature"],
    10:["Ability Score Improvement"],11:["Improved Cunning Strike"],12:["Ability Score Improvement"],
    13:["Subclass feature"],14:["Devious Strikes"],15:["Slippery Mind"],16:["Ability Score Improvement"],
    17:["Subclass feature"],18:["Elusive"],19:["Epic Boon"],20:["Stroke of Luck"]
  },
  Sorcerer:{
    1:["Spellcasting","Innate Sorcery"],2:["Font of Magic","Metamagic"],3:["Sorcerer Subclass"],
    4:["Ability Score Improvement"],5:["Sorcerous Restoration"],6:["Subclass feature"],7:["Sorcery Incarnate"],
    8:["Ability Score Improvement"],10:["Metamagic"],12:["Ability Score Improvement"],14:["Subclass feature"],
    16:["Ability Score Improvement"],17:["Metamagic"],18:["Subclass feature"],19:["Epic Boon"],
    20:["Arcane Apotheosis"]
  },
  Warlock:{
    1:["Eldritch Invocations","Pact Magic"],2:["Magical Cunning"],3:["Warlock Subclass"],
    4:["Ability Score Improvement"],6:["Subclass feature"],8:["Ability Score Improvement"],9:["Contact Patron"],
    10:["Subclass feature"],11:["Mystic Arcanum (level 6 spell)"],12:["Ability Score Improvement"],
    13:["Mystic Arcanum (level 7 spell)"],14:["Subclass feature"],15:["Mystic Arcanum (level 8 spell)"],
    16:["Ability Score Improvement"],17:["Mystic Arcanum (level 9 spell)"],19:["Epic Boon"],20:["Eldritch Master"]
  },
  Wizard:{
    1:["Spellcasting","Ritual Adept","Arcane Recovery"],2:["Scholar"],3:["Wizard Subclass"],
    4:["Ability Score Improvement"],5:["Memorize Spell"],6:["Subclass feature"],8:["Ability Score Improvement"],
    10:["Subclass feature"],12:["Ability Score Improvement"],14:["Subclass feature"],
    16:["Ability Score Improvement"],18:["Spell Mastery"],19:["Epic Boon"],20:["Signature Spells"]
  }
};

const FEATURES_2014={
  Barbarian:{
    1:["Rage","Unarmored Defense"],2:["Reckless Attack","Danger Sense"],3:["Primal Path"],
    4:["Ability Score Improvement"],5:["Extra Attack","Fast Movement"],6:["Path feature"],7:["Feral Instinct"],
    8:["Ability Score Improvement"],9:["Brutal Critical (1 die)"],10:["Path feature"],11:["Relentless Rage"],
    12:["Ability Score Improvement"],13:["Brutal Critical (2 dice)"],14:["Path feature"],15:["Persistent Rage"],
    16:["Ability Score Improvement"],17:["Brutal Critical (3 dice)"],18:["Indomitable Might"],
    19:["Ability Score Improvement"],20:["Primal Champion"]
  },
  Bard:{
    1:["Bardic Inspiration","Spellcasting"],2:["Jack of All Trades","Song of Rest"],
    3:["Bard College","Expertise"],4:["Ability Score Improvement"],5:["Font of Inspiration"],
    6:["Countercharm","College feature"],8:["Ability Score Improvement"],9:["Song of Rest Improvement"],
    10:["Bardic Inspiration Improvement","Expertise","Magical Secrets"],12:["Ability Score Improvement"],
    13:["Song of Rest Improvement"],14:["Magical Secrets","College feature"],
    15:["Bardic Inspiration Improvement"],16:["Ability Score Improvement"],17:["Song of Rest Improvement"],
    18:["Magical Secrets"],19:["Ability Score Improvement"],20:["Superior Inspiration"]
  },
  Cleric:{
    1:["Spellcasting","Divine Domain"],2:["Channel Divinity","Domain feature"],
    4:["Ability Score Improvement"],5:["Destroy Undead (CR 1/2)"],6:["Channel Divinity Improvement","Domain feature"],
    8:["Ability Score Improvement","Destroy Undead (CR 1)","Domain feature"],
    10:["Divine Intervention"],11:["Destroy Undead (CR 2)"],12:["Ability Score Improvement"],
    14:["Destroy Undead (CR 3)"],16:["Ability Score Improvement"],
    17:["Destroy Undead (CR 4)","Domain feature"],18:["Channel Divinity Improvement"],
    19:["Ability Score Improvement"],20:["Divine Intervention Improvement"]
  },
  Druid:{
    1:["Druidic","Spellcasting"],2:["Druid Circle","Wild Shape"],
    4:["Wild Shape Improvement","Ability Score Improvement"],6:["Druid Circle feature"],
    8:["Wild Shape Improvement","Ability Score Improvement"],10:["Druid Circle feature"],
    12:["Ability Score Improvement"],14:["Druid Circle feature"],16:["Ability Score Improvement"],
    18:["Timeless Body","Beast Spells"],19:["Ability Score Improvement"],20:["Archdruid"]
  },
  Fighter:{
    1:["Fighting Style","Second Wind"],2:["Action Surge (one use)"],3:["Martial Archetype"],
    4:["Ability Score Improvement"],5:["Extra Attack (two attacks)"],6:["Ability Score Improvement"],
    7:["Archetype feature"],8:["Ability Score Improvement"],9:["Indomitable (one use)"],
    10:["Archetype feature"],11:["Extra Attack (three attacks)"],12:["Ability Score Improvement"],
    13:["Indomitable (two uses)"],14:["Ability Score Improvement"],15:["Archetype feature"],
    16:["Ability Score Improvement"],17:["Action Surge (two uses)","Indomitable (three uses)"],
    18:["Archetype feature"],19:["Ability Score Improvement"],20:["Extra Attack (four attacks)"]
  },
  Monk:{
    1:["Unarmored Defense","Martial Arts"],2:["Ki","Unarmored Movement"],3:["Monastic Tradition","Deflect Missiles"],
    4:["Ability Score Improvement","Slow Fall"],5:["Extra Attack","Stunning Strike"],
    6:["Ki-Empowered Strikes","Tradition feature"],7:["Evasion","Stillness of Mind"],
    8:["Ability Score Improvement"],9:["Unarmored Movement Improvement"],10:["Purity of Body"],
    11:["Tradition feature"],12:["Ability Score Improvement"],13:["Tongue of the Sun and Moon"],
    14:["Diamond Soul"],15:["Timeless Body"],16:["Ability Score Improvement"],
    17:["Tradition feature"],18:["Empty Body"],19:["Ability Score Improvement"],20:["Perfect Self"]
  },
  Paladin:{
    1:["Divine Sense","Lay on Hands"],2:["Fighting Style","Spellcasting","Divine Smite"],
    3:["Divine Health","Sacred Oath"],4:["Ability Score Improvement"],5:["Extra Attack"],
    6:["Aura of Protection"],7:["Sacred Oath feature"],8:["Ability Score Improvement"],
    10:["Aura of Courage"],11:["Improved Divine Smite"],12:["Ability Score Improvement"],
    14:["Cleansing Touch"],15:["Sacred Oath feature"],16:["Ability Score Improvement"],
    18:["Aura Improvements"],19:["Ability Score Improvement"],20:["Sacred Oath feature"]
  },
  Ranger:{
    1:["Favored Enemy","Natural Explorer"],2:["Fighting Style","Spellcasting"],
    3:["Ranger Archetype","Primeval Awareness"],4:["Ability Score Improvement"],5:["Extra Attack"],
    6:["Favored Enemy Improvement","Natural Explorer Improvement"],7:["Archetype feature"],
    8:["Ability Score Improvement","Land's Stride"],10:["Natural Explorer Improvement","Hide in Plain Sight"],
    11:["Archetype feature"],12:["Ability Score Improvement"],14:["Favored Enemy Improvement","Vanish"],
    15:["Archetype feature"],16:["Ability Score Improvement"],18:["Feral Senses"],
    19:["Ability Score Improvement"],20:["Foe Slayer"]
  },
  Rogue:{
    1:["Expertise","Sneak Attack","Thieves' Cant"],2:["Cunning Action"],3:["Roguish Archetype"],
    4:["Ability Score Improvement"],5:["Uncanny Dodge"],6:["Expertise"],7:["Evasion"],
    8:["Ability Score Improvement"],9:["Archetype feature"],10:["Ability Score Improvement"],
    11:["Reliable Talent"],12:["Ability Score Improvement"],13:["Archetype feature"],14:["Blindsense"],
    15:["Slippery Mind"],16:["Ability Score Improvement"],17:["Archetype feature"],18:["Elusive"],
    19:["Ability Score Improvement"],20:["Stroke of Luck"]
  },
  Sorcerer:{
    1:["Spellcasting","Sorcerous Origin"],2:["Font of Magic"],3:["Metamagic"],
    4:["Ability Score Improvement"],6:["Origin feature"],8:["Ability Score Improvement"],
    10:["Metamagic"],12:["Ability Score Improvement"],14:["Origin feature"],
    16:["Ability Score Improvement"],17:["Metamagic"],18:["Origin feature"],
    19:["Ability Score Improvement"],20:["Sorcerous Restoration"]
  },
  Warlock:{
    1:["Otherworldly Patron","Pact Magic"],2:["Eldritch Invocations"],3:["Pact Boon"],
    4:["Ability Score Improvement"],6:["Patron feature"],8:["Ability Score Improvement"],
    10:["Patron feature"],11:["Mystic Arcanum (6th level)"],12:["Ability Score Improvement"],
    13:["Mystic Arcanum (7th level)"],14:["Patron feature"],15:["Mystic Arcanum (8th level)"],
    16:["Ability Score Improvement"],17:["Mystic Arcanum (9th level)"],
    19:["Ability Score Improvement"],20:["Eldritch Master"]
  },
  Wizard:{
    1:["Spellcasting","Arcane Recovery"],2:["Arcane Tradition"],4:["Ability Score Improvement"],
    6:["Tradition feature"],8:["Ability Score Improvement"],10:["Tradition feature"],
    12:["Ability Score Improvement"],14:["Tradition feature"],16:["Ability Score Improvement"],
    18:["Spell Mastery"],19:["Ability Score Improvement"],20:["Signature Spells"]
  }
};

const FULL_SLOTS=[
  null,{1:2},{1:3},{1:4,2:2},{1:4,2:3},{1:4,2:3,3:2},{1:4,2:3,3:3},
  {1:4,2:3,3:3,4:1},{1:4,2:3,3:3,4:2},{1:4,2:3,3:3,4:3,5:1},
  {1:4,2:3,3:3,4:3,5:2},{1:4,2:3,3:3,4:3,5:2,6:1},{1:4,2:3,3:3,4:3,5:2,6:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1},{1:4,2:3,3:3,4:3,5:2,6:1,7:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1,8:1},{1:4,2:3,3:3,4:3,5:2,6:1,7:1,8:1},
  {1:4,2:3,3:3,4:3,5:2,6:1,7:1,8:1,9:1},{1:4,2:3,3:3,4:3,5:3,6:1,7:1,8:1,9:1},
  {1:4,2:3,3:3,4:3,5:3,6:2,7:1,8:1,9:1},{1:4,2:3,3:3,4:3,5:3,6:2,7:2,8:1,9:1}
];
const HALF_2024=[
  null,{1:2},{1:2},{1:3},{1:3},{1:4,2:2},{1:4,2:2},{1:4,2:3},{1:4,2:3},
  {1:4,2:3,3:2},{1:4,2:3,3:2},{1:4,2:3,3:3},{1:4,2:3,3:3},{1:4,2:3,3:3,4:1},
  {1:4,2:3,3:3,4:1},{1:4,2:3,3:3,4:2},{1:4,2:3,3:3,4:2},{1:4,2:3,3:3,4:3,5:1},
  {1:4,2:3,3:3,4:3,5:1},{1:4,2:3,3:3,4:3,5:2},{1:4,2:3,3:3,4:3,5:2}
];
const HALF_2014=[
  null,{}, {1:2},{1:3},{1:3},{1:4,2:2},{1:4,2:2},{1:4,2:3},{1:4,2:3},
  {1:4,2:3,3:2},{1:4,2:3,3:2},{1:4,2:3,3:3},{1:4,2:3,3:3},{1:4,2:3,3:3,4:1},
  {1:4,2:3,3:3,4:1},{1:4,2:3,3:3,4:2},{1:4,2:3,3:3,4:2},{1:4,2:3,3:3,4:3,5:1},
  {1:4,2:3,3:3,4:3,5:1},{1:4,2:3,3:3,4:3,5:2},{1:4,2:3,3:3,4:3,5:2}
];
const PACT=[
  null,{slots:1,slotLevel:1},{slots:2,slotLevel:1},{slots:2,slotLevel:2},{slots:2,slotLevel:2},
  {slots:2,slotLevel:3},{slots:2,slotLevel:3},{slots:2,slotLevel:4},{slots:2,slotLevel:4},
  {slots:2,slotLevel:5},{slots:2,slotLevel:5},{slots:3,slotLevel:5},{slots:3,slotLevel:5},
  {slots:3,slotLevel:5},{slots:3,slotLevel:5},{slots:3,slotLevel:5},{slots:3,slotLevel:5},
  {slots:4,slotLevel:5},{slots:4,slotLevel:5},{slots:4,slotLevel:5},{slots:4,slotLevel:5}
];

const LIMITS_2024={
  Bard:{cantrips:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]},
  Cleric:{cantrips:[0,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]},
  Druid:{cantrips:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]},
  Paladin:{cantrips:Array(21).fill(0),prepared:[0,2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]},
  Ranger:{cantrips:Array(21).fill(0),prepared:[0,2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]},
  Sorcerer:{cantrips:[0,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],prepared:[0,2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]},
  Warlock:{cantrips:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],prepared:[0,2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]},
  Wizard:{cantrips:[0,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],prepared:[0,4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25]}
};

function slotsText(slots){
  const rows=Object.entries(slots||{}).filter(([,count])=>Number(count)>0);
  return rows.length?rows.map(([level,count])=>`${level}:${count}`).join(" · "):"—";
}
function spellData2024(name,level){
  const limits=LIMITS_2024[name];
  if(!limits)return {};
  const slots=name==="Warlock"?null:(["Paladin","Ranger"].includes(name)?HALF_2024[level]:FULL_SLOTS[level]);
  const out={};
  if((limits.cantrips?.[level]||0)>0)out.Cantrips=limits.cantrips[level];
  if((limits.prepared?.[level]||0)>0)out.Prepared=limits.prepared[level];
  if(slots&&Object.keys(slots).length)out.Slots=slotsText(slots);
  if(name==="Warlock"){
    const pact=PACT[level];
    if(pact){out.Invocations=[0,1,3,3,3,5,5,6,6,7,7,7,8,8,8,9,9,9,10,10,10][level]||0;out["Pact Slots"]=`${pact.slots} × L${pact.slotLevel}`;}
  }
  return out;
}
function spellData2014(name,level){
  const out={};
  if(["Bard","Cleric","Druid","Sorcerer","Wizard"].includes(name)){
    out.Slots=slotsText(FULL_SLOTS[level]);
    const cantrips={
      Bard:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
      Cleric:[0,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
      Druid:[0,2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
      Sorcerer:[0,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
      Wizard:[0,3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
    }[name];
    if(cantrips)out.Cantrips=cantrips[level];
  }else if(["Paladin","Ranger"].includes(name)){
    const slots=HALF_2014[level];if(slots&&Object.keys(slots).length)out.Slots=slotsText(slots);
  }else if(name==="Warlock"){
    const pact=PACT[level];
    if(pact){out["Pact Slots"]=`${pact.slots} × L${pact.slotLevel}`;out.Cantrips=level<4?2:level<10?3:4;out.Invocations=[0,0,2,2,2,3,3,4,4,5,5,5,6,6,6,7,7,7,8,8,8][level]||0;}
  }
  return out;
}

export function coreClassFeatures(name,ruleset,level){
  const source=ruleset==="dnd5e-2024"?FEATURES_2024:ruleset==="dnd5e-2014"?FEATURES_2014:null;
  return [...(source?.[name]?.[Number(level)]||[])];
}

export function coreClassProgressionData(name,ruleset,level){
  level=Math.max(1,Math.min(20,Number(level)||1));
  if(!CORE_CLASSES.has(name))return {};
  const out=ruleset==="dnd5e-2024"?spellData2024(name,level):ruleset==="dnd5e-2014"?spellData2014(name,level):{};
  if(ruleset==="dnd5e-2024"){
    if(name==="Barbarian"){out.Rages=[0,2,2,3,3,3,4,4,4,4,4,4,5,5,5,5,5,6,6,6,6][level];out["Rage Damage"]=level<9?"+2":level<16?"+3":"+4";out["Weapon Mastery"]=level<4?2:level<10?3:4;}
    if(name==="Bard")out["Bardic Die"]=level<5?"d6":level<10?"d8":level<15?"d10":"d12";
    if(name==="Cleric")out["Channel Divinity"]=level<2?"—":level<6?2:level<18?3:4;
    if(name==="Druid")out["Wild Shape"]=level<2?"—":level<6?2:level<17?3:4;
    if(name==="Fighter"){out["Second Wind"]=level<4?2:level<10?3:4;out["Weapon Mastery"]=level<4?3:level<10?4:level<16?5:6;out.Attacks=level<5?1:level<11?2:level<20?3:4;}
    if(name==="Monk"){out["Martial Arts"]=level<5?"d6":level<11?"d8":level<17?"d10":"d12";if(level>=2)out["Focus Points"]=level;out.Movement=level<2?"—":level<6?"+10 ft":level<10?"+15 ft":level<14?"+20 ft":level<18?"+25 ft":"+30 ft";}
    if(name==="Paladin"){out["Lay on Hands"]=level*5;if(level>=3)out["Channel Divinity"]=level<11?2:3;}
    if(name==="Ranger")out["Favored Enemy"]=level<5?2:level<9?3:level<13?4:level<17?5:6;
    if(name==="Rogue")out["Sneak Attack"]=`${Math.ceil(level/2)}d6`;
    if(name==="Sorcerer"&&level>=2)out["Sorcery Points"]=level;
  }else if(ruleset==="dnd5e-2014"){
    if(name==="Barbarian"){out.Rages=level===20?"Unlimited":[0,2,2,3,3,3,4,4,4,4,4,4,5,5,5,5,5,6,6,6,6][level];out["Rage Damage"]=level<9?"+2":level<16?"+3":"+4";}
    if(name==="Bard"){out["Bardic Die"]=level<5?"d6":level<10?"d8":level<15?"d10":"d12";if(level>=2)out["Song of Rest"]=level<9?"d6":level<13?"d8":level<17?"d10":"d12";}
    if(name==="Cleric"){if(level>=2)out["Channel Divinity"]=level<6?1:level<18?2:3;if(level>=5)out["Destroy Undead"]=level<8?"CR 1/2":level<11?"CR 1":level<14?"CR 2":level<17?"CR 3":"CR 4";}
    if(name==="Druid"&&level>=2)out["Wild Shape"]=level<4?"CR 1/4 · no swim/fly":level<8?"CR 1/2 · no fly":"CR 1";
    if(name==="Fighter"){out.Attacks=level<5?1:level<11?2:level<20?3:4;if(level>=2)out["Action Surge"]=level<17?1:2;if(level>=9)out.Indomitable=level<13?1:level<17?2:3;}
    if(name==="Monk"){out["Martial Arts"]=level<5?"d4":level<11?"d6":level<17?"d8":"d10";if(level>=2){out.Ki=level;out.Movement=level<6?"+10 ft":level<10?"+15 ft":level<14?"+20 ft":level<18?"+25 ft":"+30 ft";}}
    if(name==="Paladin")out["Lay on Hands"]=level*5;
    if(name==="Ranger"){out["Favored Enemies"]=level<6?1:level<14?2:3;out["Favored Terrains"]=level<6?1:level<10?2:3;}
    if(name==="Rogue")out["Sneak Attack"]=`${Math.ceil(level/2)}d6`;
    if(name==="Sorcerer"){if(level>=2)out["Sorcery Points"]=level;if(level>=3)out.Metamagic=level<10?2:level<17?3:4;}
  }
  return out;
}

export function progressionAnchorTarget(name){
  const raw=String(name||"").trim();
  const lower=raw.toLowerCase();
  if(lower.includes("subclass feature")||lower.includes("college feature")||lower.includes("domain feature")||lower.includes("path feature")||lower.includes("tradition feature")||lower.includes("archetype feature")||lower.includes("origin feature")||lower.includes("patron feature")||lower.includes("druid circle feature")||lower==="bard college"||lower==="druid circle"||lower==="divine domain"||lower==="primal path"||lower==="martial archetype"||lower==="monastic tradition"||lower==="sacred oath"||lower==="ranger archetype"||lower==="roguish archetype"||lower==="sorcerous origin"||lower==="otherworldly patron"||lower==="arcane tradition")return "#class-subclasses";
  const aliases=[
    [/wild shape improvement/i,"Wild Shape"],[/bardic inspiration improvement/i,"Bardic Inspiration"],
    [/song of rest improvement/i,"Song of Rest"],[/channel divinity improvement/i,"Channel Divinity"],
    [/divine intervention improvement/i,"Divine Intervention"],[/favored enemy improvement/i,"Favored Enemy"],
    [/natural explorer improvement/i,"Natural Explorer"],[/brutal critical/i,"Brutal Critical"],
    [/extra attack/i,"Extra Attack"],[/indomitable/i,"Indomitable"],[/action surge/i,"Action Surge"],
    [/mystic arcanum/i,"Mystic Arcanum"]
  ];
  for(const [pattern,target] of aliases)if(pattern.test(raw))return target;
  return raw.replace(/\s*\([^)]*\)\s*$/,"").trim();
}

function rulesetRank(row){
  const ruleset=String(row?.ruleset||"");
  const source=String(row?.source_key||"");
  if(ruleset==="dnd5e-2024"&&source==="srd-2024")return 0;
  if(ruleset==="dnd5e-2024")return 10;
  if(ruleset==="dnd5e-2014"&&source==="srd-2014")return 20;
  if(ruleset==="dnd5e-2014")return 30;
  if(ruleset==="a5e")return 40;
  return 50;
}

export function groupClassVariants(rows){
  const groups=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const key=String(row?.name_en||row?.name||"").trim().toLowerCase();
    if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  const out=[];
  for(const variants of groups.values()){
    variants.sort((a,b)=>rulesetRank(a)-rulesetRank(b)||String(a.source_name||"").localeCompare(String(b.source_name||"")));
    out.push({...variants[0],variants:[...variants]});
  }
  return out.sort((a,b)=>String(a.name_en||a.name||"").localeCompare(String(b.name_en||b.name||"")));
}

export function compactRulesetLabel(value){
  if(value==="dnd5e-2024")return "5e 2024";
  if(value==="dnd5e-2014")return "5e 2014";
  if(value==="a5e")return "A5E";
  return String(value||"compatible");
}
