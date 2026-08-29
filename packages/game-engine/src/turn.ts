import {
  CONFIG,
  GO_TO_IG_SIGNAL_INDEX,
  IG_SIGNAL_INDEX,
  START_INDEX,
  boardSpaceAt,
  normaliseIndex,
  propertyPrice,
} from '@te/config';
import type { GameState, PlayerId, PlayerState } from '@te/shared';
import { ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import { nextInt } from './rng.js';
import { activePlayerId } from './selectors.js';
import { calculateRent, getProperty } from './property.js';
import { startAuction } from './auction.js';
import { expireAlliances } from './alliance.js';
import { checkVictory } from './victory.js';
import { beginTurn } from './setup.js';
import { addArmyUnits } from './army.js';

/**
 * Turn flow: roll -> move -> land -> act -> end.
 *
 * Dice and every consequence of landing are produced here, server side. The
 * client only ever asks to roll; it never supplies or influences a result.
 */

const MAX_CHAIN_DEPTH = CONFIG.event_decks.max_automatic_resolution_chain_depth;

/**
 * Reads the phase through a call so TypeScript does not keep a narrowing from
 * an earlier guard: landing resolution can move the phase underneath us.
 */
function isSuspendedPhase(state: GameState): boolean {
  const phase = state.phase;
  return phase === 'RESOLVING_DEBT' || phase === 'AUCTION' || phase === 'GAME_OVER';
}

export function assertActiveTurn(state: GameState, playerId: PlayerId): PlayerState {
  const player = state.players[playerId];
  if (!player) throw ruleError('PLAYER_NOT_FOUND', 'You are not in this game.');
  if (state.phase === 'GAME_OVER') throw ruleError('GAME_FINISHED', 'This game has finished.');
  if (state.phase === 'LOBBY') throw ruleError('GAME_NOT_STARTED', 'The game has not started yet.');
  if (player.status !== 'active') throw ruleError('PLAYER_BANKRUPT', 'You are out of the game.');
  if (activePlayerId(state) !== playerId) {
    throw ruleError('NOT_YOUR_TURN', 'It is not your turn.');
  }
  return player;
}

export function rollDice(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = assertActiveTurn(state, playerId);
  if (state.phase !== 'PLAYER_TURN') {
    throw ruleError('INVALID_PHASE', 'You cannot roll right now.');
  }
  if (state.turn.hasRolled && !state.turn.extraRollPending) {
    throw ruleError('ALREADY_ROLLED', 'You have already rolled this turn.');
  }

  const die1 = nextInt(state.rng, 1, 6);
  const die2 = nextInt(state.rng, 1, 6);
  const dice = { die1, die2, total: die1 + die2, isDouble: die1 === die2 };
  state.turn.dice = dice;
  state.turn.hasRolled = true;
  state.turn.extraRollPending = false;
  ctx.emit('DiceRolled', { playerId, dice });

  if (player.inDetention) {
    resolveDetentionRoll(ctx, player, dice.isDouble, dice.total);
    return;
  }

  if (dice.isDouble) {
    player.consecutiveDoubles += 1;
    if (player.consecutiveDoubles >= CONFIG.defaults.double_roll_limit) {
      player.consecutiveDoubles = 0;
      sendToDetention(ctx, player, 'triple_double');
      ctx.setPhase('ACTION');
      return;
    }
    state.turn.extraRollPending = true;
  } else {
    player.consecutiveDoubles = 0;
  }

  moveBy(ctx, player, dice.total, 0);
  if (!isSuspendedPhase(state)) ctx.setPhase('ACTION');
}

function resolveDetentionRoll(
  ctx: EngineContext,
  player: PlayerState,
  isDouble: boolean,
  total: number,
): void {
  const rules = CONFIG.corner_rules.ig_signal;
  if (isDouble && rules.release_by_doubles) {
    player.inDetention = false;
    player.detentionAttempts = 0;
    ctx.emit('PlayerReleased', { playerId: player.id, method: 'doubles' });
    moveBy(ctx, player, total, 0);
  } else {
    player.detentionAttempts += 1;
    if (player.detentionAttempts >= rules.max_failed_double_attempts) {
      // Final attempt failed: the release fee is compulsory, then the player moves.
      const paid = ctx.charge(player.id, rules.release_fee, null, 'fee');
      routeFeeToPot(ctx, rules.release_fee, paid);
      player.inDetention = false;
      player.detentionAttempts = 0;
      ctx.emit('PlayerReleased', { playerId: player.id, method: 'forced' });
      if (paid) moveBy(ctx, player, total, 0);
    }
  }
  if (!isSuspendedPhase(ctx.state)) ctx.setPhase('ACTION');
}

export function payReleaseFee(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = assertActiveTurn(state, playerId);
  if (!player.inDetention) throw ruleError('INVALID_PHASE', 'You are not being held at IG Signal.');
  if (state.phase !== 'PLAYER_TURN') throw ruleError('INVALID_PHASE', 'You cannot pay right now.');
  const fee = CONFIG.corner_rules.ig_signal.release_fee;
  if (player.cash < fee) throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford the release fee.');
  ctx.debit(playerId, fee);
  routeFeeToPot(ctx, fee, true);
  player.inDetention = false;
  player.detentionAttempts = 0;
  ctx.emit('PlayerReleased', { playerId, method: 'fee' });
  ctx.emit('FeePaid', { playerId, amount: fee, feeId: 'ig_signal_release' });
}

function routeFeeToPot(ctx: EngineContext, amount: number, paid: boolean): void {
  if (!paid) return;
  if (ctx.state.settings.vacationCash && CONFIG.fees.vacation_cash_routes_fee_to_pot) {
    ctx.state.pot += amount;
  }
}

export function sendToDetention(ctx: EngineContext, player: PlayerState, reason: string): void {
  const from = player.position;
  player.position = IG_SIGNAL_INDEX;
  player.inDetention = true;
  player.detentionAttempts = 0;
  player.consecutiveDoubles = 0;
  ctx.state.turn.extraRollPending = false;
  ctx.emit('ForcedMovement', { playerId: player.id, from, to: IG_SIGNAL_INDEX, reason });
  ctx.emit('PlayerDetained', { playerId: player.id, reason });
}

/** Moves forward (or backward) by `steps`, paying the start bonus on a pass. */
export function moveBy(ctx: EngineContext, player: PlayerState, steps: number, depth: number): void {
  const from = player.position;
  const raw = from + steps;
  const to = normaliseIndex(raw);
  const passedStart = steps > 0 && raw >= CONFIG.game.board_size;
  player.position = to;
  ctx.emit('PlayerMoved', { playerId: player.id, from, to, steps, passedStart });
  if (passedStart) {
    const bonus = CONFIG.corner_rules.start.pass_bonus;
    ctx.credit(player.id, bonus);
    ctx.emit('StartBonusPaid', { playerId: player.id, amount: bonus });
  }
  resolveLanding(ctx, player, depth);
}

/** Teleports without paying the start bonus (Go To IG Signal). */
function forceTo(ctx: EngineContext, player: PlayerState, index: number, reason: string): void {
  const from = player.position;
  player.position = index;
  ctx.emit('ForcedMovement', { playerId: player.id, from, to: index, reason });
}

export function resolveLanding(ctx: EngineContext, player: PlayerState, depth: number): void {
  const { state } = ctx;
  const space = boardSpaceAt(player.position);

  switch (space.kind) {
    case 'corner':
      resolveCorner(ctx, player, space.id);
      break;
    case 'city':
    case 'special_property':
      resolvePurchasableLanding(ctx, player, space.id);
      break;
    case 'treasure':
      drawCard(ctx, player, 'treasure', depth);
      break;
    case 'surprise':
      drawCard(ctx, player, 'surprise', depth);
      break;
    case 'fee': {
      const amount = CONFIG.fees.college_fees;
      const paid = ctx.charge(player.id, amount, null, 'fee');
      routeFeeToPot(ctx, amount, paid);
      if (paid) ctx.emit('FeePaid', { playerId: player.id, amount, feeId: space.id });
      break;
    }
  }

  ctx.emit('LandingResolved', {
    playerId: player.id,
    spaceId: space.id,
    spaceIndex: space.index,
    outcome: state.turn.pendingPurchase ? 'purchase_offer' : space.kind,
  });
}

function resolveCorner(ctx: EngineContext, player: PlayerState, cornerId: string): void {
  const { state } = ctx;
  switch (cornerId) {
    case 'start':
      break;
    case 'ig_signal':
      // Just visiting; only Go To IG Signal or three doubles detains a player.
      break;
    case 'vacation':
      if (state.settings.vacationCash && CONFIG.corner_rules.vacation.vacation_cash_enabled) {
        const amount = state.pot;
        state.pot = 0;
        if (amount > 0) {
          ctx.credit(player.id, amount);
          ctx.emit('SpecialReward', { playerId: player.id, amount, source: 'vacation_cash' });
        }
      }
      break;
    case 'go_to_ig_signal':
      forceTo(ctx, player, GO_TO_IG_SIGNAL_INDEX, 'go_to_ig_signal');
      sendToDetention(ctx, player, 'go_to_ig_signal');
      break;
  }
}

function resolvePurchasableLanding(ctx: EngineContext, player: PlayerState, propertyId: string): void {
  const { state } = ctx;
  const property = getProperty(state, propertyId);

  if (property.owner === null) {
    state.turn.pendingPurchase = { propertyId, price: propertyPrice(propertyId) };
    return;
  }
  if (property.owner === player.id) return;

  const ownerPlayer = state.players[property.owner];
  if (!ownerPlayer || ownerPlayer.status !== 'active') return;

  const diceTotal = state.turn.dice?.total ?? 0;
  const rent = calculateRent(state, propertyId, diceTotal);
  if (rent <= 0) return;

  const paid = ctx.charge(player.id, rent, property.owner, 'rent');
  if (paid) {
    player.stats.rentPaid += rent;
    ownerPlayer.stats.rentCollected += rent;
    ctx.emit('RentPaid', {
      payerId: player.id,
      ownerId: property.owner,
      propertyId,
      amount: rent,
    });
  }
}

function drawCard(
  ctx: EngineContext,
  player: PlayerState,
  deck: 'treasure' | 'surprise',
  depth: number,
): void {
  const { state } = ctx;
  const cards = CONFIG.event_decks[deck];
  const deckState = state.decks[deck];
  if (deckState.order.length === 0) {
    if (!CONFIG.event_decks.reshuffle_when_empty) return;
    deckState.order = cards.map((_, i) => i);
    shuffleDeck(ctx, deckState.order);
  }
  const index = deckState.order.shift();
  if (index === undefined) return;
  const card = cards[index];
  if (!card) return;
  const [cardId, effect] = card;

  if (deck === 'treasure') ctx.emit('TreasureResolved', { playerId: player.id, cardId, effect });
  else ctx.emit('SurpriseResolved', { playerId: player.id, cardId, effect });

  applyCardEffect(ctx, player, cardId, effect, depth);
}

function shuffleDeck(ctx: EngineContext, order: number[]): void {
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = nextInt(ctx.state.rng, 0, i);
    const a = order[i] as number;
    const b = order[j] as number;
    order[i] = b;
    order[j] = a;
  }
}

