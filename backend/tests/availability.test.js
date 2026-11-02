// Model and schema tests for surfer availability (surfer_availability).
//
// Like the other database tests, these use the test database
// (TEST_DATABASE_URL, or DATABASE_URL when it isn't set) and only create
// @sesh-test.invalid users, deleted afterwards (their availability rows go
// with them: ON DELETE CASCADE). The seeded surf spots are only read; the one
// test that tries to delete a spot runs in a transaction that is rolled back.
import './setup.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sequelize } from '../src/db/index.js';
import { SurfSpot, SurferAvailability, User } from '../src/models/index.js';
import {
  ARRIVAL_TYPES,
  ARRIVAL_WINDOW_START_HOURS,
  AVAILABILITY_STATUSES,
  AVAILABILITY_TIME_ZONE,
  RELATIVE_ARRIVAL_MINUTES,
  currentlyAvailableWhere,
} from '../src/models/SurferAvailability.js';
import { deleteTestUsers, testEmail } from './helpers.js';

const CARCAVELOS = 'pt-cascais-carcavelos';
const HOUR = 60 * 60 * 1000;
const at = (iso) => new Date(iso);

// Valid example rows, one per status / arrival mode (times are absolute)
const VALID = {
  active: { status: 'active', expiresAt: at('2026-07-15T22:59:59Z') },
  activeAtSpot: { status: 'active', spotId: CARCAVELOS, expiresAt: at('2026-07-15T22:59:59Z') },
  relative: {
    status: 'coming_soon',
    spotId: CARCAVELOS,
    arrivalType: 'relative',
    arrivalOffsetMinutes: 120,
    arrivalAt: at('2026-07-15T11:00:00Z'), // 12:00 Lisbon (summer time)
    expiresAt: at('2026-07-15T12:00:00Z'),
  },
  window: {
    status: 'coming_soon',
    spotId: CARCAVELOS,
    arrivalType: 'window',
    windowStartsAt: at('2026-07-15T08:00:00Z'), // 09:00–11:00 Lisbon (summer time)
    windowEndsAt: at('2026-07-15T10:00:00Z'),
    expiresAt: at('2026-07-15T11:00:00Z'),
  },
  atSpot: { status: 'at_spot', spotId: CARCAVELOS, expiresAt: at('2026-07-15T13:00:00Z') },
  off: { status: 'off' },
};

let counter = 0;
async function testUser() {
  counter += 1;
  return User.create({ email: testEmail(`availability-${counter}`), passwordHash: 'not-a-real-hash' });
}

// Creates a row while skipping the model's own checks, so the database
// constraints are what's being tested
async function insertRaw(fields) {
  const user = await testUser();
  return SurferAvailability.create({ userId: user.id, ...fields }, { validate: false });
}

async function assertCheckViolation(fields, constraint) {
  await assert.rejects(insertRaw(fields), (error) => {
    assert.equal(error.parent?.code, '23514', `expected a CHECK violation for ${JSON.stringify(fields)}`);
    if (constraint) assert.equal(error.parent.constraint, constraint);
    return true;
  });
}

before(async () => {
  await deleteTestUsers();
});

after(async () => {
  await deleteTestUsers();
  await sequelize.close();
});

describe('model definition', () => {
  test('constants describe the MVP rules', () => {
    assert.deepEqual(AVAILABILITY_STATUSES, ['active', 'coming_soon', 'at_spot', 'off']);
    assert.deepEqual(ARRIVAL_TYPES, ['relative', 'window']);
    assert.deepEqual(RELATIVE_ARRIVAL_MINUTES, [30, 60, 120]);
    assert.deepEqual(ARRIVAL_WINDOW_START_HOURS, [5, 7, 9, 11, 13, 15, 17, 19]);
    assert.equal(AVAILABILITY_TIME_ZONE, 'Europe/Lisbon');
  });

  test('associations: user 1–0..1 availability, availability 0..1 spot', () => {
    assert.equal(User.associations.availability.associationType, 'HasOne');
    assert.equal(SurferAvailability.associations.User.associationType, 'BelongsTo');
    assert.equal(SurferAvailability.associations.spot.associationType, 'BelongsTo');
    assert.equal(SurferAvailability.associations.spot.target, SurfSpot);
    assert.equal(SurfSpot.associations.availabilities.associationType, 'HasMany');
  });

  test('the model rejects unknown status, arrival type and offset values', async () => {
    const user = await testUser();
    for (const fields of [
      { status: 'invisible' },
      { status: 'AT_THE_SPOT' },
      { ...VALID.relative, arrivalType: 'tomorrow' },
      { ...VALID.relative, arrivalOffsetMinutes: 45 },
    ]) {
      await assert.rejects(SurferAvailability.create({ userId: user.id, ...fields }), { name: 'SequelizeValidationError' });
    }
    assert.equal(await SurferAvailability.count({ where: { userId: user.id } }), 0);
  });
});

