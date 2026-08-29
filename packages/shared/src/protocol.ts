import { z } from 'zod';
import type { CommandError } from './errors.js';
import type { GameEvent } from './events.js';
import type { ClientGameState } from './view.js';
import type { PlayerId } from './state.js';

/** WebSocket protocol between the browser client and the authoritative server. */

export interface SessionInfo {
  readonly sessionToken: string;
  readonly playerId: PlayerId;
  readonly roomCode: string;
  readonly isHost: boolean;
}

export type ServerMessage =
  | { readonly type: 'SESSION'; readonly session: SessionInfo }
  | { readonly type: 'COMMAND_ACCEPTED'; readonly requestId: string }
  | { readonly type: 'COMMAND_REJECTED'; readonly requestId: string; readonly error: CommandError }
  | { readonly type: 'GAME_STATE_SNAPSHOT'; readonly state: ClientGameState }
  | { readonly type: 'EVENTS'; readonly events: GameEvent[] }
  | { readonly type: 'ROOM_CLOSED'; readonly reason: string }
  | { readonly type: 'PONG'; readonly at: number };

export const clientMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('command'),
    type: z.string().min(1).max(48),
    requestId: z.string().min(8).max(64),
    payload: z.unknown().optional(),
  }),
  z.object({ kind: z.literal('ping'), at: z.number() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const WS_PATH = '/ws';
