import { useState } from 'react';
import { CONFIG } from '@te/config';
import type { CommandError, SettingsPatch } from '@te/shared';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/game-store.js';

/**
 * Create game.
 *
 * Settings are only proposed here; the server clamps them to the ranges in
 * GAME_CONFIG.host_settings and freezes them when the game starts.
 */
export function CreateGame() {
  const { setScreen, send, connect, status } = useGameStore(useShallow((state) => ({
    setScreen: state.setScreen,
    send: state.send,
    connect: state.connect,
    status: state.status,
  })));

  const hs = CONFIG.host_settings;
  const [playerName, setPlayerName] = useState('');
  const [settings, setSettings] = useState<SettingsPatch>({
    maxPlayers: hs.maximum_players.default,
    startingCash: hs.starting_cash.default,
    turnDurationSeconds: hs.turn_duration_seconds.default,
    auction: hs.auction,
    evenBuild: hs.even_build,
    mortgage: hs.mortgage,
    vacationCash: hs.vacation_cash,
    fullSetX2Rent: hs.full_set_x2_rent,
    rentWhileInIgSignal: hs.rent_while_in_ig_signal,
    randomizePlayerOrder: hs.randomize_player_order,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = <K extends keyof SettingsPatch>(key: K, value: SettingsPatch[K]): void => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await connect();
      const rejection = await send('CREATE_ROOM', { playerName: playerName.trim(), settings });
      if (rejection) {
        setError(rejection.message);
        setBusy(false);
      }
    } catch (error) {
      setError((error as CommandError).message ?? 'Could not create the game.');
      setBusy(false);
    }
  }

  return (
    <main className="menu">
      <form className="menu__card menu__card--wide panel" onSubmit={submit}>
        <header className="menu__header">
          <h1>Create game</h1>
        </header>

        <div className="stack">
          <div className="field">
            <label htmlFor="create-name">Your name</label>
            <input
              id="create-name"
              className="input"
              value={playerName}
              maxLength={16}
              autoComplete="off"
              onChange={(event) => setPlayerName(event.target.value)}
              required
            />
          </div>

          <fieldset className="settings-grid">
            <legend className="panel__title">Game settings</legend>

            <div className="field">
              <label htmlFor="create-players">Maximum players</label>
              <input
                id="create-players"
                className="input"
                type="number"
                min={hs.maximum_players.min}
                max={hs.maximum_players.max}
                value={settings.maxPlayers}
                onChange={(event) => patch('maxPlayers', Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="create-cash">Starting cash (₹)</label>
              <input
                id="create-cash"
                className="input"
                type="number"
                min={hs.starting_cash.min}
                max={hs.starting_cash.max}
                step={100}
                value={settings.startingCash}
                onChange={(event) => patch('startingCash', Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="create-turn">Turn timer (seconds)</label>
              <input
                id="create-turn"
                className="input"
                type="number"
                min={hs.turn_duration_seconds.min}
                max={hs.turn_duration_seconds.max}
                step={10}
                value={settings.turnDurationSeconds}
                onChange={(event) => patch('turnDurationSeconds', Number(event.target.value))}
              />
            </div>

            <div className="toggles">
              <Toggle
                id="create-auction"
                label="Auctions"
                checked={settings.auction ?? true}
                onChange={(value) => patch('auction', value)}
              />
              <Toggle
                id="create-even"
                label="Even build"
                checked={settings.evenBuild ?? true}
                onChange={(value) => patch('evenBuild', value)}
              />
              <Toggle
                id="create-mortgage"
                label="Mortgages"
                checked={settings.mortgage ?? true}
                onChange={(value) => patch('mortgage', value)}
              />
              <Toggle
                id="create-vacation"
                label="Vacation cash"
                checked={settings.vacationCash ?? true}
                onChange={(value) => patch('vacationCash', value)}
              />
              <Toggle
                id="create-fullset"
                label="Double rent on a full set"
                checked={settings.fullSetX2Rent ?? true}
                onChange={(value) => patch('fullSetX2Rent', value)}
              />
              <Toggle
                id="create-detention-rent"
                label="Collect rent while at IG Signal"
                checked={settings.rentWhileInIgSignal ?? true}
                onChange={(value) => patch('rentWhileInIgSignal', value)}
              />
              <Toggle
                id="create-random"
                label="Randomise player order"
                checked={settings.randomizePlayerOrder ?? true}
                onChange={(value) => patch('randomizePlayerOrder', value)}
              />
            </div>
          </fieldset>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="row">
            <button type="button" className="btn" onClick={() => setScreen('menu')}>
              Back
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy || playerName.trim().length < 2}>
              {busy ? 'Creating…' : 'Create game'}
            </button>
          </div>
          {busy && status !== 'connected' ? (
            <p className="muted" role="status" style={{ textAlign: 'center', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Connecting to game server (waking up server, please wait ~20s)…
            </p>
          ) : null}
        </div>
      </form>
    </main>
  );
}

interface ToggleProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: boolean) => void;
}

export function Toggle({ id, label, checked, disabled = false, onChange }: ToggleProps) {
  return (
    <label className="checkbox-row" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