function applyCardEffect(
  ctx: EngineContext,
  player: PlayerState,
  cardId: string,
  effect: string,
  depth: number,
): void {
  if (effect.startsWith('+')) {
    const amount = Number.parseInt(effect.slice(1), 10);
    ctx.credit(player.id, amount);
    ctx.emit('SpecialReward', { playerId: player.id, amount, source: cardId });
    return;
  }
  if (effect.startsWith('-')) {
    const amount = Number.parseInt(effect.slice(1), 10);
    const paid = ctx.charge(player.id, amount, null, 'fee');
    routeFeeToPot(ctx, amount, paid);
    if (paid) ctx.emit('SpecialPenalty', { playerId: player.id, amount, source: cardId });
    return;
  }
  if (effect.startsWith('move:')) {
    if (depth + 1 > MAX_CHAIN_DEPTH) return;
    const steps = Number.parseInt(effect.slice('move:'.length), 10);
    if (Number.isNaN(steps)) return;
    moveBy(ctx, player, steps, depth + 1);
    return;
  }
  if (effect.startsWith('scout_cost:0')) {
    player.freeScoutCharges += 1;
    return;
  }
  if (effect.startsWith('army:')) {
    const [, unitType, delta] = effect.split(':');
    const quantity = Number.parseInt((delta ?? '').replace('+', ''), 10);
    if (!unitType || Number.isNaN(quantity)) return;
    addArmyUnits(ctx, player.id, unitType, quantity, { free: true, respectCapacity: true });
  }
}

