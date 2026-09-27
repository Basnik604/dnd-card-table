/*
  Russian game-term catalog for D&D Card Table.

  Policy:
  - English records in the local DB remain canonical and are never overwritten.
  - This file only supplies display names/terms for entities that already exist locally.
  - 2024 terminology is aligned to next.dnd.su where a matching entry is available.
  - 2014 terminology may reuse the same established Russian name, while ruleset metadata
    remains separate in the database.
  - Long rules prose is intentionally NOT copied from third-party sites. Descriptions are
    translated independently from the canonical English record in later translation packs.
*/

export const RU_GAME_EXACT = Object.freeze({
  // Core classes (2024 naming aligned to next.dnd.su)
  "Artificer":"Артефактор",
  "Bard":"Бард",
  "Barbarian":"Варвар",
  "Cleric":"Жрец",
  "Druid":"Друид",
  "Fighter":"Воин",
  "Monk":"Монах",
  "Paladin":"Паладин",
  "Ranger":"Следопыт",
  "Rogue":"Плут",
  "Sorcerer":"Чародей",
  "Warlock":"Колдун",
  "Wizard":"Волшебник",

  // PHB 2024 species naming aligned to next.dnd.su
  "Aasimar":"Аасимар",
  "Dragonborn":"Драконорождённый",
  "Dwarf":"Дварф",
  "Elf":"Эльф",
  "Gnome":"Гном",
  "Goliath":"Голиаф",
  "Halfling":"Полурослик",
  "Human":"Человек",
  "Orc":"Орк",
  "Tiefling":"Тифлинг",

  // Additional current species visible in the 2024 reference catalog.
  "Changeling":"Ченжлинг",
  "Dhampir":"Дампир",
  "Hexblood":"Ведьмовская кровь",
  "Kalashtar":"Калаштар",
  "Khoravar":"Кхоравар",
  "Reborn":"Возрождённый",
  "Shifter":"Шифтер",
  "Warforged":"Кованый",

  // Established legacy species / origins from the 5e14 DnD.su catalog.
  // These names are edition-stable enough to use as generic display aliases.
  "Aarakocra":"Ааракокра",
  "Autognome":"Автогном",
  "Astral Elf":"Астральный эльф",
  "Astral elf":"Астральный эльф",
  "Bugbear":"Багбир",
  "Vedalken":"Ведалкен",
  "Verdan":"Вердан",
  "Simic Hybrid":"Гибрид Симиков",
  "Simic hybrid":"Гибрид Симиков",
  "Gith":"Гит",
  "Giff":"Гифф",
  "Goblin":"Гоблин",
  "Grung":"Грунг",
  "Genasi":"Дженази",
  "Harengon":"Зайцегон",
  "Kender":"Кендер",
  "Kenku":"Кенку",
  "Centaur":"Кентавр",
  "Kobold":"Кобольд",
  "Leonin":"Леонин",
  "Locathah":"Локата",
  "Loxodon":"Локсодон",
  "Lizardfolk":"Людоящер",
  "Minotaur":"Минотавр",
  "Plasmoid":"Плазмоид",
  "Half-Orc":"Полуорк",
  "Half-orc":"Полуорк",
  "Half-Elf":"Полуэльф",
  "Half-elf":"Полуэльф",
  "Satyr":"Сатир",
  "Owlin":"Совлин",
  "Tabaxi":"Табакси",
  "Tortle":"Тортл",
  "Thri-kreen":"Три-крин",
  "Thri-Kreen":"Три-крин",
  "Triton":"Тритон",
  "Firbolg":"Фирболг",
  "Fairy":"Фэйри",
  "Hadozee":"Хадози",
  "Hobgoblin":"Хобгоблин",
  "Yuan-ti Pureblood":"Юань-ти",
  "Yuan-Ti":"Юань-ти",
  "Deep Gnome":"Глубинный гном",
  "Duergar":"Дуэргар",
  "Sea Elf":"Морской эльф",
  "Shadar-Kai":"Шадар-кай",
  "Eladrin":"Эладрин",
  "Custom Lineage":"Своё происхождение",
  "Custom lineage":"Своё происхождение",

  // PHB 2024 backgrounds aligned to next.dnd.su.
  "Acolyte":"Послушник",
  "Artisan":"Ремесленник",
  "Charlatan":"Шарлатан",
  "Criminal":"Преступник",
  "Entertainer":"Артист",
  "Farmer":"Фермер",
  "Guard":"Стражник",
  "Guide":"Проводник",
  "Hermit":"Отшельник",
  "Merchant":"Торговец",
  "Noble":"Дворянин",
  "Sage":"Мудрец",
  "Sailor":"Моряк",
  "Scribe":"Писарь",
  "Soldier":"Солдат",
  "Wayfarer":"Бродяга",

  // SRD / core feats whose names were checked against the 2024 Russian reference.
  "Ability Score Improvement":"Увеличение характеристик",
  "Alert":"Бдительный",
  "Archery":"Стрельба",
  "Boon of Combat Prowess":"Дар боевой удали",
  "Boon of Dimensional Travel":"Дар межпространственного перемещения",
  "Boon of Fate":"Дар судьбы",
  "Boon of Irresistible Offense":"Дар неотразимого нападения",
  "Boon of Spell Recall":"Дар восстановления заклинаний",
  "Boon of the Night Spirit":"Дар ночного духа",
  "Boon of Truesight":"Дар истинного зрения",
  "Defense":"Оборона",
  "Grappler":"Борец",
  "Magic Initiate":"Посвящённый в магию",
  "Savage Attacker":"Неистово атакующий",
  "Skilled":"Одарённый",
  "Great Weapon Fighting":"Сражение большим оружием",
  "Two-Weapon Fighting":"Сражение двумя оружиями",

  // Established 5e14 feat names that do not collide with another entity category.
  "Actor":"Артистичный",
  "Athlete":"Атлетичный",
  "War Caster":"Боевой заклинатель",
  "Lucky":"Везунчик",
  "Mounted Combatant":"Верховой боец",
  "Observant":"Внимательный",
  "Martial Adept":"Воинский адепт",
  "Inspiring Leader":"Воодушевляющий лидер",
  "Tavern Brawler":"Драчун",
  "Lightly Armored":"Знаток лёгких доспехов",
  "Moderately Armored":"Знаток средних доспехов",
  "Heavily Armored":"Знаток тяжёлых доспехов",
  "Dual Wielder":"Использование двух оружий",
  "Dungeon Delver":"Исследователь подземелий",
  "Tough":"Крепкий",
  "Healer":"Лекарь",
  "Great Weapon Master":"Мастер большого оружия",
  "Polearm Master":"Мастер древкового оружия",
  "Weapon Master":"Мастер оружия",
  "Medium Armor Master":"Мастер средних доспехов",
  "Heavy Armor Master":"Мастер тяжёлых доспехов",
  "Shield Master":"Мастер щитов",
  "Spell Sniper":"Меткие заклинания",
  "Sharpshooter":"Меткий стрелок",
  "Charger":"Налётчик",
  "Defensive Duelist":"Оборонительный дуэлянт",
  "Keen Mind":"Отличная память",
  "Mobile":"Подвижный",
  "Skulker":"Проныра",
  "Ritual Caster":"Ритуальный заклинатель",
  "Elemental Adept":"Стихийный адепт",
  "Durable":"Стойкий",
  "Sentinel":"Страж",
  "Mage Slayer":"Убийца магов",
  "Resilient":"Устойчивый",
  "Crossbow Expert":"Эксперт в арбалетах",
  "Linguist":"Языковед",

  // Ability scores.
  "Strength":"Сила",
  "Dexterity":"Ловкость",
  "Constitution":"Телосложение",
  "Intelligence":"Интеллект",
  "Wisdom":"Мудрость",
  "Charisma":"Харизма",

  // Skills. D&D.su 2024 glossary uses «Тайная магия» for Arcana.
  "Acrobatics":"Акробатика",
  "Animal Handling":"Уход за животными",
  "Arcana":"Тайная магия",
  "Athletics":"Атлетика",
  "Deception":"Обман",
  "History":"История",
  "Insight":"Проницательность",
  "Intimidation":"Запугивание",
  "Investigation":"Расследование",
  "Medicine":"Медицина",
  "Nature":"Природа",
  "Perception":"Восприятие",
  "Performance":"Выступление",
  "Persuasion":"Убеждение",
  "Religion":"Религия",
  "Sleight of Hand":"Ловкость рук",
  "Stealth":"Скрытность",
  "Survival":"Выживание",

  // Spell schools (2024 site terminology).
  "Abjuration":"Ограждение",
  "Conjuration":"Призыв",
  "Divination":"Прорицание",
  "Enchantment":"Очарование",
  "Evocation":"Воплощение",
  "Illusion":"Иллюзия",
  "Necromancy":"Некромантия",
  "Transmutation":"Преобразование",

  // Conditions (2024 glossary / combat article terminology).
  "Blinded":"Ослеплённый",
  "Charmed":"Очарованный",
  "Deafened":"Оглохший",
  "Exhaustion":"Истощение",
  "Frightened":"Испуганный",
  "Grappled":"Схваченный",
  "Incapacitated":"Недееспособный",
  "Invisible":"Невидимый",
  "Paralyzed":"Парализованный",
  "Petrified":"Окаменевший",
  "Poisoned":"Отравленный",
  "Prone":"Опрокинутый",
  "Restrained":"Опутанный",
  "Stunned":"Ошеломлённый",
  "Unconscious":"Бессознательный",

  // Damage types / common senses.
  "Acid":"Кислота",
  "Bludgeoning":"Дробящий",
  "Cold":"Холод",
  "Fire":"Огонь",
  "Force":"Силовой",
  "Lightning":"Электричество",
  "Necrotic":"Некротический",
  "Piercing":"Колющий",
  "Poison":"Яд",
  "Psychic":"Психический",
  "Radiant":"Излучение",
  "Slashing":"Рубящий",
  "Thunder":"Звук",
  "Blindsight":"Слепое зрение",
  "Darkvision":"Тёмное зрение",
  "Truesight":"Истинное зрение",

  // Sizes and creature types.
  "Tiny":"Крошечный",
  "Small":"Маленький",
  "Medium":"Средний",
  "Large":"Большой",
  "Huge":"Огромный",
  "Gargantuan":"Громадный",
  "Aberration":"Аберрация",
  "Beast":"Зверь",
  "Celestial":"Небожитель",
  "Construct":"Конструкт",
  "Dragon":"Дракон",
  "Elemental":"Элементаль",
  "Fey":"Фея",
  "Fiend":"Исчадие",
  "Giant":"Великан",
  "Humanoid":"Гуманоид",
  "Monstrosity":"Чудовище",
  "Ooze":"Слизь",
  "Plant":"Растение",
  "Undead":"Нежить",

  // Common rules vocabulary used as standalone labels.
  "Action":"Действие",
  "Bonus Action":"Бонусное действие",
  "Reaction":"Реакция",
  "Concentration":"Концентрация",
  "Ritual":"Ритуал",
  "Advantage":"Преимущество",
  "Disadvantage":"Помеха",
  "Armor Training":"Тренированность с доспехами",
  "Spellcasting":"Сотворение заклинаний",
  "Extra Attack":"Дополнительная атака",
  "Second Wind":"Второе дыхание",
  "Action Surge":"Всплеск действий",
  "Wild Shape Improvement":"Улучшение дикого облика",
  "Druid Circle":"Круг друидов"
});

