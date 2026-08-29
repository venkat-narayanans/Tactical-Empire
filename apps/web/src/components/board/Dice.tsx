import type { DiceRoll } from '@te/shared';

/**
 * Dice display.
 *
 * This is presentation only. The pips shown are the authoritative result the
 * server sent; the roll animation is a CSS shake that runs while a DiceRolled
 * event is fresh and has no influence on the value.
 */

const PIP_LAYOUTS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 25],
    [72, 25],
    [28, 50],
    [72, 50],
    [28, 75],
    [72, 75],
  ],
};

interface DiceProps {
  readonly dice: DiceRoll | null;
  readonly rolling: boolean;
}

export function Dice({ dice, rolling }: DiceProps) {
  if (!dice) {
    return (
      <div className="dice dice--empty">
        <span className="tiny muted">Waiting for the roll</span>
      </div>
    );
  }

  return (
    <div className={`dice${rolling ? ' dice--rolling' : ''}`} aria-live="polite">
      <Die value={dice.die1} />
      <Die value={dice.die2} />
      <span className="dice__total">
        {dice.total}
        {dice.isDouble ? <span className="badge badge--accent">Double</span> : null}
      </span>
      <span className="visually-hidden">
        Rolled {dice.die1} and {dice.die2}, total {dice.total}
        {dice.isDouble ? ', a double' : ''}
      </span>
    </div>
  );
}

function Die({ value }: { readonly value: number }) {
  const pips = PIP_LAYOUTS[value] ?? PIP_LAYOUTS[1]!;
  return (
    <svg className="die" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="92" height="92" rx="18" className="die__body" />
      {pips.map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r="8.5" className="die__pip" />
      ))}
    </svg>
  );
}
