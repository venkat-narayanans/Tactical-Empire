import { CITY_BY_ID, SPECIAL_BY_ID } from '@te/config';
import type { BoardSpace } from '@te/config';
import type { ClientPlayerView, PropertyState } from '@te/shared';
import { TerritoryEmblem } from './TerritoryEmblem.js';
import { DevelopmentMark } from './DevelopmentMark.js';
import { SpaceIcon } from './SpaceIcon.js';

/**
 * One board space.
 *
 * A city tile carries five separate signals, each with its own visual channel:
 * name and price as text, territory as an emblem, owner as a colour accent bar,
 * development as house/hotel marks. Owner colour is applied as an accent so it
 * can never swallow the name or the emblem.
 */

interface TileProps {
  readonly space: BoardSpace;
  readonly property: PropertyState | undefined;
  readonly owner: ClientPlayerView | undefined;
  /** Current game round, so war damage can be shown only while it still applies. */
  readonly round: number;
  readonly selected: boolean;
  readonly onSelect: (propertyId: string | null) => void;
  readonly children?: React.ReactNode;
}

export function Tile({ space, property, owner, round, selected, onSelect, children }: TileProps) {
  const city = CITY_BY_ID.get(space.id);
  const special = SPECIAL_BY_ID.get(space.id);
  const purchasable = Boolean(city ?? special);

  const ownerColour = owner?.colour ? `var(--player-${owner.colour})` : undefined;
  const classes = [
    'tile',
    `tile--${space.kind}`,
    owner ? 'tile--owned' : '',
    property?.mortgaged ? 'tile--mortgaged' : '',
    selected ? 'tile--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style = ownerColour
    ? ({ ['--owner-colour' as string]: ownerColour } as React.CSSProperties)
    : undefined;

  const label = describe(space, property, owner);
  const nameLen = space.name.length;
  const nameClass = [
    'tile__name',
    nameLen >= 13 ? 'tile__name--long' : nameLen >= 11 ? 'tile__name--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {purchasable ? <span className="tile__ownerbar" aria-hidden="true" /> : null}

      <span className="tile__head">
        {city ? <TerritoryEmblem territoryId={city.territoryId} size={14} /> : null}
        {!city && special ? <SpaceIcon spaceId={space.id} kind={space.kind} size={16} /> : null}
        {property && property.level > 0 ? (
          <DevelopmentMark
            level={property.level}
            warDamaged={property.warDamagedUntilRound > round}
          />
        ) : null}
      </span>

      <span className={nameClass} title={space.name}>{space.name}</span>

      {purchasable ? (
        <span className="tile__price">₹{city?.price ?? special?.price}</span>
      ) : null}

      {property?.mortgaged ? <span className="tile__flag">Mortgaged</span> : null}
      {children}
    </>
  );

  if (!purchasable) {
    return (
      <div className={classes} data-space={space.id} aria-label={label}>
        <span className="tile__head">
          <SpaceIcon spaceId={space.id} kind={space.kind} size={19} />
        </span>
        <span className={nameClass} title={space.name}>{space.name}</span>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      data-space={space.id}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(selected ? null : space.id)}
    >
      {body}
    </button>
  );
}

function describe(
  space: BoardSpace,
  property: PropertyState | undefined,
  owner: ClientPlayerView | undefined,
): string {
  const city = CITY_BY_ID.get(space.id);
  const special = SPECIAL_BY_ID.get(space.id);
  const parts: string[] = [space.name];
  if (city) parts.push(`₹${city.price}`, city.territoryId);
  else if (special) parts.push(`₹${special.price}`);
  parts.push(owner ? `owned by ${owner.name}` : 'unowned');
  if (property && property.level > 0) {
    parts.push(property.level === 5 ? 'hotel' : `${property.level} houses`);
  }
  if (property?.mortgaged) parts.push('mortgaged');
  return parts.join(', ');
}
