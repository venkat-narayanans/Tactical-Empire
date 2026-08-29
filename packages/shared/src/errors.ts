/**
 * Structured, user-safe error codes. Every command rejection carries one of
 * these plus a human-readable message. Internal details (stack traces, file
 * paths, database errors) never reach the client.
 */
export const ERROR_CODES = [
  'INVALID_MESSAGE',
  'UNAUTHENTICATED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_NOT_JOINABLE',
  'NAME_TAKEN',
  'INVALID_NAME',
  'COLOUR_TAKEN',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'INVALID_SETTINGS',
  'SETTINGS_FROZEN',
  'NOT_YOUR_TURN',
  'INVALID_PHASE',
  'ALREADY_ROLLED',
  'INSUFFICIENT_FUNDS',
  'PROPERTY_UNAVAILABLE',
  'PROPERTY_NOT_OWNED',
  'INVALID_DEVELOPMENT',
  'INVALID_MORTGAGE',
  'AUCTION_NOT_ACTIVE',
  'INVALID_BID',
  'INVALID_TRADE',
  'TRADE_NOT_FOUND',
  'INVALID_ARMY',
  'ARMY_CAPACITY_EXCEEDED',
  'INVALID_ARMY_SUPPORT',
  'INVALID_SCOUT',
  'INVALID_ALLIANCE',
  'ALLIANCE_NOT_FOUND',
  'INVALID_WAR',
  'PLAYER_BANKRUPT',
  'PLAYER_NOT_FOUND',
  'GAME_FINISHED',
  'GAME_NOT_STARTED',
  'DEBT_OUTSTANDING',
  'UNKNOWN_COMMAND',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CommandError {
  readonly code: ErrorCode;
  readonly message: string;
}

/** Thrown by the engine when a command is not legal. Always client-safe. */
export class RuleError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }

  toCommandError(): CommandError {
    return { code: this.code, message: this.message };
  }
}

export function ruleError(code: ErrorCode, message: string): RuleError {
  return new RuleError(code, message);
}
