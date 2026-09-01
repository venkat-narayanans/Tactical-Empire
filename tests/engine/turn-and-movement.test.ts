import { describe, expect, it } from 'vitest';
import { CONFIG, GO_TO_IG_SIGNAL_INDEX, IG_SIGNAL_INDEX, VACATION_INDEX } from '@te/config';
import { Harness, endTurnCleanly, harnessLandingOn } from '../helpers/engine-harness.js';

/** A game whose first roll is a double, for the extra-roll flow. */
function doubleRollHarness(settings?: { auction: boolean }): Harness {
  for (let seed = 1; seed < 500; seed += 1) {
    const h = new Harness({ seed });
    h.start(['Ana', 'Ben'], settings);
    h.run(h.activeId(), 'ROLL_DICE');
    if (h.state.turn.extraRollPending) return h;
  }
  throw new Error('no seed produced a double on the first roll');
}

describe('turn order and dice', () => {
  it('only lets the active player roll', () => {
    const h = new Harness();
    const [a, b] = h.start(['Ana', 'Ben']) as [string, string];
    const active = h.activeId();
    const other = active === a ? b : a;
    expect(h.expectRejected(other, 'ROLL_DICE')).toBe('NOT_YOUR_TURN');
    h.run(active, 'ROLL_DICE');
    expect(h.state.turn.dice).not.toBeNull();
  });

  it('produces dice in range and moves the token by the total', () => {
    const h = new Harness({ seed: 7 });
    h.start(['Ana', 'Ben']);
    const active = h.activeId();
    h.run(active, 'ROLL_DICE');
    const dice = h.state.turn.dice!;
    expect(dice.die1).toBeGreaterThanOrEqual(1);
    expect(dice.die1).toBeLessThanOrEqual(6);
    expect(dice.die2).toBeGreaterThanOrEqual(1);
    expect(dice.die2).toBeLessThanOrEqual(6);
    expect(dice.total).toBe(dice.die1 + dice.die2);
    expect(h.player(active).position).toBe(dice.total % 40);
  });

  it('rejects a second roll in the same turn', () => {
    const h = new Harness({ seed: 3 });
    h.start(['Ana', 'Ben']);
    const active = h.activeId();
    h.run(active, 'ROLL_DICE');
    if (h.state.turn.extraRollPending) return; // doubles legitimately grant another roll
    expect(h.expectRejected(active, 'ROLL_DICE')).toBe('INVALID_PHASE');
  });

  it('banks a double and hands the extra roll back on END_TURN', () => {
    // The extra roll is not immediate: the player finishes acting on the space
    // they landed on, and ending the turn returns the dice to them instead of
    // passing play on. The action bar renders exactly this sequence.
    const h = doubleRollHarness({ auction: false });
    const active = h.activeId();

    expect(h.state.turn.extraRollPending).toBe(true);
    expect(h.state.phase).toBe('ACTION');
    // Rolling straight away is not the way the extra roll is taken.
    expect(h.expectRejected(active, 'ROLL_DICE')).toBe('INVALID_PHASE');

    h.state.turn.pendingPurchase = null;
    h.run(active, 'END_TURN');

    expect(h.activeId()).toBe(active);
    expect(h.state.phase).toBe('PLAYER_TURN');
    expect(h.state.turn.hasRolled).toBe(false);
    h.run(active, 'ROLL_DICE');
    expect(h.state.turn.dice).not.toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const rolls = [0, 1].map(() => {
      const h = new Harness({ seed: 424242 });
      h.start(['Ana', 'Ben']);
      h.run(h.activeId(), 'ROLL_DICE');
      return h.state.turn.dice!;
    });
    expect(rolls[0]).toEqual(rolls[1]);
  });

  it('hands the turn to the next player and advances the round on wrap', () => {
    const h = new Harness({ seed: 11 });
    const [a, b] = h.start(['Ana', 'Ben']) as [string, string];
    expect(h.state.round).toBe(1);
    const seen = new Set<string>();
    // Doubles grant an extra roll to the same player, so drive turns until the
    // order has actually wrapped rather than assuming two calls is a round.
    for (let i = 0; i < 12 && h.state.round === 1; i += 1) {
      seen.add(h.activeId());
      endTurnCleanly(h, h.activeId());
    }
    expect(h.state.round).toBe(2);
    expect(seen).toEqual(new Set([a, b]));
  });
});

