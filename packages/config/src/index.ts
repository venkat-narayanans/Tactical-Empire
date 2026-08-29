import rawConfig from '../../../GAME_CONFIG.json';
import { gameConfigSchema } from './schema.js';
import type { RawGameConfig, SpaceKind, SpecialGroup } from './schema.js';

export type { RawGameConfig, SpaceKind, SpecialGroup };
export { gameConfigSchema } from './schema.js';

/** Validated, immutable game configuration. */
export const CONFIG: RawGameConfig = gameConfigSchema.parse(rawConfig);

export interface BoardSpace {
  /** 0-based board index, matching board_order. */
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly kind: SpaceKind;
}

export interface CityDefinition {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly territoryId: string;
  readonly baseRent: number;
  /** Rent by development level 0-5, straight from city_economics. */
  readonly rent: readonly number[];
  readonly fullSetUndevelopedMultiplier: number;
  readonly houseCost: number;
  readonly boardIndex: number;
}

export interface SpecialPropertyDefinition {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly group: SpecialGroup;
  readonly boardIndex: number;
}

export interface TerritoryDefinition {
  readonly id: string;
  readonly name: string;
  readonly cities: readonly string[];
  readonly bonus: number;
  readonly size: number;
  readonly houseCost: number;
}

export interface ArmyUnitDefinition {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly power: number;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`GAME_CONFIG.json is missing ${what}`);
  return value;
}

export const BOARD: readonly BoardSpace[] = CONFIG.board_order.map(([id, name, kind], index) => ({
  index,
  id,
  name,
  kind,
}));

export const TERRITORIES: readonly TerritoryDefinition[] = CONFIG.territories.map((t) => ({
  id: t.id,
  name: t.name,
  cities: t.cities,
  bonus: t.bonus,
  size: t.size,
  houseCost: required(CONFIG.development.house_cost_by_territory[t.id], `house cost for ${t.id}`),
}));

export const TERRITORY_BY_ID: ReadonlyMap<string, TerritoryDefinition> = new Map(
  TERRITORIES.map((t) => [t.id, t]),
);

const boardIndexById = new Map<string, number>(BOARD.map((s) => [s.id, s.index]));

export const CITIES: readonly CityDefinition[] = CONFIG.cities.map(
  ([id, name, price, territoryId]) => {
    const economics = required(CONFIG.city_economics[id], `city_economics for ${id}`);
    return {
      id,
      name,
      price,
      territoryId,
      baseRent: economics.base_rent,
      rent: [
        economics.rent['0'],
        economics.rent['1'],
        economics.rent['2'],
        economics.rent['3'],
        economics.rent['4'],
        economics.rent['5'],
      ],
      fullSetUndevelopedMultiplier: economics.full_set_undeveloped_multiplier,
      houseCost: required(
        CONFIG.development.house_cost_by_territory[territoryId],
        `house cost ${territoryId}`,
      ),
      boardIndex: required(boardIndexById.get(id), `board index for city ${id}`),
    };
  },
);

export const CITY_BY_ID: ReadonlyMap<string, CityDefinition> = new Map(CITIES.map((c) => [c.id, c]));

export const SPECIAL_PROPERTIES: readonly SpecialPropertyDefinition[] =
  CONFIG.special_properties.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    group: s.group,
    boardIndex: required(boardIndexById.get(s.id), `board index for special ${s.id}`),
  }));

export const SPECIAL_BY_ID: ReadonlyMap<string, SpecialPropertyDefinition> = new Map(
  SPECIAL_PROPERTIES.map((s) => [s.id, s]),
);

/** Every purchasable property id (cities + special properties). */
export const PURCHASABLE_IDS: readonly string[] = [
  ...CITIES.map((c) => c.id),
  ...SPECIAL_PROPERTIES.map((s) => s.id),
];

export const ARMY_UNITS: readonly ArmyUnitDefinition[] = CONFIG.army.units;
export const ARMY_UNIT_BY_ID: ReadonlyMap<string, ArmyUnitDefinition> = new Map(
  ARMY_UNITS.map((u) => [u.id, u]),
);

export const START_INDEX = CONFIG.corner_rules.start.position;
export const IG_SIGNAL_INDEX = required(boardIndexById.get('ig_signal'), 'ig_signal board index');
export const VACATION_INDEX = required(boardIndexById.get('vacation'), 'vacation board index');
export const GO_TO_IG_SIGNAL_INDEX = required(
  boardIndexById.get('go_to_ig_signal'),
  'go_to_ig_signal board index',
);

