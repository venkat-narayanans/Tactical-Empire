import { useEffect, useState } from 'react';
import { ARMY_UNITS, CONFIG } from '@te/config';
import type { ClientGameState } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import { formatMoney, isMyTurn, self } from '../../../lib/view-helpers.js';

/**
 * Army.
 *
 * Total, available, committed and borrowed power are shown separately: a unit
 * lent to an ally leaves your available pool and cannot be spent twice.
 */
export function ArmyPanel({ game }: { readonly game: ClientGameState }) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const summary = me?.armySummary;
  const myTurn = isMyTurn(game);
  const ally = me?.allyId ? game.players[me.allyId] : null;

  const maxLend = Math.floor(
    (summary?.availablePower ?? 0) * CONFIG.alliances.army_lend_max_percentage_of_available_power,
  );
  const [lendPower, setLendPower] = useState(maxLend);

  // Recruiting or lending moves the cap, so an untouched field follows it
  // rather than staying on the value it had when the panel opened.
  useEffect(() => {
    setLendPower((current) => (current > maxLend || current === 0 ? maxLend : current));
  }, [maxLend]);

  if (!me || !summary) return null;

  const room = summary.capacity - summary.totalUnits;
  // Only units the player still holds can be sold; lent ones are locked away.
  const freeUnitCounts = (me.army ?? [])
    .filter((unit) => unit.state === 'active')
    .reduce<Record<string, number>>((counts, unit) => {
      counts[unit.type] = (counts[unit.type] ?? 0) + 1;
      return counts;
    }, {});

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Army</span>
          <span className="badge">
            {summary.totalUnits}/{summary.capacity} units
          </span>
        </div>
        <div className="panel__body stack">
          <dl className="stat-grid">
            <div>
              <dt>Total power</dt>
              <dd className="money money--lg">{summary.totalPower}</dd>
            </div>
            <div>
              <dt>Available</dt>
              <dd>{summary.availablePower}</dd>
            </div>
            <div>
              <dt>Committed</dt>
              <dd>{summary.committedPower}</dd>
            </div>
            <div>
              <dt>Borrowed</dt>
              <dd>{summary.borrowedPower}</dd>
            </div>
          </dl>
          <p className="tiny muted">
            Capacity grows by one unit for every two cities you own, up to{' '}
            {CONFIG.army.max_capacity}.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Recruit</span>
        </div>
        <div className="panel__body stack">
          {ARMY_UNITS.map((unit) => {
            const owned = summary.unitCounts[unit.id] ?? 0;
            const sellable = freeUnitCounts[unit.id] ?? 0;
            const affordable = (me.cash ?? 0) >= unit.cost;
            return (
              <div key={unit.id} className="row row--between unit-row">
                <span>
                  <strong>{unit.name}</strong>
                  <span className="tiny muted">
                    {' '}
                    {unit.power} power · {formatMoney(unit.cost)}
                  </span>
                  {owned > 0 ? <span className="badge">{owned}</span> : null}
                </span>
                <span className="row">
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={sellable === 0}
                    title={
                      sellable === 0 && owned > 0
                        ? 'Those units are lent to your ally.'
                        : undefined
                    }
                    onClick={() => void send('SELL_ARMY', { unitType: unit.id, quantity: 1 })}
                  >
                    Sell
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    disabled={!myTurn || !affordable || room <= 0}
                    onClick={() => void send('BUY_ARMY', { unitType: unit.id, quantity: 1 })}
                  >
                    Buy
                  </button>
                </span>
              </div>
            );
          })}
          {room <= 0 ? (
            <p className="tiny muted">You are at capacity. Own more cities to recruit further.</p>
          ) : null}
          {!myTurn ? <p className="tiny muted">Recruiting happens on your own turn.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Lend to ally</span>
        </div>
        <div className="panel__body stack">
          {!ally ? (
            <p className="tiny muted">You need an active alliance before you can lend army.</p>
          ) : (
            <>
              <p className="tiny">
                Recipient: <strong>{ally.name}</strong>
              </p>
              <div className="field">
                <label htmlFor="lend-power">
                  Support power (max {maxLend} ={' '}
                  {Math.round(
                    CONFIG.alliances.army_lend_max_percentage_of_available_power * 100,
                  )}
                  % of available)
                </label>
                <input
                  id="lend-power"
                  className="input"
                  type="number"
                  min={0}
                  max={maxLend}
                  step={5}
                  value={lendPower}
                  onChange={(event) => setLendPower(Number(event.target.value))}
                />
              </div>
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={maxLend <= 0 || lendPower <= 0}
                onClick={() =>
                  void send('LEND_ARMY', { targetPlayerId: ally.id, power: lendPower })
                }
              >
                Commit support
              </button>
              <p className="tiny muted">
                Committed units stay locked with your ally until the alliance ends, and are
                released automatically when it does.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
