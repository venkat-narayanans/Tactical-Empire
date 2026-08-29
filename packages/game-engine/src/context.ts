import type {
  DebtReason,
  GameEvent,
  GameEventType,
  GamePhase,
  GameState,
  PlayerId,
  PlayerState,
} from '@te/shared';
import { ruleError } from '@te/shared';

/** Injected side-effect boundary so the engine stays pure and testable. */
export interface EngineDeps {
  now(): number;
  newId(): string;
}

type PayloadOf<T extends GameEventType> = Extract<GameEvent, { type: T }>['payload'];

/**
 * Per-command working context. It owns the event buffer and the state mutation
 * helpers, so every money movement and every phase change is funnelled through
 * one auditable place.
 */
export class EngineContext {
  readonly state: GameState;
  readonly deps: EngineDeps;
  readonly events: GameEvent[] = [];

  constructor(state: GameState, deps: EngineDeps) {
    this.state = state;
    this.deps = deps;
  }

  now(): number {
    return this.deps.now();
  }

  /** Appends an ordered, immutable event. `audience` marks it private. */
  emit<T extends GameEventType>(
    type: T,
    payload: PayloadOf<T>,
    audience?: readonly PlayerId[],
  ): void {
    this.state.sequence += 1;
    const event = {
      type,
      eventId: this.deps.newId(),
      gameId: this.state.id,
      sequence: this.state.sequence,
      at: this.now(),
      ...(audience ? { audience } : {}),
      payload,
    } as GameEvent;
    this.events.push(event);
  }

  player(playerId: PlayerId): PlayerState {
    const player = this.state.players[playerId];
    if (!player) throw ruleError('PLAYER_NOT_FOUND', 'That player is not in this game.');
    return player;
  }

  setPhase(phase: GamePhase): void {
    if (this.state.phase === phase) return;
    this.state.phase = phase;
    this.emit('PhaseChanged', { phase });
  }

  /** Adds money. Never fails. */
  credit(playerId: PlayerId, amount: number): void {
    if (amount <= 0) return;
    this.player(playerId).cash += Math.round(amount);
  }

  /**
   * Removes money. Callers must have already verified affordability; the guard
   * here exists so a logic bug can never produce negative cash.
   */
  debit(playerId: PlayerId, amount: number): void {
    if (amount <= 0) return;
    const player = this.player(playerId);
    const value = Math.round(amount);
    if (player.cash < value) {
      throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford that.');
    }
    player.cash -= value;
  }

  /**
   * Charges an obligation. If the player cannot pay in cash, the game enters
   * RESOLVING_DEBT: they must liquidate (or go bankrupt) before play continues.
   * Returns true when the charge settled immediately.
   */
  charge(
    playerId: PlayerId,
    amount: number,
    creditorId: PlayerId | null,
    reason: DebtReason,
  ): boolean {
    const value = Math.round(amount);
    if (value <= 0) return true;
    const player = this.player(playerId);
    if (player.cash >= value) {
      player.cash -= value;
      if (creditorId) this.credit(creditorId, value);
      return true;
    }
    this.state.pendingDebt = { playerId, amount: value, creditorId, reason };
    this.state.debtReturnPhase = this.state.phase;
    this.emit('DebtIncurred', { playerId, amount: value, creditorId, reason });
    this.setPhase('RESOLVING_DEBT');
    return false;
  }
}
