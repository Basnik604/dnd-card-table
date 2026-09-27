const ABILITIES=["Strength","Dexterity","Constitution","Intelligence","Wisdom","Charisma"];
const SKILLS=[
  "Acrobatics","Animal Handling","Arcana","Athletics","Deception","History",
  "Insight","Intimidation","Investigation","Medicine","Nature","Perception",
  "Performance","Persuasion","Religion","Sleight of Hand","Stealth","Survival"
];

const SOURCE_PRIORITY={
  "srd-2024":0,
  "toh":10,
  "tdcs":20,
  "open5e":30,
  "bfrd":40,
  "srd-2014":50,
  "open5e-2024":60,
  "a5e-ag":100,
  "a5e-ddg":101,
  "a5e-gpg":102
};

export function textValue(value) {
  if(value==null)return null;
  if(typeof value==="string")return value.trim()||null;
  if(typeof value==="number"||typeof value==="boolean")return String(value);
  if(Array.isArray(value))return value.map(textValue).filter(Boolean).join(", ")||null;
  if(typeof value==="object"){
    for(const key of ["name","title","label","value","as_string","display","desc","description"]){
      const text=textValue(value[key]);if(text)return text;
    }
  }
  return null;
}

export function valueArray(value) {
  return Array.isArray(value)?value:(value==null||value===""?[]:[value]);
}

function pick(record,...keys) {
  for(const key of keys)if(record?.[key]!==undefined&&record?.[key]!==null)return record[key];
  return null;
}

export function recordName(record) {
  return textValue(record?.name)||textValue(record?.title)||"Unnamed";
}

export function recordKey(record) {
  return String(record?.key||record?.slug||slugify(recordName(record)));
}

export function slugify(value) {
  return String(value||"").toLowerCase().normalize("NFKD")
    .replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-");
}

export function classifyClassRecord(record) {
  return pick(record,"subclass_of","parent_class")?"subclass":"class";
}

export function rulesetForDocument(document) {
  const key=String(document?.gamesystem?.key||document?.gamesystem_key||"").toLowerCase();
  if(key==="5e-2024")return "dnd5e-2024";
  if(key==="5e-2014")return "dnd5e-2014";
  if(key==="a5e")return "a5e";
  return key||"dnd5e-compatible";
}

export function sourceKeyOf(record) {
  return String(record?.source_key||record?.document_key||record?.document?.key||record?.summary?.source_key||"");
}

export function rulesetOf(record) {
  return String(record?.ruleset||record?.summary?.ruleset||rulesetForDocument(record?.document)||"");
}

export function isGuidedCompatible(record) {
  return ["dnd5e-2024","dnd5e-2014"].includes(rulesetOf(record));
}

export function scopeAllows(record,scope="expanded") {
  if(scope==="srd2024")return sourceKeyOf(record)==="srd-2024";
  return isGuidedCompatible(record);
}

function sourcePriority(record) {
  const year=rulesetOf(record)==="dnd5e-2024"?0:1;
  return year*1000+(SOURCE_PRIORITY[sourceKeyOf(record)]??500);
}

function parentName(record) {
  return textValue(record?.summary?.parent_class)||textValue(record?.subclass_of)||"";
}

export function dedupeGuidedRows(rows,kind) {
  const compatible=(Array.isArray(rows)?rows:[]).filter(isGuidedCompatible).slice()
    .sort((a,b)=>sourcePriority(a)-sourcePriority(b)||String(a.name_en||a.name||"").localeCompare(String(b.name_en||b.name||"")));
  const seen=new Set(),out=[];
  for(const row of compatible){
    const name=String(row.name_en||row.name||"").trim().toLowerCase();
    const key=kind==="subclass"?`${parentName(row).toLowerCase()}|${name}`:name;
    if(!name||seen.has(key))continue;
    seen.add(key);out.push(row);
  }
  return out.sort((a,b)=>String(a.name_en||a.name||"").localeCompare(String(b.name_en||b.name||"")));
}

export function sourceLabel(record) {
  const name=String(record?.source_name||record?.summary?.source_name||sourceKeyOf(record)||"Unknown source");
  const ruleset=rulesetOf(record);
  const year=ruleset==="dnd5e-2024"?"2024":ruleset==="dnd5e-2014"?"2014":ruleset==="a5e"?"A5E":"compatible";
  return `${name} · ${year}`;
}

