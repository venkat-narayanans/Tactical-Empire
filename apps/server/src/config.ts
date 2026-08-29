import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Reads `--port <n>` / `--port=<n>` from argv.
 *
 * The dev script passes the port explicitly so the API server can never end up
 * on the same port as the Vite dev server when a launcher exports its own PORT.
 */
function portFromArgv(): number | null {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith('--port=')) {
      const value = Number.parseInt(arg.slice('--port='.length), 10);
      if (Number.isFinite(value)) return value;
    }
    if (arg === '--port') {
      const value = Number.parseInt(argv[i + 1] ?? '', 10);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

export const serverConfig = {
  port: portFromArgv() ?? intFromEnv('SERVER_PORT', intFromEnv('PORT', 3001)),
  host: process.env['HOST'] ?? '0.0.0.0',
  /** SQLite file. ':memory:' is used by the integration tests. */
  databaseUrl: process.env['DATABASE_URL'] ?? path.join(repoRoot, 'data', 'tactical-empire.db'),
  /** Directory of the built web client, served in production. */
  webRoot: process.env['WEB_ROOT'] ?? path.join(repoRoot, 'apps', 'web', 'dist'),
  /** Engine tick interval for turn and auction timers. */
  tickIntervalMs: intFromEnv('TICK_INTERVAL_MS', 1000),
  /** How long a finished or abandoned room stays loaded. */
  roomIdleTimeoutMs: intFromEnv('ROOM_IDLE_TIMEOUT_MS', 1000 * 60 * 60 * 6),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  serveWeb: process.env['SERVE_WEB'] !== 'false',
} as const;

export type ServerConfig = typeof serverConfig;
