import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from '../../apps/server/src/index.js';
import { TestClient } from '../helpers/test-client.js';

/**
 * End-to-end multiplayer tests against the real server: real WebSocket frames,
 * real command validation, real SQLite persistence, real broadcast.
 */

let server: Awaited<ReturnType<typeof createServer>>;
let wsUrl: string;

beforeAll(async () => {
  server = await createServer({
    databaseUrl: ':memory:',
    serveWeb: false,
    logLevel: 'silent',
    tickIntervalMs: 250,
  });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const address = server.app.server.address() as AddressInfo;
  wsUrl = `ws://127.0.0.1:${address.port}/ws`;
});

afterAll(async () => {
  await server.close();
});

async function lobbyOfTwo() {
  const host = await TestClient.connect(wsUrl);
  await host.send('CREATE_ROOM', { playerName: 'Ana' });
  await host.waitFor((c) => c.session !== null && c.state !== null);
  const roomCode = host.session!.roomCode;

  const guest = await TestClient.connect(wsUrl);
  await guest.send('JOIN_ROOM', { roomCode, playerName: 'Ben' });
  await guest.waitFor((c) => c.session !== null && c.state !== null);
  await host.waitFor((c) => Object.keys(c.requireState().players).length === 2);

  return { host, guest, roomCode };
}

describe('rooms over the wire', () => {
  it('creates a room, joins it and synchronises both clients', async () => {
    const { host, guest, roomCode } = await lobbyOfTwo();
    expect(roomCode).toMatch(/^[A-Z0-9]{5}$/);
    expect(host.session?.isHost).toBe(true);
    expect(guest.session?.isHost).toBe(false);
    expect(Object.keys(host.requireState().players)).toHaveLength(2);
    expect(Object.keys(guest.requireState().players)).toHaveLength(2);
    host.close();
    guest.close();
  });

  it('reports a human-readable error for an unknown room', async () => {
    const client = await TestClient.connect(wsUrl);
    const error = await client.expectRejected('JOIN_ROOM', {
      roomCode: 'ZZZZZ',
      playerName: 'Nobody',
    });
    expect(error.code).toBe('ROOM_NOT_FOUND');
    expect(error.message).toBe('Room not found.');
    expect(JSON.stringify(error)).not.toMatch(/at .*\.ts:|node_modules|SQLITE/);
    client.close();
  });

  it('rejects commands from a socket that has not joined a room', async () => {
    const client = await TestClient.connect(wsUrl);
    const error = await client.expectRejected('ROLL_DICE');
    expect(error.code).toBe('UNAUTHENTICATED');
    client.close();
  });

  it('rejects an unknown command and a malformed frame', async () => {
    const client = await TestClient.connect(wsUrl);
    client.sendRaw({ kind: 'command', type: 'SET_MONEY', requestId: 'aaaaaaaa', payload: { amount: 1 } });
    await client.waitFor((c) => c.rejections.length === 1);
    expect(client.rejections[0]?.error.code).toBe('UNKNOWN_COMMAND');

    client.sendRaw({ nonsense: true });
    await client.waitFor((c) => c.rejections.length === 2);
    expect(client.rejections[1]?.error.code).toBe('INVALID_MESSAGE');
    client.close();
  });

  it('lets only the host start the game', async () => {
    const { host, guest } = await lobbyOfTwo();
    const error = await guest.expectRejected('START_GAME');
    expect(error.code).toBe('NOT_HOST');
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase !== 'LOBBY');
    expect(guest.requireState().phase).toBe('PLAYER_TURN');
    host.close();
    guest.close();
  });
});

