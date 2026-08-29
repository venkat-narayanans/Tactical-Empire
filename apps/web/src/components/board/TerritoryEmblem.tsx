import { TERRITORY_BY_ID } from '@te/config';

/**
 * Territory emblems.
 *
 * Each territory gets one simple glyph in a small circular badge. They are
 * deliberately geometric so they cannot be mistaken for a house, a hotel or a
 * player token, and they stay attached to the city no matter who owns it.
 */

const GLYPHS: Record<string, string> = {
  // Circle
  T1: 'M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z',
  // Triangle
  T2: 'M12 5 19 18.5H5L12 5Z',
  // Square
  T3: 'M6.5 6.5h11v11h-11Z',
  // Diamond
  T4: 'M12 4.5 19.5 12 12 19.5 4.5 12 12 4.5Z',
  // Hexagon
  T5: 'M12 4.5 18.5 8.2v7.6L12 19.5 5.5 15.8V8.2L12 4.5Z',
  // Chevron
  T6: 'M12 4.8 19 11l-2.4 2.2L12 9.4l-4.6 3.8L5 11l7-6.2ZM12 12.6 19 18.8l-2.4 2.2L12 17.2 7.4 21 5 18.8l7-6.2Z',
  // Cross
  T7: 'M9.6 4.6h4.8v5h5v4.8h-5v5H9.6v-5h-5V9.6h5v-5Z',
  // Star
  T8: 'M12 4.4l2.2 5.1 5.5.5-4.2 3.6 1.3 5.4L12 16.1l-4.8 2.9 1.3-5.4L4.3 10l5.5-.5L12 4.4Z',
};

interface TerritoryEmblemProps {
  readonly territoryId: string;
  readonly size?: number;
  readonly showLabel?: boolean;
}

export function TerritoryEmblem({ territoryId, size = 16, showLabel = false }: TerritoryEmblemProps) {
  const territory = TERRITORY_BY_ID.get(territoryId);
  const glyph = GLYPHS[territoryId] ?? GLYPHS['T1'];
  const label = territory?.name ?? territoryId;

  return (
    <span
      className="emblem"
      style={{
        width: size,
        height: size,
        ['--emblem-colour' as string]: `var(--territory-${territoryId})`,
      }}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={glyph} />
      </svg>
      {showLabel ? <span className="emblem__label">{label}</span> : null}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
