import { describe, expect, it } from 'vitest';
import { ARMY_UNIT_BY_ID, CONFIG } from '@te/config';
import {
  armyCapacity,
  availableArmyPower,
  borrowedArmyPower,
  committedArmyPower,
  totalArmyPower,
} from '@te/game-engine';
import { Harness, endTurnCleanly } from '../helpers/engine-harness.js';

const GUARD = ARMY_UNIT_BY_ID.get('guard')!;
const SIEGE = ARMY_UNIT_BY_ID.get('siege')!;

function game(names = ['Ana', 'Ben']) {
  const h = new Harness({ seed: 77 });
  const ids = h.start(names);
  return { h, ids };
}

describe('army', () => {
  it('charges the configured cost and derives power from units', () => {
    const { h } = game();
    const buyer = h.activeId();
    const cash = h.player(buyer).cash;
    h.run(buyer, 'BUY_ARMY', { unitType: 'guard', quantity: 2 });
    expect(h.player(buyer).army).toHaveLength(2);
    expect(h.player(buyer).cash).toBe(cash - GUARD.cost * 2);
    expect(totalArmyPower(h.player(buyer))).toBe(GUARD.power * 2);
  });

  it('rejects a purchase the player cannot afford', () => {
    const { h } = game();
    const buyer = h.activeId();
    h.player(buyer).cash = 100;
    expect(h.expectRejected(buyer, 'BUY_ARMY', { unitType: 'guard', quantity: 1 })).toBe(
      'INSUFFICIENT_FUNDS',
    );
  });

  it('rejects an unknown unit type', () => {
    const { h } = game();
    expect(h.expectRejected(h.activeId(), 'BUY_ARMY', { unitType: 'dragon', quantity: 1 })).toBe(
      'INVALID_ARMY',
    );
  });

  it('enforces capacity, which grows with owned cities', () => {
    const { h } = game();
    const buyer = h.activeId();
    expect(armyCapacity(h.state, buyer)).toBe(CONFIG.army.base_capacity);
    h.player(buyer).cash = 100000;
    expect(
      h.expectRejected(buyer, 'BUY_ARMY', {
        unitType: 'guard',
        quantity: CONFIG.army.base_capacity + 1,
      }),
    ).toBe('ARMY_CAPACITY_EXCEEDED');

    h.giveProperty(buyer, 'madagadipet');
    h.giveProperty(buyer, 'thirubhuvanai');
    expect(armyCapacity(h.state, buyer)).toBe(CONFIG.army.base_capacity + 1);
  });

  it('never exceeds the configured maximum capacity', () => {
    const { h } = game();
    const buyer = h.activeId();
    for (const city of ['madagadipet', 'thirubhuvanai', 'molapaakam', 'kandamangalam', 'ariyur',
      'thirukaanji', 'villianur', 'sulthanpet', 'velrampet', 'ariyankuppam', 'cuddalore',
      'kalapet', 'rediyarpalayam', 'kottakuppam', 'lawspet', 'muthialpet', 'nellithope',
      'uzhavarkarai', 'thattanchavady', 'bussy_street', 'mission_street', 'white_town']) {
      h.giveProperty(buyer, city);
    }
    expect(armyCapacity(h.state, buyer)).toBe(CONFIG.army.max_capacity);
  });

  it('refunds half when selling units', () => {
    const { h } = game();
    const seller = h.activeId();
    h.giveArmy(seller, 'guard', 2);
    const cash = h.player(seller).cash;
    h.run(seller, 'SELL_ARMY', { unitType: 'guard', quantity: 1 });
    expect(h.player(seller).army).toHaveLength(1);
    expect(h.player(seller).cash).toBe(
      cash + Math.floor(GUARD.cost * CONFIG.army.resale_percentage),
    );
  });
});

