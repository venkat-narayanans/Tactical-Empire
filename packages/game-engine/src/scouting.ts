import { CONFIG } from '@te/config';
import type { PlayerId, ScoutReport } from '@te/shared';
import { ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import {
  allyOf,
  armyUnitCounts,
  completedTerritories,
  propertiesOwnedBy,
  totalArmyPower,
} from './selectors.js';

/**
 * Scouting.
 *
 * The report is the only way to learn an opponent's cash bracket and army, and
 * it is delivered privately: the ScoutCompleted event is addressed to the
 * scout alone, and only ScoutStarted (cost and target) is public.
 */

/** Cash is revealed as a range, not an exact figure. */
const CASH_BUCKET = 250;

export function cashRange(cash: number): { min: number; max: number } {
  const min = Math.max(0, Math.floor(cash / CASH_BUCKET) * CASH_BUCKET);
  return { min, max: min + CASH_BUCKET };
}

export function scoutCost(ctx: EngineContext, playerId: PlayerId): number {
  return ctx.player(playerId).freeScoutCharges > 0 ? 0 : CONFIG.scouting.cost;
}

export function scout(ctx: EngineContext, playerId: PlayerId, targetPlayerId: PlayerId): void {
  const { state } = ctx;
  if (state.phase === 'LOBBY') throw ruleError('GAME_NOT_STARTED', 'The game has not started yet.');
  if (state.phase === 'GAME_OVER') throw ruleError('GAME_FINISHED', 'This game has finished.');
  if (playerId === targetPlayerId) throw ruleError('INVALID_SCOUT', 'You cannot scout yourself.');

  const player = ctx.player(playerId);
  const target = ctx.player(targetPlayerId);
  if (player.status !== 'active') throw ruleError('PLAYER_BANKRUPT', 'You are out of the game.');
  if (target.status !== 'active') throw ruleError('INVALID_SCOUT', 'That player is out of the game.');

  const cooldown = CONFIG.scouting.same_target_cooldown_rounds;
  const recent = state.scoutLog.some(
    (record) =>
      record.scoutId === playerId &&
      record.targetId === targetPlayerId &&
      state.round - record.round < cooldown,
  );
  if (recent) {
    throw ruleError('INVALID_SCOUT', 'You have already scouted that player this round.');
  }

  const cost = scoutCost(ctx, playerId);
  if (cost > 0) {
    if (player.cash < cost) throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford to scout.');
    ctx.debit(playerId, cost);
  } else {
    player.freeScoutCharges -= 1;
  }

  state.scoutLog.push({ scoutId: playerId, targetId: targetPlayerId, round: state.round });
  ctx.emit('ScoutStarted', { playerId, targetId: targetPlayerId, cost });

  const ally = allyOf(state, targetPlayerId);
  const report: ScoutReport = {
    targetId: targetPlayerId,
    round: state.round,
    propertyCount: propertiesOwnedBy(state, targetPlayerId).length,
    completedTerritories: completedTerritories(state, targetPlayerId),
    armyUnitTypes: armyUnitCounts(target),
    armyPower: totalArmyPower(target),
    allianceStatus: { allied: ally !== null, allyId: ally },
    cashRange: cashRange(target.cash),
  };
  const reports = (state.scoutReports[playerId] ??= {});
  reports[targetPlayerId] = report;
  ctx.emit('ScoutCompleted', { playerId, targetId: targetPlayerId, report }, [playerId]);
}
