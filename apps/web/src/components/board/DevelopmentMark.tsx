/**
 * Development marks.
 *
 * Houses are small pitched-roof shapes, a hotel is one wider block with a
 * marked band. Both differ in silhouette from the geometric territory emblems
 * and from the round player tokens, so a glance tells them apart.
 */

interface DevelopmentMarkProps {
  /** 0-4 houses, 5 = hotel. */
  readonly level: number;
  readonly warDamaged?: boolean;
}

export function DevelopmentMark({ level, warDamaged = false }: DevelopmentMarkProps) {
  if (level <= 0) return null;

  const label = level === 5 ? 'Hotel' : `${level} house${level > 1 ? 's' : ''}`;

  return (
    <span
      className={`development${warDamaged ? ' development--damaged' : ''}`}
      title={warDamaged ? `${label} (war damaged)` : label}
    >
      {level === 5 ? (
        <svg viewBox="0 0 18 12" aria-hidden="true" focusable="false" className="development__hotel">
          <path d="M1 11V4.4L9 1l8 3.4V11H1Z" />
          <rect x="3.4" y="6.2" width="11.2" height="1.6" className="development__band" />
        </svg>
      ) : (
        Array.from({ length: level }, (_, index) => (
          <svg
            key={index}
            viewBox="0 0 10 10"
            aria-hidden="true"
            focusable="false"
            className="development__house"
          >
            <path d="M5 1 9.2 4.3V9H0.8V4.3L5 1Z" />
          </svg>
        ))
      )}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
