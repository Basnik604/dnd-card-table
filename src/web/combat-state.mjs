import { randomUUID } from 'node:crypto';

// D&D 2024: damage is the amount after resistance/vulnerability, before
// temporary HP absorbs it. Each application is a separate damage source.
export function concentrationDC(damage) {
  return Math.min(30, Math.max(10, Math.floor(damage / 2)));
}

function integerInput(value, { min = 0, max = 9999 } = {}) {
  const n = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error('Enter a whole number within the allowed range.');
  }
  return n;
}

export function pendingConcentrationChecks(state) {
  if (!state?.name) return [];
  if (Array.isArray(state.pending_checks)) return state.pending_checks;
  // Read pre-v0.23.1 saves without a database migration.
  if (Number(state.check_dc) > 0) {
    const damage = Math.max(0, Number(state.last_damage) || 0);
    const dc = damage ? concentrationDC(damage) : Math.min(30, Math.max(10, Number(state.check_dc)));
    return [{ id: `legacy:${state.started_at || ''}:${dc}:${damage}`, dc, damage }];
  }
  return [];
}

function withChecks(state, checks) {
  return { ...state, pending_checks: checks, check_dc: checks[0]?.dc ?? null, last_damage: checks[0]?.damage ?? null };
}

export function applyHitPointDelta(character, rawDelta) {
  const delta = integerInput(rawDelta, { min: -9999 });
  const current = Math.max(0, Number(character.hp_current) || 0);
  const maximum = Math.max(1, Number(character.hp_max) || 1);
  const temporary = Math.max(0, Number(character.temp_hp) || 0);
  const choices = { ...(character.feature_choices || {}) };
  const damage = Math.max(0, -delta);
  const absorbed = Math.min(temporary, damage);
  const hp = Math.max(0, Math.min(maximum, current + (delta < 0 ? -(damage - absorbed) : delta)));
  const state = choices.concentration;
  if (damage && state?.name) {
    if (hp === 0) delete choices.concentration;
    else choices.concentration = withChecks(state, [
      ...pendingConcentrationChecks(state),
      { id: randomUUID(), dc: concentrationDC(damage), damage }
    ]);
  }
  return { ...character, hp_current: hp, temp_hp: temporary - absorbed, feature_choices: choices };
}

export async function updateCharacterHp(tx, characterId, delta, {preserveTemporaryHp = false} = {}) {
  const rows = await tx`
    SELECT id::text, hp_current, hp_max, temp_hp, feature_choices
    FROM characters WHERE id=${characterId} FOR UPDATE
  `;
  if (!rows.length) throw new Error('Character not found');
  const next = applyHitPointDelta(preserveTemporaryHp ? {...rows[0],temp_hp:0} : rows[0], delta);
  if(preserveTemporaryHp) next.temp_hp = rows[0].temp_hp;
  await tx`
    UPDATE characters SET hp_current=${next.hp_current}, temp_hp=${next.temp_hp},
      feature_choices=${tx.json(next.feature_choices)}, updated_at=NOW()
    WHERE id=${characterId}
  `;
  await tx`
    UPDATE encounter_combatants SET hp_current=${next.hp_current}, hp_max=${next.hp_max}, updated_at=NOW()
    WHERE character_id=${characterId}
  `;
  return next;
}

export function adjustCharacterHitPoints(sql, characterId, delta) {
  return sql.begin(tx => updateCharacterHp(tx, characterId, delta));
}

export function adjustEncounterHitPoints(sql, encounterId, combatantId, delta) {
  return sql.begin(async tx => {
    const targets = await tx`
      SELECT character_id::text FROM encounter_combatants
      WHERE encounter_id=${encounterId} AND id=${combatantId}
    `;
    if (!targets.length) throw new Error('Combatant not found in this encounter.');
    if (targets[0].character_id) return updateCharacterHp(tx, targets[0].character_id, delta);
    const rows = await tx`
      SELECT id::text, hp_current, hp_max FROM encounter_combatants
      WHERE encounter_id=${encounterId} AND id=${combatantId} FOR UPDATE
    `;
    if (!rows.length) throw new Error('Combatant not found in this encounter.');
    const next = applyHitPointDelta(rows[0], delta);
    await tx`
      UPDATE encounter_combatants SET hp_current=${next.hp_current}, updated_at=NOW()
      WHERE encounter_id=${encounterId} AND id=${combatantId}
    `;
    return next;
  });
}

export async function setTemporaryHitPoints(sql, characterId, amount) {
  const value = integerInput(amount);
  const rows = await sql`
    UPDATE characters SET temp_hp=${value}, updated_at=NOW()
    WHERE id=${characterId} RETURNING temp_hp
  `;
  if (!rows.length) throw new Error('Character not found');
  return value;
}

export function resolveConcentrationCheck(sql, characterId, checkId, rollForCharacter) {
  return sql.begin(async tx => {
    const rows = await tx`SELECT * FROM characters WHERE id=${characterId} FOR UPDATE`;
    if (!rows.length) throw new Error('Character not found');
    const character = rows[0];
    const choices = { ...(character.feature_choices || {}) };
    const state = choices.concentration;
    if (!state?.name) throw new Error('Character is not concentrating');
    const checks = pendingConcentrationChecks(state);
    if (!checks.length) throw new Error('No concentration save is pending.');
    if (checkId !== checks[0].id) throw new Error('Concentration check changed. Refresh the page.');
    const dc = checks[0].dc;
    const roll = rollForCharacter(character);
    const success = roll.total >= dc;
    if (success) choices.concentration = {
      ...withChecks(state, checks.slice(1)),
      last_check: { total: roll.total, dc, success: true, at: new Date().toISOString() }
    };
    else delete choices.concentration;
    await tx`
      UPDATE characters SET feature_choices=${tx.json(choices)}, updated_at=NOW()
      WHERE id=${characterId}
    `;
    await tx`
      INSERT INTO roll_log(label, formula, total, detail)
      VALUES (${`${character.name} — Concentration save DC ${dc}`}, ${roll.formula}, ${roll.total},
        ${tx.json([...roll.parts, success ? 'SUCCESS' : 'FAILURE'])})
    `;
    return { character: { ...character, feature_choices: choices }, roll, dc, success };
  });
}