// Ruleset-aware names are kept separate when DnD.su uses different established
// Russian terminology for the same English label in 2014 and 2024.
export const RU_GAME_CONTEXT = Object.freeze({
  "dnd5e-2024": Object.freeze({
    background:Object.freeze({
      "Acolyte":"Послушник","Artisan":"Ремесленник","Charlatan":"Шарлатан",
      "Criminal":"Преступник","Entertainer":"Артист","Farmer":"Фермер",
      "Guard":"Стражник","Guide":"Проводник","Hermit":"Отшельник",
      "Merchant":"Торговец","Noble":"Дворянин","Sage":"Мудрец",
      "Sailor":"Моряк","Scribe":"Писарь","Soldier":"Солдат","Wayfarer":"Бродяга"
    }),
    feat:Object.freeze({
      "Savage Attacker":"Неистово атакующий"
    })
  }),
  "dnd5e-2014": Object.freeze({
    background:Object.freeze({
      "Acolyte":"Прислужник","Charlatan":"Шарлатан","Criminal":"Преступник",
      "Entertainer":"Артист","Folk Hero":"Народный герой","Guild Artisan":"Гильдейский ремесленник",
      "Hermit":"Отшельник","Noble":"Благородный","Outlander":"Чужеземец",
      "Pirate":"Пират","Sage":"Мудрец","Sailor":"Моряк","Soldier":"Солдат","Urchin":"Беспризорник"
    }),
    feat:Object.freeze({
      "Savage Attacker":"Дикий атакующий","Skilled":"Одарённый","Grappler":"Борец",
      "Alert":"Бдительный","Magic Initiate":"Посвящённый в магию"
    }),
    species:Object.freeze({
      "Changeling":"Чейнджлинг"
    })
  })
});

