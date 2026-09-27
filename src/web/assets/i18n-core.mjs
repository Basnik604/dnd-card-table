import { UI_RU_EXTRA, UI_RU_TEMPLATES } from "./ui-ru-extra.mjs";
import { RU_GAME_EXACT, RU_GAME_GENERATED, RU_GAME_PATTERNS, translateGameEntity } from "./game-ru.mjs";

export const RU_EXACT = Object.freeze({
  ...UI_RU_EXTRA,
  ...RU_GAME_EXACT,
  ...RU_GAME_GENERATED,
  "Play":"Игра","Characters":"Персонажи","Encounters":"Сражения","Library":"Библиотека","Content":"Контент","Cards":"Карточки","Build":"Создание","Builder":"Конструктор","System":"Система","Builder Data":"Данные конструктора",
  "Theme":"Тема","Base":"Базовая","Tavern":"Таверна","Local database connected":"Локальная база подключена",
  "Content Library":"Библиотека контента","Monsters":"Монстры","Spells":"Заклинания","Equipment":"Снаряжение","Magic Items":"Магические предметы","Conditions":"Состояния","All":"Все","Search":"Поиск","matches":"совпадений","shown":"показано","steps":"шагов","cards":"карточек","characters":"персонажей","encounters":"сражений",
  "Imported SRD content normalized into one local database. Search stays inside the selected content category, checks names first, and falls back to descriptions only when no name matches.":"Импортированный SRD-контент приведён к единому формату и хранится в локальной базе. Поиск работает внутри выбранной категории: сначала по названиям, а если совпадений нет — по описаниям.",
  "Open entry to view complete game data.":"Откройте запись, чтобы посмотреть полные игровые данные.",
  "description match":"совпадение по описанию",
  "Character Builder Data":"Данные конструктора персонажа","Classes":"Классы","Subclasses":"Подклассы","Species":"Виды","Backgrounds":"Предыстории","Feats":"Черты","Ruleset":"Свод правил","All imported":"Все источники","A5E reference only":"Только A5E (справочник)","Reference only":"Только справочник","reference only":"только справочник","Open to inspect normalized builder data.":"Открыть нормализованные данные конструктора.",
  "Normalized Open5e classes, subclasses, species, backgrounds and feats with source and ruleset labels. 2024/2014-compatible records feed the guided builder; A5E records remain searchable reference data.":"Нормализованные классы, подклассы, виды, предыстории и черты из Open5e с указанием источника и свода правил. Совместимые записи 2024/2014 используются в пошаговом конструкторе; записи A5E остаются доступными как справочный материал.",
  "class":"класс","subclass":"подкласс","species":"вид","background":"предыстория","feat":"черта",
  "Class":"Класс","Subclass":"Подкласс","Species":"Вид","Background":"Предыстория","Feat":"Черта",
  "CLASS":"КЛАСС","SUBCLASS":"ПОДКЛАСС","SPECIES":"ВИД","BACKGROUND":"ПРЕДЫСТОРИЯ","FEAT":"ЧЕРТА",
  "GENERAL":"ОБЩАЯ","ORIGIN":"ПРОИСХОЖДЕНИЕ","EPIC BOON":"ЭПИЧЕСКИЙ ДАР","FIGHTING STYLE":"БОЕВОЙ СТИЛЬ",
  "Guided Character Builder":"Пошаговый конструктор персонажа","Identity":"Личность","Abilities":"Характеристики","Background":"Предыстория","Skills":"Навыки","Identity & Origin":"Личность и происхождение","Character Name":"Имя персонажа","Content Scope":"Источники контента","Expanded compatible catalog":"Расширенный совместимый каталог","SRD 5.2 only":"Только SRD 5.2","Level":"Уровень","Class":"Класс","Subclass":"Подкласс","Choose class…":"Выберите класс…","Choose subclass…":"Выберите подкласс…","Choose species…":"Выберите вид…","Choose background…":"Выберите предысторию…","Choose ability…":"Выберите характеристику…","Build a level 1–3 character with the SRD 5.2 class engine and either the core SRD catalog or compatible Open5e options. Expanded choices show their source; rules years stay in metadata instead of cluttering the lists.":"Создайте персонажа 1–3 уровня на основе классового движка SRD 5.2, используя основной SRD-каталог или совместимые варианты Open5e. В расширенном режиме показывается источник, а год правил хранится в метаданных и не перегружает списки.","Expanded mode includes licensed legacy/third-party 5e options. Same-name options prefer the modern SRD record; compatibility adjustments are applied where the rules differ.":"Расширенный режим добавляет лицензированные старые и сторонние варианты 5e. При совпадении названий используется современная запись SRD, а различия правил по возможности корректируются автоматически.",
  "Ability Scores":"Значения характеристик","Standard Array":"Стандартный набор","Point Buy":"Покупка характеристик","Roll 4d6 Drop Lowest":"4d6, отбросить минимальный","Random Array":"Случайный набор","Point Buy uses 27 points and scores 8–15 before background bonuses.":"Покупка характеристик использует 27 очков; значения до бонусов предыстории должны быть от 8 до 15.",
  "Background Benefits":"Преимущества предыстории","Ability Score Increase":"Повышение характеристик","+2 Ability":"Характеристика +2","+1 Ability":"Характеристика +1","Skill Proficiencies":"Владение навыками","Starting Equipment & Review":"Стартовое снаряжение и проверка","Class Equipment":"Снаряжение класса","Background Equipment":"Снаряжение предыстории","Recommended equipment":"Рекомендуемое снаряжение","Starting gold":"Стартовое золото","50 GP instead":"Вместо этого 50 зм","Review":"Проверка","Previous":"Назад","Next":"Далее","Create Character":"Создать персонажа",
  "Ability Options":"Варианты характеристик","Origin Feat":"Черта происхождения","Tool":"Инструмент","Source":"Источник","Uses legacy species bonuses":"Используются бонусы вида по старым правилам","Legacy ability rules":"Старые правила характеристик","Legacy 5e source":"Источник старой редакции 5e","Compatibility rule":"Правило совместимости","Choose freely using the compatibility origin increase":"Выберите характеристики свободно по правилу совместимости происхождения","This older background has no ability increase and the selected species does not supply a legacy increase. Choose +2/+1 or three +1 increases here so the character is not left without an origin ability increase.":"У этой предыстории старой редакции нет повышения характеристик, а выбранный вид не даёт старого бонуса. Выберите здесь +2/+1 или три повышения +1, чтобы персонаж не остался без повышения характеристик происхождения.","This legacy background does not add ability scores; the selected legacy species provides them.":"Эта предыстория старой редакции не повышает характеристики; повышение даёт выбранный вид старой редакции.","Background skills:":"Навыки предыстории:","None fixed.":"Нет фиксированных.","Choose a class first.":"Сначала выберите класс.","Choose a background first.":"Сначала выберите предысторию.","Choose a background in Step 1.":"Выберите предысторию на шаге 1.",
  "Name":"Имя","Not required":"Не требуется","Abilities":"Характеристики","Class Equipment":"Снаряжение класса","Background Equipment":"Снаряжение предыстории",
  "Complete the required choices on this step first.":"Сначала заполните обязательные поля на этом шаге.","Please review the current step.":"Проверьте текущий шаг.",
  "Characters":"Персонажи","Create character":"Создать персонажа","Open Guided Builder":"Открыть пошаговый конструктор","Quick Manual Character":"Быстрое ручное создание","No characters yet.":"Персонажей пока нет.","No characters created yet.":"Персонажей пока нет.","Character":"Персонаж","Character not found.":"Персонаж не найден.","Character no longer exists.":"Персонаж больше не существует.","Delete character":"Удалить персонажа","Upload portrait":"Загрузить портрет",
  "Overview":"Обзор","Combat":"Бой","Inventory":"Инвентарь","Features":"Особенности","Notes":"Заметки","Hit Points":"Хиты","Armor Class":"Класс доспеха","Initiative":"Инициатива","Speed":"Скорость","Passive Perception":"Пассивное восприятие","Proficiency Bonus":"Бонус мастерства","Saving Throws":"Спасброски","Proficiencies":"Владения","Resources":"Ресурсы","Inventory Cards":"Карточки инвентаря","Equipped Loadout":"Экипировка","No inventory cards yet.":"В инвентаре пока нет карточек.","No equipped combat cards. Equip weapons, armor or a shield from Inventory.":"Нет экипированных боевых карточек. Экипируйте оружие, доспех или щит во вкладке «Инвентарь».","No notes yet.":"Заметок пока нет.",
  "Short Rest":"Короткий отдых","Long Rest":"Долгий отдых","HP Apply":"Применить к хитам","Apply":"Применить","Set":"Задать","Manual":"Вручную","Custom":"Пользовательский","Add":"Добавить","Use":"Использовать","Heal":"Лечить","Activate":"Активировать","End":"Завершить","Remove":"Удалить","Delete":"Удалить","Clear":"Очистить","Save":"Сохранить","Edit":"Изменить",
  "Spellbook & Magic":"Заклинания и магия","Spellbook":"Книга заклинаний","Spellcasting":"Заклинания","Cantrips":"Заговоры","Prepared":"Подготовлено","Always Prepared":"Всегда подготовлено","Known Cantrip":"Известный заговор","No spells assigned yet.":"Заклинания пока не назначены.","No spell slots.":"Нет ячеек заклинаний.","No slot available":"Нет доступной ячейки","Not prepared":"Не подготовлено","Cast":"Сотворить","Cast cantrip":"Сотворить заговор","Ritual":"Ритуал","School":"Школа","Casting cost":"Стоимость сотворения","At Higher Levels":"На более высоких уровнях","Materials:":"Материалы:","Open spell":"Открыть заклинание","Choose class spell…":"Выберите заклинание класса…","Search spells…":"Поиск заклинаний…","No matching spell.":"Подходящих заклинаний нет.",
  "Concentration":"Концентрация","End Concentration":"Прекратить концентрацию","Roll Concentration Save":"Бросить спасбросок концентрации","Innate Sorcery":"Врожденное колдовство","Flexible Casting":"Гибкое колдовство","Convert a spell slot into Sorcery Points":"Преобразовать ячейку в очки чародейства","Convert slot":"Преобразовать ячейку","Create a temporary spell slot":"Создать временную ячейку","Create slot":"Создать ячейку","Sorcerer · Font of Magic":"Чародей · Источник магии",
  "Class Overview":"Обзор класса","Class Progression":"Развитие класса","Class Features":"Особенности класса","Core Features":"Основные особенности","Class Data":"Данные класса","Source & normalized data":"Источник и нормализованные данные","The essentials used during character creation and play.":"Основные данные, используемые при создании персонажа и во время игры.","Level-by-level advancement. Feature names jump to their descriptions below.":"Развитие по уровням. Названия особенностей ведут к их подробному описанию ниже.","Features are grouped by the level at which they become available. Open only the rule you need.":"Особенности сгруппированы по уровню получения. Раскрывайте только нужное правило.","Class Choices":"Выбор умений класса","Choices":"Выборы","Choices & Proficiencies":"Выборы и владения","Unlocked Features":"Открытые особенности","Newly Unlocked Features":"Новые открытые особенности","No level-appropriate features were normalized yet.":"Для этого уровня пока нет нормализованных особенностей.","No additional normalized feature rows were found for this level.":"Для этого уровня не найдено дополнительных нормализованных особенностей.","No structured traits/features in this entry.":"В этой записи нет структурированных черт или особенностей.","Traits / Features":"Черты / особенности","Normalized Summary":"Нормализованная сводка","Developer data (normalized JSON)":"Данные разработчика (нормализованный JSON)","Raw imported source":"Исходные импортированные данные",
  "Fighting Style":"Боевой стиль","Weapon Mastery":"Мастерство оружия","Expertise":"Экспертиза","Metamagic":"Метамагия","Eldritch Invocations":"Мистические воззвания","Divine Order":"Божественный орден","Primal Order":"Первозданный орден","Scholar":"Учёный","Circle of the Land":"Круг Земли","Land Type":"Тип местности","Draconic Sorcery · Level 6":"Драконье чародейство · 6 уровень","Elemental Affinity":"Стихийное сродство","Magical Discoveries":"Магические открытия","Two empty discovery slots remain.":"Осталось два свободных слота магических открытий.","Magical Discovery · Always Prepared":"Магическое открытие · всегда подготовлено","Pact of the Blade":"Договор клинка","Pact Weapon · CHA":"Оружие договора · ХАР","Bind":"Связать","Clear bond":"Разорвать связь","Recover Pact Slots":"Восстановить ячейки договора","Second Wind":"Второе дыхание",
  "Experience":"Опыт","XP":"Опыт","Level Up":"Повысить уровень","Experience is never spent when leveling.":"Опыт не расходуется при повышении уровня.","Award XP":"Добавить опыт","Add custom XP":"Добавить другое количество опыта","Set exact XP":"Задать точный опыт","Confirm Level Up":"Подтвердить повышение уровня","Hit Point Increase":"Увеличение хитов","Current Maximum":"Текущий максимум","New Maximum":"Новый максимум","Roll Hit Die":"Бросить кость хитов","Fixed Value":"Фиксированное значение","Calculation":"Расчёт","Choices Unlocked at Level":"Выборы, открываемые на уровне",
  "Encounters":"Сражения","Encounter":"Сражение","Create Encounter":"Создать сражение","Create encounter":"Создать сражение","No encounters yet.":"Сражений пока нет.","Encounter not found.":"Сражение не найдено.","Add Combatants":"Добавить участников","Add character":"Добавить персонажа","Add creature":"Добавить существо","Choose character…":"Выберите персонажа…","Choose creature…":"Выберите существо…","Roll all initiative":"Бросить инициативу всем","Reset initiative":"Сбросить инициативу","Next turn":"Следующий ход","Current turn":"Текущий ход","Add characters or creatures to begin.":"Добавьте персонажей или существ, чтобы начать.","No current combatant.":"Сейчас нет активного участника.","Delete encounter":"Удалить сражение",
  "Card Library":"Библиотека карточек","Card Template":"Шаблон карточки","Create / refresh card":"Создать / обновить карточку","Create from content":"Создать из контента","Open card":"Открыть карточку",
  "Creature":"Существо","creature":"существо","CREATURE":"СУЩЕСТВО","Condition":"Состояние","condition":"состояние","CONDITION":"СОСТОЯНИЕ","Item":"Предмет","item":"предмет","ITEM":"ПРЕДМЕТ","Entry":"Запись","entry":"запись","ENTRY":"ЗАПИСЬ",
  "Aberration":"Аберрация","ABERRATION":"АБЕРРАЦИЯ","Beast":"Зверь","BEAST":"ЗВЕРЬ","Celestial":"Небожитель","CELESTIAL":"НЕБОЖИТЕЛЬ","Construct":"Конструкт","CONSTRUCT":"КОНСТРУКТ","Dragon":"Дракон","DRAGON":"ДРАКОН","Elemental":"Элементаль","ELEMENTAL":"ЭЛЕМЕНТАЛЬ","Fey":"Фея","FEY":"ФЕЯ","Fiend":"Исчадие","FIEND":"ИСЧАДИЕ","Giant":"Великан","GIANT":"ВЕЛИКАН","Humanoid":"Гуманоид","HUMANOID":"ГУМАНОИД","Monstrosity":"Монстр","MONSTROSITY":"МОНСТР","Ooze":"Слизь","OOZE":"СЛИЗЬ","Plant":"Растение","PLANT":"РАСТЕНИЕ","Undead":"Нежить","UNDEAD":"НЕЖИТЬ","Create world instance":"Создать экземпляр в мире","Give to character":"Выдать персонажу","Return to world":"Вернуть в мир","Template & Instances":"Шаблон и экземпляры","No concrete copies yet.":"Конкретных экземпляров пока нет.","No cards matched.":"Карточки не найдены.","Actions":"Действия","No actions available.":"Действия недоступны.","This card has no executable actions yet.":"У этой карточки пока нет выполняемых действий.","Delete card template":"Удалить шаблон карточки","Card not found.":"Карточка не найдена.","Source content":"Исходный контент","Source entity not found.":"Исходная сущность не найдена.","Upload card art":"Загрузить изображение карточки",
  "Description":"Описание","Item Data":"Данные предмета","Category":"Категория","Type":"Тип","Creature Type":"Тип существа","Challenge":"Опасность","Size":"Размер","Range":"Дальность","Attunement":"Настройка","Attuned":"Настроено","Equipped":"Экипировано","Auto from equipment":"Авто по снаряжению","Manual Armor Class":"Ручной класс доспеха","Save AC":"Сохранить КД","Remove override":"Убрать ручное значение",
  "Page not found.":"Страница не найдена.","Entry not found.":"Запись не найдена.","Not found":"Не найдено","Server error":"Ошибка сервера","Nothing matched this search.":"Поиск не дал результатов.","No Character Builder data found.":"Данные конструктора персонажа не найдены.","No matching card names. Showing matches found in descriptions.":"Совпадений среди названий карточек нет. Показаны совпадения по описанию.","No matching names in this category. Showing matches found in descriptions.":"В этой категории нет совпадений среди названий. Показаны совпадения по описанию.",
  "Search builder content…":"Поиск по данным конструктора…","Search Monsters…":"Поиск монстров…","Search Spells…":"Поиск заклинаний…","Search Equipment…":"Поиск снаряжения…","Search Magic Items…":"Поиск магических предметов…","Search Conditions…":"Поиск состояний…","Search All…":"Поиск по всему…",
  "Upload failed":"Не удалось загрузить изображение","Remove this image?":"Удалить это изображение?","Could not remove image":"Не удалось удалить изображение","Delete this character?":"Удалить этого персонажа?","Delete this encounter?":"Удалить это сражение?","Delete resource?":"Удалить ресурс?","Remove this spell from the character?":"Убрать это заклинание у персонажа?","Remove this combatant from the encounter?":"Убрать этого участника из сражения?","Delete this card instance?":"Удалить этот экземпляр карточки?","Delete this card template and all of its instances?":"Удалить этот шаблон карточки и все его экземпляры?",
  "Dice result":"Результат броска","Close dice result":"Закрыть результат броска","At the table · dice":"За столом · кости","Total":"Итого","Dice roll":"Бросок костей","Rolling…":"Бросок…","Roll failed":"Ошибка броска","Could not complete the roll":"Не удалось выполнить бросок","Could not reach the server. Check the connection and try again.":"Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
  "Ready":"Готово","Locked":"Заблокировано","Active":"Активно","Always":"Всегда","More ▾":"Ещё ▾","Full description":"Полное описание","Open source entry":"Открыть исходную запись","Open feat":"Открыть черту","Parent Class":"Родительский класс","Prerequisites":"Требования","Repeatable":"Повторяемая","Primary Ability":"Основная характеристика","Hit Die":"Кость хитов","Starting Equipment":"Стартовое снаряжение","Spellcasting":"Заклинания","Saving Throws":"Спасброски","Actions":"Действия",
  "Local development prototype v0.22.1 · RU content localization · canonical English content preserved":"Локальный прототип v0.22.1 · русская локализация контента · канонический английский контент сохранён",
  "Tabletop VTT · Prototype 0.22.1":"Настольный VTT · Прототип 0.22.1",
  "Versions":"Версии","versions":"версии","records":"записей","Imported progression is supplemented with core class milestones and table values when the source leaves a level blank.":"Импортированная прогрессия дополняется ключевыми этапами класса и табличными значениями, если в источнике уровень оставлен пустым.",
  "Slots":"Ячейки","Rages":"Ярость","Rage Damage":"Урон ярости","Bardic Die":"Кость вдохновения","Channel Divinity":"Божественный канал","Wild Shape":"Дикий облик","Second Wind":"Второе дыхание","Attacks":"Атаки","Martial Arts":"Боевые искусства","Focus Points":"Очки фокуса","Movement":"Передвижение","Lay on Hands":"Наложение рук","Favored Enemy":"Избранный враг","Sneak Attack":"Скрытая атака","Sorcery Points":"Очки чародейства","Pact Slots":"Ячейки договора","Invocations":"Воззвания","Song of Rest":"Песнь отдыха","Destroy Undead":"Уничтожение нежити","Action Surge":"Всплеск действий","Indomitable":"Несгибаемый","Ki":"Ци"
});

