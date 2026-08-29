import type { RngState } from '@te/shared';

/**
 * Deterministic RNG whose state lives inside GameState.
 *
 * Every random draw the game makes - dice and war battle factors - goes through
 * here. That keeps randomness server-side and auditable, and lets tests seed a
 * game and replay it exactly. Math.random() is never called during play.
 */

export function createRngState(seed?: number): RngState {
  const base = seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  return { s0: base >>> 0, s1: (base ^ 0x9e3779b9) >>> 0 };
}

/** Advances the state and returns the next unsigned 32-bit value. */
export function nextUint32(rng: RngState): number {
  rng.s0 = (rng.s0 + 0x6d2b79f5) >>> 0;
  let t = rng.s0 ^ (rng.s1 + 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = (t ^ (t >>> 14)) >>> 0;
  rng.s1 = (rng.s1 ^ value) >>> 0;
  return value;
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / 0x100000000;
}

/** Uniform integer in [min, max], inclusive. */
export function nextInt(rng: RngState, min: number, max: number): number {
  if (max < min) throw new Error('nextInt: max < min');
  const span = max - min + 1;
  return min + (nextUint32(rng) % span);
}

/** Uniform float in [min, max). */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

/** In-place Fisher-Yates shuffle driven by the game RNG. */
export function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = nextInt(rng, 0, i);
    const a = items[i] as T;
    const b = items[j] as T;
    items[i] = b;
    items[j] = a;
  }
  return items;
}