describe('valid availability rows', () => {
  for (const [name, fields] of Object.entries(VALID)) {
    test(`stores ${name}`, async () => {
      const user = await testUser();
      const saved = await SurferAvailability.create({ userId: user.id, ...fields });
      const reloaded = await SurferAvailability.findByPk(saved.id);
      assert.equal(reloaded.status, fields.status);
      assert.equal(reloaded.spotId, fields.spotId ?? null);
      for (const field of ['arrivalAt', 'windowStartsAt', 'windowEndsAt', 'expiresAt']) {
        assert.equal(reloaded[field]?.toISOString() ?? null, fields[field]?.toISOString() ?? null, field);
      }
      assert.ok(reloaded.createdAt instanceof Date && reloaded.updatedAt instanceof Date);
    });
  }

  test('a window is accepted in both summer and winter Lisbon time', async () => {
    // 09:00 Lisbon is 08:00 UTC in July (WEST) and 09:00 UTC in December (WET)
    const winter = {
      ...VALID.window,
      windowStartsAt: at('2026-12-15T09:00:00Z'),
      windowEndsAt: at('2026-12-15T11:00:00Z'),
      expiresAt: at('2026-12-15T12:00:00Z'),
    };
    await insertRaw(VALID.window);
    await insertRaw(winter);
  });

  test('loads the user and the surf spot through the associations', async () => {
    const user = await testUser();
    await SurferAvailability.create({ userId: user.id, ...VALID.atSpot });
    const loaded = await User.findByPk(user.id, {
      include: [{ model: SurferAvailability, as: 'availability', include: [{ model: SurfSpot, as: 'spot' }] }],
    });
    assert.equal(loaded.availability.status, 'at_spot');
    assert.equal(loaded.availability.spot.id, CARCAVELOS);
    assert.equal(loaded.availability.spot.name, 'Praia de Carcavelos');
  });
});

describe('one current availability per user', () => {
  test('a second row for the same user is rejected by the database', async () => {
    const user = await testUser();
    await SurferAvailability.create({ userId: user.id, ...VALID.active });
    await assert.rejects(SurferAvailability.create({ userId: user.id, ...VALID.off }), { name: 'SequelizeUniqueConstraintError' });
    assert.equal(await SurferAvailability.count({ where: { userId: user.id } }), 1);
  });

  test('changing status updates the same row and clears old arrival data', async () => {
    const user = await testUser();
    const row = await SurferAvailability.create({ userId: user.id, ...VALID.window });
    await row.update({
      status: 'at_spot',
      arrivalType: null,
      windowStartsAt: null,
      windowEndsAt: null,
      expiresAt: at('2026-07-15T13:00:00Z'),
    });
    const reloaded = await SurferAvailability.findByPk(row.id);
    assert.equal(reloaded.status, 'at_spot');
    assert.equal(reloaded.windowStartsAt, null);
    assert.equal(await SurferAvailability.count({ where: { userId: user.id } }), 1);
  });

  test('keeping old window data when switching to At the Spot is rejected', async () => {
    const user = await testUser();
    const row = await SurferAvailability.create({ userId: user.id, ...VALID.window });
    await assert.rejects(row.update({ status: 'at_spot' }), (error) => error.parent?.code === '23514');
  });
});

