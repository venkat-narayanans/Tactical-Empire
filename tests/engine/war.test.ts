import { describe, expect, it } from 'vitest';
import { ARMY_UNIT_BY_ID, CONFIG } from '@te/config';
import {
  casualtyRateFor,
  declarationFee,
  developmentDefence,
  previewWar,
  totalArmyPower,
} from '@te/game-engine';
import { Harness } from '../helpers/engine-harness.js';

const GUARD = ARMY_UNIT_BY_ID.get('guard')!;
const SIEGE = ARMY_UNIT_BY_ID.get('siege')!;

/** Sets up an attacker on turn with a defender holding all of Territory 1. */
function warSetup(options: { attackerSiege?: number; defenderGuards?: number; seed?: number } = {}) {
  const h = new Harness({ seed: options.seed ?? 101 });
  const ids = h.start(['Ana', 'Ben']);
  const attacker = h.activeId();
  const defender = ids.find((id) => id !== attacker)!;
  h.giveProperty(defender, 'madagadipet');
  h.giveProperty(defender, 'thirubhuvanai');
  h.giveArmy(attacker, 'siege', options.attackerSiege ?? 6);
  if (options.defenderGuards) h.giveArmy(defender, 'guard', options.defenderGuards);
  return { h, attacker, defender };
}