// Small set of SRD/core subclass names that are stable and useful throughout the UI.
export const RU_GAME_KIND_EXACT = Object.freeze({
  spell:Object.freeze({
    "Heal":"Исцеление"
  }),
  subclass:Object.freeze({
    "Champion":"Чемпион",
    "Circle of the Land":"Круг Земли",
    "College of Lore":"Коллегия знаний",
    "Draconic Sorcery":"Драконье чародейство",
    "Fiend Patron":"Покровитель-исчадие",
    "Life Domain":"Домен жизни",
    "Oath of Devotion":"Клятва преданности",
    "Path of the Berserker":"Путь берсерка",
    "Thief":"Вор",
    "Warrior of the Open Hand":"Воин открытой ладони"
  })
});

// Independent translations for local records not covered by the short-name reference
// tables above. They are deliberately tracked separately so the audit can distinguish
// verified DnD.su terminology from our own fallback localization.
export const RU_GAME_GENERATED = Object.freeze({
  // Common class features and progression labels.
  "Rage":"Ярость","Unarmored Defense":"Защита без доспехов","Weapon Mastery":"Мастерство оружия",
  "Danger Sense":"Чувство опасности","Reckless Attack":"Безрассудная атака","Primal Knowledge":"Первобытное знание",
  "Fast Movement":"Быстрое передвижение","Brutal Strike":"Жестокий удар","Relentless Rage":"Неукротимая ярость",
  "Persistent Rage":"Неугасимая ярость","Indomitable Might":"Непоколебимая мощь","Primal Champion":"Первобытный чемпион",
  "Bardic Inspiration":"Бардовское вдохновение","Expertise":"Экспертность","Jack of All Trades":"Мастер на все руки",
  "Font of Inspiration":"Источник вдохновения","Countercharm":"Контрочарование","Magical Secrets":"Тайны магии",
  "Superior Inspiration":"Превосходное вдохновение","Words of Creation":"Слова Творения",
  "Divine Order":"Божественный порядок","Channel Divinity":"Божественный канал","Divine Spark":"Божественная искра","Turn Undead":"Изгнание нежити","Sear Undead":"Испепеление нежити","Preserve Life":"Сохранение жизни",
  "Blessed Strikes":"Благословенные удары","Divine Intervention":"Божественное вмешательство",
  "Greater Divine Intervention":"Великое божественное вмешательство",
  "Druidic":"Друидический язык","Primal Order":"Первобытный порядок","Wild Shape":"Дикий облик",
  "Wild Companion":"Дикий спутник","Wild Resurgence":"Дикое возрождение","Elemental Fury":"Стихийная ярость",
  "Beast Spells":"Заклинания зверя","Archdruid":"Архидруид",
  "Fighting Style":"Боевой стиль","Tactical Mind":"Тактический ум","Tactical Shift":"Тактическое перемещение",
  "Indomitable":"Несгибаемый","Tactical Master":"Тактический мастер","Studied Attacks":"Изученные атаки",
  "Martial Arts":"Боевые искусства","Monk's Focus":"Фокус монаха","Unarmored Movement":"Передвижение без доспехов",
  "Uncanny Metabolism":"Необычный метаболизм","Deflect Attacks":"Отражение атак","Slow Fall":"Замедленное падение",
  "Stunning Strike":"Ошеломляющий удар","Empowered Strikes":"Усиленные удары","Evasion":"Уклонение",
  "Acrobatic Movement":"Акробатическое передвижение","Heightened Focus":"Усиленный фокус",
  "Self-Restoration":"Самовосстановление","Deflect Energy":"Отражение энергии","Disciplined Survivor":"Дисциплинированный выживший",
  "Perfect Focus":"Совершенный фокус","Superior Defense":"Совершенная защита","Body and Mind":"Тело и разум",
  "Lay On Hands":"Наложение рук","Lay on Hands":"Наложение рук","Paladin's Smite":"Кара паладина",
  "Channel Divinity":"Божественный канал","Divine Sense":"Божественное чувство","Sacred Weapon":"Священное оружие","Aura of Protection":"Аура защиты","Abjure Foes":"Изгнание врагов",
  "Aura of Courage":"Аура отваги","Radiant Strikes":"Сияющие удары","Restoring Touch":"Исцеляющее касание",
  "Aura Expansion":"Расширение ауры",
  "Favored Enemy":"Избранный враг","Deft Explorer":"Искусный исследователь","Roving":"Странник",
  "Tireless":"Неутомимый","Relentless Hunter":"Неустанный охотник","Nature's Veil":"Покров природы",
  "Precise Hunter":"Меткий охотник","Feral Senses":"Звериные чувства","Foe Slayer":"Убийца врагов",
  "Sneak Attack":"Скрытая атака","Thieves' Cant":"Воровской жаргон","Cunning Action":"Хитрое действие",
  "Steady Aim":"Верный прицел","Cunning Strike":"Хитрый удар","Uncanny Dodge":"Невероятное уклонение",
  "Reliable Talent":"Надёжный талант","Improved Cunning Strike":"Улучшенный хитрый удар","Devious Strikes":"Коварные удары",
  "Slippery Mind":"Скользкий ум","Elusive":"Неуловимый","Stroke of Luck":"Удачный случай",
  "Innate Sorcery":"Врождённое чародейство","Font of Magic":"Источник магии","Metamagic":"Метамагия",
  "Sorcerous Restoration":"Чародейское восстановление","Sorcery Incarnate":"Воплощённое чародейство",
  "Arcane Apotheosis":"Магический апофеоз",
  "Eldritch Invocations":"Мистические воззвания","Pact Magic":"Магия договора","Magical Cunning":"Магическая хитрость",
  "Contact Patron":"Связь с покровителем","Mystic Arcanum":"Таинственный арканум","Eldritch Master":"Мистический мастер",
  "Ritual Adept":"Ритуальный адепт","Arcane Recovery":"Магическое восстановление","Scholar":"Учёный",
  "Memorize Spell":"Запоминание заклинания","Spell Mastery":"Мастерство заклинаний","Signature Spells":"Фирменные заклинания",
  "Epic Boon":"Эпический дар","Subclass feature":"Умение подкласса",

  // Missing visible third-party background names from the local expanded catalog.
  "Fate-Touched":"Затронутый судьбой","Forest Dweller":"Лесной житель","Former Adventurer":"Бывший искатель приключений",
  "Freebooter":"Вольный авантюрист","Gamekeeper":"Егерь","Innkeeper":"Трактирщик","Lyceum Student":"Ученик лицея",
  "Mercenary Company Scion":"Отпрыск наёмной компании","Mercenary Recruit":"Рекрут наёмников",
  "Monstrous Adoptee":"Воспитанник чудовищ","Mysterious Origins":"Таинственное происхождение",
  "Northern Minstrel":"Северный менестрель","Occultist":"Оккультист","Parfumier":"Парфюмер",
  "Recovered Cultist":"Бывший культист","Scoundrel":"Пройдоха","Sentry":"Часовой","Trophy Hunter":"Охотник за трофеями"
});