export const RENT_MULTIPLIERS: readonly number[] = [0, 1, 2, 3, 4, 5].map((level) =>
  required(CONFIG.development.rent_multipliers[String(level)], `rent multiplier ${level}`),
);

export const MAX_DEVELOPMENT_LEVEL = 5;
export const HOTEL_LEVEL = 5;

export function normaliseIndex(index: number): number {
  const size = CONFIG.game.board_size;
  return ((index % size) + size) % size;
}

export function boardSpaceAt(index: number): BoardSpace {
  return required(BOARD[normaliseIndex(index)], `board space ${index}`);
}

export function isCity(propertyId: string): boolean {
  return CITY_BY_ID.has(propertyId);
}

export function isSpecialProperty(propertyId: string): boolean {
  return SPECIAL_BY_ID.has(propertyId);
}

export function propertyPrice(propertyId: string): number {
  const city = CITY_BY_ID.get(propertyId);
  if (city) return city.price;
  return required(SPECIAL_BY_ID.get(propertyId), `property ${propertyId}`).price;
}

export function propertyDisplayName(propertyId: string): string {
  const city = CITY_BY_ID.get(propertyId);
  if (city) return city.name;
  return required(SPECIAL_BY_ID.get(propertyId), `property ${propertyId}`).name;
}

/**
 * Structural checks that catch a malformed GAME_CONFIG.json at process start
 * rather than mid-game. These assert the config is consistent with itself and
 * with the counts it declares; they never redefine gameplay values.
 */
export function assertConfigIntegrity(): void {
  const errors: string[] = [];
  const { game } = CONFIG;

  if (BOARD.length !== game.board_size) {
    errors.push(`board_order has ${BOARD.length} spaces, expected ${game.board_size}`);
  }
  const corners = BOARD.filter((s) => s.kind === 'corner').length;
  if (corners !== game.corner_tiles) {
    errors.push(`board has ${corners} corners, expected ${game.corner_tiles}`);
  }
  const cityTiles = BOARD.filter((s) => s.kind === 'city').length;
  if (cityTiles !== game.property_tiles) {
    errors.push(`board has ${cityTiles} city tiles, expected ${game.property_tiles}`);
  }
  const specialTiles = BOARD.length - corners - cityTiles;
  if (specialTiles !== game.special_tiles) {
    errors.push(`board has ${specialTiles} special tiles, expected ${game.special_tiles}`);
  }
  if (CITIES.length !== cityTiles) {
    errors.push(`cities list has ${CITIES.length} entries but board has ${cityTiles} city tiles`);
  }

  const idsOnBoard = new Set(BOARD.map((s) => s.id));
  if (idsOnBoard.size !== BOARD.length) errors.push('board_order contains duplicate space ids');

  for (const city of CITIES) {
    if (!idsOnBoard.has(city.id)) errors.push(`city ${city.id} is not present on the board`);
    if (!TERRITORY_BY_ID.has(city.territoryId)) {
      errors.push(`city ${city.id} references unknown territory ${city.territoryId}`);
    }
    const economics = CONFIG.city_economics[city.id];
    if (economics && economics.purchase_price !== city.price) {
      errors.push(
        `city ${city.id} price mismatch: cities=${city.price} city_economics=${economics.purchase_price}`,
      );
    }
    for (let level = 0; level <= MAX_DEVELOPMENT_LEVEL; level += 1) {
      const expected = city.baseRent * required(RENT_MULTIPLIERS[level], `multiplier ${level}`);
      if (city.rent[level] !== expected) {
        errors.push(
          `city ${city.id} rent level ${level} is ${String(city.rent[level])}, multiplier table implies ${expected}`,
        );
      }
    }
  }

  for (const territory of TERRITORIES) {
    if (territory.cities.length !== territory.size) {
      errors.push(
        `territory ${territory.id} declares size ${territory.size} but lists ${territory.cities.length} cities`,
      );
    }
    for (const cityId of territory.cities) {
      const city = CITY_BY_ID.get(cityId);
      if (!city) errors.push(`territory ${territory.id} references unknown city ${cityId}`);
      else if (city.territoryId !== territory.id) {
        errors.push(`city ${cityId} maps to ${city.territoryId} but is listed under ${territory.id}`);
      }
    }
  }

  for (const special of SPECIAL_PROPERTIES) {
    if (!idsOnBoard.has(special.id)) errors.push(`special property ${special.id} is not on the board`);
  }

  if (errors.length > 0) {
    throw new Error(`GAME_CONFIG.json failed integrity checks:\n - ${errors.join('\n - ')}`);
  }
}
