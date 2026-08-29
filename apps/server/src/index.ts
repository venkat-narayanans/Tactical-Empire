import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { assertConfigIntegrity } from '@te/config';
import { serverConfig } from './config.js';
import { SqliteGameStore } from './db/sqlite-store.js';
import { RoomService } from './rooms/room-service.js';
import { attachWebSocketServer } from './net/ws-server.js';

/**
 * Server bootstrap: Fastify for HTTP and static hosting, a raw WebSocket server
 * for gameplay, SQLite for persistence, and a timer that drives turn and
 * auction expiry.
 */
export async function createServer(overrides: Partial<typeof serverConfig> = {}) {
  const config = { ...serverConfig, ...overrides };

  // Fail fast if GAME_CONFIG.json is inconsistent, before any room exists.
  assertConfigIntegrity();

  const app = Fastify({ logger: { level: config.logLevel } });
  const store = new SqliteGameStore(config.databaseUrl);
  const rooms = new RoomService(store, app.log);

  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const code = request.params.code.toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code) || !rooms.roomExists(code)) {
      return reply.code(404).send({ error: { code: 'ROOM_NOT_FOUND', message: 'Room not found.' } });
    }
    return { roomCode: code };
  });

  if (config.serveWeb && fs.existsSync(config.webRoot)) {
    await app.register(fastifyStatic, { root: config.webRoot });
    // Single-page app: unknown non-API routes fall through to index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      }
      return reply.sendFile('index.html');
    });
  }

  await app.ready();
  const wss = attachWebSocketServer(app.server, rooms, app.log);

  const ticker = setInterval(() => {
    void rooms.tickAll();
  }, config.tickIntervalMs);

  async function close(): Promise<void> {
    clearInterval(ticker);
    rooms.shutdown();
    wss.close();
    await app.close();
    store.close();
  }

  return { app, rooms, store, config, close };
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isEntrypoint) {
  const server = await createServer();
  await server.app.listen({ port: server.config.port, host: server.config.host });
  server.app.log.info(
    { port: server.config.port },
    'Tactical Empire server listening',
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }
}
