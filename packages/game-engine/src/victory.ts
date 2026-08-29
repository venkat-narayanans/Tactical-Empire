import type { FinalScore, PlayerId } from '@te/shared';
import type { EngineContext } from './context.js';
import { activePlayers, finalScoreFor } from './selectors.js';

/**
 * Victory.
 *
 * The only two end conditions are the configured ones: one active player left,
 * or the round limit reached. Nothing else ends the game.
 */

export function checkVictory(ctx: EngineContext, reason: string): boolean {
  const { state } = ctx;
  if (state.phase === 'GAME_OVER') return true;
  if (state.phase === 'LOBBY') return false;

  const remaining = activePlayers(state);
  if (remaining.length <= 1) {
    declareVictory(ctx, remaining.map((p) => p.id), 'only_one_active_player_remains');
    return true;
  }
  if (state.round > state.settings.maxRounds) {
    declareVictory(ctx, winnersByScore(ctx), 'round_number_reaches_max_rounds');
    return true;
  }
  void reason;
  return false;
}

/** Applies the configured tie-breakers in order to pick the winner(s). */
export function winnersByScore(ctx: EngineContext): PlayerId[] {
  const scores = rankPlayers(ctx);
  const best = scores[0];
  if (!best) return [];
  return scores
    .filter(
      (score) =>
        score.total === best.total &&
        score.completedTerritories === best.completedTerritories &&
        score.armyPower === best.armyPower &&
        score.cash === best.cash,
    )
    .map((score) => score.playerId);
}

export function rankPlayers(ctx: EngineContext): FinalScore[] {
  const { state } = ctx;
  return activePlayers(state)
    .map((player) => finalScoreFor(state, player))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.completedTerritories - a.completedTerritories ||
        b.armyPower - a.armyPower ||
        b.cash - a.cash,
    );
}

export function declareVictory(ctx: EngineContext, winnerIds: PlayerId[], reason: string): void {
  const { state } = ctx;
  if (state.phase === 'GAME_OVER') return;
  const finalScores = state.turnOrder
    .map((id) => state.players[id])
    .filter((p) => p !== undefined)
    .map((player) => finalScoreFor(state, player))
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.completedTerritories - a.completedTerritories ||
        b.armyPower - a.armyPower ||
        b.cash - a.cash,
    );

  state.winnerIds = winnerIds;
  state.finalScores = finalScores;
  state.finishedAt = ctx.now();
  state.auction = null;
  state.pendingDebt = null;
  state.debtReturnPhase = null;
  ctx.setPhase('GAME_OVER');
  ctx.emit('VictoryDeclared', { winnerIds, finalScores, reason });
}
