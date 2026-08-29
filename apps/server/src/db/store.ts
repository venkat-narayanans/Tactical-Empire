import type { GameEvent, GameState, PlayerId } from '@te/shared';

/**
 * Persistence port.
 *
 * The game engine never sees this; the room service does. Keeping it an
 * interface means the SQLite adapter can be swapped for PostgreSQL without any
 * gameplay code changing.
 */

export interface StoredSession {
  readonly token: string;
  readonly gameId: string;
  readonly playerId: PlayerId;
  readonly roomCode: string;
}

export interface GameStore {
  createGame(state: GameState): void;
  loadGameByCode(roomCode: string): GameState | null;
  loadGameById(gameId: string): GameState | null;
  roomCodeExists(roomCode: string): boolean;

  /**
   * Persists a new state version together with the events that produced it, in
   * a single transaction. Returns false when `expectedVersion` no longer
   * matches the stored version, which means another writer got there first.
   */
  commit(state: GameState, events: GameEvent[], expectedVersion: number): boolean;

  appendEvents(gameId: string, events: GameEvent[]): void;
  eventsSince(gameId: string, sequence: number): GameEvent[];

  createSession(session: StoredSession): void;
  loadSession(token: string): StoredSession | null;
  touchSession(token: string, at: number): void;

  listActiveGameIds(): string[];
  deleteGame(gameId: string): void;
  close(): void;
}
