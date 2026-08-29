import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CITIES,
  CONFIG,
  RENT_MULTIPLIERS,
  SPECIAL_PROPERTIES,
  TERRITORIES,
  assertConfigIntegrity,
} from '@te/config';
import { Harness } from '../helpers/engine-harness.js';

describe('board configuration', () => {
  it('passes its own integrity checks', () => {
    expect(() => assertConfigIntegrity()).not.toThrow();
  });

  it('has exactly 40 spaces with 4 corners and 22 cities', () => {
    expect(BOARD).toHaveLength(40);
    expect(BOARD.filter((s) => s.kind === 'corner')).toHaveLength(4);
    expect(BOARD.filter((s) => s.kind === 'city')).toHaveLength(22);
  });

  it('places corners at the four board corners', () => {
    expect(BOARD[0]?.id).toBe('start');
    expect(BOARD[10]?.id).toBe('ig_signal');
    expect(BOARD[20]?.id).toBe('vacation');
    expect(BOARD[30]?.id).toBe('go_to_ig_signal');
  });

  it('assigns every city to a territory that lists it back', () => {
    for (const city of CITIES) {
      const territory = TERRITORIES.find((t) => t.id === city.territoryId);
      expect(territory, `${city.id} territory`).toBeDefined();
      expect(territory?.cities).toContain(city.id);
    }
  });

  it('derives city rent from base rent and the configured multipliers', () => {
    for (const city of CITIES) {
      for (let level = 0; level <= 5; level += 1) {
        expect(city.rent[level]).toBe(city.baseRent * (RENT_MULTIPLIERS[level] as number));
      }
    }
  });

  it('places all 7 special properties on the board', () => {
    expect(SPECIAL_PROPERTIES).toHaveLength(7);
    for (const special of SPECIAL_PROPERTIES) {
      expect(BOARD[special.boardIndex]?.id).toBe(special.id);
    }
  });
});

describe('room lifecycle', () => {
  it('creates a lobby, assigns distinct colours and starts', () => {
    const h = new Harness();
    const [a, b] = h.start(['Ana', 'Ben']);
    expect(h.state.phase).toBe('PLAYER_TURN');
    expect(h.player(a as string).colour).not.toBe(h.player(b as string).colour);
    expect(h.state.round).toBe(1);
    expect(h.player(a as string).cash).toBe(CONFIG.defaults.starting_cash);
  });

  it('refuses to start with fewer than the minimum players', () => {
    const h = new Harness();
    const a = h.join('Ana');
    expect(h.expectRejected(a, 'START_GAME')).toBe('NOT_ENOUGH_PLAYERS');
  });

  it('only lets the host start or change settings', () => {
    const h = new Harness();
    const a = h.join('Ana');
    const b = h.join('Ben');
    expect(h.expectRejected(b, 'START_GAME')).toBe('NOT_HOST');
    expect(h.expectRejected(b, 'UPDATE_SETTINGS', { settings: { startingCash: 5000 } })).toBe(
      'NOT_HOST',
    );
    h.run(a, 'UPDATE_SETTINGS', { settings: { startingCash: 5000 } });
    expect(h.state.settings.startingCash).toBe(5000);
    expect(h.player(b).cash).toBe(5000);
  });

  it('rejects a duplicate colour and a duplicate name', () => {
    const h = new Harness();
    const a = h.join('Ana');
    const b = h.join('Ben');
    const colour = h.player(a).colour!;
    expect(h.expectRejected(b, 'SELECT_COLOUR', { colour })).toBe('COLOUR_TAKEN');
    expect(() => h.join('ana')).toThrowError(/already used/i);
  });

  it('freezes settings once the game has started', () => {
    const h = new Harness();
    const [a] = h.start(['Ana', 'Ben']);
    expect(h.expectRejected(a as string, 'UPDATE_SETTINGS', { settings: { startingCash: 9000 } })).toBe(
      'SETTINGS_FROZEN',
    );
  });

  it('rejects joining a room that is full', () => {
    const h = new Harness();
    h.run('p-ana', 'JOIN_ROOM', { roomCode: 'TEST1', playerName: 'Ana' });
    h.run('p-ana', 'UPDATE_SETTINGS', { settings: { maxPlayers: 2 } });
    h.join('Ben');
    expect(() => h.join('Cat')).toThrowError(/full/i);
  });
});
