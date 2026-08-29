/**
 * All money in Tactical Empire is stored as whole integer rupees. These helpers
 * are the only place rounding happens, so a percentage in GAME_CONFIG.json can
 * never introduce a fractional balance.
 */

export function toMoney(value: number): number {
  return Math.round(value);
}

/** Percentage-of helper that always yields an integer (rounded down, bank-safe). */
export function percentOf(amount: number, percentage: number): number {
  return Math.floor(amount * percentage);
}

export function clampMoney(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

export function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
