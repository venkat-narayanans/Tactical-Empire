import { z } from 'zod';
import { CONFIG } from '@te/config';
import { PLAYER_COLOURS } from './state.js';

/**
 * The complete client -> server command surface.
 *
 * Note what is absent by design: there is no command that sets money, position,
 * ownership, dice, army power, war result or victory. Clients express intent
 * only; the engine decides every authoritative value.
 */

export const playerNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(16, 'Name must be at most 16 characters.')
  .regex(/^[\p{L}\p{N} _'-]+$/u, 'Name contains unsupported characters.');

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{5}$/, 'Room codes are 5 letters or digits.');

export const colourSchema = z.enum(PLAYER_COLOURS);

const hs = CONFIG.host_settings;

export const settingsPatchSchema = z
  .object({
    maxPlayers: z.number().int().min(hs.maximum_players.min).max(hs.maximum_players.max),
    startingCash: z.number().int().min(hs.starting_cash.min).max(hs.starting_cash.max),
    turnDurationSeconds: z
      .number()
      .int()
      .min(hs.turn_duration_seconds.min)
      .max(hs.turn_duration_seconds.max),
    maxRounds: z.number().int().min(1).max(CONFIG.defaults.max_rounds),
    auction: z.boolean(),
    fullSetX2Rent: z.boolean(),
    vacationCash: z.boolean(),
    rentWhileInIgSignal: z.boolean(),
    mortgage: z.boolean(),
    evenBuild: z.boolean(),
    randomizePlayerOrder: z.boolean(),
    privateRoom: z.boolean(),
  })
  .partial();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

const tradeAssetsSchema = z.object({
  cash: z.number().int().min(0).max(1_000_000),
  properties: z.array(z.string().min(1)).max(30),
});

/** Payload schema per command type. */
export const commandSchemas = {
  CREATE_ROOM: z.object({ playerName: playerNameSchema, settings: settingsPatchSchema.optional() }),
  JOIN_ROOM: z.object({ roomCode: roomCodeSchema, playerName: playerNameSchema }),
  REJOIN_ROOM: z.object({ roomCode: roomCodeSchema, sessionToken: z.string().min(8) }),
  LEAVE_ROOM: z.object({}),
  SELECT_COLOUR: z.object({ colour: colourSchema }),
  UPDATE_SETTINGS: z.object({ settings: settingsPatchSchema }),
  START_GAME: z.object({}),

  ROLL_DICE: z.object({}),
  END_TURN: z.object({}),
  PAY_RELEASE_FEE: z.object({}),

  BUY_PROPERTY: z.object({ propertyId: z.string().min(1) }),
  DECLINE_PROPERTY: z.object({ propertyId: z.string().min(1) }),
  BUILD: z.object({ propertyId: z.string().min(1) }),
  SELL_BUILDING: z.object({ propertyId: z.string().min(1) }),
  MORTGAGE_PROPERTY: z.object({ propertyId: z.string().min(1) }),
  UNMORTGAGE_PROPERTY: z.object({ propertyId: z.string().min(1) }),

  PLACE_BID: z.object({ auctionId: z.string().min(1), amount: z.number().int().positive() }),
  PASS_AUCTION: z.object({ auctionId: z.string().min(1) }),

  CREATE_TRADE: z.object({
    targetPlayerId: z.string().min(1),
    offered: tradeAssetsSchema,
    requested: tradeAssetsSchema,
  }),
  ACCEPT_TRADE: z.object({ tradeId: z.string().min(1) }),
  REJECT_TRADE: z.object({ tradeId: z.string().min(1) }),
  CANCEL_TRADE: z.object({ tradeId: z.string().min(1) }),

  BUY_ARMY: z.object({
    unitType: z.string().min(1),
    quantity: z.number().int().min(1).max(CONFIG.army.max_capacity),
  }),
  SELL_ARMY: z.object({
    unitType: z.string().min(1),
    quantity: z.number().int().min(1).max(CONFIG.army.max_capacity),
  }),
  LEND_ARMY: z.object({ targetPlayerId: z.string().min(1), power: z.number().int().positive() }),
  RECALL_ARMY: z.object({ targetPlayerId: z.string().min(1) }),

  SCOUT: z.object({ targetPlayerId: z.string().min(1) }),

  REQUEST_ALLIANCE: z.object({ targetPlayerId: z.string().min(1) }),
  ACCEPT_ALLIANCE: z.object({ requestId: z.string().min(1) }),
  DECLINE_ALLIANCE: z.object({ requestId: z.string().min(1) }),

  DECLARE_WAR: z.object({ targetPlayerId: z.string().min(1), territoryId: z.string().min(1) }),

  SETTLE_DEBT: z.object({}),
  DECLARE_BANKRUPTCY: z.object({}),
} as const;

export type CommandType = keyof typeof commandSchemas;

export const COMMAND_TYPES = Object.keys(commandSchemas) as CommandType[];

export type CommandPayload<T extends CommandType> = z.infer<(typeof commandSchemas)[T]>;

/** Wire envelope for a client command. */
export interface CommandEnvelope<T extends CommandType = CommandType> {
  readonly type: T;
  /** Client-generated uuid used for idempotency and rejection correlation. */
  readonly requestId: string;
  readonly payload: CommandPayload<T>;
}

export const commandEnvelopeSchema = z.object({
  type: z.string().min(1),
  requestId: z.string().min(8).max(64),
  payload: z.unknown().optional(),
});

/**
 * A validated command. Written as a distributive union so that narrowing on
 * `type` also narrows `payload` at the call site.
 */
export type ParsedCommand = {
  [K in CommandType]: {
    readonly type: K;
    readonly requestId: string;
    readonly payload: CommandPayload<K>;
  };
}[CommandType];

/**
 * Commands that mutate game state and therefore must be idempotent by
 * requestId. Read-only or lobby-shaping commands are excluded.
 */
export const MUTATING_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  'ROLL_DICE',
  'END_TURN',
  'PAY_RELEASE_FEE',
  'BUY_PROPERTY',
  'DECLINE_PROPERTY',
  'BUILD',
  'SELL_BUILDING',
  'MORTGAGE_PROPERTY',
  'UNMORTGAGE_PROPERTY',
  'PLACE_BID',
  'PASS_AUCTION',
  'CREATE_TRADE',
  'ACCEPT_TRADE',
  'REJECT_TRADE',
  'CANCEL_TRADE',
  'BUY_ARMY',
  'SELL_ARMY',
  'LEND_ARMY',
  'RECALL_ARMY',
  'SCOUT',
  'REQUEST_ALLIANCE',
  'ACCEPT_ALLIANCE',
  'DECLINE_ALLIANCE',
  'DECLARE_WAR',
  'SETTLE_DEBT',
  'DECLARE_BANKRUPTCY',
]);
