import { CONFIG } from '@te/config';
import type { PlayerId } from '@te/shared';
import { ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import { activeAllianceFor } from './selectors.js';
import { recallArmy } from './army.js';

/**
 * Formal alliances: one per player, fixed duration in rounds, with a cooldown
 * before the same player may ally again. Verbal deals happen at the table; only
 * the formal alliance is enforced (it gates army lending).
 */

export function requestAlliance(
  ctx: EngineContext,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
): void {
  const { state } = ctx;
  if (state.phase === 'LOBBY') throw ruleError('GAME_NOT_STARTED', 'The game has not started yet.');
  if (state.phase === 'GAME_OVER') throw ruleError('GAME_FINISHED', 'This game has finished.');
  if (playerId === targetPlayerId) {
    throw ruleError('INVALID_ALLIANCE', 'You cannot ally with yourself.');
  }
  const player = ctx.player(playerId);
  const target = ctx.player(targetPlayerId);
  if (player.status !== 'active' || target.status !== 'active') {
    throw ruleError('INVALID_ALLIANCE', 'Both players must still be in the game.');
  }
  assertAllianceCapacity(ctx, playerId);
  assertAllianceCapacity(ctx, targetPlayerId);

  const duplicate = Object.values(state.allianceRequests).find(
    (request) =>
      request.status === 'pending' &&
      ((request.fromPlayerId === playerId && request.toPlayerId === targetPlayerId) ||
        (request.fromPlayerId === targetPlayerId && request.toPlayerId === playerId)),
  );
  if (duplicate) throw ruleError('INVALID_ALLIANCE', 'There is already a pending request with that player.');

  const requestId = ctx.deps.newId();
  state.allianceRequests[requestId] = {
    id: requestId,
    fromPlayerId: playerId,
    toPlayerId: targetPlayerId,
    status: 'pending',
    createdAt: ctx.now(),
  };
  // Private: only the two parties learn about a pending request.
  ctx.emit(
    'AllianceRequested',
    { requestId, fromPlayerId: playerId, toPlayerId: targetPlayerId },
    [playerId, targetPlayerId],
  );
}

function assertAllianceCapacity(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = ctx.player(playerId);
  const active = Object.values(state.alliances).filter(
    (a) => a.active && a.playerIds.includes(playerId),
  );
  if (active.length >= CONFIG.alliances.max_active_per_player) {
    throw ruleError('INVALID_ALLIANCE', `${player.name} already has an active alliance.`);
  }
  if (state.round < player.allianceCooldownUntilRound) {
    throw ruleError(
      'INVALID_ALLIANCE',
      `${player.name} cannot form a new alliance until round ${player.allianceCooldownUntilRound}.`,
    );
  }
}

export function acceptAlliance(ctx: EngineContext, playerId: PlayerId, requestId: string): void {
  const { state } = ctx;
  const request = state.allianceRequests[requestId];
  if (!request || request.status !== 'pending') {
    throw ruleError('ALLIANCE_NOT_FOUND', 'That alliance request is no longer open.');
  }
  if (request.toPlayerId !== playerId) {
    throw ruleError('INVALID_ALLIANCE', 'That request was not sent to you.');
  }
  assertAllianceCapacity(ctx, request.fromPlayerId);
  assertAllianceCapacity(ctx, playerId);

  request.status = 'accepted';
  const allianceId = ctx.deps.newId();
  const expiresAfterRound = state.round + CONFIG.alliances.duration_rounds;
  state.alliances[allianceId] = {
    id: allianceId,
    playerIds: [request.fromPlayerId, playerId],
    startedRound: state.round,
    expiresAfterRound,
    active: true,
  };
  // Formed alliances are public: the UI shows "ALLIANCE ACTIVE" to everyone.
  ctx.emit('AllianceAccepted', {
    allianceId,
    playerIds: [request.fromPlayerId, playerId],
    expiresAfterRound,
  });
}

export function declineAlliance(ctx: EngineContext, playerId: PlayerId, requestId: string): void {
  const { state } = ctx;
  const request = state.allianceRequests[requestId];
  if (!request || request.status !== 'pending') {
    throw ruleError('ALLIANCE_NOT_FOUND', 'That alliance request is no longer open.');
  }
  if (request.toPlayerId !== playerId) {
    throw ruleError('INVALID_ALLIANCE', 'That request was not sent to you.');
  }
  request.status = 'declined';
  ctx.emit('AllianceDeclined', { requestId }, [request.fromPlayerId, request.toPlayerId]);
}

/** Called on every round advance. Ends alliances past their duration. */
export function expireAlliances(ctx: EngineContext): void {
  const { state } = ctx;
  for (const alliance of Object.values(state.alliances)) {
    if (!alliance.active) continue;
    if (state.round <= alliance.expiresAfterRound) continue;
    endAlliance(ctx, alliance.id);
  }
}

export function endAlliance(ctx: EngineContext, allianceId: string): void {
  const { state } = ctx;
  const alliance = state.alliances[allianceId];
  if (!alliance || !alliance.active) return;
  alliance.active = false;

  const [a, b] = alliance.playerIds;
  recallArmy(ctx, a, b, true);
  recallArmy(ctx, b, a, true);

  const cooldownUntil = state.round + CONFIG.alliances.post_end_cooldown_rounds;
  for (const id of alliance.playerIds) {
    const player = state.players[id];
    if (player) player.allianceCooldownUntilRound = cooldownUntil;
  }
  ctx.emit('AllianceExpired', { allianceId, playerIds: alliance.playerIds });
}

/** Ends any alliance a player is part of (used on bankruptcy). */
export function endAlliancesFor(ctx: EngineContext, playerId: PlayerId): void {
  const alliance = activeAllianceFor(ctx.state, playerId);
  if (alliance) endAlliance(ctx, alliance.id);
}
