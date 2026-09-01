import { create } from 'zustand';
import { propertyDisplayName } from '@te/config';
import type {
  ClientGameState,
  CommandError,
  CommandPayload,
  CommandType,
  GameEvent,
  PlayerId,
  SessionInfo,
} from '@te/shared';
import { GameConnection, type ConnectionStatus } from '../net/connection.js';

/**
 * Client state, split in two on purpose.
 *
 * `game` is the authoritative snapshot from the server and is only ever
 * replaced wholesale. Everything under "local UI state" is this browser's own
 * business - which panel is open, what is selected, animation progress - and
 * never influences a game outcome.
 */

export type Screen = 'menu' | 'create' | 'join' | 'howto' | 'lobby' | 'game' | 'over';

export type ContextPanel = 'auto' | 'trade' | 'army' | 'scout' | 'alliance' | 'war' | 'properties';

export interface Toast {
  readonly id: string;
  readonly kind: 'info' | 'success' | 'warning' | 'error';
  readonly message: string;
}

/** A token animation step queued from a PlayerMoved event. */
export interface MoveAnimation {
  readonly playerId: PlayerId;
  readonly from: number;
  readonly to: number;
  readonly steps: number;
}

interface GameStoreState {
  // ---- server state
  session: SessionInfo | null;
  game: ClientGameState | null;
  status: ConnectionStatus;
  lastError: string | null;

  // ---- local UI state
  screen: Screen;
  panel: ContextPanel;
  selectedPropertyId: string | null;
  selectedPlayerId: PlayerId | null;
  toasts: Toast[];
  /** Board index each token is drawn at, which trails the authoritative state. */
  tokenPositions: Record<PlayerId, number>;
  animating: boolean;
  diceRolling: boolean;
  recentEvents: GameEvent[];

  // ---- actions
  connect(): Promise<void>;
  /**
   * Sends a command and resolves with the server's rejection, or null when it
   * was accepted. It never rejects: a rejected command is normal gameplay (you
   * were too slow, someone outbid you) and is already surfaced as a toast, so
   * the fire-and-forget call sites must not produce unhandled rejections.
   */
  send<T extends CommandType>(
    type: T,
    payload?: CommandPayload<T>,
  ): Promise<CommandError | null>;
  setScreen(screen: Screen): void;
  setPanel(panel: ContextPanel): void;
  selectProperty(propertyId: string | null): void;
  selectPlayer(playerId: PlayerId | null): void;
  pushToast(kind: Toast['kind'], message: string): void;
  dismissToast(id: string): void;
  leave(): void;
}

const SESSION_STORAGE_KEY = 'tactical-empire.session';

function loadStoredSession(): { roomCode: string; sessionToken: string } | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { roomCode?: string; sessionToken?: string };
    if (!parsed.roomCode || !parsed.sessionToken) return null;
    return { roomCode: parsed.roomCode, sessionToken: parsed.sessionToken };
  } catch {
    return null;
  }
}

function storeSession(session: SessionInfo | null): void {
  try {
    if (!session) window.localStorage.removeItem(SESSION_STORAGE_KEY);
    else {
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ roomCode: session.roomCode, sessionToken: session.sessionToken }),
      );
    }
  } catch {
    // Storage can be unavailable (private mode); the session simply will not
    // survive a reload.
  }
}

let connection: GameConnection | null = null;

/** Normalises anything thrown on the way to the server into a CommandError. */
function toCommandError(rejection: unknown): CommandError {
  if (rejection && typeof rejection === 'object' && 'code' in rejection && 'message' in rejection) {
    return rejection as CommandError;
  }
  const message = rejection instanceof Error ? rejection.message : 'Something went wrong.';
  return { code: 'INTERNAL_ERROR', message };
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  session: null,
  game: null,
  status: 'idle',
  lastError: null,

  screen: 'menu',
  panel: 'auto',
  selectedPropertyId: null,
  selectedPlayerId: null,
  toasts: [],
  tokenPositions: {},
  animating: false,
  diceRolling: false,
  recentEvents: [],

  async connect() {
    if (!connection) {
      connection = new GameConnection({
        onStatus: (status) => set({ status }),
        onSession: (session) => {
          storeSession(session);
          set({ session });
        },
        onSnapshot: (game) => {
          const previous = get().game;
          set({ game });
          syncScreen(get, set, previous, game);
        },
        onEvents: (events) => handleEvents(get, set, events),
        onRejected: (_requestId, error) => {
          set({ lastError: error.message });
          get().pushToast('error', error.message);
        },
      });
      const stored = loadStoredSession();
      if (stored) connection.setResume(stored);
    }
    await connection.connect();
  },

  async send(type, payload) {
    try {
      if (!connection) await get().connect();
      await connection!.send(type, payload ?? ({} as never));
      return null;
    } catch (rejection) {
      return toCommandError(rejection);
    }
  },

  setScreen: (screen) => set({ screen }),
  setPanel: (panel) => set({ panel }),
  selectProperty: (selectedPropertyId) => set({ selectedPropertyId }),
  selectPlayer: (selectedPlayerId) => set({ selectedPlayerId }),

  pushToast: (kind, message) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind, message }] }));
    window.setTimeout(() => get().dismissToast(id), 5000);
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  leave: () => {
    storeSession(null);
    connection?.close();
    connection = null;
    for (const timer of moveTimers.values()) window.clearInterval(timer);
    moveTimers.clear();
    set({
      session: null,
      game: null,
      screen: 'menu',
      panel: 'auto',
      selectedPropertyId: null,
      selectedPlayerId: null,
      tokenPositions: {},
      recentEvents: [],
      status: 'idle',
      animating: false,
      diceRolling: false,
      lastError: null,
      toasts: [],
    });
  },
}));

