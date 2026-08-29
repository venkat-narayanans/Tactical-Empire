import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { CommandError, ServerMessage, SessionInfo } from '@te/shared';
import { RuleError, WS_PATH, clientMessageSchema } from '@te/shared';
import type { Connection, Logger, RoomService } from '../rooms/room-service.js';
import { describeError } from '../rooms/room-service.js';
import { parseCommand } from './parse-command.js';

/**
 * WebSocket transport.
 *
 * A socket is anonymous until it sends CREATE_ROOM, JOIN_ROOM or REJOIN_ROOM.
 * Every later command is executed as the player bound to that socket, so a
 * client can never act on behalf of somebody else by naming them in a payload.
 */

const MAX_MESSAGE_BYTES = 64 * 1024;

interface SocketState {
  session: SessionInfo | null;
  gameId: string | null;
  connection: Connection | null;
}

export function attachWebSocketServer(
  httpServer: HttpServer,
  rooms: RoomService,
  logger: Logger,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: WS_PATH, maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (socket: WebSocket) => {
    const socketState: SocketState = { session: null, gameId: null, connection: null };

    const send = (message: ServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    const reject = (requestId: string, error: CommandError): void => {
      send({ type: 'COMMAND_REJECTED', requestId, error });
    };

    socket.on('message', (raw) => {
      void handleMessage(raw.toString());
    });

    socket.on('close', () => {
      if (socketState.connection) rooms.detach(socketState.connection);
    });

    socket.on('error', (error) => {
      logger.warn({ error: describeError(error) }, 'socket error');
    });

    async function handleMessage(text: string): Promise<void> {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        reject('unknown', { code: 'INVALID_MESSAGE', message: 'Malformed message.' });
        return;
      }

      const envelope = clientMessageSchema.safeParse(parsedJson);
      if (!envelope.success) {
        reject('unknown', { code: 'INVALID_MESSAGE', message: 'Malformed message.' });
        return;
      }
      if (envelope.data.kind === 'ping') {
        send({ type: 'PONG', at: Date.now() });
        return;
      }

      const { type, requestId, payload } = envelope.data;
      try {
        const command = parseCommand(type, requestId, payload);

        if (command.type === 'CREATE_ROOM') {
          const { playerName, settings } = command.payload;
          const created = rooms.createRoom(playerName, settings);
          bindSession(created.session);
          send({ type: 'COMMAND_ACCEPTED', requestId });
          return;
        }

        if (command.type === 'JOIN_ROOM') {
          const { roomCode, playerName } = command.payload;
          const session = await rooms.joinRoom(roomCode, playerName);
          bindSession(session);
          send({ type: 'COMMAND_ACCEPTED', requestId });
          return;
        }

        if (command.type === 'REJOIN_ROOM') {
          const { roomCode, sessionToken } = command.payload;
          const session = rooms.rejoinRoom(roomCode, sessionToken);
          bindSession(session);
          send({ type: 'COMMAND_ACCEPTED', requestId });
          return;
        }

        if (!socketState.session || !socketState.gameId) {
          reject(requestId, { code: 'UNAUTHENTICATED', message: 'Join a room first.' });
          return;
        }

        if (command.type === 'LEAVE_ROOM') {
          await rooms.leaveRoom(socketState.gameId, socketState.session.playerId);
          send({ type: 'COMMAND_ACCEPTED', requestId });
          if (socketState.connection) rooms.detach(socketState.connection);
          socketState.connection = null;
          socketState.session = null;
          socketState.gameId = null;
          return;
        }

        await rooms.submitCommand(socketState.gameId, socketState.session.playerId, command);
        send({ type: 'COMMAND_ACCEPTED', requestId });
      } catch (error) {
        if (error instanceof RuleError) {
          reject(requestId, error.toCommandError());
          return;
        }
        // Never leak internals: log the detail, return a generic message.
        logger.error({ error: describeError(error), type }, 'command failed');
        reject(requestId, {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong. Please try again.',
        });
      }
    }

    function bindSession(session: SessionInfo): void {
      if (socketState.connection) rooms.detach(socketState.connection);
      socketState.session = session;
      const state = rooms.getStateByCode(session.roomCode);
      socketState.gameId = state.id;
      send({ type: 'SESSION', session });

      const connection: Connection = {
        id: randomUUID(),
        playerId: session.playerId,
        gameId: state.id,
        send,
        close: () => socket.close(),
      };
      socketState.connection = connection;
      rooms.attach(connection);
    }
  });

  return wss;
}
