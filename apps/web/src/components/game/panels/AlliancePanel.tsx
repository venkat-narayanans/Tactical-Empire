import { CONFIG } from '@te/config';
import type { ClientGameState } from '@te/shared';
import { useGameStore } from '../../../store/game-store.js';
import { opponents, self } from '../../../lib/view-helpers.js';

/** Alliance requests, the active alliance and its expiry. */
export function AlliancePanel({ game }: { readonly game: ClientGameState }) {
  const send = useGameStore((state) => state.send);
  const me = self(game);
  const ally = me?.allyId ? game.players[me.allyId] : null;
  const alliance = game.alliances.find((entry) => entry.playerIds.includes(game.viewerId));
  const incoming = game.allianceRequests.filter(
    (request) => request.toPlayerId === game.viewerId,
  );
  const outgoing = game.allianceRequests.filter(
    (request) => request.fromPlayerId === game.viewerId,
  );
  const candidates = opponents(game).filter(
    (player) => player.status === 'active' && !player.allyId,
  );
  const cooldownActive = false;

  return (
    <div className="stack">
      {incoming.length > 0 ? (
        <section className="panel panel--focus">
          <div className="panel__header">
            <span className="panel__title">Alliance requests</span>
          </div>
          <div className="panel__body stack">
            {incoming.map((request) => (
              <div key={request.id} className="stack">
                <p className="tiny">
                  <strong>{game.players[request.fromPlayerId]?.name}</strong> requests an alliance.
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void send('ACCEPT_ALLIANCE', { requestId: request.id })}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void send('DECLINE_ALLIANCE', { requestId: request.id })}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__header">
          <span className="panel__title">Alliance</span>
          {ally ? <span className="badge badge--positive">Active</span> : null}
        </div>
        <div className="panel__body stack">
          {ally && alliance ? (
            <>
              <p className="tiny">
                Allied with <strong>{ally.name}</strong> until the end of round{' '}
                {alliance.expiresAfterRound}.
              </p>
              <p className="tiny muted">
                You can lend up to{' '}
                {Math.round(CONFIG.alliances.army_lend_max_percentage_of_available_power * 100)}% of
                your available army power from the Army tab.
              </p>
            </>
          ) : (
            <>
              <p className="tiny muted">
                One alliance at a time, lasting {CONFIG.alliances.duration_rounds} rounds. An
                alliance is what allows army lending.
              </p>
              {candidates.map((player) => {
                const alreadyAsked = outgoing.some(
                  (request) => request.toPlayerId === player.id,
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
                      disabled={alreadyAsked || cooldownActive}
                      onClick={() => void send('REQUEST_ALLIANCE', { targetPlayerId: player.id })}
                    >
                      {alreadyAsked ? 'Requested' : 'Propose'}
                    </button>
                  </div>
                );
              })}
              {candidates.length === 0 ? (
                <p className="tiny muted">Nobody is currently free to ally with.</p>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
