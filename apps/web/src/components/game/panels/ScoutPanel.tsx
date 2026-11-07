import { CONFIG } from '@te/config';
import type { ClientGameState } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import { formatMoney, isMyTurn, opponents, self } from '../../../lib/view-helpers.js';
import { TerritoryEmblem } from '../../board/TerritoryEmblem.js';

/**
 * Scouting.
 *
 * Reports are private: they arrive on an event addressed only to the scout and
 * are stored per-viewer on the server, so a reload keeps your intel and nobody
 * else's.
 */
export function ScoutPanel({ game }: { readonly game: ClientGameState }) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const myTurn = isMyTurn(game);
  const cost = (me?.freeScoutCharges ?? 0) > 0 ? 0 : CONFIG.scouting.cost;
  const targets = opponents(game).filter((player) => player.status === 'active');

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Scout</span>
          <span className="badge">{cost === 0 ? 'Free scout' : formatMoney(cost)}</span>
        </div>
        <div className="panel__body stack">
          <p className="tiny muted">
            Reveals army composition, army power, completed territories, alliance status and a range
            for their cash. One scout per target per round.
          </p>

          {targets.map((player) => {
            const scoutedThisRound = game.scoutReports.some(
              (report) => report.targetId === player.id && report.round === game.round,
            );
            return (
              <div key={player.id} className="row row--between">
                <span className="row">
                  <span
                    className="swatch swatch--sm"
                    style={{ background: `var(--player-${player.colour ?? 'slate'})` }}
                    aria-hidden="true"
                  />
                  {player.name}
                </span>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={!myTurn || scoutedThisRound || (me?.cash ?? 0) < cost}
                  onClick={() => void send('SCOUT', { targetPlayerId: player.id })}
                >
                  {scoutedThisRound ? 'Scouted' : 'Scout'}
                </button>
              </div>
            );
          })}
          {!myTurn ? <p className="tiny muted">Scouting happens on your own turn.</p> : null}
        </div>
      </section>

      {game.scoutReports.length > 0 ? (
        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">Your intel</span>
          </div>
          <div className="panel__body stack">
            {[...game.scoutReports]
              .sort((a, b) => b.round - a.round)
              .map((report) => (
                <div key={`${report.targetId}-${report.round}`} className="report">
                  <div className="row row--between">
                    <strong>{game.players[report.targetId]?.name ?? 'Player'}</strong>
                    <span className="badge">Round {report.round}</span>
                  </div>
                  <dl className="stat-grid stat-grid--tight">
                    <div>
                      <dt>Army power</dt>
                      <dd>{report.armyPower}</dd>
                    </div>
                    <div>
                      <dt>Cash</dt>
                      <dd>
                        {formatMoney(report.cashRange.min)}–{formatMoney(report.cashRange.max)}
                      </dd>
                    </div>
                    <div>
                      <dt>Properties</dt>
                      <dd>{report.propertyCount}</dd>
                    </div>
                    <div>
                      <dt>Alliance</dt>
                      <dd>
                        {report.allianceStatus.allied
                          ? (game.players[report.allianceStatus.allyId ?? '']?.name ?? 'Allied')
                          : 'None'}
                      </dd>
                    </div>
                  </dl>
                  <div className="row">
                    {Object.entries(report.armyUnitTypes).map(([type, count]) => (
                      <span key={type} className="badge">
                        {count}× {type}
                      </span>
                    ))}
                    {Object.keys(report.armyUnitTypes).length === 0 ? (
                      <span className="tiny muted">No army</span>
                    ) : null}
                  </div>
                  {report.completedTerritories.length > 0 ? (
                    <div className="row">
                      {report.completedTerritories.map((territoryId) => (
                        <TerritoryEmblem key={territoryId} territoryId={territoryId} size={14} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
