import type { ClientGameState, PendingDebt } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import {
  displayName,
  formatMoney,
  houseCostFor,
  mortgageValueOf,
  propertiesOf,
  self,
} from '../../../lib/view-helpers.js';

/**
 * Debt resolution.
 *
 * Play is suspended for everyone until the debtor either raises the money or
 * declares bankruptcy. Only the debtor gets controls; everyone else sees why
 * the game is waiting.
 */
export function DebtPanel({
  game,
  debt,
}: {
  readonly game: ClientGameState;
  readonly debt: PendingDebt;
}) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const debtor = game.players[debt.playerId];
  const creditor = debt.creditorId ? game.players[debt.creditorId] : null;
  const isMine = debt.playerId === game.viewerId;
  const cash = me?.cash ?? 0;
  const shortfall = Math.max(0, debt.amount - cash);

  if (!isMine) {
    return (
      <section className="panel panel--focus">
        <div className="panel__header">
          <span className="panel__title">Payment pending</span>
        </div>
        <div className="panel__body">
          <p className="tiny">
            <strong>{debtor?.name ?? 'A player'}</strong> owes {formatMoney(debt.amount)}
            {creditor ? ` to ${creditor.name}` : ' to the bank'} and is raising the money.
          </p>
        </div>
      </section>
    );
  }

  const owned = propertiesOf(game, game.viewerId);
  const developed = owned.filter((property) => property.level > 0);
  const mortgageable = owned.filter((property) => !property.mortgaged && property.level === 0);
  const army = me?.army?.filter((unit) => unit.state === 'active') ?? [];
  const armyTypes = [...new Set(army.map((unit) => unit.type))];

  return (
    <section className="panel panel--focus panel--danger">
      <div className="panel__header">
        <span className="panel__title">You owe {formatMoney(debt.amount)}</span>
      </div>

      <div className="panel__body stack">
        <p className="tiny">
          {creditor ? `Owed to ${creditor.name}.` : 'Owed to the bank.'} Raise{' '}
          <strong>{formatMoney(shortfall)}</strong> more, or declare bankruptcy.
        </p>

        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={shortfall > 0}
          onClick={() => void send('SETTLE_DEBT')}
        >
          Pay {formatMoney(debt.amount)}
        </button>

        {developed.length > 0 ? (
          <div className="stack">
            <span className="panel__title">Sell buildings</span>
            {developed.map((property) => (
              <button
                key={property.id}
                type="button"
                className="btn btn--sm btn--block"
                onClick={() => void send('SELL_BUILDING', { propertyId: property.id })}
              >
                {displayName(property.id)} · +{formatMoney(Math.floor(houseCostFor(property.id) * 0.5))}
              </button>
            ))}
          </div>
        ) : null}

        {game.settings.mortgage && mortgageable.length > 0 ? (
          <div className="stack">
            <span className="panel__title">Mortgage</span>
            {mortgageable.map((property) => (
              <button
                key={property.id}
                type="button"
                className="btn btn--sm btn--block"
                onClick={() => void send('MORTGAGE_PROPERTY', { propertyId: property.id })}
              >
                {displayName(property.id)} · +{formatMoney(mortgageValueOf(property.id))}
              </button>
            ))}
          </div>
        ) : null}

        {armyTypes.length > 0 ? (
          <div className="stack">
            <span className="panel__title">Sell army</span>
            {armyTypes.map((type) => (
              <button
                key={type}
                type="button"
                className="btn btn--sm btn--block"
                onClick={() => void send('SELL_ARMY', { unitType: type, quantity: 1 })}
              >
                Sell one {type}
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn--danger btn--block"
          onClick={() => void send('DECLARE_BANKRUPTCY')}
        >
          Declare bankruptcy
        </button>
      </div>
    </section>
  );
}
