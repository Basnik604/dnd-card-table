import "dotenv/config";
import { sql } from "../../db/client.js";
import {
  getExisting,
  replaceTags,
  stableHash,
  upsertBaseEntity,
  type GenericRecord,
  type ImportStatus
} from "./common.js";

/**
 * Open5e currently does not expose the SRD 5.2 condition glossary as
 * document=srd-2024 records through the conditions endpoint.
 *
 * For conditions we therefore use a small canonical seed based on the
 * official SRD 5.2 Rules Glossary (CC BY 4.0) instead of pretending that
 * "0 imported" is a valid result.
 *
 * English is canonical. Russian localization will be stored separately
 * in the translations table later.
 */
const CONDITIONS: GenericRecord[] = [
  {
    key: "blinded",
    name: "Blinded",
    description: "You cannot see; sight-dependent checks fail, your attacks are hindered, and attacks against you are helped.",
    mechanics: {
      canSee: false,
      autoFailSightChecks: true,
      ownAttackRolls: "disadvantage",
      attacksAgainst: "advantage"
    }
  },
  {
    key: "charmed",
    name: "Charmed",
    description: "You cannot harm the charmer, and the charmer gains an edge in social interactions with you.",
    mechanics: {
      cannotHarmCharmer: true,
      charmerSocialChecks: "advantage"
    }
  },
  {
    key: "deafened",
    name: "Deafened",
    description: "You cannot hear and automatically fail ability checks that require hearing.",
    mechanics: {
      canHear: false,
      autoFailHearingChecks: true
    }
  },
  {
    key: "exhaustion",
    name: "Exhaustion",
    description: "Exhaustion stacks in levels, penalizing d20 tests and Speed; reaching level 6 is fatal.",
    mechanics: {
      stackable: true,
      deathAtLevel: 6,
      d20PenaltyPerLevel: 2,
      speedPenaltyFeetPerLevel: 5,
      longRestRemovesLevels: 1
    }
  },
  {
    key: "frightened",
    name: "Frightened",
    description: "Fear hinders attacks and ability checks while its source is visible, and you cannot willingly move closer to it.",
    mechanics: {
      checksAndAttacksWhileSourceVisible: "disadvantage",
      cannotWillinglyApproachSource: true
    }
  },
  {
    key: "grappled",
    name: "Grappled",
    description: "Your Speed becomes 0, attacks against creatures other than the grappler are hindered, and the grappler can move you.",
    mechanics: {
      speed: 0,
      attacksAgainstNonGrappler: "disadvantage",
      movableByGrappler: true
    }
  },
  {
    key: "incapacitated",
    name: "Incapacitated",
    description: "You cannot take actions, Bonus Actions, or Reactions; Concentration ends and you cannot speak.",
    mechanics: {
      canTakeAction: false,
      canTakeBonusAction: false,
      canTakeReaction: false,
      breaksConcentration: true,
      canSpeak: false
    }
  },
  {
    key: "invisible",
    name: "Invisible",
    description: "You are concealed from creatures that cannot see you, improving your attacks and hindering attacks against you.",
    mechanics: {
      ownAttackRollsAgainstCreaturesThatCannotSeeYou: "advantage",
      attacksAgainstFromCreaturesThatCannotSeeYou: "disadvantage"
    }
  },
  {
    key: "paralyzed",
    name: "Paralyzed",
    description: "You are incapacitated with Speed 0, fail Strength and Dexterity saves, and nearby hits become critical hits.",
    mechanics: {
      includes: ["incapacitated"],
      speed: 0,
      autoFailSaves: ["strength", "dexterity"],
      attacksAgainst: "advantage",
      hitsWithinFeetAreCritical: 5
    }
  },
  {
    key: "petrified",
    name: "Petrified",
    description: "You become an inanimate substance, are incapacitated and immobile, and gain broad protection from damage.",
    mechanics: {
      includes: ["incapacitated"],
      speed: 0,
      attacksAgainst: "advantage",
      transformedToInanimateSubstance: true
    }
  },
  {
    key: "poisoned",
    name: "Poisoned",
    description: "Poison impairs both your attack rolls and your ability checks.",
    mechanics: {
      attackRolls: "disadvantage",
      abilityChecks: "disadvantage"
    }
  },
  {
    key: "prone",
    name: "Prone",
    description: "You fight from the ground; standing costs movement, your attacks are hindered, and nearby attackers gain an edge.",
    mechanics: {
      ownAttackRolls: "disadvantage",
      attacksAgainstWithinFeet: { distance: 5, result: "advantage" },
      attacksAgainstBeyondFeet: { distance: 5, result: "disadvantage" }
    }
  },
  {
    key: "restrained",
    name: "Restrained",
    description: "Your Speed becomes 0; your attacks and Dexterity saves are hindered, while attacks against you are helped.",
    mechanics: {
      speed: 0,
      ownAttackRolls: "disadvantage",
      attacksAgainst: "advantage",
      dexteritySavingThrows: "disadvantage"
    }
  },
  {
    key: "stunned",
    name: "Stunned",
    description: "You are incapacitated, fail Strength and Dexterity saves, and attacks against you gain an edge.",
    mechanics: {
      includes: ["incapacitated"],
      autoFailSaves: ["strength", "dexterity"],
      attacksAgainst: "advantage"
    }
  },
  {
    key: "unconscious",
    name: "Unconscious",
    description: "You are incapacitated and prone with Speed 0; attacks against you are helped and nearby hits become critical hits.",
    mechanics: {
      includes: ["incapacitated", "prone"],
      speed: 0,
      attacksAgainst: "advantage",
      autoFailSaves: ["strength", "dexterity"],
      hitsWithinFeetAreCritical: 5,
      awareOfSurroundings: false
    }
  }
];