describe('database constraints reject invalid combinations', () => {
  const cases = [
    // (breaks both the status and the shape check; Postgres names either one)
    ['unknown status', { status: 'invisible' }],
    ['Active without expiry', { status: 'active' }],
    ['Active with arrival data', { ...VALID.active, arrivalType: 'relative', arrivalOffsetMinutes: 30, arrivalAt: at('2026-07-15T10:00:00Z') }],
    ['Coming Soon without a spot', { ...VALID.relative, spotId: null }],
    ['Coming Soon without arrival data', { status: 'coming_soon', spotId: CARCAVELOS, expiresAt: VALID.relative.expiresAt }],
    ['Coming Soon relative without the estimate', { ...VALID.relative, arrivalAt: null }],
    ['Coming Soon relative with an unsupported offset', { ...VALID.relative, arrivalOffsetMinutes: 45 }],
    ['Coming Soon relative with window fields', { ...VALID.relative, windowStartsAt: VALID.window.windowStartsAt, windowEndsAt: VALID.window.windowEndsAt }],
    ['Coming Soon window with a relative offset', { ...VALID.window, arrivalOffsetMinutes: 60 }],
    ['Coming Soon window longer than two hours', { ...VALID.window, windowEndsAt: at('2026-07-15T11:00:00Z') }],
    ['Coming Soon without expiry', { ...VALID.window, expiresAt: null }],
    ['At the Spot without a spot', { ...VALID.atSpot, spotId: null }],
    ['At the Spot with an arrival time', { ...VALID.atSpot, arrivalAt: at('2026-07-15T10:00:00Z') }],
    ['Off with a spot', { status: 'off', spotId: CARCAVELOS }],
    ['Off with an expiry', { status: 'off', expiresAt: at('2026-07-15T13:00:00Z') }],
  ];
  for (const [name, fields, constraint] of cases) {
    test(name, () => assertCheckViolation(fields, constraint));
  }

  test('windows must start on an allowed Lisbon hour', async () => {
    const window = (startIso) => {
      const start = at(startIso);
      return { ...VALID.window, windowStartsAt: start, windowEndsAt: new Date(start.getTime() + 2 * HOUR), expiresAt: new Date(start.getTime() + 3 * HOUR) }
    };
    // 08:00 Lisbon (winter) is not a window start; neither is 09:30 or 21:00
    await assertCheckViolation(window('2026-12-15T08:00:00Z'), 'surfer_availability_window_start_check');
    await assertCheckViolation(window('2026-07-15T08:30:00Z'), 'surfer_availability_window_start_check');
    await assertCheckViolation(window('2026-07-15T20:00:00Z'), 'surfer_availability_window_start_check');
    // 09:00 UTC in summer is 10:00 Lisbon: not a window start either
    await assertCheckViolation(window('2026-07-15T09:00:00Z'), 'surfer_availability_window_start_check');
  });

  test('the surf spot must exist', async () => {
    await assert.rejects(insertRaw({ ...VALID.atSpot, spotId: 'pt-nowhere' }), { name: 'SequelizeForeignKeyConstraintError' });
  });
});

describe('relationships on delete', () => {
  test('deleting a user deletes their availability', async () => {
    const user = await testUser();
    const row = await SurferAvailability.create({ userId: user.id, ...VALID.active });
    await user.destroy();
    assert.equal(await SurferAvailability.findByPk(row.id), null);
  });

  test('a surf spot in use cannot be deleted (checked in a rolled-back transaction)', async () => {
    const user = await testUser();
    await SurferAvailability.create({ userId: user.id, ...VALID.atSpot });
    const transaction = await sequelize.transaction();
    try {
      await assert.rejects(
        SurfSpot.destroy({ where: { id: CARCAVELOS }, transaction }),
        { name: 'SequelizeForeignKeyConstraintError' },
      );
    } finally {
      await transaction.rollback();
    }
    assert.ok(await SurfSpot.findByPk(CARCAVELOS));
  });
});

describe('currently available', () => {
  test('only rows that are not Off and not expired count, even before any cleanup', async () => {
    const now = at('2026-07-15T10:00:00Z');
    const rows = {
      current: { status: 'active', expiresAt: new Date(now.getTime() + HOUR) },
      expired: { status: 'at_spot', spotId: CARCAVELOS, expiresAt: new Date(now.getTime() - 1) },
      expiringNow: { status: 'active', expiresAt: now },
      off: { status: 'off' },
    };
    const ids = {};
    for (const [name, fields] of Object.entries(rows)) {
      const user = await testUser();
      ids[name] = (await SurferAvailability.create({ userId: user.id, ...fields })).id;
    }

    const found = await SurferAvailability.findAll({
      where: { ...currentlyAvailableWhere(now), id: Object.values(ids) },
    });
    assert.deepEqual(found.map((row) => row.id), [ids.current]);

    for (const [name, id] of Object.entries(ids)) {
      const row = await SurferAvailability.findByPk(id);
      assert.equal(row.isCurrentlyAvailable(now), name === 'current', name);
    }
  });
});
