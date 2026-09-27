import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { applyHitPointDelta, concentrationDC, pendingConcentrationChecks, adjustCharacterHitPoints,
  adjustEncounterHitPoints, setTemporaryHitPoints, resolveConcentrationCheck } from '../src/web/combat-state.mjs';

const actor = (extra = {}) => ({ hp_current: 40, hp_max: 50, temp_hp: 10,
  feature_choices: { concentration: { name: 'Bless', started_at: 'test' }, other_choice: ['keep'] }, ...extra });

test('damage consumes temporary HP first but all damage determines concentration DC', () => {
  const original = actor();
  const small = applyHitPointDelta(original, -6);
  assert.equal(small.hp_current, 40);
  assert.equal(small.temp_hp, 4);
  assert.equal(small.feature_choices.concentration.check_dc, 10);
  assert.equal(small.feature_choices.concentration.last_damage, 6);
  const large = applyHitPointDelta(original, -31);
  assert.equal(large.hp_current, 19);
  assert.equal(large.temp_hp, 0);
  assert.equal(large.feature_choices.concentration.check_dc, 15);
  assert.deepEqual(original, actor(), 'input and unrelated choices remain intact');
});

test('2024 concentration difficulty rounds down and is capped at 30', () => {
  assert.deepEqual([1, 20, 21, 23, 59, 60, 61, 100].map(concentrationDC), [10, 10, 10, 11, 29, 30, 30, 30]);
});

test('healing preserves temporary HP and pending saves; zero HP ends concentration', () => {
  const hurt = applyHitPointDelta(actor(), -3);
  const healed = applyHitPointDelta(hurt, 30);
  assert.equal(healed.hp_current, 50);
  assert.equal(healed.temp_hp, 7);
  assert.deepEqual(healed.feature_choices, hurt.feature_choices);
  const down = applyHitPointDelta(actor(), -50);
  assert.equal(down.hp_current, 0);
  assert.equal(down.temp_hp, 0);
  assert.ok(!Object.hasOwn(down.feature_choices, 'concentration'));
  assert.deepEqual(down.feature_choices.other_choice, ['keep']);
});

test('separate hits queue separate saves and retain pre-update pending checks', () => {
  const old = actor({ feature_choices: { concentration: { name: 'Bless', check_dc: 12, last_damage: 23 } } });
  const next = applyHitPointDelta(applyHitPointDelta(old, -2), -3);
  const checks = pendingConcentrationChecks(next.feature_choices.concentration);
  assert.deepEqual(checks.map(x => [x.dc, x.damage]), [[11, 23], [10, 2], [10, 3]]);
  assert.equal(new Set(checks.map(x => x.id)).size, 3);
});

test('invalid HP input is rejected before it can change state', () => {
  for (const value of ['', undefined, 'oops', '1.5', Infinity, -10000]) {
    assert.throws(() => applyHitPointDelta(actor(), value), /whole number/);
  }
  assert.deepEqual(applyHitPointDelta(actor(), 0), actor());
});

function sqlAdapter(db) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? '$' + i : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  sql.json = value => JSON.stringify(value);
  sql.begin = callback => db.transaction(tx => callback(sqlAdapter(tx)));
  return sql;
}

const characterId = '00000000-0000-4000-8000-000000000001';
const encounterA = '00000000-0000-4000-8000-000000000010';
const encounterB = '00000000-0000-4000-8000-000000000020';
const combatantA = '00000000-0000-4000-8000-000000000100';
const combatantB = '00000000-0000-4000-8000-000000000200';
const monsterId = '00000000-0000-4000-8000-000000000300';