function benefits(record) {
  return valueArray(record?.benefits).filter(value=>value&&typeof value==="object");
}

function benefit(record,type,namePattern=null) {
  return benefits(record).find(entry=>
    String(entry.type||"").toLowerCase()===String(type||"").toLowerCase() ||
    (namePattern&&namePattern.test(String(entry.name||"")))
  )||null;
}

function namedMatches(value,names) {
  const text=String(textValue(value)||"");
  return names.filter(name=>new RegExp(`\\b${name.replaceAll(" ","\\s+")}\\b`,"i").test(text));
}

function structuredNames(value) {
  if(Array.isArray(value))return value.map(textValue).filter(Boolean);
  if(value&&typeof value==="object")return Object.values(value).flatMap(structuredNames);
  const text=textValue(value);
  if(!text)return [];
  return text.split(/\s*(?:,|;|\band\b|\bor\b)\s*/i).map(part=>part.trim()).filter(Boolean);
}

function backgroundSkillPlan(value) {
  const text=String(textValue(value)||"");
  const matches=SKILLS.map(name=>({name,index:text.toLowerCase().indexOf(name.toLowerCase())}))
    .filter(match=>match.index>=0)
    .sort((a,b)=>a.index-b.index);
  const lower=text.toLowerCase();
  const markers=["choice of","choose ","either ","one between","two from","one of your choice"]
    .map(marker=>lower.indexOf(marker)).filter(index=>index>=0);
  const choiceAt=markers.length?Math.min(...markers):-1;
  let count=0;
  if(/(?:choice of|choose)\s+(?:two|2)|two\s+from/i.test(text))count=2;
  else if(/(?:choice of|choose)\s+(?:one|1)|\beither\b|one\s+between|\bone of your choice\b/i.test(text))count=1;
  const fixed=count&&choiceAt>=0?matches.filter(match=>match.index<choiceAt).map(match=>match.name):matches.map(match=>match.name);
  const options=count?matches.map(match=>match.name).filter(name=>!fixed.includes(name)):[];
  return {fixed:[...new Set(fixed)],choice:{count:Math.min(count,options.length),options:[...new Set(options)]}};
}

function trait(record,namePattern,typePattern=null) {
  return valueArray(pick(record,"traits","species_traits","features")).find(entry=>{
    if(!entry||typeof entry!=="object")return false;
    return namePattern.test(String(entry.name||entry.title||"")) || (typePattern&&typePattern.test(String(entry.type||"")));
  })||null;
}

function traitText(record,namePattern,typePattern=null) {
  const row=trait(record,namePattern,typePattern);
  return textValue(row?.desc??row?.description??row?.value);
}

function speciesAbilityData(record) {
  const entry=trait(record,/ability score/i);
  const text=String(textValue(entry?.desc||entry?.description)||"").replace(/\bWisdon\b/gi,"Wisdom");
  const fixed={};
  for(const match of text.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+score\s+increases?\s+by\s+(\d+)/gi)){
    const ability=ABILITIES.find(name=>name.toLowerCase()===match[1].toLowerCase());
    if(ability)fixed[ability.toLowerCase()]=Number(match[2]);
  }
  if(/ability scores? each increase by\s+(\d+)/i.test(text)){
    const amount=Number(text.match(/ability scores? each increase by\s+(\d+)/i)?.[1]||0);
    for(const ability of ABILITIES)fixed[ability.toLowerCase()]=amount;
  }

  const choices=[];
  const addChoice=(count,amount,options)=>{
    const unique=[...new Set(options)].filter(Boolean);
    if(count>0&&amount>0&&unique.length)choices.push({count:Math.min(count,unique.length),amount,options:unique});
  };
  let match=text.match(/(one|two|\d+)\s+(?:different\s+|other\s+)?ability scores? of your choice(?:, other than ([A-Za-z]+),)? increases? by\s+(\d+)/i);
  if(match){
    const count=match[1].toLowerCase()==="one"?1:match[1].toLowerCase()==="two"?2:Number(match[1]);
    const excluded=ABILITIES.find(name=>name.toLowerCase()===String(match[2]||"").toLowerCase());
    const other=/\bother\b/i.test(match[0]);
    const options=ABILITIES.filter(name=>name!==excluded&&(!other||fixed[name.toLowerCase()]==null));
    addChoice(count,Number(match[3]),options);
  }
  match=text.match(/(?:choose to increase\s+)?either your\s+([A-Za-z]+)\s+or\s+([A-Za-z]+)\s+score by\s+(\d+)/i)
    ||text.match(/your\s+([A-Za-z]+)\s+or\s+([A-Za-z]+)\s+score increases? by\s+(\d+)/i);
  if(match){
    const options=[match[1],match[2]].map(raw=>ABILITIES.find(name=>name.toLowerCase()===raw.toLowerCase())).filter(Boolean);
    for(const option of options)delete fixed[option.toLowerCase()];
    addChoice(1,Number(match[3]),options);
  }
  return {fixed,choices};
}

