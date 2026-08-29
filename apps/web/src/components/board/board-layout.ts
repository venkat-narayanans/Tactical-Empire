import { BOARD, CONFIG } from '@te/config';
import type { BoardSpace } from '@te/config';

/**
 * Maps board indices onto an 11x11 CSS grid.
 *
 * START sits bottom-right and play runs anti-clockwise, so the four corners
 * land on the four grid corners exactly as they do on a physical board. Nothing
 * here is hard-coded per space: the mapping is derived from the board size in
 * GAME_CONFIG.json.
 */

export type BoardEdge = 'bottom' | 'left' | 'top' | 'right';

export interface TilePlacement {
  readonly space: BoardSpace;
  readonly row: number;
  readonly column: number;
  readonly edge: BoardEdge;
  readonly isCorner: boolean;
}

const SIZE = CONFIG.game.board_size;
const PER_SIDE = SIZE / 4;
export const GRID_CELLS = PER_SIDE + 1;

export function placementFor(index: number): Omit<TilePlacement, 'space'> {
  const last = GRID_CELLS;

  if (index === 0) return { row: last, column: last, edge: 'bottom', isCorner: true };
  if (index < PER_SIDE) {
    return { row: last, column: last - index, edge: 'bottom', isCorner: false };
  }

  if (index === PER_SIDE) return { row: last, column: 1, edge: 'left', isCorner: true };
  if (index < PER_SIDE * 2) {
    return { row: last - (index - PER_SIDE), column: 1, edge: 'left', isCorner: false };
  }

  if (index === PER_SIDE * 2) return { row: 1, column: 1, edge: 'top', isCorner: true };
  if (index < PER_SIDE * 3) {
    return { row: 1, column: 1 + (index - PER_SIDE * 2), edge: 'top', isCorner: false };
  }

  if (index === PER_SIDE * 3) return { row: 1, column: last, edge: 'right', isCorner: true };
  return { row: 1 + (index - PER_SIDE * 3), column: last, edge: 'right', isCorner: false };
}

export const TILE_PLACEMENTS: readonly TilePlacement[] = BOARD.map((space) => ({
  space,
  ...placementFor(space.index),
}));