export const RU_GAME_PATTERNS = Object.freeze([
  [/^Magic Initiate \((Cleric|Druid|Wizard)\)$/i, m => `Посвящённый в магию (${RU_GAME_EXACT[m[1]] || m[1]})`],
  [/^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw$/i, m => `Спасбросок: ${RU_GAME_EXACT[m[1]] || m[1]}`],
  [/^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throws$/i, m => `Спасброски: ${RU_GAME_EXACT[m[1]] || m[1]}`]
]);

export function translateGameExact(value){
  return RU_GAME_EXACT[String(value ?? "")] ?? null;
}

function contextLookup(value,{ruleset=null,kind=null}={}){
  const raw=String(value??"");
  const byRuleset=ruleset?RU_GAME_CONTEXT[ruleset]:null;
  if(byRuleset){
    if(kind && byRuleset[kind]?.[raw]!==undefined)return byRuleset[kind][raw];
    // Only use a ruleset-wide match when it is unambiguous between categories.
    const hits=Object.values(byRuleset).map(group=>group?.[raw]).filter(v=>v!==undefined);
    if(new Set(hits).size===1 && hits.length)return hits[0];
  }
  if(kind && RU_GAME_KIND_EXACT[kind]?.[raw]!==undefined)return RU_GAME_KIND_EXACT[kind][raw];
  return null;
}