const RU_PATTERNS = [
  [/^(All|Classes|Subclasses|Species|Backgrounds|Feats|Monsters|Spells|Equipment|Magic Items|Conditions) · ([\d,]+)$/,m=>`${RU_EXACT[m[1]]||m[1]} · ${m[2]}`],
  [/^Search (Monsters|Spells|Equipment|Magic Items|Conditions|content)…$/,m=>`Поиск: ${RU_EXACT[m[1]]||"контент"}…`],
  [/^Level (\d+)$/,m=>`Уровень ${m[1]}`],
  [/^Lv (\d+)$/,m=>`Ур. ${m[1]}`],
  [/^Round (\d+)$/,m=>`Раунд ${m[1]}`],
  [/^Page (\d+) of (\d+) · (\d+) entries$/,m=>`Страница ${m[1]} из ${m[2]} · записей: ${m[3]}`],
  [/^Point Buy: scores must be 8–15$/,()=>`Покупка характеристик: значения должны быть от 8 до 15`],
  [/^Point Buy: (\d+) \/ 27 points$/,m=>`Покупка характеристик: ${m[1]} / 27 очков`],
  [/^Standard Array valid$/,()=>`Стандартный набор корректен`],
  [/^Use each Standard Array value once$/,()=>`Используйте каждое значение стандартного набора один раз`],
  [/^Rolled 4d6 drop lowest$/,()=>`Бросок 4d6 с отбрасыванием минимального`],
  [/^Randomized Standard Array$/,()=>`Случайно распределённый стандартный набор`],
  [/^Core catalog: (\d+) classes · (\d+) subclasses · (\d+) species · (\d+) backgrounds\.$/,m=>`Основной каталог: классы ${m[1]} · подклассы ${m[2]} · виды ${m[3]} · предыстории ${m[4]}.`],
  [/^Expanded catalog: (\d+) classes · (\d+) subclasses · (\d+) species · (\d+) backgrounds\. Same-name options prefer the modern SRD record; source labels stay visible without repeating rules years\.$/,m=>`Расширенный каталог: классы ${m[1]} · подклассы ${m[2]} · виды ${m[3]} · предыстории ${m[4]}. При совпадении названий используется современная запись SRD; в списках показывается источник без повторения года правил.`],
  [/^Choose (\d+) class skills\. Background duplicates are automatically excluded\.$/,m=>`Выберите навыки класса: ${m[1]}. Дубликаты из предыстории исключаются автоматически.`],
  [/^Choose (\d+) additional background skill(?:s)?\.$/,m=>`Выберите дополнительных навыков предыстории: ${m[1]}.`],
  [/^Choose (\d+): (.+)$/,m=>`Выберите ${m[1]}: ${m[2]}`],
  [/^Background (\d+) \/ (\d+) · Class (\d+) \/ (\d+)$/,m=>`Предыстория ${m[1]} / ${m[2]} · Класс ${m[3]} / ${m[4]}`],
  [/^Fixed species increases: (.+)\.$/,m=>`Фиксированные повышения вида: ${m[1]}.`],
  [/^This species has no fixed ability increase\.$/,()=>`У этого вида нет фиксированного повышения характеристик.`],
  [/^\+(\d+) Ability (\d*)$/i,m=>`Характеристика +${m[1]}${m[2]?` · выбор ${m[2]}`:''}`],
  [/^This character needs ([\d,.]+) more XP before the next level\.$/,m=>`До следующего уровня персонажу нужно ещё ${m[1]} опыта.`],
  [/^Requirement: ([\d,.]+)$/,m=>`Требуется: ${m[1]}`],
  [/^Level (\d+) → (\d+)$/,m=>`Уровень ${m[1]} → ${m[2]}`],
  [/^This spell is not on the (.+) spell list$/,m=>`Это заклинание отсутствует в списке класса «${translateText(m[1])}»`],
  [/^No level (\d+) spell slot available$/,m=>`Нет доступной ячейки заклинаний ${m[1]} уровня`],
  [/^Creating a level (\d+) slot costs (\d+) Sorcery Points$/,m=>`Создание ячейки ${m[1]} уровня стоит ${m[2]} очк. чародейства`],
  [/^Level (\d+) slot · (\d+) left$/,m=>`Ячейка ${m[1]} уровня · осталось ${m[2]}`],
  [/^Level (\d+) · gain (\d+) SP · (\d+) available$/,m=>`Уровень ${m[1]} · получить ${m[2]} ОЧ · доступно ${m[3]}`],
  [/^Damage taken · save DC (\d+)$/,m=>`Получен урон · Сл спасброска ${m[1]}`],
  [/^(\d+)\/(\d+) · CR ([^·]+) · (Fly allowed|No Fly)$/,m=>`${m[1]}/${m[2]} · ПО ${m[3].trim()} · ${m[4]==='Fly allowed'?'Полёт разрешён':'Без полёта'}`],
  [/^AC (.+?) · (.+?) · Temporary HP (\d+)$/,m=>`КД ${m[1]} · ${translateText(m[2])} · Временные хиты ${m[3]}`],
  [/^Constitution save with Advantage from Eldritch Mind$/,()=>`Спасбросок Телосложения с преимуществом от «Мистического разума»`],
  [/^Constitution save$/,()=>`Спасбросок Телосложения`],
  [/^([0-9]+) \/ ([0-9]+) SP$/,m=>`${m[1]} / ${m[2]} ОЧ`],
  [/^([0-9]+) new level$/,m=>`${m[1]} новый уровень`],
  [/^Choose discovery…$/,()=>`Выберите магическое открытие…`],
  [/^Search Cleric, Druid or Wizard spell…$/,()=>`Поиск заклинания жреца, друида или волшебника…`],
  [/^(\d+)d8 Radiant on each failed save$/,m=>`${m[1]}d8 лучистого урона при каждом проваленном спасброске`],
  [/^(\d+) HP pool$/,m=>`Запас лечения: ${m[1]} хитов`],
  [/^Active · \+(\d+)$/,m=>`Активно · +${m[1]}`],
  [/^\+(\d+) attack$/,m=>`+${m[1]} к атаке`],
  [/^Active weapon: (.+)$/,m=>`Активное оружие: ${translateText(m[1])}`],
  [/^(\d+) targets? · DC (\d+)$/,m=>`Целей: ${m[1]} · Сл ${m[2]}`],
  [/^Restore (\d+) HP to another creature within 30 feet( · Supreme Healing)?\.$/,m=>`Восстановите другому существу в пределах 30 футов ${m[1]} хитов${m[2]?` · Высшее исцеление`:``}.`],
  [/^(Radiant|Necrotic) damage (\d+) · Constitution save DC (\d+); success takes half \(round down\)\.$/,m=>`${m[1]==='Radiant'?'Лучистый':'Некротический'} урон: ${m[2]} · спасбросок Телосложения Сл ${m[3]}; при успехе половина урона (округление вниз).`],
  [/^Wisdom save DC (\d+)\. Failed saves are Frightened and Incapacitated for 1 minute; Sear Undead deals (\d+) Radiant damage and this damage does not end the turn effect\.$/,m=>`Спасбросок Мудрости Сл ${m[1]}. При провале цель испугана и недееспособна на 1 минуту; «Испепеление нежити» наносит ${m[2]} лучистого урона, и этот урон не прекращает изгнание.`],
  [/^Wisdom save DC (\d+)\. Failed saves are Frightened and Incapacitated for 1 minute and try to move as far away as possible\.$/,m=>`Спасбросок Мудрости Сл ${m[1]}. При провале цель испугана и недееспособна на 1 минуту и старается удалиться как можно дальше.`],
  [/^Distribute (\d+) HP among Bloodied creatures within 30 feet, up to half each creature's HP maximum\.$/,m=>`Распределите ${m[1]} хитов лечения между ранеными существами в пределах 30 футов, не восстанавливая никому больше половины максимума хитов.`],
  [/^Target up to (\d+) creatures? within 60 feet\. Wisdom save DC (\d+); failed saves are Frightened for 1 minute or until damaged\.$/,m=>`Выберите до ${m[1]} существ в пределах 60 футов. Спасбросок Мудрости Сл ${m[2]}; при провале цель испугана на 1 минуту или пока не получит урон.`],
  [/^No (.+) yet\.$/,m=>`Пока нет: ${m[1]}.`]
];

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(UI_RU_TEMPLATES).map(([source,target]) => {
  const ids=[]; let last=0, pattern='^';
  for (const m of source.matchAll(/\{(\d+)\}/g)) {
    pattern += escapePattern(source.slice(last,m.index)) + '(.*?)';
    ids.push(m[1]);last=m.index+m[0].length;
  }
  pattern += escapePattern(source.slice(last))+'$';
  return {source,target,ids,pattern:new RegExp(pattern),weight:source.replace(/\{\d+\}/g,'').length};
}).sort((a,b)=>b.weight-a.weight);

// Only these template slots contain game labels. Character names and arbitrary
// user text in the other slots remain verbatim.
const termSlots = {
  '{0} {1} ft.':[0], 'Level {0} {1}':[1], 'Search {4}…':[4],
  '{0} · CR {1}':[0], 'Level {0} · {1}':[1], '{1} · Lv {2} {3}':[3],
  '{0} is required by {1}':[0,1], 'Missing prerequisite: {0}':[0],
  '{1} · {2} SP':[1], 'Bound · {0}':[0], 'Builder rules missing for {0}':[0],
  '1 {0} slot · level {1}':[0], 'Cast: {0}':[0],
  '{0} — {1} spell attack':[1], '{0} — {1} damage':[1],
  'Your {18} Hit Die is d{19}. Constitution modifier: {20}.':[18],
  'Constitution save{1}':[1], '{0} — {1} attack':[1], 'Mastery · {0}':[0],
  '{0} — {1} versatile damage':[1], '{0} — {1} check':[1],
  '{0} Spellcasting':[0], 'Concentrating · {0}':[0], 'Search {0} spell…':[0],
  '· {0} Lv {1}':[0], '{1} · CR {2}':[1],
  '{10} subclasses linked to {11}.':[11], 'Subclass · {0}':[0]
};
function extraTranslation(core,context) {
  if (Object.hasOwn(UI_RU_EXTRA,core)) return UI_RU_EXTRA[core];
  for (const t of templates) {
    const match=core.match(t.pattern); if(!match) continue;
    const values=Object.fromEntries(t.ids.map((id,i)=>[id,match[i+1]]));
    for(const id of termSlots[t.source]||[]) if(values[id]) values[id]=translateText(values[id],'ru',context);
    return t.target.replace(/\{(\d+)\}/g,(_,id)=>values[id]??'');
  }
  return null;
}

export function normalizeLanguage(value){
  return String(value||'').toLowerCase().startsWith('en') ? 'en' : 'ru';
}

export function translateText(value,language='ru',context={}){
  const raw=String(value??'');
  if(normalizeLanguage(language)==='en') return raw;
  const match=raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead=match?.[1]||'', core=match?.[2]??raw, trail=match?.[3]||'';
  if(!core) return raw;
  const contextual=translateGameEntity(core,context);
  if(contextual!==core) return lead+contextual+trail;
  const exact=Object.hasOwn(RU_EXACT,core)?RU_EXACT[core]:undefined;
  if(exact!==undefined) return lead+exact+trail;
  for(const [pattern,fn] of RU_GAME_PATTERNS){
    const m=core.match(pattern);
    if(m) return lead+fn(m)+trail;
  }
  for(const [pattern,fn] of RU_PATTERNS){
    const m=core.match(pattern);
    if(m) return lead+fn(m)+trail;
  }
  const extra=extraTranslation(core,context);
  if(extra!==null)return lead+extra+trail;
  return raw;
}

export function translateMany(values,language='ru'){
  return values.map(value=>translateText(value,language));
}