type Getter = () => GameStoreState;
type Setter = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

/** Moves between lobby, board and game over as the authoritative phase moves. */
function syncScreen(
  get: Getter,
  set: Setter,
  previous: ClientGameState | null,
  next: ClientGameState,
): void {
  const screen = get().screen;
  if (next.phase === 'LOBBY') {
    if (screen !== 'lobby') set({ screen: 'lobby' });
  } else if (next.phase === 'GAME_OVER') {
    if (screen !== 'over') set({ screen: 'over' });
  } else if (screen !== 'game') {
    set({ screen: 'game' });
  }

  // Tokens start where the server says they are; movement events animate them.
  if (!previous) {
    const tokenPositions: Record<PlayerId, number> = {};
    for (const player of Object.values(next.players)) tokenPositions[player.id] = player.position;
    set({ tokenPositions });
  }
}

const NOTIFIED_EVENTS = new Set([
  'PropertyPurchased',
  'RentPaid',
  'PropertyDeveloped',
  'AuctionStarted',
  'AuctionEnded',
  'TradeExecuted',
  'TradeCreated',
  'AllianceRequested',
  'AllianceAccepted',
  'AllianceExpired',
  'ArmySupportCommitted',
  'WarDeclared',
  'WarResolved',
  'TerritoryCaptured',
  'PlayerBankrupt',
  'PlayerEliminated',
  'ScoutCompleted',
  'TreasureResolved',
  'SurpriseResolved',
  'PlayerDetained',
  'VictoryDeclared',
]);

const seenEventIds = new Set<string>();

/**
 * Turns events into animations and notifications. Events never mutate game
 * values here; the snapshot that accompanies them is the source of truth.
 * Duplicate deliveries are dropped by eventId.
 */
function handleEvents(get: Getter, set: Setter, events: GameEvent[]): void {
  const fresh = events.filter((event) => {
    if (seenEventIds.has(event.eventId)) return false;
    seenEventIds.add(event.eventId);
    return true;
  });
  if (fresh.length === 0) return;

  set((state) => ({ recentEvents: [...state.recentEvents, ...fresh].slice(-60) }));

  for (const event of fresh) {
    if (event.type === 'DiceRolled') {
      set({ diceRolling: true });
      window.setTimeout(() => set({ diceRolling: false }), 700);
    }
    if (event.type === 'PlayerMoved' || event.type === 'ForcedMovement') {
      queueTokenMove(get, set, event);
    }
    if (NOTIFIED_EVENTS.has(event.type)) {
      const message = describeEvent(get, event);
      if (message) get().pushToast(toastKind(event.type), message);
    }
  }
}

function toastKind(type: string): Toast['kind'] {
  if (type === 'PlayerBankrupt' || type === 'PlayerEliminated' || type === 'WarDeclared') {
    return 'warning';
  }
  if (type === 'VictoryDeclared' || type === 'TerritoryCaptured') return 'success';
  return 'info';
}

const STEP_INTERVAL_MS = 130;
/**
 * Hard ceiling on one token walk. Background tabs have their timers throttled,
 * so without a wall-clock deadline an animation could outlive the turn it
 * belongs to and leave `animating` - and with it the action buttons - stuck.
 */
const ANIMATION_GRACE_MS = 1500;

/** Running token walks, so a new move for a player replaces its predecessor. */
const moveTimers = new Map<PlayerId, number>();

