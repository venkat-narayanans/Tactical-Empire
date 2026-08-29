import { useEffect, useState } from 'react';
import type { ClientGameState } from '@te/shared';
import { useGameStore } from '../../store/game-store.js';
import { secondsLeft } from '../../lib/view-helpers.js';

/** Round, whose turn it is, the turn clock, room code and connection state. */
export function TopBar({ game }: { readonly game: ClientGameState }) {
  const status = useGameStore((state) => state.status);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const activePlayer = game.activePlayerId ? game.players[game.activePlayerId] : undefined;
  const isMine = game.activePlayerId === game.viewerId;
  const remaining = secondsLeft(game.turn.expiresAt, now);
  const urgent = remaining <= 10;

  const connection =
    status === 'connected'
      ? { label: 'Connected', className: 'status status--ok' }
      : status === 'reconnecting'
        ? { label: 'Reconnecting…', className: 'status status--warn' }
        : status === 'connecting'
          ? { label: 'Connecting…', className: 'status status--warn' }
          : { label: 'Disconnected', className: 'status status--bad' };

  return (
    <header className="topbar">
      <span className="topbar__logo">Tactical Empire</span>

      <span className="topbar__item">
        <span className="topbar__label">Round</span>
        <span className="topbar__value">
          {game.round}
          <span className="muted"> / {game.settings.maxRounds}</span>
        </span>
      </span>

      <span className="topbar__item topbar__item--turn">
        <span className="topbar__label">Turn</span>
        <span className="topbar__value">
          <span
            className="swatch swatch--sm"
            style={{ background: `var(--player-${activePlayer?.colour ?? 'slate'})` }}
            aria-hidden="true"
          />
          {isMine ? 'Your turn' : `${activePlayer?.name ?? '—'}`}
        </span>
      </span>

      <span className={`topbar__item topbar__timer${urgent ? ' topbar__timer--urgent' : ''}`}>
        <span className="topbar__label">Time</span>
        <span className="topbar__value">{remaining}s</span>
      </span>

      <span className="topbar__spacer" />

      <span className="topbar__item">
        <span className="topbar__label">Room</span>
        <span className="topbar__value topbar__code">{game.roomCode}</span>
      </span>

      <span className={connection.className} role="status">
        <span className="status__dot" aria-hidden="true" />
        {connection.label}
      </span>
    </header>
  );
}
