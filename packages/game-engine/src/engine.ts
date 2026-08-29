import type {
  CommandPayload,
  CommandType,
  GameEvent,
  GameState,
  ParsedCommand,
  PlayerId,
} from '@te/shared';
import { MUTATING_COMMANDS, RuleError, ruleError } from '@te/shared';
import { EngineContext } from './context.js';
import type { EngineDeps } from './context.js';
import {
  addPlayer,
  removePlayer,
  selectColour,
  startGame,
  updateSettings,
} from './setup.js';
import {
  declineProperty,
  endTurn,
  forceEndTurn,
  payReleaseFee,
  rollDice,
} from './turn.js';
import {
  build,
  buyProperty,
  mortgageProperty,
  sellBuilding,
  unmortgageProperty,
} from './property.js';
import { endAuction, passAuction, placeBid } from './auction.js';
import { acceptTrade, cancelTrade, createTrade, rejectTrade } from './trade.js';
import { buyArmy, lendArmy, recallArmy, sellArmy } from './army.js';
import { scout } from './scouting.js';
import { acceptAlliance, declineAlliance, requestAlliance } from './alliance.js';
import { declareWar } from './war.js';
import { declareBankruptcy, settleDebt } from './bankruptcy.js';

/**
 * The single entry point for every state change.
 *
 * The caller (the server) hands in a state it owns exclusively for the duration
 * of the call. On success it commits the mutated state plus the events; on a
 * RuleError it discards the state entirely, which is what makes each command
 * atomic. Duplicate requestIds are recognised and produce no second mutation.
 */

export interface ExecuteResult {
  readonly events: GameEvent[];
  readonly duplicate: boolean;
}

export function executeCommand(
  state: GameState,
  deps: EngineDeps,
  playerId: PlayerId,
  command: ParsedCommand,
): ExecuteResult {
  if (MUTATING_COMMANDS.has(command.type) && state.processedActions[command.requestId]) {
    return { events: [], duplicate: true };
  }

  const ctx = new EngineContext(state, deps);
  const sequenceStart = state.sequence + 1;
  dispatch(ctx, playerId, command);

  if (MUTATING_COMMANDS.has(command.type)) {
    state.processedActions[command.requestId] = {
      sequenceStart,
      sequenceEnd: state.sequence,
      at: deps.now(),
    };
  }
  if (ctx.events.length > 0) state.version += 1;
  return { events: ctx.events, duplicate: false };
}

function payload<T extends CommandType>(command: ParsedCommand, _type: T): CommandPayload<T> {
  return command.payload as CommandPayload<T>;
}