export function declineProperty(ctx: EngineContext, playerId: PlayerId, propertyId: string): void {
  const { state } = ctx;
  assertActiveTurn(state, playerId);
  const pending = state.turn.pendingPurchase;
  if (!pending || pending.propertyId !== propertyId) {
    throw ruleError('PROPERTY_UNAVAILABLE', 'There is no purchase offer for that property.');
  }
  state.turn.pendingPurchase = null;
  if (state.settings.auction) {
    startAuction(ctx, propertyId);
  }
}

export function endTurn(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  assertActiveTurn(state, playerId);
  if (state.phase === 'AUCTION') throw ruleError('INVALID_PHASE', 'Finish the auction first.');
  if (state.phase === 'RESOLVING_DEBT') {
    throw ruleError('DEBT_OUTSTANDING', 'Settle your debt before ending the turn.');
  }
  if (!state.turn.hasRolled) throw ruleError('INVALID_PHASE', 'You must roll before ending your turn.');

  // An unanswered purchase offer counts as a decline.
  if (state.turn.pendingPurchase) {
    const propertyId = state.turn.pendingPurchase.propertyId;
    state.turn.pendingPurchase = null;
    if (state.settings.auction) {
      startAuction(ctx, propertyId, true);
      return;
    }
  }

  finishTurn(ctx, playerId);
}