describe('alliances', () => {
  function allied() {
    const { h, ids } = game(['Ana', 'Ben', 'Cat']);
    const [a, b, c] = ids as [string, string, string];
    h.run(a, 'REQUEST_ALLIANCE', { targetPlayerId: b });
    const requestId = Object.keys(h.state.allianceRequests)[0]!;
    h.run(b, 'ACCEPT_ALLIANCE', { requestId });
    return { h, a, b, c };
  }

  it('forms an alliance on acceptance with the configured duration', () => {
    const { h, a, b } = allied();
    const alliance = Object.values(h.state.alliances)[0]!;
    expect(alliance.active).toBe(true);
    expect(alliance.playerIds).toEqual([a, b]);
    expect(alliance.expiresAfterRound).toBe(
      h.state.round + CONFIG.alliances.duration_rounds - 0,
    );
  });

  it('keeps alliance requests private to the two parties', () => {
    const { h, ids } = game(['Ana', 'Ben', 'Cat']);
    const [a, b, c] = ids as [string, string, string];
    const events = h.run(a, 'REQUEST_ALLIANCE', { targetPlayerId: b });
    const requested = events.find((event) => event.type === 'AllianceRequested');
    expect(requested?.audience).toEqual([a, b]);
    expect(requested?.audience).not.toContain(c);
  });

  it('allows only one active alliance per player', () => {
    const { h, a, c } = allied();
    expect(h.expectRejected(a, 'REQUEST_ALLIANCE', { targetPlayerId: c })).toBe('INVALID_ALLIANCE');
  });

  it('rejects a duplicate pending request', () => {
    const { h, ids } = game(['Ana', 'Ben']);
    const [a, b] = ids as [string, string];
    h.run(a, 'REQUEST_ALLIANCE', { targetPlayerId: b });
    expect(h.expectRejected(a, 'REQUEST_ALLIANCE', { targetPlayerId: b })).toBe('INVALID_ALLIANCE');
  });

  it('declines a request without forming an alliance', () => {
    const { h, ids } = game(['Ana', 'Ben']);
    const [a, b] = ids as [string, string];
    h.run(a, 'REQUEST_ALLIANCE', { targetPlayerId: b });
    const requestId = Object.keys(h.state.allianceRequests)[0]!;
    h.run(b, 'DECLINE_ALLIANCE', { requestId });
    expect(Object.values(h.state.alliances)).toHaveLength(0);
  });

  it('expires after the configured number of rounds and applies a cooldown', () => {
    const { h, a, b } = allied();
    const startRound = h.state.round;
    for (let i = 0; i < 40 && h.state.round <= startRound + CONFIG.alliances.duration_rounds; i += 1) {
      endTurnCleanly(h, h.activeId());
    }
    const alliance = Object.values(h.state.alliances)[0]!;
    expect(alliance.active).toBe(false);
    expect(h.eventsOfType('AllianceExpired')).toHaveLength(1);
    expect(h.player(a).allianceCooldownUntilRound).toBeGreaterThan(h.state.round - 1);
    expect(h.player(b).allianceCooldownUntilRound).toBeGreaterThan(h.state.round - 1);
  });
});

