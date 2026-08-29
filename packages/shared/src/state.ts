/**
 * Authoritative game state model.
 *
 * Everything here is owned and mutated exclusively by the game engine. The
 * server persists it; the client renders a filtered projection of it.
 */

export type PlayerId = string;
export type PropertyId = string;
export type TerritoryId = string;
export type TradeId = string;
export type AllianceId = string;
export type WarId = string;
export type ArmyUnitId = string;
export type ActionId = string;

/** Player colours available in the lobby. */
export const PLAYER_COLOURS = [
  'crimson',
  'azure',
  'emerald',
  'amber',
  'violet',
  'coral',
  'teal',
  'slate',
] as const;

export type PlayerColour = (typeof PLAYER_COLOURS)[number];

/**
 * Top-level state machine. Trade, alliance and scouting are side interactions
 * that do not suspend the turn, so they are not phases; an auction and an
 * unpaid debt do suspend it, so they are.
 */
export type GamePhase =
  | 'LOBBY'
  | 'PLAYER_TURN'
  | 'ACTION'
  | 'AUCTION'
  | 'RESOLVING_DEBT'
  | 'GAME_OVER';

export type PlayerStatus = 'active' | 'bankrupt';

export type ArmyUnitState = 'active' | 'lent';

export interface ArmyUnit {
  readonly id: ArmyUnitId;
  /** Army unit type id from GAME_CONFIG.army.units. */
  readonly type: string;
  state: ArmyUnitState;
  /** Set while state === 'lent'. The ally this unit is committed to. */
  lentTo: PlayerId | null;
}

export interface PlayerStats {
  propertiesBought: number;
  rentCollected: number;
  rentPaid: number;
  warsWon: number;
  warsLost: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  name: string;
  colour: PlayerColour | null;
  cash: number;
  position: number;
  status: PlayerStatus;
  isHost: boolean;
  connected: boolean;
  /** True while held at IG Signal. */
  inDetention: boolean;
  /** Number of failed release attempts made from detention. */
  detentionAttempts: number;
  consecutiveDoubles: number;
  army: ArmyUnit[];
  /** Free scout uses granted by the Surprise deck. */
  freeScoutCharges: number;
  /** Round in which this player's last alliance ended, for cooldown. */
  allianceCooldownUntilRound: number;
  stats: PlayerStats;
}

export interface PropertyState {
  readonly id: PropertyId;
  owner: PlayerId | null;
  /** 0-4 houses, 5 = hotel. Always 0 for special properties. */
  level: number;
  mortgaged: boolean;
  /**
   * Round number (exclusive) until which this property is war-damaged.
   * 0 means undamaged.
   */
  warDamagedUntilRound: number;
}

export interface DeckState {
  /** Remaining card indices, in draw order. */
  order: number[];
}

export interface DiceRoll {
  readonly die1: number;
  readonly die2: number;
  readonly total: number;
  readonly isDouble: boolean;
}

export interface PendingPurchase {
  readonly propertyId: PropertyId;
  readonly price: number;
}

export type DebtReason = 'rent' | 'fee' | 'war_declaration' | 'auction' | 'build' | 'other';

export interface PendingDebt {
  readonly playerId: PlayerId;
  readonly amount: number;
  /** null means the debt is owed to the bank. */
  readonly creditorId: PlayerId | null;
  readonly reason: DebtReason;
}

export interface TurnState {
  /** Set once the active player has rolled and resolved landing. */
  hasRolled: boolean;
  dice: DiceRoll | null;
  /** Purchase decision awaiting BUY_PROPERTY / DECLINE_PROPERTY. */
  pendingPurchase: PendingPurchase | null;
  /** Wars declared by the active player during this turn. */
  warsDeclaredThisTurn: number;
  /** True when the player earned another roll from a double. */
  extraRollPending: boolean;
  startedAt: number;
  /** Epoch ms after which the server may auto-end this turn. */
  expiresAt: number;
}

export interface AuctionBid {
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly at: number;
}

export interface AuctionState {
  readonly id: string;
  readonly propertyId: PropertyId;
  /** Players still eligible to bid. */
  activeBidders: PlayerId[];
  highestBid: number;
  highestBidderId: PlayerId | null;
  bids: AuctionBid[];
  endsAt: number;
  /** Turn the auction interrupted, restored when the auction ends. */
  readonly returnPhase: GamePhase;
  /**
   * True when the auction was triggered by ending the turn (or turn expiry),
   * so the turn should hand over as soon as the auction settles.
   */
  readonly finishTurnOnEnd: boolean;
}

export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface TradeAssets {
  cash: number;
  properties: PropertyId[];
}

export interface TradeState {
  readonly id: TradeId;
  readonly fromPlayerId: PlayerId;
  readonly toPlayerId: PlayerId;
  readonly offered: TradeAssets;
  readonly requested: TradeAssets;
  status: TradeStatus;
  readonly createdAt: number;
}