const RULESET = "dnd5e-2024";

async function ensureOfficialSource(): Promise<string> {
  const rows = await sql`
    INSERT INTO content_sources (
      provider,
      document_key,
      name,
      ruleset,
      license_code,
      license_url,
      attribution_text,
      api_base_url
    )
    VALUES (
      'wotc-srd',
      'srd-5.2-conditions',
      'System Reference Document 5.2 — Conditions',
      ${RULESET},
      'CC-BY-4.0',
      'https://creativecommons.org/licenses/by/4.0/',
      'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
      'https://www.dndbeyond.com/srd'
    )
    ON CONFLICT (provider, document_key)
    DO UPDATE SET
      name = EXCLUDED.name,
      ruleset = EXCLUDED.ruleset,
      license_code = EXCLUDED.license_code,
      license_url = EXCLUDED.license_url,
      attribution_text = EXCLUDED.attribution_text,
      api_base_url = EXCLUDED.api_base_url
    RETURNING id
  `;
  return String(rows[0].id);
}

async function importCondition(
  sourceId: string,
  record: GenericRecord
): Promise<ImportStatus> {
  const key = String(record.key);
  const hash = stableHash(record);
  const existing = await getExisting(sourceId, "condition", key);

  if (
    existing.length &&
    existing[0].source_hash === hash &&
    existing[0].import_complete === true
  ) {
    return "unchanged";
  }

  const sourceRecord: GenericRecord = {
    ...record,
    source: "SRD 5.2 Rules Glossary",
    license: "CC-BY-4.0"
  };

  const { entityId } = await upsertBaseEntity({
    sourceId,
    entityType: "condition",
    record: sourceRecord,
    hash
  });

  await sql`
    INSERT INTO conditions(entity_id, mechanics)
    VALUES (
      ${entityId},
      ${sql.json((record.mechanics ?? {}) as any)}
    )
    ON CONFLICT (entity_id)
    DO UPDATE SET mechanics = EXCLUDED.mechanics
  `;

  await replaceTags(entityId, [
    "condition",
    "rules-glossary",
    "source:srd-5.2"
  ]);

  return existing.length ? "updated" : "created";
}

async function main() {
  const sourceId = await ensureOfficialSource();

  const runRows = await sql`
    INSERT INTO import_runs(source_id, entity_type, status)
    VALUES (${sourceId}, 'condition', 'running')
    RETURNING id
  `;
  const runId = String(runRows[0].id);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const errors: Array<{ key?: string; name?: string; error: string }> = [];

  for (const record of CONDITIONS) {
    try {
      const status = await importCondition(sourceId, record);
      if (status === "created") created++;
      if (status === "updated") updated++;
      if (status === "unchanged") unchanged++;
    } catch (error) {
      failed++;
      errors.push({
        key: String(record.key ?? ""),
        name: String(record.name ?? ""),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await sql`
    UPDATE import_runs
    SET
      finished_at = NOW(),
      status = ${failed ? "completed_with_errors" : "completed"},
      discovered = ${CONDITIONS.length},
      created = ${created},
      updated = ${updated},
      unchanged = ${unchanged},
      failed = ${failed},
      errors = ${sql.json(errors)}
    WHERE id = ${runId}
  `;

  console.log({
    discovered: CONDITIONS.length,
    created,
    updated,
    unchanged,
    failed
  });

  await sql.end();
}

await main();