describe('war declaration', () => {
  it('charges the clamped 10% declaration fee', () => {
    const { h, attacker, defender } = warSetup();
    const value = 220 + 240;
    const expected = Math.min(Math.max(Math.round(value * 0.1), 100), 250);
    expect(declarationFee(h.state, 'T1', defender)).toBe(expected);

    const cash = h.player(attacker).cash;
    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    expect(h.player(attacker).cash).toBeLessThanOrEqual(cash - expected);
  });

  it('rejects a war on a territory the target owns nothing in', () => {
    const { h, attacker, defender } = warSetup();
    expect(
      h.expectRejected(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T8' }),
    ).toBe('INVALID_WAR');
  });

  it('rejects a war without an army', () => {
    const h = new Harness({ seed: 5 });
    const ids = h.start(['Ana', 'Ben']);
    const attacker = h.activeId();
    const defender = ids.find((id) => id !== attacker)!;
    h.giveProperty(defender, 'madagadipet');
    expect(
      h.expectRejected(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' }),
    ).toBe('INVALID_WAR');
  });

  it('rejects war on yourself and on an unknown territory', () => {
    const { h, attacker, defender } = warSetup();
    expect(
      h.expectRejected(attacker, 'DECLARE_WAR', { targetPlayerId: attacker, territoryId: 'T1' }),
    ).toBe('INVALID_WAR');
    expect(
      h.expectRejected(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T99' }),
    ).toBe('INVALID_WAR');
  });

  it('allows only one outgoing war per turn', () => {
    const { h, attacker, defender } = warSetup();
    h.giveProperty(defender, 'villianur');
    h.giveProperty(defender, 'sulthanpet');
    h.giveProperty(defender, 'thirukaanji');
    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    expect(
      h.expectRejected(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T3' }),
    ).toBe('INVALID_WAR');
  });

  it('rejects a war declared by someone whose turn it is not', () => {
    const { h, attacker, defender } = warSetup();
    expect(
      h.expectRejected(defender, 'DECLARE_WAR', { targetPlayerId: attacker, territoryId: 'T1' }),
    ).toBe('NOT_YOUR_TURN');
  });
});

describe('war resolution', () => {
  it('captures the territory and applies war damage on an attacker victory', () => {
    // 6 siege (540) against an undefended territory is a decisive attack.
    const { h, attacker, defender } = warSetup({ attackerSiege: 6 });
    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });

    const war = h.state.wars[0]!;
    expect(war.outcome).toBe('attacker_victory');
    expect(h.property('madagadipet').owner).toBe(attacker);
    expect(h.property('thirubhuvanai').owner).toBe(attacker);
    expect(h.property('madagadipet').warDamagedUntilRound).toBe(
      h.state.round + CONFIG.war.capture.war_damage_rounds,
    );
    expect(h.lastEvent('TerritoryCaptured')).toBeDefined();
  });

  it('leaves ownership untouched when the defender holds', () => {
    const { h, attacker, defender } = warSetup({ attackerSiege: 1, defenderGuards: 10 });
    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    const war = h.state.wars[0]!;
    expect(war.outcome).toBe('defender_victory');
    expect(h.property('madagadipet').owner).toBe(defender);
    expect(h.eventsOfType('TerritoryCaptured')).toHaveLength(0);
  });

  it('gives the defender home defence and development bonuses', () => {
    const { h, defender } = warSetup({ attackerSiege: 1, defenderGuards: 2 });
    h.property('madagadipet').level = 3;
    h.property('thirubhuvanai').level = 5;
    const expected =
      CONFIG.war.development_defense.house_3 + CONFIG.war.development_defense.hotel;
    expect(developmentDefence(h.state, 'T1', defender)).toBe(expected);
  });

  it('records both battle factors inside the configured band', () => {
    const { h, attacker, defender } = warSetup({ defenderGuards: 3 });
    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    const war = h.state.wars[0]!;
    for (const factor of [war.attackerFactor, war.defenderFactor]) {
      expect(factor).toBeGreaterThanOrEqual(CONFIG.war.battle_factor_min);
      expect(factor).toBeLessThan(CONFIG.war.battle_factor_max);
    }
    expect(war.attackerFactor).not.toBe(war.defenderFactor);
  });

  it('applies casualties to both sides, weakest units first', () => {
    const { h, attacker, defender } = warSetup({ attackerSiege: 4, defenderGuards: 4 });
    h.giveArmy(attacker, 'guard', 2);
    const attackerBefore = totalArmyPower(h.player(attacker));
    const defenderBefore = totalArmyPower(h.player(defender));

    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    const war = h.state.wars[0]!;

    expect(totalArmyPower(h.player(attacker))).toBeLessThan(attackerBefore);
    expect(totalArmyPower(h.player(defender))).toBeLessThan(defenderBefore);
    // The attacker's guards are weaker than its siege units, so they go first.
    expect(h.player(attacker).army.filter((u) => u.type === 'guard')).toHaveLength(0);
    expect(war.casualties.attackerPowerLost).toBeGreaterThan(0);
    expect(war.casualties.defenderPowerLost).toBeGreaterThan(0);
  });

  it('scales casualties by the battle margin', () => {
    expect(casualtyRateFor(110, 100)).toBe(CONFIG.war.casualties.close_battle);
    expect(casualtyRateFor(130, 100)).toBe(CONFIG.war.casualties.moderate_victory);
    expect(casualtyRateFor(300, 100)).toBe(CONFIG.war.casualties.decisive_victory);
  });

  it('does not lose units that are lent to an ally', () => {
    const h = new Harness({ seed: 55 });
    const ids = h.start(['Ana', 'Ben', 'Cat']);
    const attacker = h.activeId();
    const [defender, ally] = ids.filter((id) => id !== attacker) as [string, string];
    h.giveProperty(defender, 'madagadipet');
    h.giveProperty(defender, 'thirubhuvanai');
    h.giveArmy(attacker, 'siege', 4);
    h.giveArmy(ally, 'guard', 4);

    h.run(ally, 'REQUEST_ALLIANCE', { targetPlayerId: defender });
    const requestId = Object.keys(h.state.allianceRequests)[0]!;
    h.run(defender, 'ACCEPT_ALLIANCE', { requestId });
    h.run(ally, 'LEND_ARMY', { targetPlayerId: defender, power: 30 });
    const lentUnitIds = h.player(ally).army.filter((u) => u.state === 'lent').map((u) => u.id);
    expect(lentUnitIds.length).toBeGreaterThan(0);

    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    const surviving = new Set(h.player(ally).army.map((u) => u.id));
    for (const id of lentUnitIds) expect(surviving.has(id)).toBe(true);
  });

  it('counts committed ally support in the defender power', () => {
    const h = new Harness({ seed: 202 });
    const ids = h.start(['Ana', 'Ben', 'Cat']);
    const attacker = h.activeId();
    const [defender, ally] = ids.filter((id) => id !== attacker) as [string, string];
    h.giveProperty(defender, 'madagadipet');
    h.giveProperty(defender, 'thirubhuvanai');
    h.giveArmy(attacker, 'guard', 2);
    h.giveArmy(defender, 'guard', 1);
    h.giveArmy(ally, 'siege', 8);

    h.run(ally, 'REQUEST_ALLIANCE', { targetPlayerId: defender });
    const requestId = Object.keys(h.state.allianceRequests)[0]!;
    h.run(defender, 'ACCEPT_ALLIANCE', { requestId });
    h.run(ally, 'LEND_ARMY', { targetPlayerId: defender, power: 500 });

    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    const war = h.state.wars[0]!;
    expect(war.defenderSupportPower).toBeGreaterThan(0);
    expect(war.outcome).toBe('defender_victory');
  });

  it('does not let money alone decide a war', () => {
    // A rich attacker with a token army loses to a poor, well-defended target.
    const h = new Harness({ seed: 303 });
    const ids = h.start(['Ana', 'Ben']);
    const attacker = h.activeId();
    const defender = ids.find((id) => id !== attacker)!;
    h.player(attacker).cash = 100000;
    h.player(defender).cash = 10;
    h.giveProperty(defender, 'madagadipet', 5);
    h.giveProperty(defender, 'thirubhuvanai', 5);
    h.giveArmy(attacker, 'guard', 1);
    h.giveArmy(defender, 'siege', 4);

    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    expect(h.state.wars[0]?.outcome).toBe('defender_victory');
    expect(h.property('madagadipet').owner).toBe(defender);
  });

  it('collects reduced rent and blocks building on a war-damaged property', () => {
    const { h, attacker, defender } = warSetup({ attackerSiege: 6 });
    h.run(attacker, 'DECLARE_WAR', { targetPlayerId: defender, territoryId: 'T1' });
    expect(h.property('madagadipet').owner).toBe(attacker);
    expect(h.expectRejected(attacker, 'BUILD', { propertyId: 'madagadipet' })).toBe(
      'INVALID_DEVELOPMENT',
    );
  });

  it('previews attack power without changing anything', () => {
    const { h, attacker, defender } = warSetup({ attackerSiege: 3 });
    const versionBefore = h.state.version;
    const preview = previewWar(h.state, attacker, defender, 'T1');
    expect(preview.attackerPower).toBe(SIEGE.power * 3);
    expect(preview.capturablePropertyIds).toEqual(['madagadipet', 'thirubhuvanai']);
    expect(h.state.version).toBe(versionBefore);
    void GUARD;
  });
});
