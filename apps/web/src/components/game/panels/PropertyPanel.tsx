import type { ClientGameState } from '@te/shared';
import { CITY_BY_ID, SPECIAL_BY_ID } from '@te/config';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../../store/game-store.js';
import {
  buildingRefundOf,
  canBuildHint,
  developmentLabel,
  displayName,
  displayRent,
  formatMoney,
  houseCostFor,
  mortgageValueOf,
  priceOf,
  self,
  unmortgageCostOf,
} from '../../../lib/view-helpers.js';
import { TerritoryEmblem } from '../../board/TerritoryEmblem.js';
import { DevelopmentMark } from '../../board/DevelopmentMark.js';

/**
 * Details for the tile the player selected, plus the actions legal on it.
 * Build, mortgage and sell are shown only when the engine would accept them;
 * the server still revalidates every one.
 */
export function PropertyPanel({ game }: { readonly game: ClientGameState }) {
  const { selectedPropertyId, send } = useGameStore(useShallow((state) => ({
    selectedPropertyId: state.selectedPropertyId,
    send: state.send,
  })));

  if (!selectedPropertyId) {
    return (
      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Board</span>
        </div>
        <div className="panel__body">
          <p className="muted tiny">Select a property on the board to see its details.</p>
        </div>
      </section>
    );
  }

  const property = game.properties[selectedPropertyId];
  const city = CITY_BY_ID.get(selectedPropertyId);
  const special = SPECIAL_BY_ID.get(selectedPropertyId);
  if (!property) return null;

  const me = self(game);
  const owner = property.owner ? game.players[property.owner] : null;
  const mine = property.owner === game.viewerId;
  const rent = displayRent(game, selectedPropertyId);
  const houseCost = houseCostFor(selectedPropertyId);
  const damaged = property.warDamagedUntilRound > game.round;

  return (
    <section className="panel">
      <div className="panel__header">
        <span className="panel__title">{city ? 'City' : 'Special property'}</span>
        {city ? <TerritoryEmblem territoryId={city.territoryId} size={18} showLabel /> : null}
      </div>

      <div className="panel__body stack">
        <div>
          <h3>{displayName(selectedPropertyId)}</h3>
          <p className="tiny muted">
            Price {formatMoney(priceOf(selectedPropertyId))}
            {special ? ` · ${special.group.replace('_', ' ')}` : ''}
          </p>
        </div>

        <dl className="stat-grid">
          <div>
            <dt>Owner</dt>
            <dd>
              {owner ? (
                <span className="row">
                  <span
                    className="swatch swatch--sm"
                    style={{ background: `var(--player-${owner.colour ?? 'slate'})` }}
                    aria-hidden="true"
                  />
                  {owner.name}
                </span>
              ) : (
                'Unowned'
              )}
            </dd>
          </div>
          {city ? (
            <div>
              <dt>Development</dt>
              <dd>
                <span className="row">
                  <DevelopmentMark level={property.level} warDamaged={damaged} />
                  {developmentLabel(property.level)}
                </span>
              </dd>
            </div>
          ) : null}
          {rent !== null ? (
            <div>
              <dt>Rent now</dt>
              <dd>{formatMoney(rent)}</dd>
            </div>
          ) : null}
          {city && property.level < 5 ? (
            <div>
              <dt>Next level</dt>
              <dd>{formatMoney(houseCost)}</dd>
            </div>
          ) : null}
        </dl>

        {damaged ? (
          <p className="notice notice--warning tiny">
            War damaged: this property collects reduced rent and cannot be developed this round.
          </p>
        ) : null}
        {property.mortgaged ? (
          <p className="notice notice--warning tiny">Mortgaged: it collects no rent.</p>
        ) : null}

        {mine ? (
          <div className="stack">
            {city ? (
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={!canBuildHint(game, selectedPropertyId)}
                onClick={() => void send('BUILD', { propertyId: selectedPropertyId })}
              >
                Build {property.level === 4 ? 'hotel' : 'house'} · {formatMoney(houseCost)}
              </button>
            ) : null}

            {city && property.level > 0 ? (
              <button
                type="button"
                className="btn btn--block"
                onClick={() => void send('SELL_BUILDING', { propertyId: selectedPropertyId })}
              >
                Sell building · {formatMoney(buildingRefundOf(selectedPropertyId))}
              </button>
            ) : null}

            {game.settings.mortgage && !property.mortgaged && property.level === 0 ? (
              <button
                type="button"
                className="btn btn--block"
                onClick={() => void send('MORTGAGE_PROPERTY', { propertyId: selectedPropertyId })}
              >
                Mortgage · {formatMoney(mortgageValueOf(selectedPropertyId))}
              </button>
            ) : null}

            {property.mortgaged ? (
              <button
                type="button"
                className="btn btn--block"
                disabled={(me?.cash ?? 0) < unmortgageCostOf(selectedPropertyId)}
                onClick={() => void send('UNMORTGAGE_PROPERTY', { propertyId: selectedPropertyId })}
              >
                Lift mortgage · {formatMoney(unmortgageCostOf(selectedPropertyId))}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
