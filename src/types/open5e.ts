export type Open5eDocument = {
  key?: string;
  name?: string;
  license?: string;
  url?: string;
};

export type Open5eNamedBlock = {
  name?: string;
  desc?: string;
  description?: string;
  [key: string]: unknown;
};

export type Open5eCreature = {
  key?: string;
  slug?: string;
  name: string;
  desc?: string;
  description?: string;
  document?: Open5eDocument;

  size?: unknown;
  type?: unknown;
  subtype?: unknown;
  alignment?: unknown;

  armor_class?: unknown;
  ac?: unknown;
  armor_detail?: unknown;

  hit_points?: number;
  hit_dice?: string;

  speed?: unknown;

  // V1/legacy-style direct fields
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;

  // V2-style grouped fields
  ability_scores?: unknown;
  modifiers?: unknown;
  saving_throws?: unknown;
  skill_bonuses?: unknown;
  skill_bonuses_all?: unknown;
  skills?: unknown;

  saving_throw_strength?: number | null;
  saving_throw_dexterity?: number | null;
  saving_throw_constitution?: number | null;
  saving_throw_intelligence?: number | null;
  saving_throw_wisdom?: number | null;
  saving_throw_charisma?: number | null;

  damage_vulnerabilities?: unknown;
  damage_resistances?: unknown;
  damage_immunities?: unknown;
  condition_immunities?: unknown;

  senses?: unknown;
  languages?: unknown;
  passive_perception?: number | null;
  darkvision_range?: number | null;
  blindsight_range?: number | null;
  tremorsense_range?: number | null;
  truesight_range?: number | null;
  normal_sight_range?: number | null;
  telepathy_range?: number | null;

  challenge_rating?: unknown;
  challenge_rating_decimal?: unknown;
  proficiency_bonus?: number;
  experience_points?: number;
  xp?: number;

  traits?: Open5eNamedBlock[];
  special_abilities?: Open5eNamedBlock[];
  actions?: Open5eNamedBlock[];
  bonus_actions?: Open5eNamedBlock[];
  reactions?: Open5eNamedBlock[];
  legendary_actions?: Open5eNamedBlock[];

  [key: string]: unknown;
};

export type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
};