function normalizeCommon(record) {
  const document=record?.document||{};
  return {
    source_key:String(document.key||""),
    source_name:String(document.name||document.display_name||document.key||"Unknown source"),
    publisher:textValue(document.publisher),
    gamesystem:textValue(document.gamesystem),
    ruleset:rulesetForDocument(document)
  };
}

export function normalizeBuilderRecord(kind,record) {
  const common=normalizeCommon(record);
  if(kind==="class")return {
    category:"Class",
    summary:{
      ...common,
      hit_dice:pick(record,"hit_dice","hit_die"),
      primary_ability:pick(record,"primary_ability","primary_abilities")||[],
      saving_throws:pick(record,"saving_throws","saving_throw_proficiencies")||[]
    },
    prerequisites:valueArray(pick(record,"prerequisites","requirements")),
    proficiencies:pick(record,"proficiencies","skill_proficiencies")||{},
    choices:pick(record,"proficiency_choices","choices")||{},
    starting_equipment:valueArray(pick(record,"starting_equipment","starting_equipment_options","equipment")),
    spellcasting:pick(record,"spellcasting","spellcasting_ability","spellcasting_progression","caster_type")||{},
    progression:pick(record,"levels","level_progression","progression")||{},
    traits:valueArray(pick(record,"features","class_features"))
  };

  if(kind==="subclass")return {
    category:"Subclass",
    summary:{
      ...common,
      parent_class:textValue(pick(record,"subclass_of","parent_class","class")),
      parent_class_key:String(pick(record,"subclass_of","parent_class")?.key||""),
      primary_ability:pick(record,"primary_ability","primary_abilities")||[]
    },
    prerequisites:valueArray(pick(record,"prerequisites","requirements")),
    proficiencies:pick(record,"proficiencies","skill_proficiencies")||{},
    choices:pick(record,"proficiency_choices","choices")||{},
    starting_equipment:[],
    spellcasting:pick(record,"spellcasting","spellcasting_ability","spellcasting_progression","caster_type")||{},
    progression:pick(record,"levels","level_progression","progression")||{},
    traits:valueArray(pick(record,"features","class_features"))
  };

  if(kind==="species"){
    const speciesTraits=valueArray(pick(record,"traits","species_traits","features"));
    const parent=pick(record,"subspecies_of","parent_species");
    const abilityData=speciesAbilityData(record);
    return {
      category:parent?"Subspecies":"Species",
      summary:{
        ...common,
        size:pick(record,"size","sizes")||traitText(record,/^size$/i,/^size$/i),
        speed:pick(record,"speed","walk_speed")||traitText(record,/^speed$/i,/^speed$/i),
        creature_type:pick(record,"creature_type","type")||traitText(record,/creature type/i,/creature/i)||"Humanoid",
        parent_species:textValue(parent),
        parent_species_key:typeof parent==="string"?parent:String(parent?.key||""),
        is_subspecies:Boolean(record?.is_subspecies||parent),
        ability_scores:abilityData.fixed,
        ability_score_choices:abilityData.choices
      },
      prerequisites:[],
      proficiencies:{
        languages:pick(record,"languages","language_options")||[],
        skills:pick(record,"skill_proficiencies","proficiencies")||[]
      },
      choices:{
        ability_scores:pick(record,"ability_score_increases","ability_scores","ability_score_options")||{},
        languages:pick(record,"language_options")||[]
      },
      starting_equipment:[],
      spellcasting:pick(record,"spellcasting","innate_spellcasting")||{},
      progression:{},
      traits:speciesTraits
    };
  }

  if(kind==="background"){
    const abilityValue=pick(record,"ability_scores","ability_score_increases","ability_score_options")
      ||benefit(record,"ability_score",/^ability scores?$/i)?.desc;
    const featValue=pick(record,"feat","origin_feat","origin_feat_name")
      ||benefit(record,"feat",/^feat$/i)?.desc;
    const skillValue=pick(record,"skill_proficiencies","skills","proficiencies")
      ||benefit(record,"skill_proficiency",/^skill proficiencies$/i)?.desc;
    const toolValue=pick(record,"tool_proficiencies","tools")
      ||benefit(record,"tool_proficiency",/^tool proficienc/i)?.desc;
    const languageValue=pick(record,"languages","language_options")
      ||benefit(record,"language",/^languages?$/i)?.desc;
    const equipmentValue=pick(record,"starting_equipment","starting_equipment_options","equipment","equipment_options")
      ||benefit(record,"equipment",/^equipment$/i)?.desc;
    const featureBenefits=benefits(record).filter(entry=>String(entry.type||"").toLowerCase()==="feature");
    const parsedAbilities=namedMatches(abilityValue,ABILITIES);
    const skillPlan=backgroundSkillPlan(skillValue);
    return {
      category:"Background",
      summary:{
        ...common,
        ability_scores:parsedAbilities,
        feat:textValue(featValue),
        skills:skillPlan.fixed,
        skill_choice:skillPlan.choice,
        legacy:parsedAbilities.length!==3
      },
      prerequisites:[],
      proficiencies:{skills:skillPlan.fixed,tools:structuredNames(toolValue),languages:structuredNames(languageValue)},
      choices:pick(record,"choices","equipment_options","language_options")||{},
      starting_equipment:valueArray(equipmentValue).map(textValue).filter(Boolean),
      spellcasting:{},
      progression:{},
      traits:featureBenefits.length?featureBenefits:valueArray(pick(record,"features","traits"))
    };
  }

  const featBenefits=benefits(record).map((entry,index)=>({
    name:textValue(entry.name)||`Benefit ${index+1}`,
    desc:textValue(entry.desc)||"",
    type:entry.type||"benefit"
  }));
  return {
    category:textValue(pick(record,"category","feat_category","type"))||"Feat",
    summary:{
      ...common,
      category:pick(record,"category","feat_category","type"),
      repeatable:pick(record,"repeatable"),
      level:pick(record,"level","minimum_level")
    },
    prerequisites:valueArray(pick(record,"prerequisites","requirements","prerequisite")).filter(value=>textValue(value)),
    proficiencies:{},
    choices:pick(record,"choices","options")||{},
    starting_equipment:[],
    spellcasting:{},
    progression:{},
    traits:featBenefits.length?featBenefits:valueArray(pick(record,"features","traits"))
  };
}

