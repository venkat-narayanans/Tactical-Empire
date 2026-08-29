import {
  CITY_BY_ID,
  CONFIG,
  HOTEL_LEVEL,
  MAX_DEVELOPMENT_LEVEL,
  SPECIAL_BY_ID,
  TERRITORY_BY_ID,
  propertyDisplayName,
  propertyPrice,
} from '@te/config';
import type { GameState, PlayerId, PropertyId, PropertyState } from '@te/shared';
import { percentOf, ruleError } from '@te/shared';
import type { EngineContext } from './context.js';
import {
  citiesInTerritory,
  isWarDamaged,
  ownsCompleteTerritory,
  specialGroupCount,
} from './selectors.js';

/** Property acquisition, rent, development and mortgage. */

export function getProperty(state: GameState, propertyId: PropertyId): PropertyState {
  const property = state.properties[propertyId];
  if (!property) throw ruleError('PROPERTY_UNAVAILABLE', 'That property does not exist.');
  return property;
}

/**
 * Authoritative rent for landing on `propertyId`.
 *
 * City rent comes straight from the `city_economics` table for the current
 * development level; the undeveloped full-set multiplier, war damage and
 * mortgage state are applied on top. Special properties use their group rules.
 */
export function calculateRent(
  state: GameState,
  propertyId: PropertyId,
  diceTotal: number,
): number {
  const property = getProperty(state, propertyId);
  const owner = property.owner;
  if (!owner) return 0;
  if (property.mortgaged) return CONFIG.mortgage.rent_while_mortgaged;

  const ownerPlayer = state.players[owner];
  if (!ownerPlayer) return 0;
  if (ownerPlayer.inDetention && !state.settings.rentWhileInIgSignal) return 0;

  const city = CITY_BY_ID.get(propertyId);
  let rent: number;

  if (city) {
    rent = city.rent[property.level] ?? city.baseRent;
    if (
      property.level === 0 &&
      state.settings.fullSetX2Rent &&
      ownsCompleteTerritory(state, owner, city.territoryId)
    ) {
      rent *= city.fullSetUndevelopedMultiplier;
    }
  } else {
    const special = SPECIAL_BY_ID.get(propertyId);
    if (!special) return 0;
    const owned = specialGroupCount(state, owner, special.group);
    if (special.group === 'public_works') {
      const multiplier = CONFIG.special_property_rules.public_works.multipliers[String(owned)] ?? 0;
      rent = diceTotal * multiplier;
    } else {
      const table =
        special.group === 'transport'
          ? CONFIG.special_property_rules.transport.rent
          : CONFIG.special_property_rules.hospitality.rent;
      rent = table[String(owned)] ?? 0;
    }
  }

  if (isWarDamaged(state, property)) {
    rent = rent * CONFIG.war.capture.war_damage_rent_multiplier;
  }
  return Math.round(rent);
}

export function buyProperty(ctx: EngineContext, playerId: PlayerId, propertyId: PropertyId): void {
  const { state } = ctx;
  const pending = state.turn.pendingPurchase;
  if (!pending || pending.propertyId !== propertyId) {
    throw ruleError('PROPERTY_UNAVAILABLE', 'There is no purchase offer for that property.');
  }
  const property = getProperty(state, propertyId);
  if (property.owner !== null) {
    throw ruleError('PROPERTY_UNAVAILABLE', 'That property already has an owner.');
  }
  const player = ctx.player(playerId);
  const price = pending.price;
  if (player.cash < price) {
    throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford that property.');
  }

  ctx.debit(playerId, price);
  property.owner = playerId;
  player.stats.propertiesBought += 1;
  state.turn.pendingPurchase = null;
  ctx.emit('PropertyPurchased', { playerId, propertyId, price });
  announceTerritoryIfCompleted(ctx, playerId, propertyId);
}

/** Emits TerritoryCompleted when a purchase or capture finishes a set. */
export function announceTerritoryIfCompleted(
  ctx: EngineContext,
  playerId: PlayerId,
  propertyId: PropertyId,
): void {
  const city = CITY_BY_ID.get(propertyId);
  if (!city) return;
  if (ownsCompleteTerritory(ctx.state, playerId, city.territoryId)) {
    ctx.emit('TerritoryCompleted', { playerId, territoryId: city.territoryId });
  }
}

export interface BuildQuote {
  readonly propertyId: PropertyId;
  readonly currentLevel: number;
  readonly nextLevel: number;
  readonly cost: number;
}

/** Validates a development step and returns its cost, or throws a RuleError. */
export function quoteBuild(
  state: GameState,
  playerId: PlayerId,
  propertyId: PropertyId,
): BuildQuote {
  const city = CITY_BY_ID.get(propertyId);
  if (!city) throw ruleError('INVALID_DEVELOPMENT', 'Only cities can be developed.');
  const property = getProperty(state, propertyId);
  if (property.owner !== playerId) {
    throw ruleError('PROPERTY_NOT_OWNED', 'You do not own that property.');
  }
  if (property.level >= MAX_DEVELOPMENT_LEVEL) {
    throw ruleError('INVALID_DEVELOPMENT', 'That property is fully developed.');
  }
  if (property.mortgaged) {
    throw ruleError('INVALID_DEVELOPMENT', 'You cannot build on a mortgaged property.');
  }
  if (!ownsCompleteTerritory(state, playerId, city.territoryId)) {
    throw ruleError('INVALID_DEVELOPMENT', 'You must own the whole territory before developing.');
  }
  if (CONFIG.war.capture.war_damage_blocks_building && isWarDamaged(state, property)) {
    throw ruleError('INVALID_DEVELOPMENT', 'That property is war-damaged and cannot be developed this round.');
  }

  const setCities = citiesInTerritory(state, city.territoryId);
  if (setCities.some((c) => c.mortgaged)) {
    throw ruleError('INVALID_DEVELOPMENT', 'Unmortgage the whole territory before developing it.');
  }
  if (state.settings.evenBuild) {
    const minLevel = Math.min(...setCities.map((c) => c.level));
    if (property.level - minLevel >= CONFIG.development.even_build_max_level_difference) {
      throw ruleError('INVALID_DEVELOPMENT', 'Even build: develop the other cities in this territory first.');
    }
  }

  return {
    propertyId,
    currentLevel: property.level,
    nextLevel: property.level + 1,
    cost: city.houseCost,
  };
}

