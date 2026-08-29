import { useMemo, useState } from 'react';
import type { ClientGameState, PlayerId } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import {
  displayName,
  formatMoney,
  opponents,
  propertiesOf,
  self,
} from '../../../lib/view-helpers.js';

/**
 * Trading.
 *
 * The two sides are laid out symmetrically and labelled "You give" / "You get",
 * so what is being handed over is never ambiguous. The server revalidates both
 * sides at acceptance.
 */
export function TradePanel({ game }: { readonly game: ClientGameState }) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const others = opponents(game).filter((player) => player.status === 'active');

  const [targetId, setTargetId] = useState<PlayerId | ''>(others[0]?.id ?? '');
  const [offerCash, setOfferCash] = useState(0);
  const [requestCash, setRequestCash] = useState(0);
  const [offerProperties, setOfferProperties] = useState<string[]>([]);
  const [requestProperties, setRequestProperties] = useState<string[]>([]);

  const myTradable = useMemo(
    () => propertiesOf(game, game.viewerId).filter((property) => property.level === 0),
    [game],
  );
  const theirTradable = useMemo(
    () => (targetId ? propertiesOf(game, targetId).filter((property) => property.level === 0) : []),
    [game, targetId],
  );

  const incoming = game.trades.filter((trade) => trade.toPlayerId === game.viewerId);
  const outgoing = game.trades.filter((trade) => trade.fromPlayerId === game.viewerId);

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    propertyId: string,
  ): void => {
    setList(
      list.includes(propertyId) ? list.filter((id) => id !== propertyId) : [...list, propertyId],
    );
  };

  const empty =
    offerCash === 0 &&
    requestCash === 0 &&
    offerProperties.length === 0 &&
    requestProperties.length === 0;

  async function submit(): Promise<void> {
    if (!targetId) return;
    await send('CREATE_TRADE', {
      targetPlayerId: targetId,
      offered: { cash: offerCash, properties: offerProperties },
      requested: { cash: requestCash, properties: requestProperties },
    });
    setOfferCash(0);
    setRequestCash(0);
    setOfferProperties([]);
    setRequestProperties([]);
  }

  return (
    <div className="stack">
      {incoming.length > 0 ? (
        <section className="panel panel--focus">
          <div className="panel__header">
            <span className="panel__title">Offers for you</span>
          </div>
          <div className="panel__body stack">
            {incoming.map((trade) => (
              <div key={trade.id} className="trade-card">
                <p className="tiny">
                  <strong>{game.players[trade.fromPlayerId]?.name}</strong> offers
                </p>
                <div className="trade-card__sides">
                  <div>
                    <span className="panel__title">You get</span>
                    <ul className="tiny">
                      {trade.offered.cash > 0 ? <li>{formatMoney(trade.offered.cash)}</li> : null}
                      {trade.offered.properties.map((id) => (
                        <li key={id}>{displayName(id)}</li>
                      ))}
                      {trade.offered.cash === 0 && trade.offered.properties.length === 0 ? (
                        <li className="muted">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <span className="panel__title">You give</span>
                    <ul className="tiny">
                      {trade.requested.cash > 0 ? <li>{formatMoney(trade.requested.cash)}</li> : null}
                      {trade.requested.properties.map((id) => (
                        <li key={id}>{displayName(id)}</li>
                      ))}
                      {trade.requested.cash === 0 && trade.requested.properties.length === 0 ? (
                        <li className="muted">Nothing</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void send('ACCEPT_TRADE', { tradeId: trade.id })}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void send('REJECT_TRADE', { tradeId: trade.id })}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">New offer</span>
        </div>
        <div className="panel__body stack">
          {others.length === 0 ? (
            <p className="tiny muted">There is nobody left to trade with.</p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="trade-target">Trade with</label>
                <select
                  id="trade-target"
                  className="select"
                  value={targetId}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    setRequestProperties([]);
                  }}
                >
                  {others.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="trade-columns">
                <div className="stack">
                  <span className="panel__title">You give</span>
                  <div className="field">
                    <label htmlFor="trade-give-cash">Cash</label>
                    <input
                      id="trade-give-cash"
                      className="input"
                      type="number"
                      min={0}
                      max={me?.cash ?? 0}
                      step={10}
                      value={offerCash}
                      onChange={(event) => setOfferCash(Math.max(0, Number(event.target.value)))}
                    />
                  </div>
                  <ul className="chip-list">
                    {myTradable.map((property) => (
                      <li key={property.id}>
                        <button
                          type="button"
                          className={`chip${offerProperties.includes(property.id) ? ' chip--on' : ''}`}
                          aria-pressed={offerProperties.includes(property.id)}
                          onClick={() => toggle(offerProperties, setOfferProperties, property.id)}
                        >
                          {displayName(property.id)}
                        </button>
                      </li>
                    ))}
                    {myTradable.length === 0 ? (
                      <li className="tiny muted">No tradable property.</li>
                    ) : null}
                  </ul>
                </div>

                <div className="stack">
                  <span className="panel__title">You get</span>
                  <div className="field">
                    <label htmlFor="trade-get-cash">Cash</label>
                    <input
                      id="trade-get-cash"
                      className="input"
                      type="number"
                      min={0}
                      step={10}
                      value={requestCash}
                      onChange={(event) => setRequestCash(Math.max(0, Number(event.target.value)))}
                    />
                  </div>
                  <ul className="chip-list">
                    {theirTradable.map((property) => (
                      <li key={property.id}>
                        <button
                          type="button"
                          className={`chip${requestProperties.includes(property.id) ? ' chip--on' : ''}`}
                          aria-pressed={requestProperties.includes(property.id)}
                          onClick={() =>
                            toggle(requestProperties, setRequestProperties, property.id)
                          }
                        >
                          {displayName(property.id)}
                        </button>
                      </li>
                    ))}
                    {theirTradable.length === 0 ? (
                      <li className="tiny muted">They have nothing tradable.</li>
                    ) : null}
                  </ul>
                </div>
              </div>

              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={empty || !targetId}
                onClick={() => void submit()}
              >
                Send offer
              </button>
              <p className="tiny muted">
                Developed properties must have their buildings sold before they can be traded.
              </p>
            </>
          )}
        </div>
      </section>

      {outgoing.length > 0 ? (
        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">Your open offers</span>
          </div>
          <div className="panel__body stack">
            {outgoing.map((trade) => (
              <div key={trade.id} className="row row--between">
                <span className="tiny">To {game.players[trade.toPlayerId]?.name}</span>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void send('CANCEL_TRADE', { tradeId: trade.id })}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