export function applyLegacySpeciesBonuses(scores,speciesSummary,selections=[]) {
  const out={...scores};
  const bonuses=speciesSummary?.ability_scores;
  if(!bonuses||typeof bonuses!=="object"||Array.isArray(bonuses))return out;
  for(const [key,value] of Object.entries(bonuses)){
    const ability=String(key||"").toLowerCase();
    if(!(ability in out))continue;
    const bonus=Math.max(0,Math.min(3,Number(value)||0));
    out[ability]=Math.min(20,Number(out[ability]||0)+bonus);
  }
  let selectionIndex=0;
  for(const group of valueArray(speciesSummary?.ability_score_choices)){
    const count=Math.max(0,Number(group?.count)||0);
    const amount=Math.max(0,Math.min(3,Number(group?.amount)||0));
    const options=valueArray(group?.options).map(value=>String(value).toLowerCase());
    const chosen=valueArray(selections).slice(selectionIndex,selectionIndex+count).map(value=>String(value));
    selectionIndex+=count;
    for(const name of chosen){
      const ability=name.toLowerCase();
      if(!options.includes(ability)&&!options.includes(ABILITIES.find(item=>item.toLowerCase()===ability)))continue;
      if(!(ability in out))continue;
      out[ability]=Math.min(20,Number(out[ability]||0)+amount);
    }
  }
  return out;
}