describe('gameplay synchronisation', () => {
  it('broadcasts dice, movement and purchases to every client', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');

    const activeId = host.requireState().activePlayerId!;
    const active = host.session!.playerId === activeId ? host : guest;
    const other = active === host ? guest : host;

    await active.send('ROLL_DICE');
    await other.waitFor((c) => c.requireState().turn.dice !== null);

    const dice = other.requireState().turn.dice!;
    expect(dice.total).toBe(dice.die1 + dice.die2);
    expect(other.requireState().players[activeId]?.position).toBe(
      host.requireState().players[activeId]?.position,
    );
    expect(other.events.some((event) => event.type === 'DiceRolled')).toBe(true);

    const pending = active.requireState().turn.pendingPurchase;
    if (pending) {
      await active.send('BUY_PROPERTY', { propertyId: pending.propertyId });
      await other.waitFor(
        (c) => c.requireState().properties[pending.propertyId]?.owner === activeId,
      );
      expect(other.requireState().properties[pending.propertyId]?.owner).toBe(activeId);
    }

    host.close();
    guest.close();
  });

  it('never sends an opponent cash to the other client', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');

    const hostId = host.session!.playerId;
    const guestId = guest.session!.playerId;
    expect(host.requireState().players[hostId]?.cash).toBeGreaterThan(0);
    expect(host.requireState().players[guestId]?.cash).toBeNull();
    expect(guest.requireState().players[hostId]?.cash).toBeNull();
    host.close();
    guest.close();
  });

  it('rejects a roll from the player whose turn it is not', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');
    const activeId = host.requireState().activePlayerId!;
    const idle = host.session!.playerId === activeId ? guest : host;
    const error = await idle.expectRejected('ROLL_DICE');
    expect(error.code).toBe('NOT_YOUR_TURN');
    host.close();
    guest.close();
  });

  it('resolves a simultaneous purchase race with exactly one owner', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');

    const activeId = host.requireState().activePlayerId!;
    const active = host.session!.playerId === activeId ? host : guest;
    const other = active === host ? guest : host;

    await active.send('ROLL_DICE');
    await other.waitFor((c) => c.requireState().turn.hasRolled);
    const pending = active.requireState().turn.pendingPurchase;
    if (!pending) {
      host.close();
      guest.close();
      return;
    }

    // Both clients fire at the same property in the same tick.
    const results = await Promise.allSettled([
      active.send('BUY_PROPERTY', { propertyId: pending.propertyId }),
      other.send('BUY_PROPERTY', { propertyId: pending.propertyId }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(active.requireState().properties[pending.propertyId]?.owner).toBe(activeId);

    host.close();
    guest.close();
  });

  it('applies a duplicate requestId only once', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');

    const activeId = host.requireState().activePlayerId!;
    const active = host.session!.playerId === activeId ? host : guest;

    await active.send('ROLL_DICE', {}, 'duplicate-roll-request');
    const position = active.requireState().players[activeId]?.position;
    const version = active.requireState().version;
    await active.send('ROLL_DICE', {}, 'duplicate-roll-request');

    expect(active.requireState().players[activeId]?.position).toBe(position);
    expect(active.requireState().version).toBe(version);
    host.close();
    guest.close();
  });
});

describe('reconnection', () => {
  it('restores a player state from their session token', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');

    const activeId = host.requireState().activePlayerId!;
    const active = host.session!.playerId === activeId ? host : guest;
    await active.send('ROLL_DICE');
    await active.waitFor((c) => c.requireState().turn.hasRolled);

    const token = guest.session!.sessionToken;
    const roomCode = guest.session!.roomCode;
    const guestId = guest.session!.playerId;
    const cashBefore = guest.requireState().players[guestId]?.cash;
    guest.close();

    const reconnected = await TestClient.connect(wsUrl);
    await reconnected.send('REJOIN_ROOM', { roomCode, sessionToken: token });
    await reconnected.waitFor((c) => c.state !== null);

    expect(reconnected.session?.playerId).toBe(guestId);
    expect(reconnected.requireState().players[guestId]?.cash).toBe(cashBefore);
    expect(reconnected.requireState().turn.hasRolled).toBe(true);
    expect(reconnected.requireState().players[guestId]?.status).toBe('active');

    host.close();
    reconnected.close();
  });

  it('refuses a session token from another room', async () => {
    const first = await lobbyOfTwo();
    const second = await lobbyOfTwo();
    const client = await TestClient.connect(wsUrl);
    const error = await client.expectRejected('REJOIN_ROOM', {
      roomCode: second.roomCode,
      sessionToken: first.host.session!.sessionToken,
    });
    expect(error.code).toBe('UNAUTHENTICATED');
    client.close();
    first.host.close();
    first.guest.close();
    second.host.close();
    second.guest.close();
  });

  it('marks a player disconnected without removing them from the game', async () => {
    const { host, guest } = await lobbyOfTwo();
    await host.send('START_GAME');
    await guest.waitFor((c) => c.requireState().phase === 'PLAYER_TURN');
    const guestId = guest.session!.playerId;
    guest.close();

    await host.waitFor((c) => c.requireState().players[guestId]?.connected === false, 5000);
    expect(host.requireState().players[guestId]).toBeDefined();
    expect(host.requireState().players[guestId]?.status).toBe('active');
    host.close();
  });
});