function finishMove(set: Setter, playerId: PlayerId, position: number): void {
  const timer = moveTimers.get(playerId);
  if (timer !== undefined) window.clearInterval(timer);
  moveTimers.delete(playerId);
  set((state) => ({
    tokenPositions: { ...state.tokenPositions, [playerId]: position },
    animating: moveTimers.size > 0,
  }));
}

/**
 * Walks a token through the intermediate spaces. Purely visual: the store's
 * `tokenPositions` catches up to the authoritative position it was given, and
 * it always arrives - a landing can chain into a second move, and the walk is
 * abandoned for the final square rather than left half-finished.
 */
function queueTokenMove(get: Getter, set: Setter, event: GameEvent): void {
  const payload = event.payload as { playerId: PlayerId; from: number; to: number };
  const { playerId, from, to } = payload;
  void get;

  const forward = ((to - from) % 40 + 40) % 40;
  const stepCount = event.type === 'ForcedMovement' || forward > 12 ? 0 : forward;
  if (stepCount === 0) {
    finishMove(set, playerId, to);
    return;
  }

  // A chained move supersedes the one still running for this player.
  const previous = moveTimers.get(playerId);
  if (previous !== undefined) window.clearInterval(previous);

  let step = 0;
  const deadline = Date.now() + stepCount * STEP_INTERVAL_MS + ANIMATION_GRACE_MS;
  const timer = window.setInterval(() => {
    step += 1;
    if (step >= stepCount || Date.now() > deadline) {
      finishMove(set, playerId, to);
      return;
    }
    const position = (from + step) % 40;
    set((state) => ({ tokenPositions: { ...state.tokenPositions, [playerId]: position } }));
  }, STEP_INTERVAL_MS);

  moveTimers.set(playerId, timer);
  set({ animating: true });
}

function describeEvent(get: Getter, event: GameEvent): string | null {
  const game = get().game;
  const p = event.payload as Record<string, unknown>;
  const name = (key: string): string => {
    const id = p[key];
    return typeof id === 'string' ? (game?.players[id]?.name ?? 'A player') : 'A player';
  };
  const property = (key: string): string => {
    const id = p[key];
    return typeof id === 'string' ? propertyDisplayName(id) : 'a property';
  };
  const amount = (key: string): string => {
    const value = p[key];
    return typeof value === 'number' ? `₹${value.toLocaleString('en-IN')}` : '₹0';
  };
  const text = (key: string): string => String(p[key] ?? '');

  switch (event.type) {
    case 'PropertyPurchased':
      return `${name('playerId')} bought ${property('propertyId')}`;
    case 'RentPaid':
      return `${name('payerId')} paid ${amount('amount')} rent to ${name('ownerId')}`;
    case 'PropertyDeveloped':
      return `${name('playerId')} developed ${property('propertyId')}`;
    case 'AuctionStarted':
      return `Auction started for ${property('propertyId')}`;
    case 'AuctionEnded':
      return p['winnerId']
        ? `${name('winnerId')} won ${property('propertyId')} for ${amount('amount')}`
        : `${property('propertyId')} received no bids`;
    case 'TradeCreated':
      return `${name('fromPlayerId')} sent a trade offer`;
    case 'TradeExecuted':
      return 'Trade completed';
    case 'AllianceRequested':
      return `${name('fromPlayerId')} proposes an alliance`;
    case 'AllianceAccepted':
      return 'Alliance formed';
    case 'AllianceExpired':
      return 'Alliance ended';
    case 'ArmySupportCommitted':
      return `${name('fromPlayerId')} lent army to ${name('toPlayerId')}`;
    case 'WarDeclared':
      return `${name('attackerId')} declared war on ${name('defenderId')}`;
    case 'WarResolved':
      return p['outcome'] === 'attacker_victory'
        ? `${name('attackerId')} won the war`
        : `${name('defenderId')} held their territory`;
    case 'TerritoryCaptured':
      return `${name('toPlayerId')} captured ${text('territoryId')}`;
    case 'PlayerBankrupt':
      return `${name('playerId')} went bankrupt`;
    case 'PlayerEliminated':
      return `${name('playerId')} is out of the game`;
    case 'ScoutCompleted':
      return `Scout report on ${name('targetId')} received`;
    case 'TreasureResolved':
      return `Treasure: ${text('cardId').replace(/_/g, ' ')}`;
    case 'SurpriseResolved':
      return `Surprise: ${text('cardId').replace(/_/g, ' ')}`;
    case 'PlayerDetained':
      return `${name('playerId')} was sent to IG Signal`;
    case 'VictoryDeclared':
      return 'The game is over';
    default:
      return null;
  }
}
