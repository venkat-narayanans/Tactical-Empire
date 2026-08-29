import { useGameStore } from '../store/game-store.js';

/** The entry screen: three choices, nothing else. */
export function MainMenu() {
  const setScreen = useGameStore((state) => state.setScreen);

  return (
    <main className="menu">
      <div className="menu__card panel">
        <header className="menu__header">
          <h1 className="menu__logo">Tactical Empire</h1>
          <p className="muted">Property, territory and war, played with friends.</p>
        </header>

        <div className="stack">
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => setScreen('create')}>
            Create game
          </button>
          <button type="button" className="btn btn--lg btn--block" onClick={() => setScreen('join')}>
            Join game
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setScreen('howto')}>
            How to play
          </button>
        </div>
      </div>
    </main>
  );
}
