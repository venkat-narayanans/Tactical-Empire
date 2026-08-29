import { randomUUID } from 'node:crypto';
import type {
  GameEvent,
  GameState,
  ParsedCommand,
  PlayerId,
  ServerMessage,
  SessionInfo,
  SettingsPatch,
} from '@te/shared';
import { RuleError, ruleError } from '@te/shared';
import {
  EngineContext,
  addPlayer,
  createGame,
  executeCommand,
  filterEventsForPlayer,
  projectStateForPlayer,
  removePlayer,
  tick,
  type EngineDeps,
} from '@te/game-engine';
import type { GameStore } from '../db/store.js';

/** A live client socket bound to one player in one room. */
export interface Connection {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly gameId: string;
  send(message: ServerMessage): void;
  close(): void;
}

interface Room {
  state: GameState;
  connections: Map<string, Connection>;
  /** Serialises state-changing work for this game. */
  queue: Promise<unknown>;
  lastActivity: number;
}

export interface Logger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Owns every live room.
 *
 * All state changes for one game funnel through `runExclusive`, so commands are
 * applied one at a time against fresh state. A command runs against a deep
 * clone; only if the engine accepts it and the store commits does the clone
 * become the room's state. A rejected or failed command therefore leaves the
 * game exactly as it was.
 */
