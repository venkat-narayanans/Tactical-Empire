import { CONFIG, PURCHASABLE_IDS, START_INDEX, assertConfigIntegrity } from '@te/config';
import type {
  GameSettings,
  GameState,
  PlayerColour,
  PlayerId,
  PlayerState,
  PropertyState,
  SettingsPatch,
} from '@te/shared';
import { PLAYER_COLOURS, ruleError } from '@te/shared';
import type { EngineContext, EngineDeps } from './context.js';
import { createRngState, shuffle } from './rng.js';

assertConfigIntegrity();

export function defaultSettings(): GameSettings {
  const hs = CONFIG.host_settings;
  return {
    maxPlayers: hs.maximum_players.default,
    startingCash: hs.starting_cash.default,
    turnDurationSeconds: hs.turn_duration_seconds.default,
    maxRounds: CONFIG.defaults.max_rounds,
    auction: hs.auction,
    fullSetX2Rent: hs.full_set_x2_rent,
    vacationCash: hs.vacation_cash,
    rentWhileInIgSignal: hs.rent_while_in_ig_signal,
    mortgage: hs.mortgage,
    evenBuild: hs.even_build,
    randomizePlayerOrder: hs.randomize_player_order,
    privateRoom: hs.private_room,
  };
}

function initialProperties(): Record<string, PropertyState> {
  const properties: Record<string, PropertyState> = {};
  for (const id of PURCHASABLE_IDS) {
    properties[id] = { id, owner: null, level: 0, mortgaged: false, warDamagedUntilRound: 0 };
  }
  return properties;
}

export interface CreateGameOptions {
  readonly gameId: string;
  readonly roomCode: string;
  readonly settings?: SettingsPatch;
  readonly now: number;
  readonly seed?: number;
}

export function createGame(options: CreateGameOptions): GameState {
  const rng = createRngState(options.seed);
  const settings = { ...defaultSettings(), ...(options.settings ?? {}) };
  return {
    id: options.gameId,
    roomCode: options.roomCode,
    phase: 'LOBBY',
    round: 0,
    version: 1,
    sequence: 0,
    turnOrder: [],
    activePlayerIndex: 0,
    players: {},
    properties: initialProperties(),
    turn: {
      hasRolled: false,
      dice: null,
      pendingPurchase: null,
      warsDeclaredThisTurn: 0,
      extraRollPending: false,
      startedAt: options.now,
      expiresAt: options.now,
    },
    auction: null,
    pendingDebt: null,
    debtReturnPhase: null,
    trades: {},
    allianceRequests: {},
    alliances: {},
    wars: [],
    activeWarIds: [],
    scoutLog: [],
    scoutReports: {},
    pot: 0,
    decks: {
      treasure: { order: shuffle(rng, CONFIG.event_decks.treasure.map((_, i) => i)) },
      surprise: { order: shuffle(rng, CONFIG.event_decks.surprise.map((_, i) => i)) },
    },
    settings,
    rng,
    processedActions: {},
    winnerIds: null,
    finalScores: null,
    createdAt: options.now,
    startedAt: null,
    finishedAt: null,
  };
}

export function createPlayer(
  id: PlayerId,
  name: string,
  isHost: boolean,
  startingCash: number,
): PlayerState {
  return {
    id,
    name,
    colour: null,
    cash: startingCash,
    position: START_INDEX,
    status: 'active',
    isHost,
    connected: true,
    inDetention: false,
    detentionAttempts: 0,
    consecutiveDoubles: 0,
    army: [],
    freeScoutCharges: 0,
    allianceCooldownUntilRound: 0,
    stats: { propertiesBought: 0, rentCollected: 0, rentPaid: 0, warsWon: 0, warsLost: 0 },
  };
}

export function firstAvailableColour(state: GameState): PlayerColour | null {
  const taken = new Set(
    Object.values(state.players)
      .map((p) => p.colour)
      .filter((c): c is PlayerColour => c !== null),
  );
  return PLAYER_COLOURS.find((colour) => !taken.has(colour)) ?? null;
}