test('combat persistence uses PostgreSQL transactions for HP, concentration and the roll log', async t => {
  const db = new PGlite();
  const sql = sqlAdapter(db);
  try {
    await db.exec(`
      CREATE TABLE characters (id uuid PRIMARY KEY, name text, hp_current int CHECK (hp_current>=0),
        hp_max int, temp_hp int CHECK (temp_hp>=0), feature_choices jsonb, updated_at timestamptz DEFAULT now());
      CREATE TABLE encounter_combatants (id uuid PRIMARY KEY, encounter_id uuid,
        character_id uuid REFERENCES characters(id), hp_current int CHECK (hp_current>=0), hp_max int,
        updated_at timestamptz DEFAULT now());
      CREATE TABLE roll_log (id serial PRIMARY KEY, label text, formula text, total int, detail jsonb);
    `);
    const reset = async () => {
      await db.exec('TRUNCATE encounter_combatants, characters, roll_log');
      await sql`INSERT INTO characters(id,name,hp_current,hp_max,temp_hp,feature_choices)
        VALUES (${characterId},'Arlen',40,50,10,${sql.json(actor().feature_choices)})`;
      await sql`INSERT INTO encounter_combatants(id,encounter_id,character_id,hp_current,hp_max)
        VALUES (${combatantA},${encounterA},${characterId},40,50),
               (${combatantB},${encounterB},${characterId},40,50),
               (${monsterId},${encounterA},NULL,12,12)`;
    };
    const character = async () => (await sql`SELECT * FROM characters WHERE id=${characterId}`)[0];
    const fixedRoll = total => () => ({ formula: '1d20+3', total, parts: [`fixed ${total}`], dice: [] });

    await t.test('encounter damage matches sheet damage and updates every linked HP snapshot', async () => {
      await reset();
      await adjustEncounterHitPoints(sql, encounterA, combatantA, -17);
      const next = await character();
      assert.equal(next.hp_current, 33);
      assert.equal(next.temp_hp, 0);
      assert.equal(next.feature_choices.concentration.last_damage, 17);
      const snapshots = await sql`SELECT hp_current FROM encounter_combatants WHERE character_id=${characterId}`;
      assert.deepEqual(snapshots.map(x => x.hp_current), [33, 33]);
      await adjustCharacterHitPoints(sql, characterId, -2);
      assert.equal(pendingConcentrationChecks((await character()).feature_choices.concentration).length, 2);
    });

    await t.test('an old encounter snapshot cannot undo healing or a rest on the character sheet', async () => {
      await reset();
      await sql`UPDATE characters SET hp_current=48,temp_hp=0 WHERE id=${characterId}`;
      await adjustEncounterHitPoints(sql, encounterA, combatantA, -5);
      assert.equal((await character()).hp_current, 43);
      await adjustCharacterHitPoints(sql, characterId, 50);
      assert.equal((await character()).hp_current, 50);
    });

    await t.test('wrong encounter and invalid input cannot change a character or monster', async () => {
      await reset();
      await assert.rejects(adjustEncounterHitPoints(sql, encounterB, combatantA, -8), /not found/);
      await assert.rejects(adjustCharacterHitPoints(sql, characterId, '1.5'), /whole number/);
      assert.equal((await character()).hp_current, 40);
      await adjustEncounterHitPoints(sql, encounterA, monsterId, -99);
      assert.equal((await sql`SELECT hp_current FROM encounter_combatants WHERE id=${monsterId}`)[0].hp_current, 0);
      assert.equal((await character()).hp_current, 40);
    });

    await t.test('temporary HP replace the buffer without healing, stacking or clearing checks', async () => {
      await reset();
      await adjustCharacterHitPoints(sql, characterId, -2);
      const before = await character();
      await setTemporaryHitPoints(sql, characterId, 4);
      const after = await character();
      assert.equal(after.temp_hp, 4);
      assert.equal(after.hp_current, before.hp_current);
      assert.deepEqual(after.feature_choices, before.feature_choices);
      await setTemporaryHitPoints(sql, characterId, 0);
      assert.equal((await character()).temp_hp, 0);
    });

    await t.test('successful saves resolve one hit at a time and duplicate requests cannot consume the next', async () => {
      await reset();
      await adjustCharacterHitPoints(sql, characterId, -2);
      await adjustEncounterHitPoints(sql, encounterA, combatantA, -3);
      const [first, second] = pendingConcentrationChecks((await character()).feature_choices.concentration);
      await resolveConcentrationCheck(sql, characterId, first.id, fixedRoll(18));
      assert.equal(pendingConcentrationChecks((await character()).feature_choices.concentration)[0].id, second.id);
      await assert.rejects(resolveConcentrationCheck(sql, characterId, first.id, fixedRoll(18)), /changed/);
      await resolveConcentrationCheck(sql, characterId, second.id, fixedRoll(18));
      assert.equal(pendingConcentrationChecks((await character()).feature_choices.concentration).length, 0);
      assert.equal((await character()).feature_choices.concentration.name, 'Bless');
      assert.equal((await sql`SELECT * FROM roll_log`).length, 2);
      await assert.rejects(resolveConcentrationCheck(sql, characterId, second.id, fixedRoll(18)), /No concentration/);
    });

    await t.test('failed saves and zero HP end concentration and discard remaining saves', async () => {
      await reset();
      await adjustCharacterHitPoints(sql, characterId, -1);
      await adjustCharacterHitPoints(sql, characterId, -1);
      const [first] = pendingConcentrationChecks((await character()).feature_choices.concentration);
      const result = await resolveConcentrationCheck(sql, characterId, first.id, fixedRoll(4));
      assert.equal(result.success, false);
      assert.ok(!(await character()).feature_choices.concentration);
      assert.deepEqual((await character()).feature_choices.other_choice, ['keep']);
      await reset();
      await adjustEncounterHitPoints(sql, encounterA, combatantA, -70);
      assert.equal((await character()).hp_current, 0);
      assert.ok(!(await character()).feature_choices.concentration);
    });

    await t.test('a failed log write rolls back the concentration change', async () => {
      await reset();
      await adjustCharacterHitPoints(sql, characterId, -1);
      const before = (await character()).feature_choices;
      const [first] = pendingConcentrationChecks(before.concentration);
      await db.exec('ALTER TABLE roll_log ADD CONSTRAINT test_reject_roll CHECK (total < 0)');
      await assert.rejects(resolveConcentrationCheck(sql, characterId, first.id, fixedRoll(18)), /test_reject_roll/);
      assert.deepEqual((await character()).feature_choices, before);
      assert.equal((await sql`SELECT * FROM roll_log`).length, 0);
      await db.exec('ALTER TABLE roll_log DROP CONSTRAINT test_reject_roll');
    });
  } finally { await db.close(); }
});
