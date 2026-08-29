import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/game-store.js';
import { Board } from '../components/board/Board.js';
import { TopBar } from '../components/game/TopBar.js';
import { PlayerPanel } from '../components/game/PlayerPanel.js';
import { ContextPanel } from '../components/game/ContextPanel.js';
import { ActionBar } from '../components/game/ActionBar.js';
import '../styles/game.css';

/**
 * Gameplay layout: top bar, player panel, board, contextual panel, action bar.
 * The board is sized from the viewport so all three target desktop resolutions
 * fit without page scrolling; only the side panels scroll internally.
 */
export function GameScreen() {
  const {
    game,
    tokenPositions,
    selectedPropertyId,
    selectProperty,
    diceRolling,
  } = useGameStore(useShallow((state) => ({
    game: state.game,
    tokenPositions: state.tokenPositions,
    selectedPropertyId: state.selectedPropertyId,
    selectProperty: state.selectProperty,
    diceRolling: state.diceRolling,
  })));

  if (!game) {
    return (
      <main className="menu">
        <p className="muted">Loading the board…</p>
      </main>
    );
  }

  return (
    <div className="layout-game">
      <TopBar game={game} />

      <div className="layout-game__body">
        <aside className="layout-game__left scroll-y" aria-label="Players">
          <PlayerPanel game={game} />
        </aside>

        <div className="layout-game__board">
          <Board
            game={game}
            tokenPositions={tokenPositions}
            selectedPropertyId={selectedPropertyId}
            onSelectProperty={selectProperty}
            diceRolling={diceRolling}
          />
        </div>

        <aside className="layout-game__right scroll-y" aria-label="Actions">
          <ContextPanel game={game} />
        </aside>
      </div>

      <ActionBar game={game} />
    </div>
  );
}
