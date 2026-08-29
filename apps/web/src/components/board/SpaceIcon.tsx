import type { SpaceKind } from '@te/config';
import { SPECIAL_BY_ID } from '@te/config';

/**
 * Icons for the non-city spaces.
 *
 * Each icon reads from the space's own meaning - a chest for Treasure, a
 * question for Surprise, a plane for the Airport - without drifting into
 * decoration that would compete with the board information.
 */

const PATHS: Record<string, string> = {
  start: 'M4 12h11l-3.4-3.4L13 7.2 18.8 13 13 18.8l-1.4-1.4L15 14H4v-2Z',
  ig_signal: 'M9 3h6v3.2A5.4 5.4 0 0 1 12 16a5.4 5.4 0 0 1-3-9.8V3Zm-3 16h12v2H6v-2Z',
  vacation: 'M12 3a6 6 0 0 1 6 6c0 4-6 12-6 12S6 13 6 9a6 6 0 0 1 6-6Zm0 3.6A2.4 2.4 0 1 0 12 11a2.4 2.4 0 0 0 0-4.4Z',
  go_to_ig_signal: 'M13.6 4 21 11.4l-7.4 7.4-1.8-1.8 4.3-4.3H3v-2.6h13.1l-4.3-4.3L13.6 4Z',
  treasure: 'M3 8h18v3H3V8Zm1 4h7v2h2v-2h7v8H4v-8Zm4-8h8l2 3H6l2-3Z',
  surprise: 'M12 3a5 5 0 0 1 5 5c0 2.6-1.8 3.4-2.8 4.3-.7.6-1 1.1-1 2.2h-2.6c0-1.9.7-2.9 1.7-3.8.9-.8 1.7-1.3 1.7-2.5A2.4 2.4 0 0 0 9.5 8H7A5 5 0 0 1 12 3Zm-1.4 14h2.8v2.8h-2.8V17Z',
  fee: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm2.6 5v2h7V8h-7Zm0 4v2h4.6v-2H8.6Z',
  public_works: 'M3 20V9l9-6 9 6v11h-6v-6H9v6H3Z',
  hospitality: 'M4 6h2.6v5.2h10.8V6H20v14h-2.6v-5.2H6.6V20H4V6Z',
  transport: 'M2.4 17.4 9 13.6V8.2c0-1.4.9-2.6 2.4-2.6s2.4 1.2 2.4 2.6v5.4l6.8 3.8v2l-6.8-2v3.2l2 1.6v1.4L11.4 24l-4.4-1.4v-1.4l2-1.6v-3.2l-6.6 2v-2Z',
};

interface SpaceIconProps {
  readonly spaceId: string;
  readonly kind: SpaceKind;
  readonly size?: number;
}

export function SpaceIcon({ spaceId, kind, size = 16 }: SpaceIconProps) {
  const path = resolvePath(spaceId, kind);
  return (
    <span className={`space-icon space-icon--${kind}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={path} />
      </svg>
    </span>
  );
}

function resolvePath(spaceId: string, kind: SpaceKind): string {
  const direct = PATHS[spaceId];
  if (direct) return direct;
  const special = SPECIAL_BY_ID.get(spaceId);
  if (special) return PATHS[special.group] ?? PATHS['public_works']!;
  return PATHS[kind] ?? PATHS['fee']!;
}
