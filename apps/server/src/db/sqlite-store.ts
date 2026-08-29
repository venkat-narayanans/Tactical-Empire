import Database from 'better-sqlite3';
import type { Database as Db, Statement } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { GameEvent, GameState } from '@te/shared';
import type { GameStore, StoredSession } from './store.js';

/**
 * SQLite-backed implementation of the persistence port.
 *
 * better-sqlite3 is synchronous, so `db.transaction(...)` gives a genuine
 * all-or-nothing write: a command's new state and its events are stored
 * together or not at all. Version numbers are checked inside the transaction,
 * so two concurrent writers can never both commit against the same base state.
 */
export class SqliteGameStore implements GameStore {
  private readonly db: Db;
  private readonly statements: {
    insertGame: Statement;
    selectByCode: Statement;
    selectById: Statement;
    codeExists: Statement;
    updateGame: Statement;
    insertEvent: Statement;
    selectEvents: Statement;
    insertSession: Statement;
    selectSession: Statement;
    touchSession: Statement;
    activeGames: Statement;
    deleteGame: Statement;
    deleteEvents: Statement;
  };

  constructor(databaseUrl: string) {
    if (databaseUrl !== ':memory:') {
      fs.mkdirSync(path.dirname(databaseUrl), { recursive: true });
    }
    this.db = new Database(databaseUrl);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();

    this.statements = {
      insertGame: this.db.prepare(
        `INSERT INTO games (id, room_code, phase, version, state, created_at, updated_at)
         VALUES (@id, @room_code, @phase, @version, @state, @created_at, @updated_at)`,
      ),
      selectByCode: this.db.prepare('SELECT state FROM games WHERE room_code = ?'),
      selectById: this.db.prepare('SELECT state FROM games WHERE id = ?'),
      codeExists: this.db.prepare('SELECT 1 FROM games WHERE room_code = ?'),
      updateGame: this.db.prepare(
        `UPDATE games SET phase = @phase, version = @version, state = @state, updated_at = @updated_at
         WHERE id = @id AND version = @expected_version`,
      ),
      insertEvent: this.db.prepare(
        `INSERT OR IGNORE INTO events (game_id, sequence, event_id, type, audience, payload, at)
         VALUES (@game_id, @sequence, @event_id, @type, @audience, @payload, @at)`,
      ),
      selectEvents: this.db.prepare(
        'SELECT event_id, sequence, type, audience, payload, at FROM events WHERE game_id = ? AND sequence > ? ORDER BY sequence ASC',
      ),
      insertSession: this.db.prepare(
        `INSERT OR REPLACE INTO sessions (token, game_id, player_id, room_code, created_at, last_seen)
         VALUES (@token, @game_id, @player_id, @room_code, @created_at, @last_seen)`,
      ),
      selectSession: this.db.prepare(
        'SELECT token, game_id, player_id, room_code FROM sessions WHERE token = ?',
      ),
      touchSession: this.db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?'),
      activeGames: this.db.prepare("SELECT id FROM games WHERE phase <> 'GAME_OVER'"),
      deleteGame: this.db.prepare('DELETE FROM games WHERE id = ?'),
      deleteEvents: this.db.prepare('DELETE FROM events WHERE game_id = ?'),
    };
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL UNIQUE,
        phase TEXT NOT NULL,
        version INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_games_phase ON games(phase);

      CREATE TABLE IF NOT EXISTS events (
        game_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        type TEXT NOT NULL,
        audience TEXT,
        payload TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (game_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        room_code TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_game ON sessions(game_id);
    `);
  }

  createGame(state: GameState): void {
    const now = Date.now();
    this.statements.insertGame.run({
      id: state.id,
      room_code: state.roomCode,
      phase: state.phase,
      version: state.version,
      state: JSON.stringify(state),
      created_at: now,
      updated_at: now,
    });
  }

  loadGameByCode(roomCode: string): GameState | null {
    const row = this.statements.selectByCode.get(roomCode) as { state: string } | undefined;
    return row ? (JSON.parse(row.state) as GameState) : null;
  }

  loadGameById(gameId: string): GameState | null {
    const row = this.statements.selectById.get(gameId) as { state: string } | undefined;
    return row ? (JSON.parse(row.state) as GameState) : null;
  }

  roomCodeExists(roomCode: string): boolean {
    return this.statements.codeExists.get(roomCode) !== undefined;
  }

  commit(state: GameState, events: GameEvent[], expectedVersion: number): boolean {
    const transaction = this.db.transaction(() => {
      const result = this.statements.updateGame.run({
        id: state.id,
        phase: state.phase,
        version: state.version,
        state: JSON.stringify(state),
        updated_at: Date.now(),
        expected_version: expectedVersion,
      });
      if (result.changes === 0) return false;
      for (const event of events) this.insertEventRow(event);
      return true;
    });
    return transaction() as boolean;
  }

  appendEvents(gameId: string, events: GameEvent[]): void {
    const transaction = this.db.transaction(() => {
      for (const event of events) this.insertEventRow(event);
    });
    transaction();
    void gameId;
  }

  private insertEventRow(event: GameEvent): void {
    this.statements.insertEvent.run({
      game_id: event.gameId,
      sequence: event.sequence,
      event_id: event.eventId,
      type: event.type,
      audience: event.audience ? JSON.stringify(event.audience) : null,
      payload: JSON.stringify(event.payload),
      at: event.at,
    });
  }

  eventsSince(gameId: string, sequence: number): GameEvent[] {
    const rows = this.statements.selectEvents.all(gameId, sequence) as Array<{
      event_id: string;
      sequence: number;
      type: string;
      audience: string | null;
      payload: string;
      at: number;
    }>;
    return rows.map(
      (row) =>
        ({
          type: row.type,
          eventId: row.event_id,
          gameId,
          sequence: row.sequence,
          at: row.at,
          ...(row.audience ? { audience: JSON.parse(row.audience) as string[] } : {}),
          payload: JSON.parse(row.payload) as unknown,
        }) as GameEvent,
    );
  }

  createSession(session: StoredSession): void {
    const now = Date.now();
    this.statements.insertSession.run({
      token: session.token,
      game_id: session.gameId,
      player_id: session.playerId,
      room_code: session.roomCode,
      created_at: now,
      last_seen: now,
    });
  }

  loadSession(token: string): StoredSession | null {
    const row = this.statements.selectSession.get(token) as
      | { token: string; game_id: string; player_id: string; room_code: string }
      | undefined;
    if (!row) return null;
    return {
      token: row.token,
      gameId: row.game_id,
      playerId: row.player_id,
      roomCode: row.room_code,
    };
  }

  touchSession(token: string, at: number): void {
    this.statements.touchSession.run(at, token);
  }

  listActiveGameIds(): string[] {
    return (this.statements.activeGames.all() as Array<{ id: string }>).map((row) => row.id);
  }

  deleteGame(gameId: string): void {
    const transaction = this.db.transaction(() => {
      this.statements.deleteEvents.run(gameId);
      this.statements.deleteGame.run(gameId);
    });
    transaction();
  }

  close(): void {
    this.db.close();
  }
}
