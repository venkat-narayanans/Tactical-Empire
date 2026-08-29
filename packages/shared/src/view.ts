import type {
  Alliance,
  AllianceRequest,
  ArmyUnit,
  AuctionState,
  DiceRoll,
  FinalScore,
  GamePhase,
  GameSettings,
  PendingDebt,
  PendingPurchase,
  PlayerColour,
  PlayerId,
  PlayerStats,
  PlayerStatus,
  PropertyId,
  PropertyState,
  ScoutReport,
  TerritoryId,
  TradeState,
  WarRecord,
} from './state.js';

/**
 * The projection of authoritative state that a single player is allowed to see.
 *
 * Cash and army are private: GAME_CONFIG's scouting block pays ₹100 to reveal
 * army composition, army power and a cash range, which only has meaning if
 * those values are hidden by default. Everything visible on the board
 * (ownership, development, positions) stays public.
 */

export interface ClientPlayerView {
  readonly id: PlayerId;
  readonly name: string;
  readonly colour: PlayerColour | null;
  readonly position: number;
  readonly status: PlayerStatus;
  readonly connected: boolean;
  readonly isHost: boolean;
  readonly inDetention: boolean;
  readonly propertyCount: number;
  readonly completedTerritories: TerritoryId[];
  readonly isSelf: boolean;
  /** Own cash only; null for opponents. */
  readonly cash: number | null;
  /** Own army only; null for opponents. */
  readonly army: ArmyUnit[] | null;
  /** Own derived army numbers only; null for opponents. */
  readonly armySummary: ArmySummary | null;
  readonly stats: PlayerStats | null;
  readonly freeScoutCharges: number | null;
  /** Public: the ally id if this player currently has an active alliance. */
  readonly allyId: PlayerId | null;
}

export interface ArmySummary {
  readonly totalUnits: number;
  readonly activeUnits: number;
  readonly lentUnits: number;
  readonly totalPower: number;
  readonly availablePower: number;
  readonly committedPower: number;
  /** Power lent to this player by allies, usable for defence and attack. */
  readonly borrowedPower: number;
  readonly capacity: number;
  readonly unitCounts: Record<string, number>;
}

export interface ClientTurnView {
  readonly hasRolled: boolean;
  readonly dice: DiceRoll | null;
  readonly pendingPurchase: PendingPurchase | null;
  readonly extraRollPending: boolean;
  readonly expiresAt: number;
  readonly warsDeclaredThisTurn: number;
}

export interface ClientGameState {
  readonly id: string;
  readonly roomCode: string;
  readonly phase: GamePhase;
  readonly round: number;
  readonly version: number;
  readonly sequence: number;
  readonly turnOrder: PlayerId[];
  readonly activePlayerId: PlayerId | null;
  readonly players: Record<PlayerId, ClientPlayerView>;
  readonly properties: Record<PropertyId, PropertyState>;
  readonly turn: ClientTurnView;
  readonly auction: AuctionState | null;
  readonly pendingDebt: PendingDebt | null;
  /** Only trades the viewer is party to. */
  readonly trades: TradeState[];
  /** Only alliance requests the viewer is party to. */
  readonly allianceRequests: AllianceRequest[];
  readonly alliances: Alliance[];
  readonly wars: WarRecord[];
  readonly pot: number;
  readonly settings: GameSettings;
  readonly winnerIds: PlayerId[] | null;
  readonly finalScores: FinalScore[] | null;
  /** Scout reports this viewer has paid for, most recent per target. */
  readonly scoutReports: ScoutReport[];
  readonly viewerId: PlayerId;
}