export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly codeToGameId = new Map<string, string>();
  private readonly deps: EngineDeps = { now: () => Date.now(), newId: () => randomUUID() };

  constructor(
    private readonly store: GameStore,
    private readonly logger: Logger,
  ) {}

  // ---------------------------------------------------------------- room setup

  createRoom(playerName: string, settings?: SettingsPatch): { session: SessionInfo; state: GameState } {
    const roomCode = this.generateRoomCode();
    const gameId = randomUUID();
    const state = createGame({
      gameId,
      roomCode,
      now: Date.now(),
      ...(settings ? { settings } : {}),
    });

    const playerId = randomUUID();
    const ctx = new EngineContext(state, this.deps);
    ctx.emit('RoomCreated', { roomCode, hostId: playerId });
    addPlayer(ctx, playerId, playerName, true);

    this.store.createGame(state);
    this.store.appendEvents(gameId, ctx.events);
    this.rooms.set(gameId, {
      state,
      connections: new Map(),
      queue: Promise.resolve(),
      lastActivity: Date.now(),
    });
    this.codeToGameId.set(roomCode, gameId);

    const session = this.issueSession(gameId, playerId, roomCode, true);
    this.logger.info({ roomCode, gameId }, 'room created');
    return { session, state };
  }

  async joinRoom(roomCode: string, playerName: string): Promise<SessionInfo> {
    const room = this.requireRoomByCode(roomCode);
    const playerId = randomUUID();
    await this.runExclusive(room.state.id, (state) => {
      const ctx = new EngineContext(state, this.deps);
      addPlayer(ctx, playerId, playerName, false);
      return ctx.events;
    });
    const joined = this.requireRoom(room.state.id);
    const player = joined.state.players[playerId];
    return this.issueSession(joined.state.id, playerId, roomCode, player?.isHost ?? false);
  }

  rejoinRoom(roomCode: string, sessionToken: string): SessionInfo {
    const stored = this.store.loadSession(sessionToken);
    if (!stored) throw ruleError('UNAUTHENTICATED', 'That session is no longer valid.');
    if (stored.roomCode !== roomCode.toUpperCase()) {
      throw ruleError('UNAUTHENTICATED', 'That session belongs to a different room.');
    }
    const room = this.loadRoom(stored.gameId);
    if (!room) throw ruleError('ROOM_NOT_FOUND', 'That room no longer exists.');
    const player = room.state.players[stored.playerId];
    if (!player) throw ruleError('UNAUTHENTICATED', 'You are no longer in that room.');
    this.store.touchSession(sessionToken, Date.now());
    return {
      sessionToken,
      playerId: stored.playerId,
      roomCode: room.state.roomCode,
      isHost: player.isHost,
    };
  }

  private issueSession(
    gameId: string,
    playerId: PlayerId,
    roomCode: string,
    isHost: boolean,
  ): SessionInfo {
    const sessionToken = randomUUID();
    this.store.createSession({ token: sessionToken, gameId, playerId, roomCode });
    return { sessionToken, playerId, roomCode, isHost };
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = '';
      for (let i = 0; i < 5; i += 1) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.codeToGameId.has(code) && !this.store.roomCodeExists(code)) return code;
    }
    throw ruleError('INTERNAL_ERROR', 'Could not allocate a room code. Please try again.');
  }

  // ------------------------------------------------------------- room lookup

  private loadRoom(gameId: string): Room | null {
    const existing = this.rooms.get(gameId);
    if (existing) return existing;
    const state = this.store.loadGameById(gameId);
    if (!state) return null;
    const room: Room = {
      state,
      connections: new Map(),
      queue: Promise.resolve(),
      lastActivity: Date.now(),
    };
    this.rooms.set(gameId, room);
    this.codeToGameId.set(state.roomCode, gameId);
    return room;
  }

  private requireRoom(gameId: string): Room {
    const room = this.loadRoom(gameId);
    if (!room) throw ruleError('ROOM_NOT_FOUND', 'That room no longer exists.');
    return room;
  }

  private requireRoomByCode(roomCode: string): Room {
    const code = roomCode.toUpperCase();
    const cachedId = this.codeToGameId.get(code);
    if (cachedId) {
      const room = this.loadRoom(cachedId);
      if (room) return room;
    }
    const state = this.store.loadGameByCode(code);
    if (!state) throw ruleError('ROOM_NOT_FOUND', 'Room not found.');
    this.codeToGameId.set(code, state.id);
    return this.requireRoom(state.id);
  }

  roomExists(roomCode: string): boolean {
    const code = roomCode.toUpperCase();
    return this.codeToGameId.has(code) || this.store.roomCodeExists(code);
  }

  getState(gameId: string): GameState {
    return this.requireRoom(gameId).state;
  }

  getStateByCode(roomCode: string): GameState {
    return this.requireRoomByCode(roomCode).state;
  }

  // ------------------------------------------------------------ command path

  /**
   * Runs `work` against a private copy of the game state, then commits state
   * and events in one transaction. Calls for the same game are serialised.
   */
  private async runExclusive(
    gameId: string,
    work: (state: GameState) => GameEvent[],
  ): Promise<GameEvent[]> {
    const room = this.requireRoom(gameId);
    const run = room.queue.then(
      () => this.applyExclusive(gameId, work),
      () => this.applyExclusive(gameId, work),
    );
    // Keep the chain alive even when this call rejects, so later commands run.
    room.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private applyExclusive(gameId: string, work: (state: GameState) => GameEvent[]): GameEvent[] {
    const room = this.requireRoom(gameId);
    const baseVersion = room.state.version;
    const draft = structuredClone(room.state);

    const events = work(draft);

    if (events.length === 0) {
      room.lastActivity = Date.now();
      return [];
    }

    const committed = this.store.commit(draft, events, baseVersion);
    if (!committed) {
      // The stored version moved underneath us; the caller can retry safely
      // because nothing was applied.
      throw ruleError('INTERNAL_ERROR', 'The game state changed. Please try again.');
    }

    room.state = draft;
    room.lastActivity = Date.now();
    this.broadcast(room, events);
    return events;
  }

  async submitCommand(
    gameId: string,
    playerId: PlayerId,
    command: ParsedCommand,
  ): Promise<GameEvent[]> {
    return this.runExclusive(gameId, (state) => {
      const result = executeCommand(state, this.deps, playerId, command);
      return result.events;
    });
  }

  async leaveRoom(gameId: string, playerId: PlayerId): Promise<void> {
    await this.runExclusive(gameId, (state) => {
      const ctx = new EngineContext(state, this.deps);
      removePlayer(ctx, playerId);
      return ctx.events;
    });
  }

  // ------------------------------------------------------------ connections

  attach(connection: Connection): void {
    const room = this.requireRoom(connection.gameId);
    room.connections.set(connection.id, connection);
    room.lastActivity = Date.now();
    void this.setConnected(connection.gameId, connection.playerId, true);
    connection.send({
      type: 'GAME_STATE_SNAPSHOT',
      state: projectStateForPlayer(room.state, connection.playerId),
    });
  }

  detach(connection: Connection): void {
    const room = this.rooms.get(connection.gameId);
    if (!room) return;
    room.connections.delete(connection.id);
    const stillHere = [...room.connections.values()].some(
      (c) => c.playerId === connection.playerId,
    );
    if (!stillHere) void this.setConnected(connection.gameId, connection.playerId, false);
  }

  /**
   * A disconnect never removes a player or their assets; it only flips a flag
   * so other clients can show the connection state.
   */
  private async setConnected(
    gameId: string,
    playerId: PlayerId,
    connected: boolean,
  ): Promise<void> {
    try {
      await this.runExclusive(gameId, (state) => {
        const player = state.players[playerId];
        if (!player || player.connected === connected) return [];
        player.connected = connected;
        const ctx = new EngineContext(state, this.deps);
        ctx.emit(connected ? 'PlayerReconnected' : 'PlayerDisconnected', { playerId });
        return ctx.events;
      });
    } catch (error) {
      this.logger.warn({ gameId, playerId, error: describeError(error) }, 'connection flag failed');
    }
  }

  sendSnapshot(connection: Connection): void {
    const room = this.requireRoom(connection.gameId);
    connection.send({
      type: 'GAME_STATE_SNAPSHOT',
      state: projectStateForPlayer(room.state, connection.playerId),
    });
  }

  private broadcast(room: Room, events: GameEvent[]): void {
    for (const connection of room.connections.values()) {
      const visible = filterEventsForPlayer(events, connection.playerId);
      if (visible.length > 0) connection.send({ type: 'EVENTS', events: visible });
      connection.send({
        type: 'GAME_STATE_SNAPSHOT',
        state: projectStateForPlayer(room.state, connection.playerId),
      });
    }
  }

  // ------------------------------------------------------------------- ticks

  /** Drives turn and auction timers for every loaded room. */
  async tickAll(): Promise<void> {
    for (const gameId of [...this.rooms.keys()]) {
      const room = this.rooms.get(gameId);
      if (!room) continue;
      if (room.state.phase === 'LOBBY' || room.state.phase === 'GAME_OVER') {
        this.evictIfIdle(gameId, room);
        continue;
      }
      try {
        await this.runExclusive(gameId, (state) => tick(state, this.deps));
      } catch (error) {
        this.logger.error({ gameId, error: describeError(error) }, 'tick failed');
      }
    }
  }

  private evictIfIdle(gameId: string, room: Room): void {
    if (room.connections.size > 0) return;
    if (Date.now() - room.lastActivity < 1000 * 60 * 30) return;
    this.rooms.delete(gameId);
    this.codeToGameId.delete(room.state.roomCode);
  }

  shutdown(): void {
    for (const room of this.rooms.values()) {
      for (const connection of room.connections.values()) connection.close();
    }
    this.rooms.clear();
  }
}

export function describeError(error: unknown): string {
  if (error instanceof RuleError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