function dispatch(ctx: EngineContext, playerId: PlayerId, command: ParsedCommand): void {
  switch (command.type) {
    case 'JOIN_ROOM': {
      const p = payload(command, 'JOIN_ROOM');
      addPlayer(ctx, playerId, p.playerName, Object.keys(ctx.state.players).length === 0);
      return;
    }
    case 'LEAVE_ROOM':
      removePlayer(ctx, playerId);
      return;
    case 'SELECT_COLOUR':
      selectColour(ctx, playerId, payload(command, 'SELECT_COLOUR').colour);
      return;
    case 'UPDATE_SETTINGS':
      updateSettings(ctx, playerId, payload(command, 'UPDATE_SETTINGS').settings);
      return;
    case 'START_GAME':
      startGame(ctx, playerId);
      return;

    case 'ROLL_DICE':
      rollDice(ctx, playerId);
      return;
    case 'END_TURN':
      endTurn(ctx, playerId);
      return;
    case 'PAY_RELEASE_FEE':
      payReleaseFee(ctx, playerId);
      return;

    case 'BUY_PROPERTY':
      buyProperty(ctx, playerId, payload(command, 'BUY_PROPERTY').propertyId);
      return;
    case 'DECLINE_PROPERTY':
      declineProperty(ctx, playerId, payload(command, 'DECLINE_PROPERTY').propertyId);
      return;
    case 'BUILD':
      requireOwnTurnAction(ctx, playerId);
      build(ctx, playerId, payload(command, 'BUILD').propertyId);
      return;
    case 'SELL_BUILDING':
      sellBuilding(ctx, playerId, payload(command, 'SELL_BUILDING').propertyId);
      return;
    case 'MORTGAGE_PROPERTY':
      mortgageProperty(ctx, playerId, payload(command, 'MORTGAGE_PROPERTY').propertyId);
      return;
    case 'UNMORTGAGE_PROPERTY':
      unmortgageProperty(ctx, playerId, payload(command, 'UNMORTGAGE_PROPERTY').propertyId);
      return;

    case 'PLACE_BID': {
      const p = payload(command, 'PLACE_BID');
      placeBid(ctx, playerId, p.auctionId, p.amount);
      return;
    }
    case 'PASS_AUCTION':
      passAuction(ctx, playerId, payload(command, 'PASS_AUCTION').auctionId);
      return;

    case 'CREATE_TRADE': {
      const p = payload(command, 'CREATE_TRADE');
      createTrade(ctx, playerId, p.targetPlayerId, p.offered, p.requested);
      return;
    }
    case 'ACCEPT_TRADE':
      acceptTrade(ctx, playerId, payload(command, 'ACCEPT_TRADE').tradeId);
      return;
    case 'REJECT_TRADE':
      rejectTrade(ctx, playerId, payload(command, 'REJECT_TRADE').tradeId);
      return;
    case 'CANCEL_TRADE':
      cancelTrade(ctx, playerId, payload(command, 'CANCEL_TRADE').tradeId);
      return;

    case 'BUY_ARMY': {
      const p = payload(command, 'BUY_ARMY');
      requireOwnTurnAction(ctx, playerId);
      buyArmy(ctx, playerId, p.unitType, p.quantity);
      return;
    }
    case 'SELL_ARMY': {
      const p = payload(command, 'SELL_ARMY');
      sellArmy(ctx, playerId, p.unitType, p.quantity);
      return;
    }
    case 'LEND_ARMY': {
      const p = payload(command, 'LEND_ARMY');
      lendArmy(ctx, playerId, p.targetPlayerId, p.power);
      return;
    }
    case 'RECALL_ARMY':
      recallArmy(ctx, playerId, payload(command, 'RECALL_ARMY').targetPlayerId);
      return;

    case 'SCOUT':
      requireOwnTurnAction(ctx, playerId);
      scout(ctx, playerId, payload(command, 'SCOUT').targetPlayerId);
      return;

    case 'REQUEST_ALLIANCE':
      requestAlliance(ctx, playerId, payload(command, 'REQUEST_ALLIANCE').targetPlayerId);
      return;
    case 'ACCEPT_ALLIANCE':
      acceptAlliance(ctx, playerId, payload(command, 'ACCEPT_ALLIANCE').requestId);
      return;
    case 'DECLINE_ALLIANCE':
      declineAlliance(ctx, playerId, payload(command, 'DECLINE_ALLIANCE').requestId);
      return;

    case 'DECLARE_WAR': {
      const p = payload(command, 'DECLARE_WAR');
      declareWar(ctx, playerId, p.targetPlayerId, p.territoryId);
      return;
    }

    case 'SETTLE_DEBT':
      settleDebt(ctx, playerId);
      return;
    case 'DECLARE_BANKRUPTCY':
      declareBankruptcy(ctx, playerId);
      return;

    case 'CREATE_ROOM':
    case 'REJOIN_ROOM':
      // Handled by the connection layer before a game context exists.
      throw ruleError('UNKNOWN_COMMAND', 'That command cannot be sent to a game.');

    default:
      // Every CommandType is handled above; `command` is `never` here.
      throw ruleError('UNKNOWN_COMMAND', 'Unknown command.');
  }
}

/**
 * Actions that spend a player's turn (build, buy army, scout) are limited to
 * the active player during their own turn, so they cannot be used to react
 * mid-way through someone else's move.
 */
function requireOwnTurnAction(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  if (state.phase === 'LOBBY') throw ruleError('GAME_NOT_STARTED', 'The game has not started yet.');
  if (state.phase === 'GAME_OVER') throw ruleError('GAME_FINISHED', 'This game has finished.');
  if (state.phase === 'AUCTION') throw ruleError('INVALID_PHASE', 'Finish the auction first.');
  if (state.phase === 'RESOLVING_DEBT') {
    throw ruleError('DEBT_OUTSTANDING', 'Settle your debt first.');
  }
  if (state.turnOrder[state.activePlayerIndex] !== playerId) {
    throw ruleError('NOT_YOUR_TURN', 'You can only do that on your own turn.');
  }
  const player = state.players[playerId];
  if (!player || player.status !== 'active') {
    throw ruleError('PLAYER_BANKRUPT', 'You are out of the game.');
  }
}

/** Server-driven tick: expires turns and auctions. Produces the same events. */
export function tick(state: GameState, deps: EngineDeps): GameEvent[] {
  const ctx = new EngineContext(state, deps);
  const now = deps.now();

  if (state.phase === 'AUCTION' && state.auction && now >= state.auction.endsAt) {
    endAuction(ctx);
  } else if (
    (state.phase === 'PLAYER_TURN' || state.phase === 'ACTION') &&
    now >= state.turn.expiresAt
  ) {
    forceEndTurn(ctx);
  }

  if (ctx.events.length > 0) state.version += 1;
  return ctx.events;
}

export { RuleError };
export type { EngineDeps };