describe('movement and landing', () => {
  it('pays the start bonus when passing START', () => {
    const { h, activeId } = harnessLandingOn(3, { wrapPastStart: true });
    const before = h.player(activeId).cash;
    h.run(activeId, 'ROLL_DICE');
    expect(h.player(activeId).position).toBe(3);
    expect(h.eventsOfType('StartBonusPaid')).toHaveLength(1);
    // Landed on Thirubhuvanai, which is only offered for purchase, not charged.
    expect(h.player(activeId).cash).toBe(before + CONFIG.defaults.start_pass_bonus);
  });

  it('sends a player to IG Signal from Go To IG Signal without a start bonus', () => {
    const { h, activeId } = harnessLandingOn(GO_TO_IG_SIGNAL_INDEX);
    const before = h.player(activeId).cash;
    h.run(activeId, 'ROLL_DICE');
    expect(h.player(activeId).position).toBe(IG_SIGNAL_INDEX);
    expect(h.player(activeId).inDetention).toBe(true);
    expect(h.player(activeId).cash).toBe(before);
    expect(h.eventsOfType('PlayerDetained')).toHaveLength(1);
  });

  it('detains a player after three consecutive doubles', () => {
    // Search seeds for one that yields three doubles in a row.
    for (let seed = 0; seed < 400; seed += 1) {
      const h = new Harness({ seed });
      h.start(['Ana', 'Ben']);
      const active = h.activeId();
      let doubles = 0;
      for (let i = 0; i < 3; i += 1) {
        if (h.state.phase !== 'PLAYER_TURN') break;
        h.run(active, 'ROLL_DICE');
        if (!h.state.turn.dice?.isDouble) break;
        doubles += 1;
        if (h.state.turn.pendingPurchase) {
          h.run(active, 'DECLINE_PROPERTY', {
            propertyId: h.state.turn.pendingPurchase.propertyId,
          });
        }
        while (h.state.phase === 'AUCTION' && h.state.auction) {
          const auctionId = h.state.auction.id;
          for (const bidder of [...h.state.auction.activeBidders]) {
            if (h.state.auction?.id !== auctionId) break;
            h.run(bidder, 'PASS_AUCTION', { auctionId });
          }
        }
        if (h.state.turn.extraRollPending) {
          h.run(active, 'END_TURN');
        }
      }
      if (doubles === 3) {
        expect(h.player(active).inDetention).toBe(true);
        expect(h.player(active).position).toBe(IG_SIGNAL_INDEX);
        return;
      }
    }
    throw new Error('no seed produced three consecutive doubles');
  });

  it('collects the vacation pot on landing when the setting is on', () => {
    const { h, activeId } = harnessLandingOn(VACATION_INDEX);
    h.state.pot = 500;
    const before = h.player(activeId).cash;
    h.run(activeId, 'ROLL_DICE');
    expect(h.player(activeId).position).toBe(VACATION_INDEX);
    expect(h.player(activeId).cash).toBe(before + 500);
    expect(h.state.pot).toBe(0);
  });

  it('routes the college fee into the vacation pot', () => {
    const { h, activeId } = harnessLandingOn(4);
    const before = h.player(activeId).cash;
    h.run(activeId, 'ROLL_DICE');
    expect(h.player(activeId).position).toBe(4);
    expect(h.player(activeId).cash).toBe(before - CONFIG.fees.college_fees);
    expect(h.state.pot).toBe(CONFIG.fees.college_fees);
  });

  it('auto-ends a turn that runs past the timer', () => {
    const h = new Harness({ seed: 8 });
    h.start(['Ana', 'Ben'], { auction: false });
    const first = h.activeId();
    h.advanceClock(CONFIG.defaults.turn_duration_seconds * 1000 + 1000);
    h.tick();
    expect(h.state.turn.hasRolled).toBe(false);
    expect(h.eventsOfType('TurnEnded').length).toBeGreaterThan(0);
    void first;
  });
});
