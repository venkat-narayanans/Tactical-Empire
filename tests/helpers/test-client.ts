import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
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
 * A real WebSocket client for the integration tests.
 *
 * These tests drive the actual server the browser talks to: same protocol, same
 * validation, same persistence. Nothing here reaches into engine internals.
 */
export class TestClient {
  private socket!: WebSocket;
  session: SessionInfo | null = null;
  state: ClientGameState | null = null;
  readonly events: GameEvent[] = [];
  readonly rejections: Array<{ requestId: string; error: CommandError }> = [];
  private readonly pending = new Map<
    string,
    { resolve: () => void; reject: (error: CommandError) => void }
  >();
  private readonly watchers = new Set<() => void>();

  static async connect(url: string): Promise<TestClient> {
    const client = new TestClient();
    client.socket = new WebSocket(url);
    client.socket.on('message', (raw) => client.handle(JSON.parse(raw.toString()) as ServerMessage));
    await new Promise<void>((resolve, reject) => {
      client.socket.once('open', () => resolve());
      client.socket.once('error', reject);
    });
    return client;
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'SESSION':
        this.session = message.session;
        break;
      case 'GAME_STATE_SNAPSHOT':
        this.state = message.state;
        break;
      case 'EVENTS':
        this.events.push(...message.events);
        break;
      case 'COMMAND_ACCEPTED':
        this.pending.get(message.requestId)?.resolve();
        this.pending.delete(message.requestId);
        break;
      case 'COMMAND_REJECTED':
        this.rejections.push({ requestId: message.requestId, error: message.error });
        this.pending.get(message.requestId)?.reject(message.error);
        this.pending.delete(message.requestId);
        break;
      default:
        break;
    }
    for (const watcher of [...this.watchers]) watcher();
  }

  /** Sends a command and resolves when the server accepts it. */
  send<T extends CommandType>(
    type: T,
    payload: CommandPayload<T> = {} as CommandPayload<T>,
    requestId = randomUUID(),
  ): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ kind: 'command', type, requestId, payload }));
    return promise;
  }

  /** Sends a command expected to fail, and returns the structured error. */
  async expectRejected<T extends CommandType>(
    type: T,
    payload: CommandPayload<T> = {} as CommandPayload<T>,
  ): Promise<CommandError> {
    try {
      await this.send(type, payload);
    } catch (error) {
      return error as CommandError;
    }
    throw new Error(`Expected ${type} to be rejected, but it was accepted.`);
  }

  /** Sends a raw frame, bypassing the typed command surface. */
  sendRaw(frame: unknown): void {
    this.socket.send(JSON.stringify(frame));
  }

  waitFor(predicate: (client: TestClient) => boolean, timeoutMs = 5000): Promise<void> {
    if (predicate(this)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.watchers.delete(check);
        reject(new Error('waitFor timed out'));
      }, timeoutMs);
      const check = (): void => {
        if (!predicate(this)) return;
        clearTimeout(timer);
        this.watchers.delete(check);
        resolve();
      };
      this.watchers.add(check);
    });
  }

  requireState(): ClientGameState {
    if (!this.state) throw new Error('no snapshot received yet');
    return this.state;
  }

  close(): void {
    this.socket.close();
  }
}
