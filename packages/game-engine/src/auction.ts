import { CONFIG, propertyDisplayName } from '@te/config';
import type { GameState, PlayerId, PropertyId } from '@te/shared';
import { ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import { announceTerritoryIfCompleted, getProperty } from './property.js';
import { finishTurn } from './turn.js';
import { activePlayerId } from './selectors.js';

/**
 * Auctions.
 *
 * GAME_CONFIG defines the bidding rules and the anti-sniping extension but not
 * a base auction length, so the engine uses AUCTION_DURATION_SECONDS below.
 * See docs/DECISIONS.md.
 */
export const AUCTION_DURATION_SECONDS = 20;

export function startAuction(
  ctx: EngineContext,
  propertyId: PropertyId,
  finishTurnOnEnd = false,
): void {
  const { state } = ctx;
  if (!state.settings.auction) {
    throw ruleError('INVALID_PHASE', 'Auctions are disabled in this game.');
  }
  if (state.auction) throw ruleError('INVALID_PHASE', 'An auction is already running.');
  const property = getProperty(state, propertyId);
  if (property.owner !== null) {
    throw ruleError('PROPERTY_UNAVAILABLE', 'That property already has an owner.');
  }

  const bidders = state.turnOrder.filter((id) => state.players[id]?.status === 'active');
  const auctionId = ctx.deps.newId();
  const endsAt = ctx.now() + AUCTION_DURATION_SECONDS * 1000;
  state.auction = {
    id: auctionId,
    propertyId,
    activeBidders: bidders,
    highestBid: CONFIG.auction.starting_bid,
    highestBidderId: null,
    bids: [],
    endsAt,
    returnPhase: 'ACTION',
    finishTurnOnEnd,
  };
  ctx.setPhase('AUCTION');
  ctx.emit('AuctionStarted', { auctionId, propertyId, endsAt });
}

export function placeBid(
  ctx: EngineContext,
  playerId: PlayerId,
  auctionId: string,
  amount: number,
): void {
  const { state } = ctx;
  const auction = state.auction;
  if (!auction || auction.id !== auctionId) {
    throw ruleError('AUCTION_NOT_ACTIVE', 'That auction is no longer running.');
  }
  const player = ctx.player(playerId);
  if (player.status !== 'active') throw ruleError('PLAYER_BANKRUPT', 'You are out of the game.');
  if (!auction.activeBidders.includes(playerId)) {
    throw ruleError('INVALID_BID', 'You have already passed on this auction.');
  }
  if (CONFIG.auction.bid_must_exceed_current && amount <= auction.highestBid) {
    throw ruleError('INVALID_BID', `Your bid must be higher than ₹${auction.highestBid}.`);
  }
  if (CONFIG.auction.bid_cannot_exceed_cash && amount > player.cash) {
    throw ruleError('INSUFFICIENT_FUNDS', 'You cannot bid more than your cash.');
  }

  auction.highestBid = amount;
  auction.highestBidderId = playerId;
  auction.bids.push({ playerId, amount, at: ctx.now() });

  // Anti-sniping: a late bid always leaves everyone a minimum window to respond.
  const minimumEnd = ctx.now() + CONFIG.auction.anti_sniping_extension_seconds * 1000;
  if (auction.endsAt < minimumEnd) auction.endsAt = minimumEnd;

  ctx.emit('BidPlaced', { auctionId, playerId, amount, endsAt: auction.endsAt });
}

export function passAuction(ctx: EngineContext, playerId: PlayerId, auctionId: string): void {
  const { state } = ctx;
  const auction = state.auction;
  if (!auction || auction.id !== auctionId) {
    throw ruleError('AUCTION_NOT_ACTIVE', 'That auction is no longer running.');
  }
  if (!auction.activeBidders.includes(playerId)) {
    throw ruleError('INVALID_BID', 'You have already passed on this auction.');
  }
  auction.activeBidders = auction.activeBidders.filter((id) => id !== playerId);
  ctx.emit('AuctionPassed', { auctionId, playerId });

  const remaining = auction.activeBidders;
  const shouldClose =
    remaining.length === 0 ||
    (remaining.length === 1 && auction.highestBidderId !== null && remaining[0] === auction.highestBidderId);
  if (shouldClose) endAuction(ctx);
}

/** Settles the auction: charges the winner, transfers ownership, resumes the turn. */
export function endAuction(ctx: EngineContext): void {
  const { state } = ctx;
  const auction = state.auction;
  if (!auction) return;
  const { id: auctionId, propertyId, highestBidderId, highestBid } = auction;

  let winnerId: PlayerId | null = null;
  let amount = 0;

  if (highestBidderId) {
    const winner = state.players[highestBidderId];
    const property = state.properties[propertyId];
    if (winner && property && property.owner === null && winner.cash >= highestBid) {
      ctx.debit(highestBidderId, highestBid);
      property.owner = highestBidderId;
      winner.stats.propertiesBought += 1;
      winnerId = highestBidderId;
      amount = highestBid;
    }
  }

  state.auction = null;
  ctx.emit('AuctionEnded', { auctionId, propertyId, winnerId, amount });
  if (winnerId) {
    ctx.emit('PropertyPurchased', { playerId: winnerId, propertyId, price: amount });
    announceTerritoryIfCompleted(ctx, winnerId, propertyId);
  }

  ctx.setPhase(auction.returnPhase);

  // An auction started by ending the turn should hand over once it settles;
  // one started by declining mid-turn returns the player to their own actions.
  if (auction.finishTurnOnEnd && state.phase === 'ACTION' && state.pendingDebt === null) {
    const current = activePlayerId(state);
    if (current) finishTurn(ctx, current);
  }
}

export function auctionPropertyName(state: GameState): string | null {
  return state.auction ? propertyDisplayName(state.auction.propertyId) : null;
}
