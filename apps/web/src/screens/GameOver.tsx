import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../store/game-store.js';
import { formatMoney } from '../lib/view-helpers.js';

/** Final standings, generated from the server's authoritative score breakdown. */
export function GameOver() {
  const { game, leave } = useGameStore(
    useShallow((state) => ({ game: state.game, leave: state.leave })),
  );
  if (!game) return null;

  const winners = game.winnerIds ?? [];
  const iWon = winners.includes(game.viewerId);
  const scores = game.finalScores ?? [];

  return (
    <main className="menu">
      <div className="menu__card menu__card--wide panel">
        <header className="menu__header">
          <h1>{iWon ? 'Victory' : 'Game over'}</h1>
          <p className="muted">
            {winners.length === 0
              ? 'The game ended with no winner.'
              : winners.length === 1
                ? `${game.players[winners[0] as string]?.name ?? 'A player'} wins.`
                : `Shared victory: ${winners
                    .map((id) => game.players[id]?.name ?? 'A player')
                    .join(' and ')}.`}
          </p>
        </header>

        <table className="scoreboard">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Cash</th>
              <th scope="col">Property</th>
              <th scope="col">Buildings</th>
              <th scope="col">Army</th>
              <th scope="col">Territories</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((score) => {
              const player = game.players[score.playerId];
              const isWinner = winners.includes(score.playerId);
              return (
                <tr key={score.playerId} className={isWinner ? 'scoreboard__winner' : undefined}>
                  <th scope="row">
                    <span className="row">
                      <span
                        className="swatch swatch--sm"
                        style={{ background: `var(--player-${player?.colour ?? 'slate'})` }}
                        aria-hidden="true"
                      />
                      {player?.name ?? 'Player'}
                      {isWinner ? <span className="badge badge--positive">Winner</span> : null}
                    </span>
                  </th>
                  <td>{formatMoney(score.cash)}</td>
                  <td>{formatMoney(score.propertyValue)}</td>
                  <td>{formatMoney(score.buildingValue)}</td>
                  <td>{formatMoney(score.armyValue)}</td>
                  <td>
                    {score.completedTerritories} · {formatMoney(score.territoryBonus)}
                  </td>
                  <td className="money">{formatMoney(score.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="row">
          <button type="button" className="btn btn--primary" onClick={leave}>
            Back to menu
          </button>
        </div>
      </div>
    </main>
  );
}