export function translateGameEntity(value,context={}){
  const raw=String(value??"");
  const contextual=contextLookup(raw,context);
  if(contextual!==null)return contextual;
  return translateGameText(raw);
}

export function translateGameText(value){
  const raw=String(value ?? "");
  const exact=translateGameExact(raw);
  if(exact!==null)return exact;
  if(RU_GAME_GENERATED[raw]!==undefined)return RU_GAME_GENERATED[raw];
  for(const [pattern,fn] of RU_GAME_PATTERNS){
    const match=raw.match(pattern);
    if(match)return fn(match);
  }
  return raw;
}

function normalizedSearch(value){
  return String(value??"").trim().toLocaleLowerCase("ru-RU").replaceAll("ё","е");
}

export function englishAliasesForRussianQuery(query,{ruleset=null,kind=null,limit=80}={}){
  const needle=normalizedSearch(query);
  if(!needle)return [];
  const found=[];
  const add=(english,russian)=>{
    if(!english||!russian)return;
    if(normalizedSearch(russian).includes(needle) && !found.includes(english))found.push(english);
  };
  for(const [english,russian] of Object.entries(RU_GAME_EXACT))add(english,russian);
  for(const [english,russian] of Object.entries(RU_GAME_GENERATED))add(english,russian);
  if(kind && RU_GAME_KIND_EXACT[kind])for(const [english,russian] of Object.entries(RU_GAME_KIND_EXACT[kind]))add(english,russian);
  else for(const group of Object.values(RU_GAME_KIND_EXACT))for(const [english,russian] of Object.entries(group))add(english,russian);
  const rulesets=ruleset&&RU_GAME_CONTEXT[ruleset]?[ruleset]:Object.keys(RU_GAME_CONTEXT);
  for(const rs of rulesets){
    const groups=RU_GAME_CONTEXT[rs]||{};
    if(kind && groups[kind])for(const [english,russian] of Object.entries(groups[kind]))add(english,russian);
    else for(const group of Object.values(groups))for(const [english,russian] of Object.entries(group))add(english,russian);
  }
  return found.slice(0,Math.max(1,Number(limit)||80));
}

export function gameTranslationStatus(value,context={}){
  const raw=String(value ?? "");
  if(contextLookup(raw,context)!==null)return "reference";
  if(RU_GAME_EXACT[raw]!==undefined)return "reference";
  if(RU_GAME_PATTERNS.some(([pattern])=>pattern.test(raw)))return "reference";
  if(RU_GAME_GENERATED[raw]!==undefined)return "generated";
  return "pending";
}
