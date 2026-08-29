import type { ClientGameState, ClientPlayerView } from '@te/shared';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store/game-store.js';
import {
  displayName,
  formatMoney,
  orderedPlayers,
  propertiesOf,
  self,
} from '../../lib/view-helpers.js';
import { TerritoryEmblem } from '../board/TerritoryEmblem.js';
import { DevelopmentMark } from '../board/DevelopmentMark.js';

/**
 * Left panel: your own position in full, and what is publicly known about
 * everyone else. Opponent cash and army are hidden here because they are hidden
 * in the state the server sends - scouting is how you learn them.
 */
export function PlayerPanel({ game }: { readonly game: ClientGameState }) {
  const { selectedPlayerId, selectPlayer, selectProperty } = useGameStore(useShallow((state) => ({
    selectedPlayerId: state.selectedPlayerId,
    selectPlayer: state.selectPlayer,
    selectProperty: state.selectProperty,
  })));

  const me = self(game);
  const players = orderedPlayers(game);

  return (
    <div className="stack">
      {me ? (
        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">You</span>
            {me.status === 'bankrupt' ? <span className="badge badge--danger">Bankrupt</span> : null}
          </div>
          <div className="panel__body stack">
            <div className="row row--between">
              <span className="row">
                <span
                  className="swatch"
                  style={{ background: `var(--player-${me.colour ?? 'slate'})` }}
                  aria-hidden="true"
                />
                <strong>{me.name}</strong>
              </span>
              <span className="money money--lg">{formatMoney(me.cash)}</span>
            </div>

            <dl className="stat-grid">
              <div>
                <dt>Properties</dt>
                <dd>{me.propertyCount}</dd>
              </div>
              <div>
                <dt>Territories</dt>
                <dd>{me.completedTerritories.length}</dd>
              </div>
              <div>
                <dt>Army power</dt>
                <dd>{me.armySummary?.totalPower ?? 0}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{me.armySummary?.availablePower ?? 0}</dd>
              </div>
              <div>
                <dt>Committed</dt>
                <dd>{me.armySummary?.committedPower ?? 0}</dd>
              </div>
              <div>
                <dt>Borrowed</dt>
                <dd>{me.armySummary?.borrowedPower ?? 0}</dd>
              </div>
            </dl>

            {me.allyId ? (
              <p className="tiny">
                Allied with <strong>{game.players[me.allyId]?.name}</strong>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Players</span>
        </div>
        <ul className="player-list">
          {players.map((player) => (
            <PlayerRow
              key={player.id}
              game={game}
              player={player}
              selected={selectedPlayerId === player.id}
              onSelect={() => selectPlayer(selectedPlayerId === player.id ? null : player.id)}
            />
          ))}
        </ul>
      </section>

      {me ? (
        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">Your properties</span>
            <span className="badge">{me.propertyCount}</span>
          </div>
          <ul className="property-list">
            {propertiesOf(game, me.id).map((property) => (
              <li key={property.id}>
                <button
                  type="button"
                  className="property-row"
                  onClick={() => selectProperty(property.id)}
                >
                  <span className="property-row__name">{displayName(property.id)}</span>
                  <span className="property-row__marks">
                    <DevelopmentMark
                      level={property.level}
                      warDamaged={property.warDamagedUntilRound > game.round}
                    />
                    {property.mortgaged ? <span className="badge badge--danger">M</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {me.propertyCount === 0 ? (
              <li className="property-list__empty muted tiny">You do not own anything yet.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

interface PlayerRowProps {
  readonly game: ClientGameState;
  readonly player: ClientPlayerView;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function PlayerRow({ game, player, selected, onSelect }: PlayerRowProps) {
  const isActive = game.activePlayerId === player.id;
  const report = game.scoutReports.find((entry) => entry.targetId === player.id);

  return (
    <li>
      <button
        type="button"
        className={[
          'player-row',
          isActive ? 'player-row--active' : '',
          selected ? 'player-row--selected' : '',
          player.status === 'bankrupt' ? 'player-row--out' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span
          className="swatch"
          style={{ background: `var(--player-${player.colour ?? 'slate'})` }}
          aria-hidden="true"
        />
        <span className="player-row__body">
          <span className="player-row__name">
            {player.name}
            {player.isSelf ? <span className="badge">You</span> : null}
            {isActive ? <span className="badge badge--accent">Turn</span> : null}
          </span>
          <span className="player-row__meta tiny muted">
            {player.propertyCount} properties · {player.completedTerritories.length} territories
            {player.isSelf ? ` · ${formatMoney(player.cash)}` : ''}
          </span>
          {!player.isSelf && report ? (
            <span className="player-row__meta tiny">
              Scouted r{report.round}: power {report.armyPower}, cash {formatMoney(report.cashRange.min)}–
              {formatMoney(report.cashRange.max)}
            </span>
          ) : null}
          <span className="player-row__marks">
            {player.completedTerritories.map((territoryId) => (
              <TerritoryEmblem key={territoryId} territoryId={territoryId} size={13} />
            ))}
          </span>
        </span>
        <span className="player-row__flags">
          {player.status === 'bankrupt' ? <span className="badge badge--danger">Out</span> : null}
          {player.inDetention ? <span className="badge badge--warning">Held</span> : null}
          {!player.connected ? <span className="badge badge--warning">Offline</span> : null}
          {player.allyId ? <span className="badge">Allied</span> : null}
        </span>
      </button>
    </li>
  );
}