export function build(ctx: EngineContext, playerId: PlayerId, propertyId: PropertyId): void {
  const quote = quoteBuild(ctx.state, playerId, propertyId);
  const player = ctx.player(playerId);
  if (player.cash < quote.cost) {
    throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford that development.');
  }
  ctx.debit(playerId, quote.cost);
  const property = getProperty(ctx.state, propertyId);
  property.level = quote.nextLevel;
  ctx.emit('PropertyDeveloped', {
    playerId,
    propertyId,
    level: property.level,
    cost: quote.cost,
  });
}

export function sellBuilding(ctx: EngineContext, playerId: PlayerId, propertyId: PropertyId): void {
  const { state } = ctx;
  const city = CITY_BY_ID.get(propertyId);
  if (!city) throw ruleError('INVALID_DEVELOPMENT', 'Only cities have buildings.');
  const property = getProperty(state, propertyId);
  if (property.owner !== playerId) {
    throw ruleError('PROPERTY_NOT_OWNED', 'You do not own that property.');
  }
  if (property.level <= 0) {
    throw ruleError('INVALID_DEVELOPMENT', 'There is nothing to sell on that property.');
  }
  if (state.settings.evenBuild) {
    const setCities = citiesInTerritory(state, city.territoryId);
    const maxLevel = Math.max(...setCities.map((c) => c.level));
    if (maxLevel - (property.level - 1) > CONFIG.development.even_build_max_level_difference) {
      throw ruleError('INVALID_DEVELOPMENT', 'Even build: sell from the most developed city first.');
    }
  }
  const refund = percentOf(city.houseCost, CONFIG.development.resale_percentage);
  property.level -= 1;
  ctx.credit(playerId, refund);
  ctx.emit('BuildingSold', { playerId, propertyId, level: property.level, refund });
}

export function mortgageValue(propertyId: PropertyId): number {
  return percentOf(propertyPrice(propertyId), CONFIG.mortgage.mortgage_percentage);
}

export function unmortgageCost(propertyId: PropertyId): number {
  return Math.ceil(mortgageValue(propertyId) * (1 + CONFIG.mortgage.unmortgage_interest));
}

export function mortgageProperty(
  ctx: EngineContext,
  playerId: PlayerId,
  propertyId: PropertyId,
): void {
  const { state } = ctx;
  if (!state.settings.mortgage) {
    throw ruleError('INVALID_MORTGAGE', 'Mortgages are disabled in this game.');
  }
  const property = getProperty(state, propertyId);
  if (property.owner !== playerId) {
    throw ruleError('PROPERTY_NOT_OWNED', 'You do not own that property.');
  }
  if (property.mortgaged) throw ruleError('INVALID_MORTGAGE', 'That property is already mortgaged.');
  if (property.level > 0) {
    throw ruleError('INVALID_MORTGAGE', 'Sell the buildings on that property first.');
  }
  if (isInActiveWar(state, playerId)) {
    throw ruleError('INVALID_MORTGAGE', 'You cannot take a new mortgage while a war is active.');
  }
  const amount = mortgageValue(propertyId);
  property.mortgaged = true;
  ctx.credit(playerId, amount);
  ctx.emit('PropertyMortgaged', { playerId, propertyId, amount });
}

export function unmortgageProperty(
  ctx: EngineContext,
  playerId: PlayerId,
  propertyId: PropertyId,
): void {
  const { state } = ctx;
  const property = getProperty(state, propertyId);
  if (property.owner !== playerId) {
    throw ruleError('PROPERTY_NOT_OWNED', 'You do not own that property.');
  }
  if (!property.mortgaged) throw ruleError('INVALID_MORTGAGE', 'That property is not mortgaged.');
  const cost = unmortgageCost(propertyId);
  const player = ctx.player(playerId);
  if (player.cash < cost) throw ruleError('INSUFFICIENT_FUNDS', 'You cannot afford to lift that mortgage.');
  ctx.debit(playerId, cost);
  property.mortgaged = false;
  ctx.emit('PropertyUnmortgaged', { playerId, propertyId, amount: cost });
}

/**
 * `war.locked_during_war` freezes trade and new mortgages for war participants.
 * A war is active for the remainder of the turn in which it was declared.
 */
export function isInActiveWar(state: GameState, playerId: PlayerId): boolean {
  return state.activeWarIds.some((warId) => {
    const war = state.wars.find((w) => w.id === warId);
    return war !== undefined && (war.attackerId === playerId || war.defenderId === playerId);
  });
}

/** Returns every property in a territory owned by a specific player. */
export function territoryPropertiesOf(
  state: GameState,
  territoryId: string,
  playerId: PlayerId,
): PropertyState[] {
  const territory = TERRITORY_BY_ID.get(territoryId);
  if (!territory) return [];
  return territory.cities
    .map((cityId) => state.properties[cityId])
    .filter((p): p is PropertyState => p !== undefined && p.owner === playerId);
}

export function displayName(propertyId: PropertyId): string {
  return propertyDisplayName(propertyId);
}

export { HOTEL_LEVEL, MAX_DEVELOPMENT_LEVEL };