export type AllianceRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface AllianceRequest {
  readonly id: string;
  readonly fromPlayerId: PlayerId;
  readonly toPlayerId: PlayerId;
  status: AllianceRequestStatus;
  readonly createdAt: number;
}

export interface Alliance {
  readonly id: AllianceId;
  readonly playerIds: readonly [PlayerId, PlayerId];
  readonly startedRound: number;
  /** Round number (exclusive) at which the alliance expires. */
  readonly expiresAfterRound: number;
  active: boolean;
}

export interface WarCasualties {
  readonly attackerUnitIds: ArmyUnitId[];
  readonly defenderUnitIds: ArmyUnitId[];
  readonly attackerPowerLost: number;
  readonly defenderPowerLost: number;
}

export type WarOutcome = 'attacker_victory' | 'defender_victory';

export interface WarRecord {
  readonly id: WarId;
  readonly attackerId: PlayerId;
  readonly defenderId: PlayerId;
  readonly territoryId: TerritoryId;
  readonly round: number;
  readonly declarationFee: number;
  readonly attackerBasePower: number;
  readonly defenderBasePower: number;
  readonly attackerSupportPower: number;
  readonly defenderSupportPower: number;
  readonly defenderDevelopmentPower: number;
  readonly defenderHomeBonus: number;
  readonly attackerFinalPower: number;
  readonly defenderFinalPower: number;
  readonly attackerFactor: number;
  readonly defenderFactor: number;
  readonly outcome: WarOutcome;
  readonly capturedPropertyIds: PropertyId[];
  readonly casualties: WarCasualties;
}

export interface ScoutRecord {
  readonly scoutId: PlayerId;
  readonly targetId: PlayerId;
  readonly round: number;
}

export interface CashRange {
  readonly min: number;
  readonly max: number;
}

export interface ScoutReport {
  readonly targetId: PlayerId;
  readonly round: number;
  readonly propertyCount: number;
  readonly completedTerritories: TerritoryId[];
  readonly armyUnitTypes: Record<string, number>;
  readonly armyPower: number;
  readonly allianceStatus: { allied: boolean; allyId: PlayerId | null };
  readonly cashRange: CashRange;
}

export interface GameSettings {
  maxPlayers: number;
  startingCash: number;
  turnDurationSeconds: number;
  maxRounds: number;
  auction: boolean;
  fullSetX2Rent: boolean;
  vacationCash: boolean;
  rentWhileInIgSignal: boolean;
  mortgage: boolean;
  evenBuild: boolean;
  randomizePlayerOrder: boolean;
  privateRoom: boolean;
}

export interface RngState {
  /** xorshift128+ style state, kept in the game state so replays are exact. */
  s0: number;
  s1: number;
}

export interface ProcessedAction {
  readonly sequenceStart: number;
  readonly sequenceEnd: number;
  readonly at: number;
}

export interface FinalScore {
  readonly playerId: PlayerId;
  readonly cash: number;
  readonly propertyValue: number;
  readonly buildingValue: number;
  readonly armyValue: number;
  readonly territoryBonus: number;
  readonly total: number;
  readonly completedTerritories: number;
  readonly armyPower: number;
}

export interface GameState {
  readonly id: string;
  readonly roomCode: string;
  phase: GamePhase;
  round: number;
  /** Monotonically increasing state version. */
  version: number;
  /** Monotonically increasing event sequence for this game. */
  sequence: number;
  turnOrder: PlayerId[];
  activePlayerIndex: number;
  players: Record<PlayerId, PlayerState>;
  properties: Record<PropertyId, PropertyState>;
  turn: TurnState;
  auction: AuctionState | null;
  /** Unpaid obligation blocking play until settled or resolved by bankruptcy. */
  pendingDebt: PendingDebt | null;
  /** Phase to restore once the pending debt clears. */
  debtReturnPhase: GamePhase | null;
  trades: Record<TradeId, TradeState>;
  allianceRequests: Record<string, AllianceRequest>;
  alliances: Record<AllianceId, Alliance>;
  wars: WarRecord[];
  /** Active war ids by participant, for the one-active-war-per-player rule. */
  activeWarIds: WarId[];
  scoutLog: ScoutRecord[];
  /** Latest scout report per (scout, target), so reconnects keep intel. */
  scoutReports: Record<PlayerId, Record<PlayerId, ScoutReport>>;
  /** Vacation pot fed by fees when the setting is on. */
  pot: number;
  decks: { treasure: DeckState; surprise: DeckState };
  settings: GameSettings;
  rng: RngState;
  processedActions: Record<ActionId, ProcessedAction>;
  winnerIds: PlayerId[] | null;
  finalScores: FinalScore[] | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}
