import type {
  AllianceId,
  ArmyUnitId,
  CashRange,
  DiceRoll,
  FinalScore,
  GamePhase,
  PlayerColour,
  PlayerId,
  PropertyId,
  ScoutReport,
  TerritoryId,
  TradeAssets,
  TradeId,
  WarId,
  WarOutcome,
} from './state.js';

/**
 * Events are immutable facts produced by the game engine. Commands request,
 * events confirm. Every event carries a per-game sequence number so clients can
 * detect gaps and drop duplicates.
 */

export interface GameEventEnvelope<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly eventId: string;
  readonly gameId: string;
  readonly sequence: number;
  readonly at: number;
  /**
   * When set, the event is private and is only delivered to these players.
   * Undefined means the event is public.
   */
  readonly audience?: readonly PlayerId[];
  readonly payload: TPayload;
}

type E<TType extends string, TPayload> = GameEventEnvelope<TType, TPayload>;

export type GameEvent =
  // Room
  | E<'RoomCreated', { roomCode: string; hostId: PlayerId }>
  | E<'PlayerJoined', { playerId: PlayerId; name: string; colour: PlayerColour | null }>
  | E<'PlayerLeft', { playerId: PlayerId; name: string }>
  | E<'PlayerColourChanged', { playerId: PlayerId; colour: PlayerColour }>
  | E<'SettingsChanged', { changedBy: PlayerId }>
  | E<'GameStarted', { turnOrder: PlayerId[] }>
  // Connection
  | E<'PlayerDisconnected', { playerId: PlayerId }>
  | E<'PlayerReconnected', { playerId: PlayerId }>
  // Turn
  | E<'TurnStarted', { playerId: PlayerId; round: number; expiresAt: number }>
  | E<'DiceRolled', { playerId: PlayerId; dice: DiceRoll }>
  | E<'PlayerMoved', { playerId: PlayerId; from: number; to: number; steps: number; passedStart: boolean }>
  | E<'TurnEnded', { playerId: PlayerId }>
  | E<'PhaseChanged', { phase: GamePhase }>
  // Landing
  | E<'LandingResolved', { playerId: PlayerId; spaceId: string; spaceIndex: number; outcome: string }>
  | E<'TreasureResolved', { playerId: PlayerId; cardId: string; effect: string }>
  | E<'SurpriseResolved', { playerId: PlayerId; cardId: string; effect: string }>
  | E<'FeePaid', { playerId: PlayerId; amount: number; feeId: string }>
  | E<'SpecialReward', { playerId: PlayerId; amount: number; source: string }>
  | E<'SpecialPenalty', { playerId: PlayerId; amount: number; source: string }>
  | E<'ForcedMovement', { playerId: PlayerId; from: number; to: number; reason: string }>
  | E<'StartBonusPaid', { playerId: PlayerId; amount: number }>
  | E<'PlayerDetained', { playerId: PlayerId; reason: string }>
  | E<'PlayerReleased', { playerId: PlayerId; method: 'doubles' | 'fee' | 'forced' }>
  // Property
  | E<'PropertyPurchased', { playerId: PlayerId; propertyId: PropertyId; price: number }>
  | E<'RentPaid', { payerId: PlayerId; ownerId: PlayerId; propertyId: PropertyId; amount: number }>
  | E<'PropertyDeveloped', { playerId: PlayerId; propertyId: PropertyId; level: number; cost: number }>
  | E<'BuildingSold', { playerId: PlayerId; propertyId: PropertyId; level: number; refund: number }>
  | E<'PropertyMortgaged', { playerId: PlayerId; propertyId: PropertyId; amount: number }>
  | E<'PropertyUnmortgaged', { playerId: PlayerId; propertyId: PropertyId; amount: number }>
  | E<'TerritoryCompleted', { playerId: PlayerId; territoryId: TerritoryId }>
  // Auction
  | E<'AuctionStarted', { auctionId: string; propertyId: PropertyId; endsAt: number }>
  | E<'BidPlaced', { auctionId: string; playerId: PlayerId; amount: number; endsAt: number }>
  | E<'AuctionPassed', { auctionId: string; playerId: PlayerId }>
  | E<'AuctionEnded', { auctionId: string; propertyId: PropertyId; winnerId: PlayerId | null; amount: number }>
  // Trade
  | E<'TradeCreated', { tradeId: TradeId; fromPlayerId: PlayerId; toPlayerId: PlayerId; offered: TradeAssets; requested: TradeAssets }>
  | E<'TradeAccepted', { tradeId: TradeId }>
  | E<'TradeRejected', { tradeId: TradeId }>
  | E<'TradeCancelled', { tradeId: TradeId }>
  | E<'TradeExecuted', { tradeId: TradeId; fromPlayerId: PlayerId; toPlayerId: PlayerId }>
  // Army
  | E<'ArmyUnitPurchased', { playerId: PlayerId; unitType: string; quantity: number; cost: number }>
  | E<'ArmyUnitSold', { playerId: PlayerId; unitIds: ArmyUnitId[]; refund: number }>
  | E<'ArmySupportCommitted', { fromPlayerId: PlayerId; toPlayerId: PlayerId; unitIds: ArmyUnitId[]; power: number }>
  | E<'ArmySupportReleased', { fromPlayerId: PlayerId; toPlayerId: PlayerId; unitIds: ArmyUnitId[] }>
  // Scouting
  | E<'ScoutStarted', { playerId: PlayerId; targetId: PlayerId; cost: number }>
  | E<'ScoutCompleted', { playerId: PlayerId; targetId: PlayerId; report: ScoutReport }>
  // Alliance
  | E<'AllianceRequested', { requestId: string; fromPlayerId: PlayerId; toPlayerId: PlayerId }>
  | E<'AllianceAccepted', { allianceId: AllianceId; playerIds: readonly PlayerId[]; expiresAfterRound: number }>
  | E<'AllianceDeclined', { requestId: string }>
  | E<'AllianceExpired', { allianceId: AllianceId; playerIds: readonly PlayerId[] }>
  // War
  | E<'WarDeclared', { warId: WarId; attackerId: PlayerId; defenderId: PlayerId; territoryId: TerritoryId; fee: number }>
  | E<'WarResolved', { warId: WarId; attackerId: PlayerId; defenderId: PlayerId; territoryId: TerritoryId; attackerPower: number; defenderPower: number; outcome: WarOutcome }>
  | E<'CasualtiesApplied', { warId: WarId; attackerUnitIds: ArmyUnitId[]; defenderUnitIds: ArmyUnitId[] }>
  | E<'TerritoryCaptured', { warId: WarId; territoryId: TerritoryId; fromPlayerId: PlayerId; toPlayerId: PlayerId; propertyIds: PropertyId[] }>
  // Player lifecycle
  | E<'DebtIncurred', { playerId: PlayerId; amount: number; creditorId: PlayerId | null; reason: string }>
  | E<'DebtSettled', { playerId: PlayerId; amount: number; creditorId: PlayerId | null }>
  | E<'PlayerBankrupt', { playerId: PlayerId; creditorId: PlayerId | null }>
  | E<'PlayerEliminated', { playerId: PlayerId }>
  | E<'RoundAdvanced', { round: number }>
  | E<'VictoryDeclared', { winnerIds: PlayerId[]; finalScores: FinalScore[]; reason: string }>;

export type GameEventType = GameEvent['type'];

/** Narrow an event to a specific type. */
export function isEvent<T extends GameEventType>(
  event: GameEvent,
  type: T,
): event is Extract<GameEvent, { type: T }> {
  return event.type === type;
}

export type { CashRange };