describe('army lending', () => {
  function alliedWithArmy() {
    const { h, ids } = game(['Ana', 'Ben', 'Cat']);
    const [a, b, c] = ids as [string, string, string];
    h.run(a, 'REQUEST_ALLIANCE', { targetPlayerId: b });
    const requestId = Object.keys(h.state.allianceRequests)[0]!;
    h.run(b, 'ACCEPT_ALLIANCE', { requestId });
    h.giveArmy(a, 'guard', 4); // 120 power available
    return { h, a, b, c };
  }

  it('caps support at the configured share of available power', () => {
    const { h, a, b } = alliedWithArmy();
    const available = availableArmyPower(h.player(a));
    const cap = Math.floor(available * CONFIG.alliances.army_lend_max_percentage_of_available_power);

    h.run(a, 'LEND_ARMY', { targetPlayerId: b, power: 1000 });
    expect(committedArmyPower(h.player(a))).toBeLessThanOrEqual(cap);
    expect(committedArmyPower(h.player(a))).toBeGreaterThan(0);
  });

  it('moves power out of available and into the ally borrowed pool', () => {
    const { h, a, b } = alliedWithArmy();
    const before = availableArmyPower(h.player(a));
    h.run(a, 'LEND_ARMY', { targetPlayerId: b, power: 30 });
    const lent = committedArmyPower(h.player(a));
    expect(availableArmyPower(h.player(a))).toBe(before - lent);
    expect(borrowedArmyPower(h.state, b)).toBe(lent);
    // Total never changes: units moved state, they were not duplicated.
    expect(totalArmyPower(h.player(a))).toBe(before);
  });

  it('refuses to lend to a non-ally', () => {
    const { h, a, c } = alliedWithArmy();
    expect(h.expectRejected(a, 'LEND_ARMY', { targetPlayerId: c, power: 30 })).toBe(
      'INVALID_ARMY_SUPPORT',
    );
  });

  it('will not sell units that are committed to an ally', () => {
    const { h, a, b } = alliedWithArmy();
    h.run(a, 'LEND_ARMY', { targetPlayerId: b, power: 30 });
    const free = h.player(a).army.filter((u) => u.state === 'active').length;
    expect(h.expectRejected(a, 'SELL_ARMY', { unitType: 'guard', quantity: free + 1 })).toBe(
      'INVALID_ARMY',
    );
  });

  it('keeps lent units locked while the alliance is active', () => {
    const { h, a, b } = alliedWithArmy();
    h.run(a, 'LEND_ARMY', { targetPlayerId: b, power: 30 });
    expect(h.expectRejected(a, 'RECALL_ARMY', { targetPlayerId: b })).toBe('INVALID_ARMY_SUPPORT');
  });

  it('releases lent units automatically when the alliance expires', () => {
    const { h, a, b } = alliedWithArmy();
    h.run(a, 'LEND_ARMY', { targetPlayerId: b, power: 30 });
    expect(committedArmyPower(h.player(a))).toBeGreaterThan(0);
    const startRound = h.state.round;
    for (let i = 0; i < 60 && h.state.round <= startRound + CONFIG.alliances.duration_rounds; i += 1) {
      endTurnCleanly(h, h.activeId());
    }
    expect(committedArmyPower(h.player(a))).toBe(0);
    expect(borrowedArmyPower(h.state, b)).toBe(0);
  });
});

describe('scouting', () => {
  it('charges the cost and returns a private report', () => {
    const { h, ids } = game(['Ana', 'Ben', 'Cat']);
    const [, b] = ids as [string, string];
    const scoutId = h.activeId();
    const target = scoutId === b ? (ids[0] as string) : b;
    h.giveArmy(target, 'siege', 2);
    const cash = h.player(scoutId).cash;

    const events = h.run(scoutId, 'SCOUT', { targetPlayerId: target });
    expect(h.player(scoutId).cash).toBe(cash - CONFIG.scouting.cost);

    const completed = events.find((event) => event.type === 'ScoutCompleted');
    expect(completed?.audience).toEqual([scoutId]);
    const report = (completed?.payload as { report: { armyPower: number; cashRange: { min: number } } })
      .report;
    expect(report.armyPower).toBe(SIEGE.power * 2);
    expect(report.cashRange.min).toBeLessThanOrEqual(h.player(target).cash);
  });

  it('enforces the same-target cooldown within a round', () => {
    const { h, ids } = game(['Ana', 'Ben']);
    const scoutId = h.activeId();
    const target = ids.find((id) => id !== scoutId)!;
    h.run(scoutId, 'SCOUT', { targetPlayerId: target });
    expect(h.expectRejected(scoutId, 'SCOUT', { targetPlayerId: target })).toBe('INVALID_SCOUT');
  });

  it('refuses to scout yourself', () => {
    const { h } = game();
    const scoutId = h.activeId();
    expect(h.expectRejected(scoutId, 'SCOUT', { targetPlayerId: scoutId })).toBe('INVALID_SCOUT');
  });

  it('only lets the active player scout', () => {
    const { h, ids } = game();
    const scoutId = h.activeId();
    const other = ids.find((id) => id !== scoutId)!;
    expect(h.expectRejected(other, 'SCOUT', { targetPlayerId: scoutId })).toBe('NOT_YOUR_TURN');
  });
});
