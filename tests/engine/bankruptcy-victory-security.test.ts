import { describe, expect, it } from 'vitest';
import { CITY_BY_ID, CONFIG } from '@te/config';
import { finalScoreFor, projectStateForPlayer, filterEventsForPlayer } from '@te/game-engine';
import { commandSchemas } from '@te/shared';
import { Harness, endTurnCleanly, harnessLandingOn } from '../helpers/engine-harness.js';

const MADAGADIPET = CITY_BY_ID.get('madagadipet')!;

/** Puts the active player into RESOLVING_DEBT by landing on expensive rent. */
function inDebt() {
  const { h, activeId } = harnessLandingOn(MADAGADIPET.boardIndex);
  const [a, b] = h.state.turnOrder as [string, string];
  const owner = activeId === a ? b : a;
  h.giveProperty(owner, 'madagadipet');
  h.giveProperty(owner, 'thirubhuvanai');
  h.property('madagadipet').level = 5;
  h.player(activeId).cash = 5;
  h.run(activeId, 'ROLL_DICE');
  return { h, debtor: activeId, creditor: owner };
}

describe('debt and bankruptcy', () => {
  it('suspends play with a pending debt when rent cannot be paid', () => {
    const { h, debtor, creditor } = inDebt();
    expect(h.state.phase).toBe('RESOLVING_DEBT');
    expect(h.state.pendingDebt).toMatchObject({ playerId: debtor, creditorId: creditor });
    expect(h.player(debtor).cash).toBeGreaterThanOrEqual(0);
  });

  it('blocks ending the turn while a debt is outstanding', () => {
    const { h, debtor } = inDebt();
    expect(h.expectRejected(debtor, 'END_TURN')).toBe('DEBT_OUTSTANDING');
  });

  it('settles the debt once the player raises the cash', () => {
    const { h, debtor, creditor } = inDebt();
    const owed = h.state.pendingDebt!.amount;
    h.player(debtor).cash = owed;
    const creditorCash = h.player(creditor).cash;

    h.run(debtor, 'SETTLE_DEBT');
    expect(h.state.pendingDebt).toBeNull();
    expect(h.state.phase).not.toBe('RESOLVING_DEBT');
    expect(h.player(debtor).cash).toBe(0);
    expect(h.player(creditor).cash).toBe(creditorCash + owed);
  });

  it('lets a debtor liquidate buildings and army to survive', () => {
    const { h, debtor } = inDebt();
    h.giveProperty(debtor, 'villianur');
    h.giveArmy(debtor, 'siege', 2);
    h.run(debtor, 'SELL_ARMY', { unitType: 'siege', quantity: 2 });
    h.run(debtor, 'MORTGAGE_PROPERTY', { propertyId: 'villianur' });
    expect(h.player(debtor).cash).toBeGreaterThan(0);
  });

  it('transfers assets to the creditor and eliminates a bankrupt player', () => {
    const h = new Harness({ seed: 44 });
    const ids = h.start(['Ana', 'Ben', 'Cat']);
    const debtor = h.activeId();
    const [creditor] = ids.filter((id) => id !== debtor) as [string];
    h.giveProperty(debtor, 'villianur');
    h.giveArmy(debtor, 'guard', 2);
    h.player(debtor).cash = 0;
    h.state.pendingDebt = { playerId: debtor, amount: 5000, creditorId: creditor, reason: 'rent' };
    h.state.debtReturnPhase = 'ACTION';
    h.state.phase = 'RESOLVING_DEBT';

    const creditorArmy = h.player(creditor).army.length;
    h.run(debtor, 'DECLARE_BANKRUPTCY');

    expect(h.player(debtor).status).toBe('bankrupt');
    expect(h.property('villianur').owner).toBe(creditor);
    expect(h.player(creditor).army).toHaveLength(creditorArmy + 2);
    expect(h.player(debtor).army).toHaveLength(0);
    expect(h.eventsOfType('PlayerEliminated')).toHaveLength(1);
  });

  it('returns assets to the bank when the debt was owed to the bank', () => {
    const h = new Harness({ seed: 45 });
    h.start(['Ana', 'Ben', 'Cat']);
    const debtor = h.activeId();
    h.giveProperty(debtor, 'villianur', 3);
    h.player(debtor).cash = 0;
    h.state.pendingDebt = { playerId: debtor, amount: 5000, creditorId: null, reason: 'fee' };
    h.state.debtReturnPhase = 'ACTION';
    h.state.phase = 'RESOLVING_DEBT';

    h.run(debtor, 'DECLARE_BANKRUPTCY');
    expect(h.property('villianur').owner).toBeNull();
    expect(h.property('villianur').level).toBe(0);
  });

  it('rejects gameplay commands from a bankrupt player', () => {
    const h = new Harness({ seed: 46 });
    const ids = h.start(['Ana', 'Ben', 'Cat']);
    const debtor = h.activeId();
    h.player(debtor).cash = 0;
    h.state.pendingDebt = { playerId: debtor, amount: 5000, creditorId: null, reason: 'fee' };
    h.state.debtReturnPhase = 'ACTION';
    h.state.phase = 'RESOLVING_DEBT';
    h.run(debtor, 'DECLARE_BANKRUPTCY');

    expect(h.expectRejected(debtor, 'ROLL_DICE')).toMatch(/PLAYER_BANKRUPT|NOT_YOUR_TURN/);
    expect(h.expectRejected(debtor, 'BUY_ARMY', { unitType: 'guard', quantity: 1 })).toMatch(
      /PLAYER_BANKRUPT|NOT_YOUR_TURN/,
    );
    void ids;
  });
});