export function addPlayer(
  ctx: EngineContext,
  playerId: PlayerId,
  name: string,
  isHost: boolean,
): PlayerState {
  const { state } = ctx;
  if (state.phase !== 'LOBBY') {
    throw ruleError('ROOM_NOT_JOINABLE', 'That game has already started.');
  }
  if (state.turnOrder.length >= state.settings.maxPlayers) {
    throw ruleError('ROOM_FULL', 'That room is full.');
  }
  const nameTaken = Object.values(state.players).some(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (nameTaken) throw ruleError('NAME_TAKEN', 'That name is already used in this room.');

  const player = createPlayer(playerId, name, isHost, state.settings.startingCash);
  player.colour = firstAvailableColour(state);
  state.players[playerId] = player;
  state.turnOrder.push(playerId);
  ctx.emit('PlayerJoined', { playerId, name, colour: player.colour });
  return player;
}

export function removePlayer(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = state.players[playerId];
  if (!player) return;
  if (state.phase !== 'LOBBY') {
    // Mid-game leaves are handled as disconnects; a player is never silently
    // deleted from a running game because their assets are still in play.
    player.connected = false;
    ctx.emit('PlayerDisconnected', { playerId });
    return;
  }
  delete state.players[playerId];
  state.turnOrder = state.turnOrder.filter((id) => id !== playerId);
  ctx.emit('PlayerLeft', { playerId, name: player.name });

  if (player.isHost) {
    const nextHostId = state.turnOrder[0];
    const nextHost = nextHostId ? state.players[nextHostId] : undefined;
    if (nextHost) nextHost.isHost = true;
  }
}

export function selectColour(ctx: EngineContext, playerId: PlayerId, colour: PlayerColour): void {
  const { state } = ctx;
  if (state.phase !== 'LOBBY') {
    throw ruleError('INVALID_PHASE', 'Colours can only be changed in the lobby.');
  }
  const taken = Object.values(state.players).some((p) => p.id !== playerId && p.colour === colour);
  if (taken) throw ruleError('COLOUR_TAKEN', 'That colour is already taken.');
  ctx.player(playerId).colour = colour;
  ctx.emit('PlayerColourChanged', { playerId, colour });
}

export function updateSettings(
  ctx: EngineContext,
  playerId: PlayerId,
  patch: SettingsPatch,
): void {
  const { state } = ctx;
  const player = ctx.player(playerId);
  if (!player.isHost) throw ruleError('NOT_HOST', 'Only the host can change settings.');
  if (state.phase !== 'LOBBY') {
    throw ruleError('SETTINGS_FROZEN', 'Settings are locked once the game starts.');
  }
  const next = { ...state.settings, ...patch };
  if (next.maxPlayers < state.turnOrder.length) {
    throw ruleError('INVALID_SETTINGS', 'Maximum players cannot be below the number of players in the room.');
  }
  state.settings = next;
  // Cash changes in the lobby apply to everyone, since nobody has played yet.
  for (const p of Object.values(state.players)) p.cash = next.startingCash;
  ctx.emit('SettingsChanged', { changedBy: playerId });
}

export function startGame(ctx: EngineContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = ctx.player(playerId);
  if (!player.isHost) throw ruleError('NOT_HOST', 'Only the host can start the game.');
  if (state.phase !== 'LOBBY') throw ruleError('INVALID_PHASE', 'The game has already started.');
  if (state.turnOrder.length < CONFIG.defaults.min_players) {
    throw ruleError(
      'NOT_ENOUGH_PLAYERS',
      `At least ${CONFIG.defaults.min_players} players are needed to start.`,
    );
  }
  const missingColour = Object.values(state.players).some((p) => p.colour === null);
  if (missingColour) {
    throw ruleError('INVALID_SETTINGS', 'Every player must choose a colour before starting.');
  }

  if (state.settings.randomizePlayerOrder) {
    state.turnOrder = shuffle(state.rng, [...state.turnOrder]);
  }
  state.activePlayerIndex = 0;
  state.round = 1;
  state.startedAt = ctx.now();
  for (const p of Object.values(state.players)) {
    p.cash = state.settings.startingCash;
    p.position = START_INDEX;
  }
  ctx.emit('GameStarted', { turnOrder: [...state.turnOrder] });
  ctx.emit('RoundAdvanced', { round: 1 });
  beginTurn(ctx);
}

/** Prepares turn state for the current active player and announces the turn. */
export function beginTurn(ctx: EngineContext): void {
  const { state } = ctx;
  const playerId = state.turnOrder[state.activePlayerIndex];
  if (!playerId) return;
  const now = ctx.now();
  state.turn = {
    hasRolled: false,
    dice: null,
    pendingPurchase: null,
    warsDeclaredThisTurn: 0,
    extraRollPending: false,
    startedAt: now,
    expiresAt: now + state.settings.turnDurationSeconds * 1000,
  };
  state.activeWarIds = [];
  ctx.setPhase('PLAYER_TURN');
  ctx.emit('TurnStarted', { playerId, round: state.round, expiresAt: state.turn.expiresAt });
}

export type { EngineDeps };
