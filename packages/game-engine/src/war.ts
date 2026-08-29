import { CONFIG, TERRITORY_BY_ID, propertyPrice } from '@te/config';
import type {
  ArmyUnit,
  GameState,
  PlayerId,
  PlayerState,
  TerritoryId,
  WarCasualties,
  WarOutcome,
  WarRecord,
} from '@te/shared';
import { clampMoney, ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import { nextRange } from './rng.js';
import {
  availableArmyPower,
  borrowedArmyPower,
  unitPower,
} from './selectors.js';
import { announceTerritoryIfCompleted, territoryPropertiesOf } from './property.js';
import { assertActiveTurn } from './turn.js';

/**
 * War.
 *
 * Everything that decides a war is computed here: power, support, the two
 * independent battle factors, casualties and capture. The client supplies only
 * a target player and a territory. Money buys army, and army is one input among
 * several - development, home defence, committed allied support and the random
 * battle factors all move the result - so cash alone never guarantees a win.
 */

const DEV_DEFENCE = CONFIG.war.development_defense;

export interface WarPreview {
  readonly territoryId: TerritoryId;
  readonly defenderId: PlayerId;
  readonly fee: number;
  readonly attackerPower: number;
  readonly attackerSupportPower: number;
  readonly territoryPropertyValue: number;
  readonly capturablePropertyIds: string[];
}

/** Sum of purchase prices of the defender's properties in the territory. */
export function territoryPropertyValue(
  state: GameState,
  territoryId: TerritoryId,
  defenderId: PlayerId,
): number {
  return territoryPropertiesOf(state, territoryId, defenderId).reduce(
    (sum, property) => sum + propertyPrice(property.id),
    0,
  );
}

export function declarationFee(
  state: GameState,
  territoryId: TerritoryId,
  defenderId: PlayerId,
): number {
  const value = territoryPropertyValue(state, territoryId, defenderId);
  return clampMoney(value * 0.1, 100, 250);
}

export function developmentDefence(
  state: GameState,
  territoryId: TerritoryId,
  defenderId: PlayerId,
): number {
  let power = 0;
  for (const property of territoryPropertiesOf(state, territoryId, defenderId)) {
    switch (property.level) {
      case 1:
        power += DEV_DEFENCE.house_1;
        break;
      case 2:
        power += DEV_DEFENCE.house_2;
        break;
      case 3:
        power += DEV_DEFENCE.house_3;
        break;
      case 4:
        power += DEV_DEFENCE.house_4;
        break;
      case 5:
        power += DEV_DEFENCE.hotel;
        break;
      default:
        break;
    }
  }
  return power;
}

/** Read-only projection used by the war confirmation UI. Never mutates. */
export function previewWar(
  state: GameState,
  attackerId: PlayerId,
  defenderId: PlayerId,
  territoryId: TerritoryId,
): WarPreview {
  const attacker = state.players[attackerId];
  if (!attacker) throw ruleError('PLAYER_NOT_FOUND', 'You are not in this game.');
  return {
    territoryId,
    defenderId,
    fee: declarationFee(state, territoryId, defenderId),
    attackerPower: availableArmyPower(attacker),
    attackerSupportPower: borrowedArmyPower(state, attackerId),
    territoryPropertyValue: territoryPropertyValue(state, territoryId, defenderId),
    capturablePropertyIds: territoryPropertiesOf(state, territoryId, defenderId).map((p) => p.id),
  };
}

export function validateWarDeclaration(
  state: GameState,
  attackerId: PlayerId,
  defenderId: PlayerId,
  territoryId: TerritoryId,
): void {
  if (attackerId === defenderId) throw ruleError('INVALID_WAR', 'You cannot declare war on yourself.');
  const attacker = state.players[attackerId];
  const defender = state.players[defenderId];
  if (!attacker || !defender) throw ruleError('PLAYER_NOT_FOUND', 'That player is not in this game.');
  if (defender.status !== 'active') throw ruleError('INVALID_WAR', 'That player is out of the game.');
  if (!TERRITORY_BY_ID.has(territoryId)) throw ruleError('INVALID_WAR', 'That territory does not exist.');

  const targets = territoryPropertiesOf(state, territoryId, defenderId);
  if (targets.length === 0) {
    throw ruleError('INVALID_WAR', 'That player owns nothing in that territory.');
  }
  if (state.turn.warsDeclaredThisTurn >= CONFIG.war.max_outgoing_wars_per_turn) {
    throw ruleError('INVALID_WAR', 'You have already declared war this turn.');
  }
  const activeForAttacker = state.activeWarIds.filter((id) => {
    const war = state.wars.find((w) => w.id === id);
    return war && (war.attackerId === attackerId || war.defenderId === attackerId);
  });
  if (activeForAttacker.length >= CONFIG.war.max_active_wars_per_player) {
    throw ruleError('INVALID_WAR', 'You already have an active war.');
  }
  if (availableArmyPower(attacker) + borrowedArmyPower(state, attackerId) <= 0) {
    throw ruleError('INVALID_WAR', 'You need an army before you can declare war.');
  }
  const fee = declarationFee(state, territoryId, defenderId);
  if (attacker.cash < fee) {
    throw ruleError('INSUFFICIENT_FUNDS', `The declaration fee is ₹${fee}.`);
  }
}

export function declareWar(
  ctx: EngineContext,
  attackerId: PlayerId,
  defenderId: PlayerId,
  territoryId: TerritoryId,
): void {
  const { state } = ctx;
  assertActiveTurn(state, attackerId);
  if (state.phase !== 'PLAYER_TURN' && state.phase !== 'ACTION') {
    throw ruleError('INVALID_PHASE', 'You cannot declare war right now.');
  }
  validateWarDeclaration(state, attackerId, defenderId, territoryId);

  const attacker = ctx.player(attackerId);
  const defender = ctx.player(defenderId);
  const fee = declarationFee(state, territoryId, defenderId);
  ctx.debit(attackerId, fee);
  state.turn.warsDeclaredThisTurn += 1;

  const warId = ctx.deps.newId();
  ctx.emit('WarDeclared', { warId, attackerId, defenderId, territoryId, fee });

  const war = resolveWar(ctx, warId, attacker, defender, territoryId, fee);
  state.wars.push(war);
  state.activeWarIds.push(warId);
}

function resolveWar(
  ctx: EngineContext,
  warId: string,
  attacker: PlayerState,
  defender: PlayerState,
  territoryId: TerritoryId,
  fee: number,
): WarRecord {
  const { state } = ctx;

  const attackerBasePower = availableArmyPower(attacker);
  const attackerSupportPower = borrowedArmyPower(state, attacker.id);
  const defenderBasePower = availableArmyPower(defender);
  const defenderSupportPower = borrowedArmyPower(state, defender.id);
  const defenderDevelopmentPower = developmentDefence(state, territoryId, defender.id);

  const defenderRaw = defenderBasePower + defenderSupportPower + defenderDevelopmentPower;
  const defenderHomeBonus = Math.round(defenderRaw * CONFIG.war.home_defense_bonus);

  const attackerFactor = nextRange(state.rng, CONFIG.war.battle_factor_min, CONFIG.war.battle_factor_max);
  const defenderFactor = nextRange(state.rng, CONFIG.war.battle_factor_min, CONFIG.war.battle_factor_max);

  const attackerFinalPower = Math.round((attackerBasePower + attackerSupportPower) * attackerFactor);
  const defenderFinalPower = Math.round((defenderRaw + defenderHomeBonus) * defenderFactor);

  // A tie holds the territory: the defender wins ties.
  const outcome: WarOutcome =
    attackerFinalPower > defenderFinalPower ? 'attacker_victory' : 'defender_victory';

  ctx.emit('WarResolved', {
    warId,
    attackerId: attacker.id,
    defenderId: defender.id,
    territoryId,
    attackerPower: attackerFinalPower,
    defenderPower: defenderFinalPower,
    outcome,
  });

  const casualties = applyCasualties(
    ctx,
    warId,
    attacker,
    defender,
    attackerFinalPower,
    defenderFinalPower,
    outcome,
  );

  const capturedPropertyIds =
    outcome === 'attacker_victory'
      ? captureTerritory(ctx, warId, attacker.id, defender.id, territoryId)
      : [];

  if (outcome === 'attacker_victory') {
    attacker.stats.warsWon += 1;
    defender.stats.warsLost += 1;
  } else {
    defender.stats.warsWon += 1;
    attacker.stats.warsLost += 1;
  }

  return {
    id: warId,
    attackerId: attacker.id,
    defenderId: defender.id,
    territoryId,
    round: state.round,
    declarationFee: fee,
    attackerBasePower,
    defenderBasePower,
    attackerSupportPower,
    defenderSupportPower,
    defenderDevelopmentPower,
    defenderHomeBonus,
    attackerFinalPower,
    defenderFinalPower,
    attackerFactor,
    defenderFactor,
    outcome,
    capturedPropertyIds,
    casualties,
  };
}

/** Casualty rate from the battle margin, per GAME_CONFIG.war.casualties. */
export function casualtyRateFor(winnerPower: number, loserPower: number): number {
  const margin = loserPower > 0 ? winnerPower / loserPower : Number.POSITIVE_INFINITY;
  const rates = CONFIG.war.casualties;
  if (margin < 1.2) return rates.close_battle;
  if (margin < 1.5) return rates.moderate_victory;
  return rates.decisive_victory;
}

function applyCasualties(
  ctx: EngineContext,
  warId: string,
  attacker: PlayerState,
  defender: PlayerState,
  attackerPower: number,
  defenderPower: number,
  outcome: WarOutcome,
): WarCasualties {
  const attackerWon = outcome === 'attacker_victory';
  const winner = attackerWon ? attacker : defender;
  const loser = attackerWon ? defender : attacker;
  const winnerPower = attackerWon ? attackerPower : defenderPower;
  const loserPower = attackerWon ? defenderPower : attackerPower;

  const loserRate = casualtyRateFor(winnerPower, loserPower);
  const winnerRate = CONFIG.war.casualties.winner_also_takes_casualties ? loserRate / 2 : 0;

  const loserLosses = removeWeakestUnits(loser, loserRate);
  const winnerLosses = removeWeakestUnits(winner, winnerRate);

  const attackerLosses = attackerWon ? winnerLosses : loserLosses;
  const defenderLosses = attackerWon ? loserLosses : winnerLosses;

  ctx.emit('CasualtiesApplied', {
    warId,
    attackerUnitIds: attackerLosses.unitIds,
    defenderUnitIds: defenderLosses.unitIds,
  });

  return {
    attackerUnitIds: attackerLosses.unitIds,
    defenderUnitIds: defenderLosses.unitIds,
    attackerPowerLost: attackerLosses.power,
    defenderPowerLost: defenderLosses.power,
  };
}

/**
 * Removes weakest units first until at least `rate` of the player's own
 * committed-to-battle power is gone.
 *
 * Only units the player owns and holds themselves are at risk. Units lent to
 * an ally are locked to that ally and cannot simultaneously be lost here, which
 * is the invariant "one army unit cannot be simultaneously active, lent, sold,
 * or lost".
 */
function removeWeakestUnits(
  player: PlayerState,
  rate: number,
): { unitIds: string[]; power: number } {
  if (rate <= 0) return { unitIds: [], power: 0 };
  const own: ArmyUnit[] = player.army.filter((u) => u.state === 'active');
  const totalPower = own.reduce((sum, u) => sum + unitPower(u), 0);
  const target = Math.floor(totalPower * rate);
  if (target <= 0) return { unitIds: [], power: 0 };

  const weakestFirst = [...own].sort((a, b) => unitPower(a) - unitPower(b));
  const removed: string[] = [];
  let removedPower = 0;
  for (const unit of weakestFirst) {
    if (removedPower >= target) break;
    removed.push(unit.id);
    removedPower += unitPower(unit);
  }
  const removedSet = new Set(removed);
  player.army = player.army.filter((u) => !removedSet.has(u.id));
  return { unitIds: removed, power: removedPower };
}

function captureTerritory(
  ctx: EngineContext,
  warId: string,
  attackerId: PlayerId,
  defenderId: PlayerId,
  territoryId: TerritoryId,
): string[] {
  const { state } = ctx;
  const captured = territoryPropertiesOf(state, territoryId, defenderId);
  if (captured.length === 0) return [];

  const damageUntil = state.round + CONFIG.war.capture.war_damage_rounds;
  const propertyIds: string[] = [];
  for (const property of captured) {
    property.owner = attackerId;
    if (!CONFIG.war.capture.buildings_remain) property.level = 0;
    property.warDamagedUntilRound = damageUntil;
    propertyIds.push(property.id);
  }

  ctx.emit('TerritoryCaptured', {
    warId,
    territoryId,
    fromPlayerId: defenderId,
    toPlayerId: attackerId,
    propertyIds,
  });
  for (const propertyId of propertyIds) {
    announceTerritoryIfCompleted(ctx, attackerId, propertyId);
  }
  return propertyIds;
}