describe('victory', () => {
  it('ends the game when only one player remains', () => {
    const h = new Harness({ seed: 47 });
    const ids = h.start(['Ana', 'Ben']);
    const debtor = h.activeId();
    const survivor = ids.find((id) => id !== debtor)!;
    h.player(debtor).cash = 0;
    h.state.pendingDebt = { playerId: debtor, amount: 5000, creditorId: survivor, reason: 'rent' };
    h.state.debtReturnPhase = 'ACTION';
    h.state.phase = 'RESOLVING_DEBT';

    h.run(debtor, 'DECLARE_BANKRUPTCY');
    expect(h.state.phase).toBe('GAME_OVER');
    expect(h.state.winnerIds).toEqual([survivor]);
    expect(h.lastEvent('VictoryDeclared')).toBeDefined();
  });

  it('rejects every gameplay command once the game is over', () => {
    const h = new Harness({ seed: 48 });
    const ids = h.start(['Ana', 'Ben']);
    const debtor = h.activeId();
    const survivor = ids.find((id) => id !== debtor)!;
    h.player(debtor).cash = 0;
    h.state.pendingDebt = { playerId: debtor, amount: 5000, creditorId: survivor, reason: 'rent' };
    h.state.debtReturnPhase = 'ACTION';
    h.state.phase = 'RESOLVING_DEBT';
    h.run(debtor, 'DECLARE_BANKRUPTCY');

    expect(h.expectRejected(survivor, 'ROLL_DICE')).toBe('GAME_FINISHED');
    expect(h.expectRejected(survivor, 'BUY_ARMY', { unitType: 'guard', quantity: 1 })).toBe(
      'GAME_FINISHED',
    );
  });

  it('ends on the round limit and ranks players by the configured score', () => {
    const h = new Harness({ seed: 49 });
    const ids = h.start(['Ana', 'Ben'], { maxRounds: 2 });
    const [a] = ids as [string];
    h.player(a).cash = 9000;
    for (let i = 0; i < 30 && h.state.phase !== 'GAME_OVER'; i += 1) {
      endTurnCleanly(h, h.activeId());
    }
    expect(h.state.phase).toBe('GAME_OVER');
    expect(h.state.finalScores).not.toBeNull();
    expect(h.state.winnerIds).toContain(a);
  });

  it('scores cash, property, buildings, army and territory bonuses', () => {
    const h = new Harness({ seed: 50 });
    const [a] = h.start(['Ana', 'Ben']) as [string];
    h.player(a).cash = 1000;
    h.giveProperty(a, 'madagadipet', 2);
    h.giveProperty(a, 'thirubhuvanai', 0);
    h.giveArmy(a, 'guard', 2);

    const score = finalScoreFor(h.state, h.player(a));
    expect(score.cash).toBe(1000);
    expect(score.propertyValue).toBe(220 + 240);
    expect(score.buildingValue).toBe(Math.round(2 * MADAGADIPET.houseCost * 0.5));
    expect(score.armyValue).toBe(Math.round(2 * 250 * 0.5));
    expect(score.territoryBonus).toBe(500);
    expect(score.total).toBe(
      score.cash + score.propertyValue + score.buildingValue + score.armyValue + score.territoryBonus,
    );
  });
});

