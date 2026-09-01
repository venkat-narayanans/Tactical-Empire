import { useState } from 'react';
import type { CommandError } from '@te/shared';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/game-store.js';

/** Join an existing room by code. Server errors are shown verbatim - they are
 * already written for players and never expose internals. */
export function JoinGame() {
  const { setScreen, send, connect } = useGameStore(useShallow((state) => ({
    setScreen: state.setScreen,
    send: state.send,
    connect: state.connect,
  })));

  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await connect();
      const rejection = await send('JOIN_ROOM', {
        roomCode: roomCode.trim().toUpperCase(),
        playerName: playerName.trim(),
      });
      if (rejection) {
        setError(rejection.message);
        setBusy(false);
      }
    } catch (error) {
      setError((error as CommandError).message ?? 'Could not join that game.');
      setBusy(false);
    }
  }

  return (
    <main className="menu">
      <form className="menu__card panel" onSubmit={submit}>
        <header className="menu__header">
          <h1>Join game</h1>
        </header>

        <div className="stack">
          <div className="field">
            <label htmlFor="join-name">Your name</label>
            <input
              id="join-name"
              className="input"
              value={playerName}
              maxLength={16}
              autoComplete="off"
              onChange={(event) => setPlayerName(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="join-code">Room code</label>
            <input
              id="join-code"
              className="input input--code"
              value={roomCode}
              maxLength={5}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              required
            />
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="row">
            <button type="button" className="btn" onClick={() => setScreen('menu')}>
              Back
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || playerName.trim().length < 2 || roomCode.trim().length !== 5}
            >
              {busy ? 'Joining…' : 'Join game'}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
