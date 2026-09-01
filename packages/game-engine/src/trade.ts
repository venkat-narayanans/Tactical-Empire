import type { GameState, PlayerId, TradeAssets } from '@te/shared';
import { ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import { announceTerritoryIfCompleted, getProperty, isInActiveWar } from './property.js';

/**
 * Player-to-player trading.
 *
 * The offer is validated when created and revalidated in full at acceptance,
 * because ownership and cash can change in between. Execution is a single
 * synchronous block, so a trade can never move one side's assets without the
 * other's. Army and alliances are not tradable per GAME_CONFIG.trade.
 */

function assertTradableAssets(
  state: GameState,
  playerId: PlayerId,
  assets: TradeAssets,
  who: string,
): void {
  const player = state.players[playerId];
  if (!player) throw ruleError('PLAYER_NOT_FOUND', 'That player is not in this game.');
  if (assets.cash < 0) throw ruleError('INVALID_TRADE', 'Cash amounts cannot be negative.');
  if (assets.cash > player.cash) {
    throw ruleError('INVALID_TRADE', `${who} does not have ₹${assets.cash}.`);
  }
  const seen = new Set<string>();
  for (const propertyId of assets.properties) {
    if (seen.has(propertyId)) throw ruleError('INVALID_TRADE', 'A property is listed twice.');
    seen.add(propertyId);
    const property = getProperty(state, propertyId);
    if (property.owner !== playerId) {
      throw ruleError('INVALID_TRADE', `${who} no longer owns that property.`);
    }
    if (property.level > 0) {
      throw ruleError('INVALID_TRADE', 'Sell the buildings on a property before trading it.');
    }
    if (state.auction?.propertyId === propertyId) {
      throw ruleError('INVALID_TRADE', 'That property is in an active auction.');
    }
  }
}

function assertTradeAllowed(state: GameState, playerId: PlayerId, targetId: PlayerId): void {
  if (state.phase === 'LOBBY') throw ruleError('GAME_NOT_STARTED', 'The game has not started yet.');
  if (state.phase === 'GAME_OVER') throw ruleError('GAME_FINISHED', 'This game has finished.');
  for (const id of [playerId, targetId]) {
    const player = state.players[id];
    if (!player) throw ruleError('PLAYER_NOT_FOUND', 'That player is not in this game.');
    if (player.status !== 'active') throw ruleError('PLAYER_BANKRUPT', 'That player is out of the game.');
    if (isInActiveWar(state, id)) {
      throw ruleError('INVALID_TRADE', 'Trading is locked while a war is active.');
    }
  }
}

export function createTrade(
  ctx: EngineContext,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  offered: TradeAssets,
  requested: TradeAssets,
): void {
  const { state } = ctx;
  if (playerId === targetPlayerId) throw ruleError('INVALID_TRADE', 'You cannot trade with yourself.');
  assertTradeAllowed(state, playerId, targetPlayerId);
  if (
    offered.cash === 0 &&
    offered.properties.length === 0 &&
    requested.cash === 0 &&
    requested.properties.length === 0
  ) {
    throw ruleError('INVALID_TRADE', 'A trade must move at least one asset.');
  }
  assertTradableAssets(state, playerId, offered, 'You');
  assertTradableAssets(state, targetPlayerId, requested, 'That player');

  const tradeId = ctx.deps.newId();
  state.trades[tradeId] = {
    id: tradeId,
    fromPlayerId: playerId,
    toPlayerId: targetPlayerId,
    offered: { cash: offered.cash, properties: [...offered.properties] },
    requested: { cash: requested.cash, properties: [...requested.properties] },
    status: 'pending',
    createdAt: ctx.now(),
  };
  ctx.emit(
    'TradeCreated',
    { tradeId, fromPlayerId: playerId, toPlayerId: targetPlayerId, offered, requested },
    [playerId, targetPlayerId],
  );
}

export function acceptTrade(ctx: EngineContext, playerId: PlayerId, tradeId: string): void {
  const { state } = ctx;
  const trade = state.trades[tradeId];
  if (!trade) throw ruleError('TRADE_NOT_FOUND', 'That trade offer no longer exists.');
  if (trade.status !== 'pending') {
    throw ruleError('INVALID_TRADE', 'That trade offer is no longer open.');
  }
  if (trade.toPlayerId !== playerId) {
    throw ruleError('INVALID_TRADE', 'That offer was not made to you.');
  }

  // Full revalidation: the world may have moved since the offer was created.
  assertTradeAllowed(state, trade.fromPlayerId, trade.toPlayerId);
  assertTradableAssets(state, trade.fromPlayerId, trade.offered, 'The offering player');
  assertTradableAssets(state, trade.toPlayerId, trade.requested, 'You');

  trade.status = 'accepted';
  ctx.emit('TradeAccepted', { tradeId }, [trade.fromPlayerId, trade.toPlayerId]);

  // Atomic execution: no validation remains, so nothing below can fail.
  const from = ctx.player(trade.fromPlayerId);
  const to = ctx.player(trade.toPlayerId);
  from.cash -= trade.offered.cash;
  to.cash += trade.offered.cash;
  to.cash -= trade.requested.cash;
  from.cash += trade.requested.cash;
  for (const propertyId of trade.offered.properties) {
    getProperty(state, propertyId).owner = trade.toPlayerId;
  }
  for (const propertyId of trade.requested.properties) {
    getProperty(state, propertyId).owner = trade.fromPlayerId;
  }

  ctx.emit('TradeExecuted', {
    tradeId,
    fromPlayerId: trade.fromPlayerId,
    toPlayerId: trade.toPlayerId,
  });
  for (const propertyId of trade.offered.properties) {
    announceTerritoryIfCompleted(ctx, trade.toPlayerId, propertyId);
  }
  for (const propertyId of trade.requested.properties) {
    announceTerritoryIfCompleted(ctx, trade.fromPlayerId, propertyId);
  }

  invalidateConflictingTrades(ctx, tradeId);
}

/**
 * Any other pending offer that references an asset this trade just moved is
 * now stale, so it is cancelled rather than left to fail later.
 */
function invalidateConflictingTrades(ctx: EngineContext, executedTradeId: string): void {
  const { state } = ctx;
  const executed = state.trades[executedTradeId];
  if (!executed) return;
  const moved = new Set([...executed.offered.properties, ...executed.requested.properties]);
  for (const trade of Object.values(state.trades)) {
    if (trade.id === executedTradeId || trade.status !== 'pending') continue;
    const touches = [...trade.offered.properties, ...trade.requested.properties].some((id) =>
      moved.has(id),
    );
    if (!touches) continue;
    trade.status = 'cancelled';
    ctx.emit('TradeCancelled', { tradeId: trade.id }, [trade.fromPlayerId, trade.toPlayerId]);
  }
}

export function rejectTrade(ctx: EngineContext, playerId: PlayerId, tradeId: string): void {
  const { state } = ctx;
  const trade = state.trades[tradeId];
  if (!trade) throw ruleError('TRADE_NOT_FOUND', 'That trade offer no longer exists.');
  if (trade.status !== 'pending') throw ruleError('INVALID_TRADE', 'That offer is no longer open.');
  if (trade.toPlayerId !== playerId) {
    throw ruleError('INVALID_TRADE', 'That offer was not made to you.');
  }
  trade.status = 'rejected';
  ctx.emit('TradeRejected', { tradeId }, [trade.fromPlayerId, trade.toPlayerId]);
}

export function cancelTrade(ctx: EngineContext, playerId: PlayerId, tradeId: string): void {
  const { state } = ctx;
  const trade = state.trades[tradeId];
  if (!trade) throw ruleError('TRADE_NOT_FOUND', 'That trade offer no longer exists.');
  if (trade.status !== 'pending') throw ruleError('INVALID_TRADE', 'That offer is no longer open.');
  if (trade.fromPlayerId !== playerId) {
    throw ruleError('INVALID_TRADE', 'You did not create that offer.');
  }
  trade.status = 'cancelled';
  ctx.emit('TradeCancelled', { tradeId }, [trade.fromPlayerId, trade.toPlayerId]);
}

/** Cancels every pending trade a player is party to (bankruptcy, elimination). */
export function cancelTradesFor(ctx: EngineContext, playerId: PlayerId): void {
  for (const trade of Object.values(ctx.state.trades)) {
    if (trade.status !== 'pending') continue;
    if (trade.fromPlayerId !== playerId && trade.toPlayerId !== playerId) continue;
    trade.status = 'cancelled';
    ctx.emit('TradeCancelled', { tradeId: trade.id }, [trade.fromPlayerId, trade.toPlayerId]);
  }
}
