import type {
  ClientGameState,
  ClientPlayerView,
  GameEvent,
  GameState,
  PlayerId,
} from '@te/shared';
import {
  activePlayerId,
  allyOf,
  armySummary,
  completedTerritories,
  propertiesOwnedBy,
} from './selectors.js';

/**
 * Server-side filtering of authoritative state down to what one player may see.
 *
 * Cash and army are withheld for everyone but the viewer, and pending trades /
 * alliance requests are limited to the ones the viewer is party to. This is the
 * only path state takes to a client, so private data cannot leak by accident.
 */
export function projectStateForPlayer(state: GameState, viewerId: PlayerId): ClientGameState {
  const players: Record<PlayerId, ClientPlayerView> = {};

  for (const player of Object.values(state.players)) {
    const isSelf = player.id === viewerId;
    players[player.id] = {
      id: player.id,
      name: player.name,
      colour: player.colour,
      position: player.position,
      status: player.status,
      connected: player.connected,
      isHost: player.isHost,
      inDetention: player.inDetention,
      propertyCount: propertiesOwnedBy(state, player.id).length,
      completedTerritories: completedTerritories(state, player.id),
      isSelf,
      cash: isSelf ? player.cash : null,
      army: isSelf ? player.army.map((u) => ({ ...u })) : null,
      armySummary: isSelf ? armySummary(state, player) : null,
      stats: isSelf ? { ...player.stats } : null,
      freeScoutCharges: isSelf ? player.freeScoutCharges : null,
      allyId: allyOf(state, player.id),
    };
  }

  const scoutReports = Object.values(state.scoutReports[viewerId] ?? {});

  return {
    id: state.id,
    roomCode: state.roomCode,
    phase: state.phase,
    round: state.round,
    version: state.version,
    sequence: state.sequence,
    turnOrder: [...state.turnOrder],
    activePlayerId: activePlayerId(state),
    players,
    properties: Object.fromEntries(
      Object.entries(state.properties).map(([id, property]) => [id, { ...property }]),
    ),
    turn: {
      hasRolled: state.turn.hasRolled,
      dice: state.turn.dice,
      pendingPurchase: state.turn.pendingPurchase,
      extraRollPending: state.turn.extraRollPending,
      expiresAt: state.turn.expiresAt,
      warsDeclaredThisTurn: state.turn.warsDeclaredThisTurn,
    },
    auction: state.auction ? { ...state.auction } : null,
    pendingDebt: state.pendingDebt,
    trades: Object.values(state.trades).filter(
      (trade) =>
        trade.status === 'pending' &&
        (trade.fromPlayerId === viewerId || trade.toPlayerId === viewerId),
    ),
    allianceRequests: Object.values(state.allianceRequests).filter(
      (request) =>
        request.status === 'pending' &&
        (request.fromPlayerId === viewerId || request.toPlayerId === viewerId),
    ),
    alliances: Object.values(state.alliances).filter((alliance) => alliance.active),
    wars: state.wars,
    pot: state.pot,
    settings: state.settings,
    winnerIds: state.winnerIds,
    finalScores: state.finalScores,
    scoutReports,
    viewerId,
  };
}

/** Events a given player is allowed to receive. */
export function filterEventsForPlayer(events: GameEvent[], viewerId: PlayerId): GameEvent[] {
  return events.filter((event) => !event.audience || event.audience.includes(viewerId));
}
