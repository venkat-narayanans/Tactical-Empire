import type {
  CommandPayload,
  CommandType,
  GameEvent,
  GameState,
  PlayerId,
  SettingsPatch,
} from '@te/shared';
import { RuleError } from '@te/shared';
import {
  createGame,
  executeCommand,
  tick,
  type EngineDeps,
} from '@te/game-engine';

/**
 * Deterministic in-memory driver for the game engine.
 *
 * Ids and time are supplied by the harness, and the RNG is seeded, so an
 * identical sequence of commands always produces identical state. That is what
 * lets the war and dice tests assert exact numbers.
 */
export class Harness {
  state: GameState;
  readonly events: GameEvent[] = [];
  private idCounter = 0;
  private clock: number;
  readonly deps: EngineDeps;

  constructor(options: { seed?: number; settings?: SettingsPatch; now?: number } = {}) {
    this.clock = options.now ?? 1_700_000_000_000;
    this.deps = {
      now: () => this.clock,
      newId: () => `id-${++this.idCounter}`,
    };
    this.state = createGame({
      gameId: 'game-test',
      roomCode: 'TEST1',
      now: this.clock,
      seed: options.seed ?? 12345,
      ...(options.settings ? { settings: options.settings } : {}),
    });
  }

  advanceClock(ms: number): void {
    this.clock += ms;
  }

  now(): number {
    return this.clock;
  }

  /** Runs a command; throws RuleError exactly as the server would. */
  run<T extends CommandType>(
    playerId: PlayerId,
    type: T,
    payload: CommandPayload<T> = {} as CommandPayload<T>,
    requestId?: string,
  ): GameEvent[] {
    const result = executeCommand(this.state, this.deps, playerId, {
      type,
      requestId: requestId ?? `req-${++this.idCounter}`,
      payload,
    });
    this.events.push(...result.events);
    return result.events;
  }

  /** Runs a command and returns the RuleError code instead of throwing. */
  expectRejected<T extends CommandType>(
    playerId: PlayerId,
    type: T,
    payload: CommandPayload<T> = {} as CommandPayload<T>,
  ): string {
    try {
      this.run(playerId, type, payload);
    } catch (error) {
      if (error instanceof RuleError) return error.code;
      throw error;
    }
    throw new Error(`Expected ${type} to be rejected, but it succeeded.`);
  }

  tick(): GameEvent[] {
    const events = tick(this.state, this.deps);
    this.events.push(...events);
    return events;
  }

  join(name: string): PlayerId {
    const playerId = `p-${name.toLowerCase()}`;
    this.run(playerId, 'JOIN_ROOM', { roomCode: 'TEST1', playerName: name });
    return playerId;
  }

  /** Creates a lobby of `names`, assigns colours and starts the game. */
  start(names: string[], settings?: SettingsPatch): PlayerId[] {
    const ids = names.map((name) => this.join(name));
    const host = ids[0] as PlayerId;
    if (settings) this.run(host, 'UPDATE_SETTINGS', { settings });
    this.run(host, 'START_GAME');
    return ids;
  }

  player(playerId: PlayerId) {
    const player = this.state.players[playerId];
    if (!player) throw new Error(`No such player ${playerId}`);
    return player;
  }

  property(propertyId: string) {
    const property = this.state.properties[propertyId];
    if (!property) throw new Error(`No such property ${propertyId}`);
    return property;
  }

  activeId(): PlayerId {
    const id = this.state.turnOrder[this.state.activePlayerIndex];
    if (!id) throw new Error('No active player');
    return id;
  }

  eventsOfType(type: string): GameEvent[] {
    return this.events.filter((event) => event.type === type);
  }

  lastEvent(type: string): GameEvent | undefined {
    return [...this.events].reverse().find((event) => event.type === type);
  }

  /** Places a player directly on a board index by rigging position, for tests. */
  placeAt(playerId: PlayerId, index: number): void {
    this.player(playerId).position = index;
  }

  /** Grants a property to a player without going through purchase. */
  giveProperty(playerId: PlayerId, propertyId: string, level = 0): void {
    const property = this.property(propertyId);
    property.owner = playerId;
    property.level = level;
  }

  giveArmy(playerId: PlayerId, unitType: string, quantity: number): void {
    const player = this.player(playerId);
    for (let i = 0; i < quantity; i += 1) {
      player.army.push({
        id: `unit-${++this.idCounter}`,
        type: unitType,
        state: 'active',
        lentTo: null,
      });
    }
  }
}

/** Rolls until the active player's turn ends, to move play along in tests. */
export function endTurnCleanly(harness: Harness, playerId: PlayerId): void {
  if (!harness.state.turn.hasRolled) harness.run(playerId, 'ROLL_DICE');
  if (harness.state.turn.pendingPurchase) {
    harness.run(playerId, 'DECLINE_PROPERTY', {
      propertyId: harness.state.turn.pendingPurchase.propertyId,
    });
  }
  while (harness.state.phase === 'AUCTION' && harness.state.auction) {
    const auctionId = harness.state.auction.id;
    for (const bidder of [...harness.state.auction.activeBidders]) {
      if (harness.state.auction?.id !== auctionId) break;
      harness.run(bidder, 'PASS_AUCTION', { auctionId });
    }
  }
  if (harness.activeId() === playerId && harness.state.phase !== 'GAME_OVER') {
    harness.run(playerId, 'END_TURN');
  }
}

/**
 * Builds a harness whose active player will land exactly on `targetIndex` with
 * their first roll.
 *
 * The RNG is seeded and lives in the game state, so a probe run reveals the
 * roll a seed will produce; a fresh harness with the same seed then starts the
 * player the right distance away. This keeps landing tests exact instead of
 * probabilistic.
 */
export function harnessLandingOn(
  targetIndex: number,
  options: { names?: string[]; settings?: SettingsPatch; wrapPastStart?: boolean } = {},
): { h: Harness; activeId: PlayerId; total: number; from: number; passedStart: boolean } {
  const names = options.names ?? ['Ana', 'Ben'];
  // Prefer a start square that does not wrap past START, so the start bonus
  // does not muddy cash assertions; fall back to wrapping when the target is
  // too close to START to reach any other way.
  const preferences =
    options.wrapPastStart === undefined ? [false, true] : [options.wrapPastStart];

  for (const wantWrap of preferences) {
    for (let seed = 1; seed < 800; seed += 1) {
      const settings = options.settings;
      const probe = new Harness({ seed, ...(settings ? { settings } : {}) });
      probe.start(names, settings);
      probe.run(probe.activeId(), 'ROLL_DICE');
      const total = probe.state.turn.dice?.total;
      if (!total) continue;

      const from = ((targetIndex - total) % 40 + 40) % 40;
      if (from === 0 || from === targetIndex) continue;
      const passedStart = from + total >= 40;
      if (passedStart !== wantWrap) continue;

      const h = new Harness({ seed, ...(settings ? { settings } : {}) });
      h.start(names, settings);
      const activeId = h.activeId();
      h.placeAt(activeId, from);
      return { h, activeId, total, from, passedStart };
    }
  }
  throw new Error(`no seed lands a player on board index ${targetIndex}`);
}