describe('server authority and privacy', () => {
  it('has no command that sets money, position, ownership, dice or results', () => {
    const forbidden = [
      'SET_MONEY',
      'SET_POSITION',
      'SET_DICE',
      'SET_OWNER',
      'SET_ARMY',
      'FORCE_RENT',
      'FORCE_WAR_WIN',
      'FORCE_VICTORY',
      'SET_WINNER',
    ];
    for (const command of forbidden) {
      expect(Object.keys(commandSchemas)).not.toContain(command);
    }
  });

  it('ignores extra fields a malicious client attaches to ROLL_DICE', () => {
    const h = new Harness({ seed: 60 });
    h.start(['Ana', 'Ben']);
    const active = h.activeId();
    const parsed = commandSchemas.ROLL_DICE.parse({ result: 12, die1: 6, die2: 6 });
    expect(parsed).toEqual({});
    h.run(active, 'ROLL_DICE');
    expect(h.state.turn.dice?.total).toBeLessThanOrEqual(12);
    expect(h.state.turn.dice?.total).toBeGreaterThanOrEqual(2);
  });

  it('hides opponent cash and army from the projected state', () => {
    const h = new Harness({ seed: 61 });
    const [a, b] = h.start(['Ana', 'Ben']) as [string, string];
    h.giveArmy(b, 'siege', 3);
    h.player(b).cash = 4321;

    const view = projectStateForPlayer(h.state, a);
    expect(view.players[a]?.cash).toBe(h.player(a).cash);
    expect(view.players[b]?.cash).toBeNull();
    expect(view.players[b]?.army).toBeNull();
    expect(view.players[b]?.armySummary).toBeNull();
    expect(JSON.stringify(view)).not.toContain('4321');
  });

  it('keeps scout reports out of other players event streams', () => {
    const h = new Harness({ seed: 62 });
    const ids = h.start(['Ana', 'Ben', 'Cat']);
    const scoutId = h.activeId();
    const [target, bystander] = ids.filter((id) => id !== scoutId) as [string, string];
    const events = h.run(scoutId, 'SCOUT', { targetPlayerId: target });

    expect(filterEventsForPlayer(events, bystander).map((e) => e.type)).not.toContain(
      'ScoutCompleted',
    );
    expect(filterEventsForPlayer(events, scoutId).map((e) => e.type)).toContain('ScoutCompleted');
  });

  it('only shows a player the trades they are party to', () => {
    const h = new Harness({ seed: 63 });
    const [a, b, c] = h.start(['Ana', 'Ben', 'Cat']) as [string, string, string];
    h.giveProperty(a, 'madagadipet');
    h.run(a, 'CREATE_TRADE', {
      targetPlayerId: b,
      offered: { cash: 0, properties: ['madagadipet'] },
      requested: { cash: 50, properties: [] },
    });
    expect(projectStateForPlayer(h.state, c).trades).toHaveLength(0);
    expect(projectStateForPlayer(h.state, b).trades).toHaveLength(1);
  });

  it('makes repeated commands with one requestId idempotent', () => {
    const h = new Harness({ seed: 64 });
    h.start(['Ana', 'Ben']);
    const active = h.activeId();
    h.run(active, 'ROLL_DICE', {}, 'same-request');
    const position = h.player(active).position;
    const sequence = h.state.sequence;
    h.run(active, 'ROLL_DICE', {}, 'same-request');
    expect(h.player(active).position).toBe(position);
    expect(h.state.sequence).toBe(sequence);
  });

  it('numbers events sequentially with no gaps', () => {
    const h = new Harness({ seed: 65 });
    h.start(['Ana', 'Ben']);
    for (let i = 0; i < 6; i += 1) endTurnCleanly(h, h.activeId());
    const sequences = h.events.map((event) => event.sequence);
    expect(sequences).toEqual(sequences.map((_, index) => index + 1));
  });

  it('never lets cash go negative through normal play', () => {
    const h = new Harness({ seed: 66 });
    h.start(['Ana', 'Ben', 'Cat'], { startingCash: 500 });
    for (let i = 0; i < 60 && h.state.phase !== 'GAME_OVER'; i += 1) {
      const active = h.activeId();
      try {
        endTurnCleanly(h, active);
      } catch {
        // A debt or a blocked action is a legal outcome; the invariant below
        // is what matters.
        if (h.state.pendingDebt) h.run(h.state.pendingDebt.playerId, 'DECLARE_BANKRUPTCY');
      }
      for (const player of Object.values(h.state.players)) {
        expect(player.cash).toBeGreaterThanOrEqual(0);
      }
    }
    void CONFIG;
  });
});
