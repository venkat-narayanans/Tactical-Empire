import { useState } from 'react';
import { CONFIG } from '@te/config';
import { PLAYER_COLOURS } from '@te/shared';
import type { PlayerColour, SettingsPatch } from '@te/shared';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/game-store.js';
import { orderedPlayers, self } from '../lib/view-helpers.js';
import { Toggle } from './CreateGame.js';

/** The lobby: room code, players, colours, host settings, start. */
export function Lobby() {
  const { game, send, leave, pushToast } = useGameStore(useShallow((state) => ({
    game: state.game,
    send: state.send,
    leave: state.leave,
    pushToast: state.pushToast,
  })));
  const [copied, setCopied] = useState(false);

  if (!game) return <main className="menu"><p>Loading…</p></main>;

  const me = self(game);
  const isHost = me?.isHost ?? false;
  const players = orderedPlayers(game);
  const takenColours = new Set(players.map((player) => player.colour).filter(Boolean));
  const hs = CONFIG.host_settings;

  const patchSettings = (patch: SettingsPatch): void => {
    void send('UPDATE_SETTINGS', { settings: patch });
  };

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(game!.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast('warning', `Room code: ${game!.roomCode}`);
    }
  }

  return (
    <main className="lobby">
      <div className="lobby__grid">
        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">Room</span>
            <span className="badge">{players.length}/{game.settings.maxPlayers} players</span>
          </div>
          <div className="panel__body stack">
            <div className="lobby__code">
              <span className="lobby__code-value">{game.roomCode}</span>
              <button type="button" className="btn btn--sm" onClick={() => void copyCode()}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <p className="tiny muted">Share this code so friends can join.</p>

            <ul className="lobby__players">
              {players.map((player) => (
                <li key={player.id} className="lobby__player">
                  <span
                    className="swatch"
                    style={{ background: `var(--player-${player.colour ?? 'slate'})` }}
                    aria-hidden="true"
                  />
                  <span className="lobby__player-name">
                    {player.name}
                    {player.isSelf ? <span className="badge">You</span> : null}
                    {player.isHost ? <span className="badge badge--accent">Host</span> : null}
                  </span>
                  {!player.connected ? <span className="badge badge--warning">Offline</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <span className="panel__title">Your colour</span>
          </div>
          <div className="panel__body">
            <div className="colour-picker" role="radiogroup" aria-label="Choose your colour">
              {PLAYER_COLOURS.map((colour) => {
                const taken = takenColours.has(colour) && me?.colour !== colour;
                const selected = me?.colour === colour;
                return (
                  <button
                    key={colour}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={colour}
                    disabled={taken}
                    className={`colour-swatch${selected ? ' colour-swatch--selected' : ''}`}
                    style={{ background: `var(--player-${colour})` }}
                    onClick={() => void send('SELECT_COLOUR', { colour: colour as PlayerColour })}
                  >
                    {selected ? <span aria-hidden="true">✓</span> : null}
                    {taken ? <span className="visually-hidden">taken</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel lobby__settings">
          <div className="panel__header">
            <span className="panel__title">Settings</span>
            {!isHost ? <span className="badge">Host only</span> : null}
          </div>
          <div className="panel__body">
            <div className="settings-grid">
              <div className="field">
                <label htmlFor="lobby-cash">Starting cash (₹)</label>
                <input
                  id="lobby-cash"
                  className="input"
                  type="number"
                  disabled={!isHost}
                  min={hs.starting_cash.min}
                  max={hs.starting_cash.max}
                  step={100}
                  value={game.settings.startingCash}
                  onChange={(event) => patchSettings({ startingCash: Number(event.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="lobby-turn">Turn timer (seconds)</label>
                <input
                  id="lobby-turn"
                  className="input"
                  type="number"
                  disabled={!isHost}
                  min={hs.turn_duration_seconds.min}
                  max={hs.turn_duration_seconds.max}
                  step={10}
                  value={game.settings.turnDurationSeconds}
                  onChange={(event) =>
                    patchSettings({ turnDurationSeconds: Number(event.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="lobby-players">Maximum players</label>
                <input
                  id="lobby-players"
                  className="input"
                  type="number"
                  disabled={!isHost}
                  min={hs.maximum_players.min}
                  max={hs.maximum_players.max}
                  value={game.settings.maxPlayers}
                  onChange={(event) => patchSettings({ maxPlayers: Number(event.target.value) })}
                />
              </div>
            </div>

            <div className="toggles">
              <Toggle
                id="lobby-auction"
                label="Auctions"
                disabled={!isHost}
                checked={game.settings.auction}
                onChange={(value) => patchSettings({ auction: value })}
              />
              <Toggle
                id="lobby-even"
                label="Even build"
                disabled={!isHost}
                checked={game.settings.evenBuild}
                onChange={(value) => patchSettings({ evenBuild: value })}
              />
              <Toggle
                id="lobby-mortgage"
                label="Mortgages"
                disabled={!isHost}
                checked={game.settings.mortgage}
                onChange={(value) => patchSettings({ mortgage: value })}
              />
              <Toggle
                id="lobby-vacation"
                label="Vacation cash"
                disabled={!isHost}
                checked={game.settings.vacationCash}
                onChange={(value) => patchSettings({ vacationCash: value })}
              />
              <Toggle
                id="lobby-fullset"
                label="Double rent on a full set"
                disabled={!isHost}
                checked={game.settings.fullSetX2Rent}
                onChange={(value) => patchSettings({ fullSetX2Rent: value })}
              />
              <Toggle
                id="lobby-random"
                label="Randomise player order"
                disabled={!isHost}
                checked={game.settings.randomizePlayerOrder}
                onChange={(value) => patchSettings({ randomizePlayerOrder: value })}
              />
            </div>
          </div>
        </section>
      </div>

      <footer className="lobby__actions">
        <button type="button" className="btn" onClick={leave}>
          Leave room
        </button>
        {isHost ? (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={players.length < CONFIG.defaults.min_players}
            onClick={() => void send('START_GAME')}
          >
            Start game
          </button>
        ) : (
          <span className="muted">Waiting for the host to start…</span>
        )}
      </footer>
      {players.length < CONFIG.defaults.min_players ? (
        <p className="tiny muted lobby__hint">
          At least {CONFIG.defaults.min_players} players are needed to start.
        </p>
      ) : null}
    </main>
  );
}