/** Ends the current turn and hands over, or grants the pending extra roll. */
export function finishTurn(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = state.players[playerId];

  if (player && player.status === 'active' && state.turn.extraRollPending && !player.inDetention) {
    state.turn.hasRolled = false;
    state.turn.dice = null;
    ctx.setPhase('PLAYER_TURN');
    return;
  }

  state.activeWarIds = [];
  ctx.emit('TurnEnded', { playerId });
  advanceToNextPlayer(ctx);
}

export function advanceToNextPlayer(ctx: EngineContext): void {
  const { state } = ctx;
  const remaining = state.turnOrder.filter((id) => state.players[id]?.status === 'active');
  if (remaining.length === 0) {
    checkVictory(ctx, 'no_active_players');
    return;
  }

  const size = state.turnOrder.length;
  let index = state.activePlayerIndex;
  let wrapped = false;
  for (let step = 1; step <= size; step += 1) {
    const raw = state.activePlayerIndex + step;
    const candidate = raw % size;
    if (raw >= size) wrapped = true;
    const id = state.turnOrder[candidate];
    if (id && state.players[id]?.status === 'active') {
      index = candidate;
      break;
    }
  }
  if (wrapped) {
    // The order wrapped past the last seat: a full round has completed.
    advanceRound(ctx);
    if (state.phase === 'GAME_OVER') return;
  }
  state.activePlayerIndex = index;
  if (checkVictory(ctx, 'round_limit')) return;
  beginTurn(ctx);
}

function advanceRound(ctx: EngineContext): void {
  const { state } = ctx;
  state.round += 1;
  ctx.emit('RoundAdvanced', { round: state.round });
  expireAlliances(ctx);
  checkVictory(ctx, 'round_limit');
}

/** Server-driven turn expiry. Ends the turn without giving the player a choice. */
export function forceEndTurn(ctx: EngineContext): void {
  const { state } = ctx;
  const playerId = activePlayerId(state);
  if (!playerId) return;
  if (state.phase === 'AUCTION' || state.phase === 'GAME_OVER') return;

  if (state.phase === 'RESOLVING_DEBT') return;

  if (!state.turn.hasRolled) {
    // The player never rolled: roll for them so the game cannot stall.
    rollDice(ctx, playerId);
    if (isSuspendedPhase(state)) return;
  }
  if (state.turn.pendingPurchase) {
    const propertyId = state.turn.pendingPurchase.propertyId;
    state.turn.pendingPurchase = null;
    if (state.settings.auction) {
      startAuction(ctx, propertyId, true);
      return;
    }
  }
  finishTurn(ctx, playerId);
}

export { START_INDEX };
