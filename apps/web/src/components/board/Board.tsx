import { useMemo } from 'react';
import { BOARD, TERRITORIES } from '@te/config';
import type { ClientGameState, PlayerId } from '@te/shared';
import { GRID_CELLS, TILE_PLACEMENTS } from './board-layout.js';
import { Tile } from './Tile.js';
import { TerritoryEmblem } from './TerritoryEmblem.js';
import { Dice } from './Dice.js';
import './board.css';

/**
 * The board.
 *
 * Every tile is generated from GAME_CONFIG.json via `TILE_PLACEMENTS`; there is
 * no per-space JSX anywhere. Text is never rotated, so a city name is readable
 * on all four sides.
 */

interface BoardProps {
  readonly game: ClientGameState;
  readonly tokenPositions: Record<PlayerId, number>;
  readonly selectedPropertyId: string | null;
  readonly onSelectProperty: (propertyId: string | null) => void;
  readonly diceRolling: boolean;
}

export function Board({
  game,
  tokenPositions,
  selectedPropertyId,
  onSelectProperty,
  diceRolling,
}: BoardProps) {
  const tokensBySpace = useMemo(() => {
    const map = new Map<number, PlayerId[]>();
    for (const player of Object.values(game.players)) {
      if (player.status !== 'active') continue;
      const index = tokenPositions[player.id] ?? player.position;
      const list = map.get(index) ?? [];
      list.push(player.id);
      map.set(index, list);
    }
    return map;
  }, [game.players, tokenPositions]);

  return (
    <div className="board" style={{ '--grid-cells': GRID_CELLS } as React.CSSProperties}>
      <div className="board__grid" role="grid" aria-label="Tactical Empire board">
        {TILE_PLACEMENTS.map(({ space, row, column, edge, isCorner }) => {
          const property = game.properties[space.id];
          const ownerId = property?.owner ?? null;
          const owner = ownerId ? game.players[ownerId] : undefined;
          const tokens = tokensBySpace.get(space.index) ?? [];

          return (
            <div
              key={space.id}
              className={`board__cell board__cell--${edge}${isCorner ? ' board__cell--corner' : ''}`}
              style={{ gridRow: row, gridColumn: column }}
              role="gridcell"
            >
              <Tile
                space={space}
                property={property}
                owner={owner}
                round={game.round}
                selected={selectedPropertyId === space.id}
                onSelect={onSelectProperty}
              >
                {tokens.length > 0 ? (
                  <span className="tile__tokens">
                    {tokens.map((playerId) => {
                      const player = game.players[playerId];
                      if (!player) return null;
                      return (
                        <span
                          key={playerId}
                          className={`token${game.activePlayerId === playerId ? ' token--active' : ''}`}
                          style={
                            {
                              '--token-colour': `var(--player-${player.colour ?? 'slate'})`,
                            } as React.CSSProperties
                          }
                          title={player.name}
                        >
                          <span className="visually-hidden">{player.name}</span>
                        </span>
                      );
                    })}
                  </span>
                ) : null}
              </Tile>
            </div>
          );
        })}

        <div className="board__centre">
          <div className="board__brand">
            <span className="board__brand-title">Tactical Empire</span>
            <span className="board__brand-sub">Round {game.round} of {game.settings.maxRounds}</span>
          </div>

          <Dice dice={game.turn.dice} rolling={diceRolling} />

          <ul className="board__legend" aria-label="Territories">
            {TERRITORIES.map((territory) => (
              <li key={territory.id} className="board__legend-item">
                <TerritoryEmblem territoryId={territory.id} size={14} />
                <span>{territory.id}</span>
                <span className="muted tiny">₹{territory.bonus}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <span className="visually-hidden">
        This board has {BOARD.length} spaces.
      </span>
    </div>
  );
}
