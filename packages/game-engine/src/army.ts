import { ARMY_UNIT_BY_ID, CONFIG } from '@te/config';
import type { ArmyUnit, PlayerId } from '@te/shared';
import { percentOf, ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import {
  activeAllianceFor,
  armyCapacity,
  availableArmyPower,
  unitCost,
  unitPower,
} from './selectors.js';

/**
 * Army purchase, resale and lending.
 *
 * Army power is always derived from the unit list - it is never stored - so a
 * client can neither inflate it nor spend the same unit twice. A lent unit is
 * marked `lent` and is excluded from the owner's available power for as long as
 * the alliance holds it.
 */

export interface AddArmyOptions {
  /** Skip payment (used by the Surprise deck's army card). */
  readonly free?: boolean;
  /** Silently stop at capacity instead of rejecting. */
  readonly respectCapacity?: boolean;
}

export function addArmyUnits(
  ctx: EngineContext,
  playerId: PlayerId,
  unitType: string,
  quantity: number,
  options: AddArmyOptions = {},
): void {
  const { state } = ctx;
  const definition = ARMY_UNIT_BY_ID.get(unitType);
  if (!definition) throw ruleError('INVALID_ARMY', 'That is not a valid army unit.');
  const player = ctx.player(playerId);

  const capacity = armyCapacity(state, playerId);
  const room = capacity - player.army.length;
  const count = options.respectCapacity ? Math.min(quantity, Math.max(room, 0)) : quantity;
  if (count <= 0) return;
  if (!options.respectCapacity && count > room) {
    throw ruleError(
      'ARMY_CAPACITY_EXCEEDED',
      `Your army capacity is ${capacity} units; you have room for ${Math.max(room, 0)} more.`,
    );
  }

  const cost = options.free ? 0 : definition.cost * count;
  if (cost > 0) {
    if (player.cash < cost) throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford those units.');
    ctx.debit(playerId, cost);
  }

  for (let i = 0; i < count; i += 1) {
    player.army.push({ id: ctx.deps.newId(), type: unitType, state: 'active', lentTo: null });
  }
  ctx.emit('ArmyUnitPurchased', { playerId, unitType, quantity: count, cost });
}

export function buyArmy(
  ctx: EngineContext,
  playerId: PlayerId,
  unitType: string,
  quantity: number,
): void {
  const player = ctx.player(playerId);
  if (player.status !== 'active') throw ruleError('PLAYER_BANKRUPT', 'You are out of the game.');
  if (ctx.state.phase === 'GAME_OVER') throw ruleError('GAME_FINISHED', 'This game has finished.');
  addArmyUnits(ctx, playerId, unitType, quantity, {});
}

export function sellArmy(
  ctx: EngineContext,
  playerId: PlayerId,
  unitType: string,
  quantity: number,
): void {
  const player = ctx.player(playerId);
  const sellable = player.army.filter((u) => u.type === unitType && u.state === 'active');
  if (sellable.length < quantity) {
    throw ruleError('INVALID_ARMY', 'You do not have that many free units of that type to sell.');
  }
  const sold = sellable.slice(0, quantity);
  const soldIds = new Set(sold.map((u) => u.id));
  player.army = player.army.filter((u) => !soldIds.has(u.id));
  const refund = percentOf(unitCost(unitType) * quantity, CONFIG.army.resale_percentage);
  ctx.credit(playerId, refund);
  ctx.emit('ArmyUnitSold', { playerId, unitIds: [...soldIds], refund });
}

/** Maximum power a player may currently lend, per the alliance config. */
export function maxLendablePower(ctx: EngineContext, playerId: PlayerId): number {
  const player = ctx.player(playerId);
  return Math.floor(
    availableArmyPower(player) * CONFIG.alliances.army_lend_max_percentage_of_available_power,
  );
}

export function lendArmy(
  ctx: EngineContext,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  requestedPower: number,
): void {
  const { state } = ctx;
  if (playerId === targetPlayerId) {
    throw ruleError('INVALID_ARMY_SUPPORT', 'You cannot lend army to yourself.');
  }
  const player = ctx.player(playerId);
  const target = ctx.player(targetPlayerId);
  if (player.status !== 'active' || target.status !== 'active') {
    throw ruleError('INVALID_ARMY_SUPPORT', 'Both players must still be in the game.');
  }

  const alliance = activeAllianceFor(state, playerId);
  if (!alliance || !alliance.playerIds.includes(targetPlayerId)) {
    throw ruleError('INVALID_ARMY_SUPPORT', 'You can only lend army to your active ally.');
  }

  const cap = maxLendablePower(ctx, playerId);
  if (cap <= 0) throw ruleError('INVALID_ARMY_SUPPORT', 'You have no army available to lend.');
  const budget = Math.min(requestedPower, cap);

  // Largest units first, so the committed power lands as close to the request
  // as possible without ever exceeding the configured cap.
  const candidates = player.army
    .filter((u) => u.state === 'active')
    .sort((a, b) => unitPower(b) - unitPower(a));

  const chosen: ArmyUnit[] = [];
  let committed = 0;
  for (const unit of candidates) {
    const power = unitPower(unit);
    if (committed + power <= budget) {
      chosen.push(unit);
      committed += power;
    }
  }
  if (chosen.length === 0) {
    throw ruleError(
      'INVALID_ARMY_SUPPORT',
      `You can lend at most ${cap} power; no unit fits that budget.`,
    );
  }

  for (const unit of chosen) {
    unit.state = 'lent';
    unit.lentTo = targetPlayerId;
  }
  ctx.emit('ArmySupportCommitted', {
    fromPlayerId: playerId,
    toPlayerId: targetPlayerId,
    unitIds: chosen.map((u) => u.id),
    power: committed,
  });
}

/**
 * Returns lent units to their owner. `lent_units_locked` keeps them committed
 * while the alliance is active, so a manual recall requires the alliance to
 * have ended; expiry releases them automatically.
 */
export function recallArmy(
  ctx: EngineContext,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  force = false,
): void {
  const { state } = ctx;
  const player = ctx.player(playerId);
  if (!force && CONFIG.alliances.lent_units_locked) {
    const alliance = activeAllianceFor(state, playerId);
    if (alliance && alliance.playerIds.includes(targetPlayerId)) {
      throw ruleError(
        'INVALID_ARMY_SUPPORT',
        'Lent units stay committed until the alliance ends.',
      );
    }
  }
  const released = player.army.filter((u) => u.state === 'lent' && u.lentTo === targetPlayerId);
  if (released.length === 0) return;
  for (const unit of released) {
    unit.state = 'active';
    unit.lentTo = null;
  }
  ctx.emit('ArmySupportReleased', {
    fromPlayerId: playerId,
    toPlayerId: targetPlayerId,
    unitIds: released.map((u) => u.id),
  });
}

/** Releases every unit a player has lent out, in any direction. */
export function releaseAllLentUnits(ctx: EngineContext, playerId: PlayerId): void {
  const targets = new Set(
    ctx
      .player(playerId)
      .army.filter((u) => u.state === 'lent' && u.lentTo)
      .map((u) => u.lentTo as PlayerId),
  );
  for (const target of targets) recallArmy(ctx, playerId, target, true);
}
