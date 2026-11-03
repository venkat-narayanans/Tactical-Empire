import type {
  ClientGameState,
  CommandError,
  CommandPayload,
  CommandType,
  GameEvent,
  ServerMessage,
  SessionInfo,
} from '@te/shared';

/**
 * WebSocket client.
 *
 * It sends intents and receives authoritative snapshots and events. It holds no
 * game rules: nothing here computes rent, dice, power or ownership. On drop it
 * reconnects and replays REJOIN_ROOM with the stored session token, which the
 * server answers with a fresh snapshot.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface ConnectionHandlers {
  onStatus(status: ConnectionStatus): void;
  onSession(session: SessionInfo): void;
  onSnapshot(state: ClientGameState): void;
  onEvents(events: GameEvent[]): void;
  onRejected(requestId: string, error: CommandError): void;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

function websocketUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    let url = envUrl.trim();
    if (url.startsWith('http://')) {
      url = 'ws://' + url.slice('http://'.length);
    } else if (url.startsWith('https://')) {
      url = 'wss://' + url.slice('https://'.length);
    }
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url = `${protocol}//${url}`;
    }
    if (!url.endsWith('/ws')) {
      url = url.replace(/\/+$/, '') + '/ws';
    }
    return url;
  }

  // Local development / localhost: connect to local server
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0')
  ) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  // Deployed production default (e.g. on Vercel): connect to the live Render backend
  return 'wss://tactical-empire.onrender.com/ws';
}

export class GameConnection {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private readonly pending = new Map<
    string,
    { resolve: () => void; reject: (error: CommandError) => void }
  >();
  /** Command replayed after a reconnect to restore the session. */
  private resume: { roomCode: string; sessionToken: string } | null = null;
  private closedByUs = false;

  constructor(private readonly handlers: ConnectionHandlers) {}

  connect(): Promise<void> {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return Promise.resolve();
    this.closedByUs = false;
    this.setStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(websocketUrl());
      this.socket = socket;

      socket.onopen = () => {
        this.reconnectAttempt = 0;
        this.setStatus('connected');
        if (this.resume) {
          void this.send('REJOIN_ROOM', { ...this.resume }).catch(() => {
            // The session expired; the UI falls back to the main menu.
            this.resume = null;
          });
        }
        resolve();
      };

      socket.onmessage = (event) => {
        this.handleMessage(JSON.parse(String(event.data)) as ServerMessage);
      };

      socket.onerror = () => {
        if (this.status === 'connecting') reject(new Error('Could not reach the server.'));
      };

      socket.onclose = () => {
        this.socket = null;
        for (const [, entry] of this.pending) {
          entry.reject({ code: 'INTERNAL_ERROR', message: 'Connection lost.' });
        }
        this.pending.clear();
        if (this.closedByUs) {
          this.setStatus('closed');
          return;
        }
        this.scheduleReconnect();
      };
    });
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 8000;
    this.reconnectAttempt += 1;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'SESSION':
        this.resume = {
          roomCode: message.session.roomCode,
          sessionToken: message.session.sessionToken,
        };
        this.handlers.onSession(message.session);
        break;
      case 'GAME_STATE_SNAPSHOT':
        this.handlers.onSnapshot(message.state);
        break;
      case 'EVENTS':
        this.handlers.onEvents(message.events);
        break;
      case 'COMMAND_ACCEPTED': {
        this.pending.get(message.requestId)?.resolve();
        this.pending.delete(message.requestId);
        break;
      }
      case 'COMMAND_REJECTED': {
        this.pending.get(message.requestId)?.reject(message.error);
        this.pending.delete(message.requestId);
        this.handlers.onRejected(message.requestId, message.error);
        break;
      }
      default:
        break;
    }
  }

  /** Sends a command; resolves on acceptance, rejects with a CommandError. */
  send<T extends CommandType>(
    type: T,
    payload: CommandPayload<T> = {} as CommandPayload<T>,
    requestId: string = crypto.randomUUID(),
  ): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject<void>({
        code: 'INTERNAL_ERROR',
        message: 'Not connected. Trying to reconnect.',
      } satisfies CommandError);
    }
    const promise = new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    socket.send(JSON.stringify({ kind: 'command', type, requestId, payload }));
    return promise;
  }

  /** Restores a session saved in this browser after a page reload. */
  setResume(resume: { roomCode: string; sessionToken: string } | null): void {
    this.resume = resume;
  }

  close(): void {
    this.closedByUs = true;
    this.resume = null;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.setStatus('closed');
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.handlers.onStatus(status);
  }
}
